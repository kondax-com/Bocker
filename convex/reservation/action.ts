"use node"

import { internalAction, action, ActionCtx } from '@/convex/_generated/server';
import { v } from 'convex/values';
import { RowType, SupabaseService } from '@/services/supabase/SupabaseService';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env-config'
import { sendInternalReservationNotification } from '@/services/notifications/internalRequest'
import { internal } from '@/convex/_generated/api';
import { Doc, Id} from '@/convex/_generated/dataModel';
import { ReservationMenu, ReservationOption, ReservationStatus, PaymentMethod, reservationStatusType } from '@/convex/types';
import { ConvexError } from 'convex/values';
import { ERROR_SEVERITY, ERROR_STATUS_CODE } from '@/lib/errors/constants';
import { PointTaskQueueRepository, PointTransactionRepository } from '@/services/supabase/repositories/point';
import { CustomerRepository } from '@/services/supabase/repositories/customer';
import { cancelForCompletedReservation } from './reservation.helpers';
import { CouponTransactionRepository } from '@/services/supabase/repositories/coupon';
import { CarteRepository, CarteDetailRepository } from '@/services/supabase/repositories/carte';
import { fetchMutation } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { validateStringLength, validateDateStrFormat } from '@/convex/utils/validations';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';


/**
 * 予約IDに紐づくポイントタスクを削除する
 * キャンセル時にポイント付与を阻止するために使用
 */
export const deletePointTaskForReservation = internalAction({
  args: {
    tenant_id: v.string(),
    org_id: v.string(),
    reservation_id: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Supabase管理者クライアントを作成
      const supabase = createClient(
        getEnv('NEXT_PUBLIC_SUPABASE_URL'),
        getEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        }
      );
      
      const supabaseService = new SupabaseService(supabase);
      const pointTaskQueueRepo = new PointTaskQueueRepository(supabaseService);
      
      // 予約に紐づくポイントタスクを検索
      const pointTask = await pointTaskQueueRepo.findByReservation(
        args.tenant_id,
        args.org_id,
        args.reservation_id
      );
      
      if (pointTask && pointTask.status === 'pending') {
        // タスクがpending状態の場合のみ削除
        await pointTaskQueueRepo.deleteRecord('id', pointTask.id);
        console.log(`ポイントタスクを削除しました: ${pointTask.id} (予約ID: ${args.reservation_id})`);
        return { deleted: true, taskId: pointTask.id };
      }
      
      console.log(`削除対象のポイントタスクが見つかりませんでした: 予約ID ${args.reservation_id}`);
      return { deleted: false, reason: 'task_not_found_or_not_pending' };
      
    } catch (error) {
      console.error('ポイントタスク削除エラー:', error);
      throw error;
    }
  },
});

/**
 * 1時間ごとに実行されるリマインダー送信処理
 * 施術時間の3時間前の予約を対象にリマインダーを送信
 * 日本時間（JST）で実行されるように修正
 */
