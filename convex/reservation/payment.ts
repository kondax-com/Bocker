import { requireReservationMutation } from '@/convex/utils/reservationAccess'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'
import { mutation, internalMutation } from '@/convex/_generated/server';
import { v } from 'convex/values';
import { ConvexError } from 'convex/values';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';
import { updateRecord } from '@/convex/utils/helpers';
import { api } from '@/convex/_generated/api';
import { internal } from '@/convex/_generated/api';

/**
 * 決済成功時の予約受付処理
 * Stripe Webhookから呼び出される
 */
export const confirmPayment = mutation({
  args: {
    reservation_id: v.id('reservation'),
    stripe_payment_intent_id: v.optional(v.string()),
    server_token: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { reservation_id, stripe_payment_intent_id } = args;
    await requireReservationMutation(ctx, reservation_id, 'payment-confirm', args, args.server_token)

    // 予約情報を取得
    const reservation = await ctx.db.get(reservation_id);
    if (!reservation || reservation.is_archive) {
      throw new ConvexError({
        message: '予約が存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'confirmPayment',
        details: { reservation_id },
      });
    }

    // すでに予約受付済みの場合はスキップ（べき等性）
    if (reservation.status === 'confirmed' && reservation.payment_status === 'completed') {
      return true;
    }

    // 予約ステータスを予約受付に更新
    await updateRecord(ctx, reservation_id, {
      status: 'confirmed',
      payment_status: 'completed',
      stripe_payment_intent_id: stripe_payment_intent_id || reservation.stripe_payment_intent_id,
    });

    // ポイント利用がある場合の減算処理とトランザクション作成
    const reservationDetail = await ctx.db
      .query('reservation_detail')
      .withIndex('by_reservation_archive', (q) => 
        q.eq('reservation_id', reservation_id).eq('is_archive', false)
      )
      .first();

    if (reservationDetail?.use_points && reservationDetail.use_points > 0 && reservation.customer_uid) {
      try {
        // ポイント減算とトランザクション作成のためのアクションを予約する
        // mutation内では外部APIを呼び出せないため、別のactionを予約実行する
        await ctx.scheduler.runAfter(0, internal.reservation.action.performSideEffects, {
          mode: 'confirm',
          payload: {
            reservation: {
              ...reservation,
              detail: reservationDetail,
            },
            pointConfig: null, // ポイント設定は不要（減算のみ）
          },
          coreResult: {
            reservationId: reservation_id,
          },
        });

        console.log(`[confirmPayment] ポイント減算処理を予約実行: ${reservationDetail.use_points}ポイント (予約ID: ${reservation_id})`);
      } catch (pointError) {
        console.error(`[confirmPayment] ポイント減算予約失敗 (予約ID: ${reservation_id}):`, pointError);
        // ポイント処理が失敗しても決済成功は維持する（ログのみ）
      }
    }

    return true;
  },
});

/**
 * 期限切れpending予約のクリーンアップ
 * Cronジョブから定期的に呼び出される
 */
export const cleanupExpiredPendingReservations = internalMutation({
  args: {},
  returns: v.object({
    processed: v.number(),
    cancelled: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    
    // 期限切れのpending予約を取得
    const expiredReservations = await ctx.db
      .query('reservation')
      .withIndex('by_status_pending_expiry_archive', (q) =>
        q.eq('status', 'pending')
        .lte('pending_expiry', now)
      )
      .take(100); // バッチサイズ制限

    let processed = 0;
    let cancelled = 0;

    for (const reservation of expiredReservations) {
      try {
        // キャンセル処理（在庫復元も含む）
        await ctx.runMutation(api.reservation.mutation.cancelReservation, withReservationMutationCapability('cancel', {
          reservationId: reservation._id,
          cancelledBy: 'system' as const,
          cancelReason: '決済タイムアウト',
          skipValidation: true,
        }));

        cancelled++;
      } catch (error) {
        console.error('Failed to cancel expired reservation:', reservation._id, error);
      }
      processed++;
    }

    return { processed, cancelled };
  },
});

/**
 * 決済再試行用の新しいCheckout Session作成
 * pending予約に対して再度決済を試みる
 */
export const retryPayment = mutation({
  args: {
    reservation_id: v.id('reservation'),
  },
  returns: v.object({
    success: v.boolean(),
    checkoutSessionId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { reservation_id } = args;
    await requireReservationMutation(ctx, reservation_id, 'payment-retry', args)

    // 予約情報を取得
    const reservation = await ctx.db.get(reservation_id);
    if (!reservation || reservation.is_archive) {
      throw new ConvexError({
        message: '予約が存在しません',
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'retryPayment',
        details: { reservation_id },
      });
    }

    // pending状態でない場合はエラー
    if (reservation.status !== 'pending') {
      throw new ConvexError({
        message: '再試行できない予約です',
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'retryPayment',
        details: { 
          reservation_id,
          status: reservation.status,
        },
      });
    }

    // 有効期限を延長
    const new_expiry = Date.now() + 30 * 60 * 1000; // 30分延長
    await updateRecord(ctx, reservation_id, {
      pending_expiry: new_expiry,
    });

    // 新しいCheckout Session IDは外部APIで作成される想定
    // ここでは有効期限の延長のみ行う
    return {
      success: true,
      checkoutSessionId: undefined, // 実際にはAPI経由で取得
    };
  },
});