export const sendHourlyReminders = internalAction({
  handler: async (ctx): Promise<{ processed: number; sent: number; errors: Array<{ reservationId: string; error: string }> }> => {
    try {
      // 現在時刻（UTC）を取得
      const nowUTC = Date.now();
      
      // 日本時間での現在時刻を取得（正確なタイムゾーン処理）
      const nowJST = format(new Date(nowUTC), 'yyyy-MM-dd HH:mm:ss', { locale: ja });
      
      // 3-4時間後の時間帯を計算（UTC時間で）
      const threeHoursLaterUTC = nowUTC + (3 * 60 * 60 * 1000);
      const fourHoursLaterUTC = nowUTC + (4 * 60 * 60 * 1000);
      
      // 日本時間での表示用
      const threeHoursLaterJST = format(new Date(threeHoursLaterUTC), 'yyyy-MM-dd HH:mm:ss', { locale: ja });
      
      const fourHoursLaterJST = format(new Date(fourHoursLaterUTC), 'yyyy-MM-dd HH:mm:ss', { locale: ja });
      
      console.log(`リマインダー送信処理開始（JST）: ${nowJST}`);
      console.log(`対象時間帯（JST）: ${threeHoursLaterJST} - ${fourHoursLaterJST}`);
      console.log(`対象時間帯（UTC Unix）: ${threeHoursLaterUTC} - ${fourHoursLaterUTC}`);
      
      // 3-4時間後に開始される、予約受付済みでリマインダー未送信の予約を取得
      // ConvexはUTC時間で処理するため、UTC時間を渡す
      const reminderData = await ctx.runQuery(internal.reservation.query.getReservationsForReminder, {
        startTimeFrom: threeHoursLaterUTC,
        startTimeTo: fourHoursLaterUTC,
      });
      
      console.log(`対象予約数: ${reminderData.length}`);
      
      if (reminderData.length === 0) {
        return { processed: 0, sent: 0, errors: [] };
      }
      
      // Supabase管理者クライアントを作成
      const supabase = createClient(
        getEnv('NEXT_PUBLIC_SUPABASE_URL'),
        getEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        }
      );
      
      const supabaseService = new SupabaseService(supabase);
      const customerRepo = new CustomerRepository(supabaseService);
      
      let sent = 0;
      const errors: Array<{ reservationId: string; error: string }> = [];
      
      // 並列処理で通知送信（最大10件ずつ）
      const batchSize = 10;
      for (let i = 0; i < reminderData.length; i += batchSize) {
        const batch = reminderData.slice(i, i + batchSize);
        const promises = batch.map(async (reminder) => {
          try {
            // 顧客情報を取得
            const { customer } = await customerRepo.getCompleteCustomerData(
              reminder.reservation.customer_uid!,
              reminder.reservation.tenant_id,
              reminder.reservation.org_id
            );
            
            if (!customer) {
              throw new Error('顧客情報が見つかりません');
            }
            
            // 通知送信処理
            if (customer.line_id) {
              await sendInternalReservationNotification('/api/line/reminder', reminder.reservation._id, 'reminder');
            } else if (customer.email) {
              await sendInternalReservationNotification('/api/resend/reminder', reminder.reservation._id, 'reminder');
            } else {
              throw new Error('通知先（LINE IDまたはメール）が設定されていません');
            }
            
            // リマインダー送信フラグを更新（送信時刻はUTC時間で保存）
            await ctx.runMutation(internal.reservation.mutation.updateReminderStatus, {
              reservationId: reminder.reservation._id,
              sent: true,
              sentAt: nowUTC,
            });
            
            sent++;
            console.log(`リマインダー送信成功: 予約ID ${reminder.reservation._id}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push({
              reservationId: reminder.reservation._id,
              error: errorMessage,
            });
            console.error(`リマインダー送信失敗: 予約ID ${reminder.reservation._id}`, error);
          }
        });
        
        await Promise.all(promises);
      }
      
      console.log(`リマインダー送信処理完了: 送信成功 ${sent}件, エラー ${errors.length}件`);
      
      return {
        processed: reminderData.length,
        sent,
        errors,
      };
    } catch (error) {
      console.error('リマインダー送信処理エラー:', error);
      throw error;
    }
  },
});

export const sendCancellationNotifications = internalAction({
  args: { reservation_id: v.id('reservation') },
  handler: async (_ctx, args) => {
    const results = await Promise.allSettled([
      sendInternalReservationNotification(
        '/api/line/customer-cancellation-notification',
        args.reservation_id,
        'cancellation'
      ),
      sendInternalReservationNotification(
        '/api/line/salon-cancellation-notification',
        args.reservation_id,
        'cancellation'
      ),
    ])
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Cancellation notification failed', {
          reservationId: args.reservation_id,
          audience: index === 0 ? 'customer' : 'salon',
        })
      }
    })
    return {
      customer: results[0].status === 'fulfilled',
      salon: results[1].status === 'fulfilled',
    }
  },
})

type CreatePayload = {
  tenant_id: Id<'tenant'>;
  org_id: Id<'organization'>;
  customer_uid?: string;
  staff_id: Id<'staff'>;
  staff_name: string;
  start_time_unix: number;
  payment_method: PaymentMethod;
  menus: ReservationMenu[];
  options: ReservationOption[];
  total_price: number;
  notes?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isCreatePayload = (payload: any): payload is CreatePayload => {
  return typeof payload === 'object' && payload !== null && 'tenant_id' in payload && 'org_id' in payload && 'staff_id' in payload && 'staff_name' in payload && 'start_time_unix' in payload && 'payment_method' in payload && 'menus' in payload && 'options' in payload && 'total_price' in payload;
};

type ConfirmPayload = {
  reservation?: Doc<'reservation'> & {
    detail?: Doc<'reservation_detail'> | null;
  };
  pointConfig?: Doc<'point_config'> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isConfirmPayload = (payload: any): payload is ConfirmPayload => {
  return typeof payload === 'object' && payload !== null && 'reservation' in payload && 'pointConfig' in payload;
};

type CancelPayload = {
  reservation?: Doc<'reservation'> & {
    detail?: Doc<'reservation_detail'> | null;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isCancelPayload = (payload: any): payload is CancelPayload => {
  return typeof payload === 'object' && payload !== null && 'reservation' in payload;
};

// ステータス変更用のPayload型
type StatusSideEffectsPayload = {
  reservationId: Id<'reservation'>;
  status: ReservationStatus;
  reservation?: Doc<'reservation'> & {
    detail?: Doc<'reservation_detail'> | null;
  };
  pointConfig?: Doc<'point_config'> | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isStatusSideEffectsPayload = (payload: any): payload is StatusSideEffectsPayload => {
  return typeof payload === 'object' && payload !== null && 'reservationId' in payload && 'status' in payload && 'reservation' in payload && 'pointConfig' in payload;
};

/**
 * 予約管理の副次処理を実行する
 * Convexトランザクション後にSupabaseへの書き込みを行う
 */
export const performSideEffects = internalAction({
  args: { 
    mode: v.union(
      v.literal("create"),
      v.literal("confirm"),
      v.literal("cancel"),
      v.literal("status")
    ),
    payload: v.any(), 
    coreResult: v.object({
      reservationId: v.id('reservation'),
      status: v.optional(v.string()),
      payment_method: v.optional(v.string()),
      checkout_url: v.optional(v.string()),
      alreadyConfirmed: v.optional(v.boolean()),
      newStatus: v.optional(v.string()),
      refundedOptions: v.optional(v.any()),
    })
  },
  handler: async (ctx, { mode, payload, coreResult }) => {
    // Supabase管理者クライアントを作成
    const supabase = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    const supabaseService = new SupabaseService(supabase);
    
    try {
      switch (mode) {
        case "create":
          if (isCreatePayload(payload)) {
            await handleCreateSideEffects(supabaseService, payload, coreResult);
          } else {
            throw new ConvexError(
              {
                statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
                severity: ERROR_SEVERITY.ERROR,
                message: 'Invalid payload type for create mode',
              }
            )
          }
          break;
        case "confirm":
          if (isConfirmPayload(payload)) {
            await handleConfirmSideEffects(supabaseService, payload, coreResult);
          } else {
            throw new ConvexError(
              {
                statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
                severity: ERROR_SEVERITY.ERROR,
                message: 'Invalid payload type for confirm mode',
              }
            )
          }
          break;
        case "cancel":
          if (isCancelPayload(payload)) {
            await handleCancelSideEffects(supabaseService, payload, coreResult);
          } else {
            throw new ConvexError(
              {
                statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
                severity: ERROR_SEVERITY.ERROR,
                message: 'Invalid payload type for cancel mode',
              }
            )
          }
          break;
        case "status":
          if (isStatusSideEffectsPayload(payload)) {
            await handleStatusSideEffects(ctx, supabaseService, payload, coreResult);
          } else {
            throw new ConvexError(
              'Invalid payload type for status mode',
            )
          }
          break;
      }
    } catch (error) {
      console.error("SideEffects error", error);
      // Sentryへの通知（実装されている場合）
      // Sentry.captureException(error);
      throw error; // エラーを再投げして、Convex側でロールバック
    }
  },
});

// 予約作成時の副次処理
async function handleCreateSideEffects(
  supabaseService: SupabaseService, 
  payload: {
    tenant_id: string;
    org_id: string;
    customer_uid?: string;
    staff_id: string;
    staff_name: string;
    start_time_unix: number;
    payment_method: string;
    menus: ReservationMenu[];
    options: ReservationOption[];
    total_price: number;
    use_points?: number;
    notes?: string;
  }, 
  coreResult: {
    reservationId: string;
  }
) {
  const carteRepo = new CarteRepository(supabaseService);
  
  // ポイント使用がある場合の減算処理
  if (payload.use_points && payload.use_points > 0 && payload.customer_uid) {
    try {
      // 原子的なポイント減算とトランザクション作成
      const { data, error } = await supabaseService.rpc('update_customer_points_atomic', {
        p_customer_uid: payload.customer_uid,
        p_tenant_id: payload.tenant_id,
        p_org_id: payload.org_id,
        p_points_delta: -payload.use_points, // 減算なので負の値
        p_transaction_type: 'used',
        p_description: `予約でのポイント利用 (予約ID: ${coreResult.reservationId})`,
        p_reservation_id: coreResult.reservationId,
      });

      if (error) {
        throw error;
      }

      const result = data?.[0];
      if (!result) {
        throw new Error('ポイント更新処理でエラーが発生しました。');
      }

      console.log(`[handleCreateSideEffects] ポイント減算成功: ${payload.customer_uid}, 使用ポイント: ${payload.use_points}, 新残高: ${result.new_total_points}, トランザクションID: ${result.transaction_id}`);

    } catch (pointError) {
      console.error(`[handleCreateSideEffects] ポイント減算失敗 (予約ID: ${coreResult.reservationId}):`, pointError);
      throw new Error(`ポイント減算処理でエラーが発生しました: ${pointError instanceof Error ? pointError.message : 'Unknown error'}`);
    }
  }

  // カルテ作成（現金決済の場合のみ）
  if (payload.payment_method === "cash" && payload.customer_uid) {
    // カルテを取得または作成
    const carte = await carteRepo.findOrCreateByCustomer(
      payload.tenant_id,
      payload.org_id,
      payload.customer_uid,
      {
        ltv_price: 0, // 作成時はLTVに加算しない
      }
    );
    
    // カルテ詳細を追加
    const carteDetailRepo = new CarteDetailRepository(supabaseService);
    await carteDetailRepo.createCarteDetail({
      tenant_id: payload.tenant_id,
      org_id: payload.org_id,
      carte_id: carte.id,
      reservation_id: coreResult.reservationId,
      staff_id: payload.staff_id,
      staff_name: payload.staff_name,
      // JST(UTC+9) の ISO 文字列に変換
      service_start_time: new Date(payload.start_time_unix + 9 * 60 * 60 * 1000).toISOString(),
      menu_details: payload.menus || [],
      option_details: payload.options || [],
      total_price: payload.total_price,
      notes: '',
      customer_requests: payload.notes || '',
      after_images: [],
    });
  }
}

// 決済確定時の副次処理
async function handleConfirmSideEffects(
  supabaseService: SupabaseService, 
  payload: {
    reservation?: Doc<'reservation'> & {
      detail?: Doc<'reservation_detail'> | null;
    };
    pointConfig?: Doc<'point_config'> | null;
  }, 
  coreResult: {
    reservationId: Id<'reservation'>;
  }
) {
  try {
    const reservation = payload.reservation;
    
    // ポイント使用がある場合の減算処理
    if (reservation?.detail?.use_points && reservation.detail.use_points > 0 && reservation.customer_uid) {
      try {
        // 原子的なポイント減算とトランザクション作成
        const { data, error } = await supabaseService.rpc('update_customer_points_atomic', {
          p_customer_uid: reservation.customer_uid,
          p_tenant_id: reservation.tenant_id,
          p_org_id: reservation.org_id,
          p_points_delta: -reservation.detail.use_points, // 減算なので負の値
          p_transaction_type: 'used',
          p_description: `決済完了時のポイント利用 (予約ID: ${coreResult.reservationId})`,
          p_reservation_id: coreResult.reservationId,
        });

        if (error) {
          throw error;
        }

        const result = data?.[0];
        if (!result) {
          throw new Error('ポイント更新処理でエラーが発生しました。');
        }

        console.log(`[handleConfirmSideEffects] ポイント減算成功: ${reservation.customer_uid}, 使用ポイント: ${reservation.detail.use_points}, 新残高: ${result.new_total_points}, トランザクションID: ${result.transaction_id}`);

      } catch (pointError) {
        console.error(`[handleConfirmSideEffects] ポイント減算失敗 (予約ID: ${coreResult.reservationId}):`, pointError);
        throw new Error(`ポイント減算処理でエラーが発生しました: ${pointError instanceof Error ? pointError.message : 'Unknown error'}`);
      }
    }

    // クレジットカード決済の場合のみカルテ作成
    if(payload.reservation?.detail?.payment_method === "credit_card" && payload.reservation?.customer_uid && payload.reservation?.org_id) {
      const carteRepo = new CarteRepository(supabaseService);
      const carte = await carteRepo.findOrCreateByCustomer(
          payload.reservation.tenant_id,
          payload.reservation.org_id,
          payload.reservation.customer_uid,
        {
          ltv_price: 0, // 作成時はLTVに加算しない
        }
      );
      // カルテ詳細を追加
      const carteDetailRepo = new CarteDetailRepository(supabaseService);
      await carteDetailRepo.createCarteDetail({
        tenant_id: payload.reservation.tenant_id,
        org_id: payload.reservation.org_id,
        carte_id: carte.id,
        reservation_id: coreResult.reservationId,
        staff_id: payload.reservation.staff_id || '',
        staff_name: payload.reservation.staff_name || '',
        // JST(UTC+9) の ISO 文字列に変換
        service_start_time: new Date(payload.reservation.start_time_unix + 9 * 60 * 60 * 1000).toISOString(),
        menu_details: payload.reservation.detail?.menus || [],
        option_details: payload.reservation.detail?.options || [],
        total_price: payload.reservation.detail?.total_price || 0,
        notes: '',
        customer_requests: payload.reservation.detail?.notes || '',
      });
    }
  } catch (error) {
    console.error("Confirm side effects error:", error);
    throw error;
  }
}

// キャンセル時の副次処理
async function handleCancelSideEffects(
  supabaseService: SupabaseService, 
  payload: {
    reservation?: Doc<'reservation'> & {
      detail?: Doc<'reservation_detail'> | null;
    };
  }, 
  coreResult: {
    reservationId: string;
  }
) {
  console.log('handleCancelSideEffects', coreResult);
  // 予約詳細はpayloadから取得
  const reservation = payload.reservation;
  
  if (!reservation || !reservation.customer_uid) return;
  
  const carteDetailRepo = new CarteDetailRepository(supabaseService);
  
  try {
    // 1. カルテ詳細レコードを削除
    const carteDetail = await carteDetailRepo.findByReservation(
      reservation.tenant_id,
      reservation.org_id,
      reservation._id
    );
    if (carteDetail) {
      await carteDetailRepo.deleteRecord('id', carteDetail.id);
      console.log(`[handleCancelSideEffects] Deleted carte_detail record: ${carteDetail.id}`);
    }

    // 2. ポイント返還処理
    if (reservation.detail?.use_points && reservation.detail.use_points > 0) {
      const pointTransactionRepo = new PointTransactionRepository(supabaseService);
      
      try {
        await pointTransactionRepo.refundPointsForCancellation({
          customerUid: reservation.customer_uid,
          reservationId: reservation._id,
          refundPoints: reservation.detail.use_points,
          tenantId: reservation.tenant_id,
          orgId: reservation.org_id,
        });
        
        console.log(`[handleCancelSideEffects] Refunded ${reservation.detail.use_points} points for reservation ${reservation._id}`);
      } catch (pointError) {
        console.error(`[handleCancelSideEffects] Failed to refund points for reservation ${reservation._id}:`, pointError);
        // ポイント返還失敗はログに記録するが、キャンセル処理は継続
      }
    }

    if(reservation.status === "completed" && reservation.customer_uid) {
      await cancelForCompletedReservation(supabaseService, reservation);
    }
  } catch (error) {
    console.error("Cancel side effects error:", error);
    throw error;
  }
}

// ステータス変更時の副次処理
async function handleStatusSideEffects(
  ctx: ActionCtx, // Action context for running mutations
  supabaseService: SupabaseService, 
  payload: StatusSideEffectsPayload, 
  coreResult: {
    reservationId: string;
  }
) {

  console.log(`[handleStatusSideEffects] Status changed to ${payload.status} for reservation ${payload.reservationId} ${coreResult.reservationId}`);
  
  // 予約情報を取得
  const reservation = payload.reservation;
  if (!reservation || !reservation.detail) {
    console.error('[handleStatusSideEffects] No reservation or detail found');
    return;
  }

  // completed ステータスへの変更時の処理
  if (payload.status === 'completed' && reservation.customer_uid) {
    const pointTaskQueueRepo = new PointTaskQueueRepository(supabaseService);
    const customerRepo = new CustomerRepository(supabaseService);
    const carteRepo = new CarteRepository(supabaseService);
    try {
      // 1. カルテのLTV価格に今回の支払総額を加算
      const carte = await carteRepo.findOrCreateByCustomer(
        reservation.tenant_id,
        reservation.org_id,
        reservation.customer_uid,
        {
          ltv_price: 0, // 初期値
        }
      );
      
      await carteRepo.update(carte.id, {
        ltv_price: (carte.ltv_price || 0) + (reservation.detail?.total_price || 0),
        updated_at: new Date().toISOString(),
      });
      
      // 2. 30日後のポイント付与タスクを作成
      const pointConfig = payload.pointConfig;
      if (pointConfig && pointConfig.is_active) {
        const earnPoints = pointConfig.is_fixed_point ? pointConfig.fixed_point : Math.floor((reservation.detail?.total_price || 0) * ((pointConfig.point_rate || 0) / 100));
        
        if (earnPoints && earnPoints > 0) {
          await pointTaskQueueRepo.create({
            tenant_id: reservation.tenant_id,
            org_id: reservation.org_id,
            customer_uid: reservation.customer_uid,
            reservation_id: reservation._id,
            points: earnPoints,
            scheduled_for_unix: reservation.start_time_unix + (30 * 24 * 60 * 60 * 1000), // 30日後
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      
      // 3. 顧客情報を取得・更新
      const { customer } = await customerRepo.getCompleteCustomerData(
        reservation.customer_uid,
        reservation.tenant_id,
        reservation.org_id
      );
      
      if (customer) {
        
        const updateData: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
          // 4. total_reservation_countを1増やす
          total_reservation_count: (customer.total_reservation_count || 0) + 1,
          // 6. last_reservation_date_unixを現在時刻で更新（秒単位）
          last_reservation_date_unix: Math.floor(Date.now() / 1000),
        };
        
        // 5. 初回顧客の場合はcustomer_typeを"repeat"に変更
        if (customer.customer_type === 'first_time') {
          updateData.customer_type = 'repeat';
        }
        
        // 顧客基本情報を RPC 経由で更新
        await customerRepo.updateCustomer(
          reservation.customer_uid,
          reservation.tenant_id,
          reservation.org_id,
          updateData,
        );
        
        // ポイント減算は予約確定時に実行済みなので、ここではログのみ
        if (reservation.detail.use_points) {
          console.log(`[handleStatusSideEffects] Points already deducted at reservation confirmation: ${reservation.detail.use_points} points for reservation ${reservation._id}`);
        }

        // 7. クーポン利用時の処理（completed時は利用回数更新のみ）
        // 注意: クーポントランザクションは予約確定時に既に作成済みであるべき
        if(reservation.detail.coupon_discount && reservation.detail.coupon_discount > 0 && reservation.detail.coupon_id) {
          try {
            // クーポントランザクションが既に存在するかチェック
            const couponTransactionRepo = new CouponTransactionRepository(supabaseService);
            const existingTransaction = await couponTransactionRepo.findByReservation(
              reservation.tenant_id,
              reservation.org_id,
              reservation._id
            );

            if (existingTransaction) {
              console.log(`[handleStatusSideEffects] クーポントランザクションは既に存在します: ${existingTransaction.id}`);
            } else {
              console.warn(`[handleStatusSideEffects] クーポントランザクションが見つかりません。completed時に作成します: ${reservation._id}`);
              
              // 緊急対応として completed 時にトランザクションを作成
              const couponTransaction = await couponTransactionRepo.create({
                tenant_id: reservation.tenant_id,
                org_id: reservation.org_id,
                coupon_id: reservation.detail.coupon_id,
                customer_uid: reservation.customer_uid,
                reservation_id: reservation._id,
                transaction_date_unix: Math.floor(Date.now() / 1000),
                discount_amount: reservation.detail.coupon_discount,
              });

              console.log(`[handleStatusSideEffects] 緊急作成されたクーポントランザクション: ${couponTransaction.id}`);
            }

            // クーポン利用回数を更新（重複チェック付き）
            await fetchMutation(api.coupon.config.mutation.updateNumberOfUse, {
              type: 'increment',
              tenant_id: reservation.tenant_id as Id<'tenant'>,
              org_id: reservation.org_id as Id<'organization'>,
              coupon_id: reservation.detail.coupon_id as Id<'coupon'>,
            });

            console.log(`[handleStatusSideEffects] クーポン利用回数を更新しました: ${reservation.detail.coupon_id}`);
          } catch (couponError) {
            console.error(`[handleStatusSideEffects] クーポン処理でエラーが発生しました (予約ID: ${reservation._id}):`, couponError);
            // クーポン処理のエラーは予約完了処理をブロックしない（ビジネス継続性優先）
          }
        }
      }
      
      // 8. 予約データをSupabaseに移行し、成功後にConvexから削除
      try {
        await migrateReservationToSupabase(ctx, reservation);
        console.log(`[handleStatusSideEffects] Reservation migrated to Supabase and deleted from Convex successfully: ${reservation._id}`);
      } catch (migrationError) {
        // Supabase移行エラーは予約完了処理を停止させない（ビジネス継続性優先）
        const errorMessage = migrationError instanceof Error ? migrationError.message : 'Unknown migration error';
        console.error(`[handleStatusSideEffects] Supabase migration failed but reservation completion continues: ${reservation._id}`, {
          error: errorMessage,
          reservation_id: reservation._id,
          tenant_id: reservation.tenant_id,
          org_id: reservation.org_id
        });
        // エラーログを記録するが処理は継続
      }

      // 9. 売上集計をリアルタイム更新
      try {
        await updateSupabaseSalesAggregation(reservation);
        console.log(`[handleStatusSideEffects] Sales aggregation updated successfully: ${reservation._id}`);
      } catch (aggregationError) {
        // 売上集計エラーも予約完了処理を停止させない（ビジネス継続性優先）
        const errorMessage = aggregationError instanceof Error ? aggregationError.message : 'Unknown aggregation error';
        console.error(`[handleStatusSideEffects] Sales aggregation failed but reservation completion continues: ${reservation._id}`, {
          error: errorMessage,
          reservation_id: reservation._id,
          tenant_id: reservation.tenant_id,
          org_id: reservation.org_id,
          total_price: reservation.detail?.total_price
        });
        // エラーログを記録するが処理は継続
      }
      
      console.log('[handleStatusSideEffects] Completed status side effects successfully');
    } catch (error) {
      console.error('[handleStatusSideEffects] Error in completed status side effects:', error);
      throw error;
    }
  } else if ((payload.status === 'cancelled' || payload.status === 'refunded') && reservation.customer_uid) {
    console.log('[handleStatusSideEffects] Cancelled status side effects');

    const carteDetailRepo = new CarteDetailRepository(supabaseService);
    console.log('handleCancelSideEffects', coreResult);
    // 予約詳細はpayloadから取得
    const reservation = payload.reservation;
    if (!reservation || !reservation.customer_uid) return;
    try {
      // 1. カルテ詳細レコードを削除
      const carteDetail = await carteDetailRepo.findByReservation(
        reservation.tenant_id,
        reservation.org_id,
        reservation._id
      );
      if (carteDetail) {
        await carteDetailRepo.deleteRecord('id', carteDetail.id);
        console.log(`[handleCancelSideEffects] Deleted carte_detail record: ${carteDetail.id}`);
      }

      // 2. ポイント返還処理
      if (reservation.detail?.use_points && reservation.detail.use_points > 0) {
        const pointTransactionRepo = new PointTransactionRepository(supabaseService);
        
        try {
          await pointTransactionRepo.refundPointsForCancellation({
            customerUid: reservation.customer_uid,
            reservationId: reservation._id,
            refundPoints: reservation.detail.use_points,
            tenantId: reservation.tenant_id,
            orgId: reservation.org_id,
          });
          
          console.log(`[handleStatusSideEffects] Refunded ${reservation.detail.use_points} points for cancelled reservation ${reservation._id}`);
        } catch (pointError) {
          console.error(`[handleStatusSideEffects] Failed to refund points for reservation ${reservation._id}:`, pointError);
          // ポイント返還失敗はログに記録するが、キャンセル処理は継続
        }
      }

      if(reservation.status === "completed" && reservation.customer_uid) {
        await cancelForCompletedReservation(supabaseService, reservation);
      }
    } catch (error) {
      console.error("Cancel side effects error:", error);
      throw error;
    }
  } else if (payload.status === 'confirmed' && reservation.customer_uid) {
    console.log('[handleStatusSideEffects] Confirmed status side effects');
  } else if (payload.status === 'pending' && reservation.customer_uid) {
    console.log('[handleStatusSideEffects] Pending status side effects');
  }
}

/**
 * 単一の予約データをConvexからSupabaseに移行し、移行成功後にConvexから削除する
 * 予約完了時に即座に実行される
 */
async function migrateReservationToSupabase(
  ctx: ActionCtx,
  reservation: Doc<'reservation'> & {
    detail?: Doc<'reservation_detail'> | null;
  }
) {
  try {
    // Supabase管理者クライアントを作成
    const supabase = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    console.log(`[migrateReservationToSupabase] Starting migration for reservation: ${reservation._id}`);
    
    // 予約データの変換（migration/action.tsのロジックを参考）
    const reservationPayload = {
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
      customer_uid: reservation.customer_uid || null,
      staff_id: reservation.staff_id,
      customer_name: reservation.customer_name,
      staff_name: reservation.staff_name || null,
      status: reservation.status,
      payment_status: reservation.payment_status,
      stripe_checkout_session_id: reservation.stripe_checkout_session_id || null,
      stripe_payment_intent_id: reservation.stripe_payment_intent_id || null,
      date: reservation.date,
      start_time_unix: reservation.start_time_unix,
      end_time_unix: reservation.end_time_unix,
      // フリー指名関連フィールド
      is_free_nomination: reservation.is_free_nomination || false,
      assigned_staff_id: reservation.assigned_staff_id || null,
      assigned_staff_name: reservation.assigned_staff_name || null,
      assignment_timestamp: reservation.assignment_timestamp || null,
      last_staff_change: reservation.last_staff_change || null,
      // キャンセル関連フィールド
      cancelled_at: reservation.cancelled_at || null,
      cancelled_by: reservation.cancelled_by || null,
      cancel_reason: reservation.cancel_reason || null,
      // リマインダー関連フィールド
      reminder_sent: reservation.reminder_sent || false,
      reminder_sent_at: reservation.reminder_sent_at || null,
      pending_expiry: reservation.pending_expiry || null,
      is_archive: reservation.is_archive || false,
      _convex_id: reservation._id, // ConvexレコードIDを保持
      _creation_time: Math.floor(reservation._creationTime) // 小数点を切り捨てて整数に変換
    };
    
    // 予約データをSupabaseに挿入/更新
    const { error: reservationError } = await supabase
      .from('reservation')
      .upsert(reservationPayload, { 
        onConflict: '_convex_id'
      });
    
    if (reservationError) {
      throw new Error(`Reservation upsert error: ${reservationError.message}`);
    }
    
    console.log(`[migrateReservationToSupabase] Reservation migrated successfully: ${reservation._id}`);
    
    // 予約詳細データがある場合は移行
    if (reservation.detail) {
      const detailPayload = {
        tenant_id: reservation.tenant_id,
        org_id: reservation.org_id,
        reservation_id: reservation._id, // NOT NULL制約があるため必須
        coupon_id: reservation.detail.coupon_id || null,
        total_price: reservation.detail.total_price || null,
        payment_method: reservation.detail.payment_method || 'cash',
        menus: reservation.detail.menus || [],
        options: reservation.detail.options || [],
        extra_charge: reservation.detail.extra_charge || null,
        use_points: reservation.detail.use_points || null,
        coupon_discount: reservation.detail.coupon_discount || null,
        featured_hair_images: reservation.detail.featured_hair_images || [],
        notes: reservation.detail.notes || null,
        cancellation_info: reservation.detail.cancellation_info || null,
        is_archive: reservation.detail.is_archive || false,
        _convex_id: reservation.detail._id,
        _convex_reservation_id: reservation._id,
        _creation_time: Math.floor(reservation.detail._creationTime)
      };
      
      const { error: detailError } = await supabase
        .from('reservation_detail')
        .upsert(detailPayload, { 
          onConflict: '_convex_id'
        });
      
      if (detailError) {
        throw new Error(`Reservation detail upsert error: ${detailError.message}`);
      }
      
      console.log(`[migrateReservationToSupabase] Reservation detail migrated successfully: ${reservation.detail._id}`);
    }
    
    console.log(`[migrateReservationToSupabase] Migration completed successfully for reservation: ${reservation._id}`);
    
    // Supabase移行成功後、Convexから予約データを削除してデータ重複を防ぐ
    try {
      const deleteResult = await ctx.runMutation(internal.reservation.mutation.deleteReservationAfterMigration, {
        reservation_id: reservation._id,
      });
      
      if (deleteResult.success) {
        console.log(`[migrateReservationToSupabase] Convex reservation data deleted successfully after migration: ${reservation._id}`);
      } else {
        console.warn(`[migrateReservationToSupabase] Failed to delete Convex data after successful migration: ${reservation._id}`, deleteResult.error);
      }
    } catch (deleteError) {
      // 削除失敗はSupabase移行の成功を阻害しない（ログのみ記録）
      const deleteErrorMessage = deleteError instanceof Error ? deleteError.message : 'Unknown delete error';
      console.error(`[migrateReservationToSupabase] Critical: Failed to delete Convex data after successful Supabase migration for reservation ${reservation._id}:`, {
        error: deleteErrorMessage,
        reservation_id: reservation._id,
        tenant_id: reservation.tenant_id,
        org_id: reservation.org_id
      });
      // エラーは再スローしない（Supabase移行は成功しているため）
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[migrateReservationToSupabase] Migration failed for reservation ${reservation._id}:`, {
      error: errorMessage,
      reservation_id: reservation._id,
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id
    });
    
    // エラーを再スローして呼び出し元でハンドリングできるようにする
    throw new Error(`Reservation migration failed: ${errorMessage}`);
  }
}

/**
 * 予約完了時にSupabaseの売上集計テーブルを更新する（差額配賦対応版）
 * 新しいincrement_sales_with_guard_v3 RPC関数を使用してオプション・指名料・割引を按分配賦
 */
async function updateSupabaseSalesAggregation(reservation: Doc<'reservation'> & {
  detail?: Doc<'reservation_detail'> | null;
}) {
  // 予約詳細がない場合はスキップ
  if (!reservation.detail) {
    console.log(`[updateSupabaseSalesAggregation] No detail found for reservation: ${reservation._id}`);
    return;
  }

  try {
    // Supabase管理者クライアントを作成
    const supabase = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    console.log(`[updateSupabaseSalesAggregation] Starting aggregation update for reservation: ${reservation._id}`);
    
    // 営業日を算出（start_time_unixから日付を取得）
    const businessDate = new Date(reservation.start_time_unix).toISOString().split('T')[0];
    const totalAmount = reservation.detail.total_price || 0;
    
    // メニューデータの準備（パーティション対応RPC関数用）
    const menusForRpc = reservation.detail.menus && Array.isArray(reservation.detail.menus) 
      ? reservation.detail.menus.filter(menu => menu.id && menu.id.trim() !== '') // 空のIDを除外
      : null;
    
    // オプションデータの準備
    const optionsForRpc = reservation.detail.options && Array.isArray(reservation.detail.options) 
      ? reservation.detail.options.filter(option => option.id && option.id.trim() !== '') // 空のIDを除外
      : null;
    
    // 差額配賦対応RPC関数を呼び出し（v3使用）
    const { data: result, error } = await supabase.rpc('increment_sales_with_guard_v3', {
      p_reservation_id: reservation._id,
      p_tenant_id: reservation.tenant_id,
      p_org_id: reservation.org_id,
      p_business_date: businessDate,
      p_amount: totalAmount,
      p_staff_id: reservation.staff_id || null,
      p_staff_name: reservation.staff_name || null,
      p_menus: menusForRpc,
      p_options: optionsForRpc,
      p_extra_charge: reservation.detail.extra_charge || 0,
      p_coupon_discount: reservation.detail.coupon_discount || 0,
      p_use_points: reservation.detail.use_points || 0
    });

    if (error) {
      throw new Error(`RPC function error: ${error.message} (${error.code || 'Unknown code'})`);
    }

    // 結果の詳細ログ出力
    if (result?.status === 'success') {
      console.log(`[updateSupabaseSalesAggregation] Aggregation update completed successfully for reservation: ${reservation._id}`, {
        reservation_id: reservation._id,
        operations: result.operations || [],
        performance: result.performance || {},
        business_date: businessDate,
        total_amount: totalAmount
      });
    } else if (result?.status === 'duplicate') {
      console.log(`[updateSupabaseSalesAggregation] Duplicate processing detected for reservation: ${reservation._id}`, {
        reservation_id: reservation._id,
        message: result.message,
        processed_at: result.processed_at
      });
      // 重複処理は正常として扱う（エラーにしない）
      return;
    } else if (result?.status === 'error') {
      throw new Error(`RPC processing error: ${result.message || 'Unknown RPC error'}`);
    } else {
      throw new Error(`Unexpected RPC response format: ${JSON.stringify(result)}`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[updateSupabaseSalesAggregation] Aggregation update failed for reservation ${reservation._id}:`, {
      error: errorMessage,
      reservation_id: reservation._id,
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
      total_price: reservation.detail?.total_price,
      business_date: new Date(reservation.start_time_unix).toISOString().split('T')[0],
      staff_id: reservation.staff_id,
      menu_count: reservation.detail.menus?.length || 0
    });
    
    // エラーを再スローして呼び出し元でハンドリングできるようにする
    throw new Error(`Sales aggregation failed: ${errorMessage}`);
  }
}

/**
 * 予約データエクスポート用アクション
 * 大量データを効率的に取得するためのアクション関数
 */
export const exportReservations = action({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    start_date: v.string(),
    end_date: v.string(),
    status_filter: v.optional(reservationStatusType),
  },
  handler: async (ctx, args) => {
    // バリデーション
    validateStringLength(args.org_id, 'org_id');
    validateDateStrFormat(args.start_date, 'start_date');
    validateDateStrFormat(args.end_date, 'end_date');
    
    // 期間制限チェック（最大3ヶ月）
    const startDate = new Date(args.start_date);
    const endDate = new Date(args.end_date);
    const diffInMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                        (endDate.getMonth() - startDate.getMonth());
    
    if (diffInMonths > 3) {
      throw new Error('Period cannot exceed 3 months');
    }
    
    // 全件データを取得
    const allReservations = [];
    const allDetails = [];
    let hasMore = true;
    let cursor: string | null = null;

    while (hasMore) {
      const result: {
        reservations: Doc<'reservation'>[];
        details: Doc<'reservation_detail'>[];
        hasMore: boolean;
        nextCursor: string | null;
      } = await ctx.runQuery(api.reservation.query.listOrganizationAllStatusForExport, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        start_date: args.start_date,
        end_date: args.end_date,
        status_filter: args.status_filter,
        cursor: cursor || undefined,
        limit: 1000, // 大きなバッチサイズで効率的に取得
      });
      
      allReservations.push(...result.reservations);
      allDetails.push(...result.details);
      hasMore = result.hasMore;
      cursor = result.nextCursor || null;
    }
    
    return {
      reservations: allReservations,
      details: allDetails,
      hasMore: hasMore,
      nextCursor: cursor,
    };
  },
})

















