import { requireReservationCreation, requireReservationMutation } from '@/convex/utils/reservationAccess'
import { assertSameOrganization } from '@/convex/utils/notificationAccess'

import { internal } from '@/convex/_generated/api'
import { mutation, internalMutation } from '@/convex/_generated/server';
import { v } from 'convex/values';
import { updateRecord } from '@/convex/utils/helpers';
import { reservationStatusType,  paymentMethodType,reservationPaymentStatusType, reservationMenuType, reservationOptionType, imageType, StaffChangeHistory } from '@/convex/types';
import { validateRequired, validateRequiredNumber, validateDateStrToDate } from '@/convex/utils/validations';
import { ConvexError } from 'convex/values';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';
import { cancelableDeadline } from '@/convex/reservation/reservation.helpers'; 
 import { Id } from '../_generated/dataModel';
import {
  createReservationWithDetails,
  archiveReservationWithDetails,
  deleteReservationWithDetails,
  checkReservationDoubleBooking,
  findBestAvailableStaffForTimeSlot,
  checkAdvancedStaffSwapPossibility
} from '@/convex/reservation/reservation.helpers';

/**

1. Convex ミューテーションのトランザクショナル性

Convex のミューテーションは内部的に Optimistic Concurrency Control （OCC）を用いており、同一テーブルへの同時書き込みが競合すると自動的に再試行されるため、同一ミューテーション内でチェック→挿入を連続的に実行することで、外部呼び出しを挟む方法よりも整合性が担保されやすいです  ￼ ￼。
	•	たとえば、checkDoubleBooking を別クエリとして呼び出す場合、クエリ実行後に別のリクエストで同じ時間帯の予約が入る可能性があります。しかし、ミューテーション内にチェックロジックを内包し、直後に挿入する実装であれば、Convex が提供するトランザクション的な実行保証（シリアライズ処理）が働き、最後まで同じミューテーション内で連続実行されます  ￼ ￼。
	•	さらに、Convex のサンドボックス化された JavaScript 実行環境により、ミューテーション内で外部副作用を起こさず、データベース権限・読み書き以外の処理は許されないため、途中で外部 API を呼んで結果が変わるリスクもありません  ￼。

⸻

2. レースコンディション発生メカニズムと対策

2.1 レースコンディションの原理

レースコンディションは「複数の処理が同時に同じデータにアクセスし、更新のタイミングによって結果が不定になる状況」です  ￼ ￼。例えば、予約の重複チェックをクエリとして呼び出した直後に別リクエストが同時間帯の予約を挿入してしまうと、チェック後に矛盾した結果で予約を受け付けてしまう恐れがあります  ￼。

2.2 Convex における対策
	•	同一ミューテーション内での連続実行
Convex ミューテーションはサーバーサイドで一度にバッチ的に実行され、最終的な書き込みを OCC によって試行します。これにより、同一ミューテーション内で重複チェック→挿入を並列にせず直列に処理すれば、チェックと挿入の間に別プロセスが介入しづらくなります  ￼ ￼。
	•	OCC による自動再試行
それでも、極めて同時刻に複数ミューテーションが到達するケースでは、そのタイミングで同一レコードに対する書き込み衝突が発生し、Convex の OCC により一方のミューテーションが失敗して再試行されます。この再試行によって、結果として重複チェックの結果が再取得され、最終的に一方のみが書き込まれる仕組みです  ￼。

⸻

3. 以下の順序で処理を行っています。
	1.	入力バリデーション・スタッフ・組織の存在チェック
	2.	reservation_config から availableSheet を取得
	3.	組織全体で同日・予約受付済みの既存予約をクエリし、時間帯重複数 overlapCount を算出
	•	overlapCount >= availableSheet の場合は即例外投げ
	4.	同じスタッフ・同日・予約受付済みで時間帯が重複する予約をクエリし、1件でも存在すれば例外投げ
	5.	例外が発生しなければ ctx.db.insert('reservation', …) で新規予約レコードを作成
	6.	createReservationWithDetails で関連テーブルにも同一関数内でレコードを挿入

  「重複チェック→挿入」を同じミューテーション内にまとめた形です  ￼ ￼。
	•	予約件数上限 (availableSheet) のチェックと挿入を同じ関数内で直列実行
たとえば orgReservations を取得し、overlapCount を算出した後、すぐにエラー投げまたは次ステップへ進み、外部の別クエリ呼び出しを挟んでいません。これにより、チェック結果と挿入の間に別リクエストが介入する"間"がかなり小さくなっています  ￼ ￼。
	•	スタッフ単位の時間帯重複チェックも同様に同関数内で行い、そのままエラー投げまたは挿入へ。したがって、チェック→挿入の連続性が保たれています  ￼ ￼。

よって、多少の同時リクエストがあったとしても、Convex の OCC による自動再試行メカニズムが働き、最終的に正しいデータ整合性が担保されるため、実運用上「重複予約を許さない」要件を十分満たすといえます  ￼ ￼。

⸻

4. 注意点およびさらに安全性を高めるための提案

4.1 可能な OCC エラーの捕捉と再試行ロジック

Convex の OCC エラーは自動的に再試行されますが、ミューテーション内で何かしら例外をキャッチしてしまうと自動再試行がスキップされる恐れがあります  ￼。
	•	もし独自に try/catch を追加している場合は、ConvexError 以外の例外は再スローするようにし、OCC が発生したときに Convex の再試行機構が生きるように注意してください  ￼。

4.2 インデックス設計とクエリ最適化
	•	withIndex('by_tenant_org_date_status_archive', ...) と withIndex('by_tenant_org_staff_date_status_archive', ...) の両方を使っていますが、インデックスが適切に設定されていることでクエリが高速化され、結果的にチェック→挿入のタイミングラグがさらに小さくなります  ￼。
	•	インデックスのカーディナリティ（値の種類）が高い場合、実行プランによってはサブインデックスが使われず全表走査になる可能性もあるため、Convex ダッシュボードの「Query Performance」セクションで実行時間を確認し、必要なら追加インデックスを検討すると良いでしょう  ￼。

4.3 マルチインスタンス環境での検証
	•	複数クライアント（たとえばウェブとモバイルアプリ）が同時に予約を試みた場合の挙動を本番環境と同等の条件で負荷テストすることで、意図しないシナリオ（例：深夜バッチや外部システム連携による予約一括挿入時など）が発生したときに正常に再試行が起きるかを確認しておくと安心です  ￼ ￼。
*/

// フリー指名予約のスタッフ自動割り当て処理
export const assignStaffForFreeNomination = internalMutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    date: v.string(),
    menu_ids: v.array(v.id('menu')),
    option_ids: v.array(v.id('option')),
    start_time_unix: v.number(),
    end_time_unix: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    assignedStaff: v.optional(v.object({
      id: v.id('staff'),
      name: v.string(),
      priority: v.number(),
      extra_charge: v.number(),
      assigned_at: v.number(),
    })),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const bestStaff = await findBestAvailableStaffForTimeSlot(ctx, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        menu_ids: args.menu_ids,
        date: args.date,
        start_time_unix: args.start_time_unix,
        end_time_unix: args.end_time_unix,
      });

      if (!bestStaff) {
        return {
          success: false,
          error: 'この時間帯に対応可能なスタッフが見つかりませんでした',
        };
      }

      return {
        success: true,
        assignedStaff: {
          id: bestStaff.staff_id,
          name: bestStaff.staff_name,
          priority: bestStaff.priority,
          extra_charge: bestStaff.extra_charge,
          assigned_at: Date.now(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '予期しないエラーが発生しました',
      };
    }
  },
});

// 予約の追加処理
// 予約作成に必要な情報を受け取り、入力バリデーションやスタッフ・組織の存在確認を行う。
// さらに、予約時間の重複チェック（Race condition防止）を実施し、問題なければ予約と予約詳細を同時に作成する。
// 共通ヘルパーを利用することで、予約と関連情報の一貫性を保ちつつ効率的に処理を行う。
export const create = mutation({
  args: {
    tenant_id: v.id('tenant'), // テナントID
    org_id: v.id('organization'), // 組織ID
    customer_uid: v.optional(v.string()), // Supabase 側の customer.id
    staff_id: v.optional(v.id('staff')), // スタッフID（指名フリーの場合はundefined）
    customer_name: v.string(), // 顧客名
    staff_name: v.optional(v.string()), // スタッフ名（指名フリーの場合はundefined）
    is_free_nomination: v.optional(v.boolean()), // 指名フリーフラグ
    status: reservationStatusType, // 予約ステータス
    date: v.string(), // 予約日 YYYY-MM-DD
    start_time_unix: v.number(), // 予約開始時間
    end_time_unix: v.number(), // 予約終了時間
    total_price: v.number(), // 合計金額
    coupon_id: v.optional(v.id('coupon')), // クーポンID
    payment_method: paymentMethodType, // 支払方法
    stripe_checkout_session_id: v.optional(v.string()), // Stripe Checkout Session ID
    payment_status: reservationPaymentStatusType, // 支払ステータス
    menus: v.array(reservationMenuType), // メニュー
    options: v.array(reservationOptionType), // オプション
    extra_charge: v.optional(v.number()), // 追加料金
    use_points: v.optional(v.number()), // 使用ポイント数
    coupon_discount: v.optional(v.number()), // クーポン割引額
    featured_hair_images: v.array(imageType), // フィーチャー画像
    notes: v.optional(v.string()), // メモ
    // 決済失敗対策用フィールド
    pending_duration_minutes: v.optional(v.number()), // pending状態の有効期限（分）
  },
  handler: async (ctx, args) => {
    await requireReservationCreation(ctx, args)
    // 入力値の妥当性を検証し、不正なデータの登録を防止するためのバリデーション処理
    validateDateStrToDate(args.date, 'date')
    validateRequiredNumber(args.start_time_unix, 'start_time_unix')
    validateRequiredNumber(args.end_time_unix, 'end_time_unix')
    validateRequired(args.org_id, 'org_id')

    // 指名フリーではない場合、スタッフIDに対応するスタッフが存在するかを確認
    if (!args.is_free_nomination && args.staff_id) {
      const staff = await ctx.db.get(args.staff_id)
      if (!staff) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.NOT_FOUND,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.create',
          message: '指定されたスタッフが存在しません',
          code: 'NOT_FOUND',
          status: 404,
          details: {
            ...args,
          },
        })
      }
    } else if (!args.is_free_nomination && !args.staff_id) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.create',
        message: 'スタッフIDが必要です',
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }

    // アクティブな組織が存在し、かつアーカイブされていないことを確認する
    const organization = await ctx.db.query('organization').withIndex('by_tenant_active_archive', q => q.eq('tenant_id', args.tenant_id).eq('is_active', true).eq('is_archive', false)).first()
    if (!organization) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.INTERNAL_SERVER_ERROR,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.create',
        message: '指定された有効な組織が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      });
    }

    // 指名フリーではない場合のみ重複チェック（指名フリーは後でスタッフ割り当て時にチェック）
    if (!args.is_free_nomination && args.staff_id) {
      const isOverlapping = await checkReservationDoubleBooking(ctx, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        staff_id: args.staff_id,
        date: args.date,
        start_time_unix: args.start_time_unix,
        end_time_unix: args.end_time_unix,
      });

      if (isOverlapping) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.CONFLICT,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.create',
          message: 'この時間帯の予約はすでにいっぱいです。別の時間を選択してください。',
          code: 'CONFLICT',
          status: 409,
          details: {
            ...args,
          },
        });
      }
    }

    // pending状態の有効期限を設定（デフォルト30分）
    const pending_expiry = args.pending_duration_minutes 
      ? Date.now() + args.pending_duration_minutes * 60 * 1000
      : Date.now() + 30 * 60 * 1000;

    // 楽観的在庫管理: 予約作成時に即座に在庫を減算
    if (args.options && args.options.length > 0) {
      const stockResult = await ctx.runMutation(internal.option.stock.decrementStockForReservation, {
        options: args.options.map(opt => ({
          id: opt.id,
          quantity: opt.quantity,
        })),
      });
      
      if (!stockResult.success && stockResult.errors.length > 0) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.create',
          message: stockResult.errors[0].error,
          code: 'INSUFFICIENT_STOCK',
          status: 400,
          details: {
            ...args,
            stockErrors: stockResult.errors,
          },
        });
      }
    }

    // 指名フリーの場合はスタッフ自動割り当て
    let finalStaffId = args.staff_id;
    let finalStaffName = args.staff_name;
    let assignmentInfo = {};

    if (args.is_free_nomination) {
      const assignment = await ctx.runMutation(
        internal.reservation.mutation.assignStaffForFreeNomination,
        {
          tenant_id: args.tenant_id,
          org_id: args.org_id,
          date: args.date,
          menu_ids: args.menus.map(m => m.id),
          option_ids: args.options?.map(o => o.id) || [],
          start_time_unix: args.start_time_unix,
          end_time_unix: args.end_time_unix,
        }
      );

      if (!assignment.success || !assignment.assignedStaff) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.CONFLICT,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.create',
          message: assignment.error || '指名フリー予約のスタッフ割り当てに失敗しました',
          code: 'CONFLICT',
          status: 409,
          details: {
            ...args,
          },
        });
      }

      // 内部的に割り当てたスタッフ情報を保存
      assignmentInfo = {
        is_free_nomination: true,
        assigned_staff_id: assignment.assignedStaff.id,
        assigned_staff_name: assignment.assignedStaff.name,
        assignment_timestamp: assignment.assignedStaff.assigned_at,
      };
      
      // フリー指名でも予約にはスタッフ情報を設定
      finalStaffId = assignment.assignedStaff.id;
      finalStaffName = assignment.assignedStaff.name;
    }

    // 予約本体と詳細情報を一括で作成する共通ヘルパーを呼び出すことで、データの整合性を確保しつつ効率的に処理
    const { reservationId } = await createReservationWithDetails(ctx, {
      ...args,
      staff_id: finalStaffId,
      staff_name: finalStaffName,
      use_points: args.use_points,
      pending_expiry,
      ...assignmentInfo,
    });
    return reservationId;
  },
})

// 予約情報の更新処理
// 予約内容の変更時に必要なバリデーションや認証チェックを行い、予約が存在しアーカイブされていないことを確認する。
// 予約時間が変更された場合は重複チェックを行い、問題なければ更新処理を実行する。
// 予約IDを除外した更新データを用いて、予約レコードの整合性を保ちながら更新する。
export const update = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    reservation_id: v.id('reservation'),
    customer_uid: v.string(),
    customer_name: v.string(),
    staff_id: v.id('staff'),
    staff_name: v.string(),
    menus: v.array(reservationMenuType),
    options: v.array(reservationOptionType),
    total_price: v.number(),
    status: reservationStatusType,
    date: v.string(),
    start_time_unix: v.number(),
    end_time_unix: v.number(),
    extra_charge: v.number(),
    featured_hair_images: v.array(imageType),
    use_points: v.number(),
    coupon_id: v.id('coupon'),
    coupon_discount: v.number(),
    notes: v.string(),
    payment_method: paymentMethodType,
    stripe_checkout_session_id: v.string(),
    payment_status: reservationPaymentStatusType,
  },
  handler: async (ctx, args) => {
    // 認証チェック: ログイン済みユーザーのみ更新可能
    const managedReservation = await requireReservationMutation(ctx, args.reservation_id, 'update', args)
    assertSameOrganization(managedReservation, args.tenant_id, args.org_id)
    // 入力値の妥当性検証
    validateDateStrToDate(args.date, 'date')
    validateRequiredNumber(args.start_time_unix, 'start_time_unix')
    validateRequiredNumber(args.end_time_unix, 'end_time_unix')
    validateRequired(args.customer_uid, 'customer_uid')
    validateRequired(args.org_id, 'org_id')

    // 対象予約が存在し、アーカイブされていないことを確認
    const reservation = await ctx.db.get(args.reservation_id)
    if (!reservation || reservation.is_archive) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.update',
        message: '指定された予約が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      })
    }

    // 予約時間が変更された場合は重複チェックを実施し、同時間帯に他の予約が存在しないかを検証（Race condition防止）
    if (
      (args.start_time_unix !== reservation.start_time_unix ||
        args.end_time_unix !== reservation.end_time_unix)
    ) {
      const isOverlapping = await checkReservationDoubleBooking(ctx, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        staff_id: args.staff_id,
        date: args.date,
        start_time_unix: args.start_time_unix,
        end_time_unix: args.end_time_unix,
        excludeReservationId: reservation._id, // 自分自身の予約は除外
      });

      if (isOverlapping) {
        throw new ConvexError({
          message: 'この時間帯はすでに予約が入っています。別の時間を選択してください。',
          statusCode: ERROR_STATUS_CODE.CONFLICT,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.update',
          code: 'CONFLICT',
          status: 409,
          details: {
            ...args,
          },
        })
      }
    }

    // reservation_idを除外した更新データを作成（予約IDは更新対象外のため除外）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reservation_id, ...updateData } = args

    // 予約本体の更新処理を実行し、データの整合性を保ちながら情報を更新
    return await updateRecord(ctx, args.reservation_id, updateData)
  },
})

// 予約のキャンセル処理
// 顧客またはスタッフによるキャンセル要求を処理し、各種制約をチェックする。
// キャンセル可能期限の検証、在庫の復元、ポイントタスクの削除などを一括で行う。
// キャンセル情報は予約詳細テーブルに記録し、本体のステータスも更新する。
export const cancelReservation = mutation({
  args: {
    reservationId: v.id('reservation'),
    cancelledBy: v.union(v.literal('customer'), v.literal('staff'), v.literal('system')),
    cancelReason: v.optional(v.string()),
    skipValidation: v.optional(v.boolean()), // 検証をスキップするか（システムキャンセル用）
    server_token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireReservationMutation(ctx, args.reservationId, 'cancel', args, args.server_token)
    // 予約と詳細情報を取得
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.is_archive) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.cancelReservation',
        message: '指定された予約が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: { reservationId: args.reservationId },
      });
    }

    // すでにキャンセルされている場合はエラー
    if (reservation.status === 'cancelled') {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.cancelReservation',
        message: 'この予約はすでにキャンセルされています',
        code: 'ALREADY_CANCELLED',
        status: 400,
        details: { reservationId: args.reservationId },
      });
    }

    // 予約詳細情報を取得
    const details = await ctx.db
      .query('reservation_detail')
      .withIndex('by_reservation_archive', (q) =>
        q.eq('reservation_id', args.reservationId).eq('is_archive', false)
      )
      .first();

    if (!details) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.cancelReservation',
        message: '予約詳細が見つかりません',
        code: 'NOT_FOUND',
        status: 404,
        details: { reservationId: args.reservationId },
      });
    }

    // 顧客によるキャンセルの場合はキャンセル期限をチェック
    if (args.cancelledBy === 'customer' && !args.skipValidation) {
      // 組織の設定を取得
      const orgConfig = await ctx.db
        .query('reservation_config')
        .withIndex('by_tenant_org_archive', (q) =>
          q.eq('tenant_id', reservation.tenant_id)
            .eq('org_id', reservation.org_id)
            .eq('is_archive', false)
        )
        .first();

      // キャンセル可能期限を計算（デフォルト1日前）
      const cancelDeadline = cancelableDeadline(orgConfig?.available_cancel_days || 1, reservation.start_time_unix);
      
      if (Date.now() > cancelDeadline) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'reservation.cancelReservation',
          message: 'キャンセル期限を過ぎているため、キャンセルできません',
          code: 'CANCELLATION_DEADLINE_PASSED',
          status: 400,
          details: {
            reservationId: args.reservationId,
            cancelDeadline: new Date(cancelDeadline).toISOString(),
            currentTime: new Date().toISOString(),
          },
        });
      }
    }

    // 楽観的在庫管理: キャンセル時に在庫を復元
    if (details.options && details.options.length > 0) {
      await ctx.runMutation(internal.option.stock.restoreStockForCancellation, {
        options: details.options.map(opt => ({
          id: opt.id,
          quantity: opt.quantity,
        })),
      });
    }

    // ポイントタスクを削除（予約に紐づくポイント付与をキャンセル）
    await ctx.scheduler.runAfter(0, internal.reservation.action.deletePointTaskForReservation, {
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
      reservation_id: args.reservationId,
    });

    // クーポン使用回数をデクリメント
    if (details.coupon_id) {
      try {
        await ctx.runMutation(internal.coupon.mutation.decrementUsageCount, {
          couponId: details.coupon_id,
        });
      } catch (error) {
        // クーポン使用回数の更新に失敗しても、キャンセル処理は続行
        console.error('Failed to decrement coupon usage count:', error);
      }
    }

    // 予約のステータスを更新
    await ctx.db.patch(args.reservationId, {
      status: 'cancelled',
      cancelled_at: Date.now(),
      cancelled_by: args.cancelledBy,
      cancel_reason: args.cancelReason,
      updated_at: Date.now(),
    });

    // 予約詳細にもキャンセル情報を記録
    await ctx.db.patch(details._id, {
      cancellation_info: {
        cancelled_at: Date.now(),
        cancelled_by: args.cancelledBy,
        reason: args.cancelReason,
      },
      updated_at: Date.now(),
    });

    return { success: true, reservationId: args.reservationId };
  },
});

// 支払い予約受付処理
// Stripe決済成功後に呼び出され、予約ステータスと支払いステータスを更新する。
// pending状態の予約を予約受付済みに変更し、決済情報を記録する。
export const confirmPayment = mutation({
  args: {
    reservation_id: v.id('reservation'),
    stripe_payment_intent_id: v.optional(v.string()),
    server_token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireReservationMutation(ctx, args.reservation_id, 'payment-confirm', args, args.server_token)
    // 予約の存在確認
    const reservation = await ctx.db.get(args.reservation_id);
    if (!reservation || reservation.is_archive) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.confirmPayment',
        message: '指定された予約が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: { reservationId: args.reservation_id },
      });
    }

    // すでに予約受付済みの場合は何もしない（冪等性）
    if (reservation.status === 'confirmed' && reservation.payment_status === 'paid') {
      return { success: true, alreadyConfirmed: true };
    }

    // ステータスと支払いステータスを更新
    await ctx.db.patch(args.reservation_id, {
      status: 'confirmed',
      payment_status: 'paid',
      stripe_payment_intent_id: args.stripe_payment_intent_id,
      updated_at: Date.now(),
    });

    return { success: true, alreadyConfirmed: false };
  },
});

// 予約の論理削除（アーカイブ）処理
// 物理的な削除ではなく、アーカイブフラグを立てることで履歴を保持する。
// 予約本体と詳細情報を一括でアーカイブし、関連データの整合性を保つ。
export const archive = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    reservation_id: v.id('reservation'),
  },
  handler: async (ctx, args) => {
    // 認証チェック: ログイン済みユーザーのみアーカイブ可能
    const managedReservation = await requireReservationMutation(ctx, args.reservation_id, 'delete', args)
    assertSameOrganization(managedReservation, args.tenant_id, args.org_id)
    validateRequired(args.org_id, 'org_id')

    // 対象予約が存在することを確認
    const reservation = await ctx.db.get(args.reservation_id)
    if (!reservation) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.archive',
        message: '指定された予約が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      })
    }

    // 共通ヘルパーで予約と関連データを一括アーカイブすることでデータの整合性を保持
    return await archiveReservationWithDetails(ctx, args.reservation_id)
  },
})

// 予約の物理削除処理
// 開発環境またはデータ完全削除が必要な場合に使用。本番環境では通常使用しない。
// 予約本体と詳細情報を完全に削除し、データベースから物理的に除去する。
export const kill = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    reservation_id: v.id('reservation'),
  },
  handler: async (ctx, args) => {
    // 認証チェック: ログイン済みユーザーのみ削除可能
    const managedReservation = await requireReservationMutation(ctx, args.reservation_id, 'delete', args)
    assertSameOrganization(managedReservation, args.tenant_id, args.org_id)
    validateRequired(args.org_id, 'org_id')

    // 対象予約が存在することを確認
    const reservation = await ctx.db.get(args.reservation_id)
    if (!reservation) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'reservation.kill',
        message: '指定された予約が存在しません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      })
    }

    // 共通ヘルパーで予約と関連データを完全削除することで一貫性を保つ
    return await deleteReservationWithDetails(ctx, args.reservation_id)
  },
})

/**
 * リマインダー送信ステータスを更新する内部ミューテーション
 * Cron jobから呼び出される
 */
export const updateReminderStatus = internalMutation({
  args: {
    reservationId: v.id('reservation'),
    sent: v.boolean(),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reservationId, {
      reminder_sent: args.sent,
      reminder_sent_at: args.sentAt,
      updated_at: Date.now(),
    });
  },
});


export const updateStatus = mutation({
  args: {
    reservation_id: v.id('reservation'),
    status: reservationStatusType,
  },
  handler: async (ctx, args) => {
    await requireReservationMutation(ctx, args.reservation_id, 'status', args)
    await updateRecord(ctx, args.reservation_id, {
      status: args.status,
    })

    return args.reservation_id
  },
})


/**
 * 指名フリー予約のスタッフ変更（管理画面専用）
 * @returns スタッフ変更結果
 */
export const changeStaffForFreeNomination = mutation({
  args: {
    reservation_id: v.id('reservation'),
    new_staff_id: v.id('staff'),
    changed_by: v.string(), // 変更者（管理者）の情報
  },
  returns: v.object({
    success: v.boolean(),
    previousStaff: v.optional(v.object({
      id: v.optional(v.id('staff')),
      name: v.optional(v.string()),
    })),
    newStaff: v.object({
      id: v.id('staff'),
      name: v.string(),
    }),
    wasSwapped: v.optional(v.boolean()), // 入れ替えが発生したかのフラグ
    swappedReservation: v.optional(v.object({
      id: v.id('reservation'),
      newStaffName: v.string(),
    })), // 入れ替えた相手の予約情報
  }),
  handler: async (ctx, args) => {
    await requireReservationMutation(ctx, args.reservation_id, 'staff-change', args)
    
    // 入れ替え処理の状態を管理する変数
    let wasSwapped = false;
    let swappedReservationInfo: { id: Id<'reservation'>; newStaffName: string } | undefined;
    
    // 1. 予約情報を取得
    const reservation = await ctx.db.get(args.reservation_id);
    if (!reservation) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        message: '予約が見つかりません',
      });
    }

    // 2. 指名フリー予約かチェック
    if (!reservation.is_free_nomination) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.FORBIDDEN,
        severity: ERROR_SEVERITY.ERROR,
        message: '指名フリー予約以外はスタッフ変更できません',
      });
    }

    // 3. 権限チェック（組織が一致するか）
    // Note: この権限チェックは checkAuth で組織権限を確認した後に行われるため、
    // ここでは予約が同じ組織に属することを確認している

    // 4. 新しいスタッフ情報を取得
    const newStaff = await ctx.db.get(args.new_staff_id);
    if (!newStaff || newStaff.org_id !== reservation.org_id || newStaff.tenant_id !== reservation.tenant_id || newStaff.is_archive || !newStaff.is_active) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        message: 'スタッフが見つかりません',
      });
    }

    // 5. 現在の予約詳細情報を取得（メニュー対応チェック用）
    const currentReservationDetail = await ctx.db
      .query('reservation_detail')
      .withIndex('by_reservation_archive', (q) =>
        q.eq('reservation_id', reservation._id).eq('is_archive', false)
      )
      .first();

    if (!currentReservationDetail) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        message: '予約詳細が見つかりません',
      });
    }

    // 6. 高度なスタッフ入れ替え可能性チェック
    const swapCheck = await checkAdvancedStaffSwapPossibility(ctx, {
      current_reservation: reservation,
      current_reservation_detail: currentReservationDetail,
      target_staff_id: args.new_staff_id,
      target_staff: newStaff,
    });

    console.log('スタッフ入れ替えチェック結果:', swapCheck);

    // 入れ替えが不可能な場合はエラーを投げる
    if (!swapCheck.canSwap) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.CONFLICT,
        severity: ERROR_SEVERITY.ERROR,
        message: swapCheck.reason || 'スタッフの入れ替えができません',
      });
    }

    // 入れ替えが可能で、対象予約がある場合は入れ替え処理を実行
    if (swapCheck.swappableReservation && swapCheck.swappableReservationDetail) {
      const conflictingReservation = swapCheck.swappableReservation;
      
      // 現在のスタッフIDを取得
      const currentStaffId = reservation.assigned_staff_id || reservation.staff_id;
      
      if (!currentStaffId) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
          severity: ERROR_SEVERITY.ERROR,
          message: '現在の予約にスタッフが割り当てられていません',
        });
      }

      // 現在のスタッフ情報を取得
      const currentStaff = await ctx.db.get(currentStaffId);
      if (!currentStaff) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.NOT_FOUND,
          severity: ERROR_SEVERITY.ERROR,
          message: '現在のスタッフ情報が見つかりません',
        });
      }

      // 入れ替え処理：重複している予約のスタッフを現在のスタッフに変更
      const conflictStaffChangeHistory: StaffChangeHistory = {
        changed_by: args.changed_by,
        changed_at: Date.now(),
        previous_staff_id: conflictingReservation.assigned_staff_id || conflictingReservation.staff_id,
        previous_staff_name: conflictingReservation.assigned_staff_name || conflictingReservation.staff_name,
      };

      await ctx.db.patch(conflictingReservation._id, {
        staff_id: currentStaff._id,
        staff_name: currentStaff.name || '',
        assigned_staff_id: currentStaff._id,
        assigned_staff_name: currentStaff.name || '',
        last_staff_change: conflictStaffChangeHistory,
        updated_at: Date.now(),
      });

      // 入れ替え処理の状態を記録
      wasSwapped = true;
      swappedReservationInfo = {
        id: conflictingReservation._id,
        newStaffName: currentStaff.name || '',
      };
    }

    // 7. 変更履歴を記録して更新
    const lastStaffChange: StaffChangeHistory = {
      changed_by: args.changed_by,
      changed_at: Date.now(),
      previous_staff_id: reservation.assigned_staff_id,
      previous_staff_name: reservation.assigned_staff_name,
    };

    await ctx.db.patch(reservation._id, {
      // フリー指名のスタッフ変更：is_free_nominationは維持し、staff_idとstaff_nameを更新
      staff_id: newStaff._id,
      staff_name: newStaff.name || '',
      // 履歴として assigned_staff_id も更新
      assigned_staff_id: newStaff._id,
      assigned_staff_name: newStaff.name || '',
      last_staff_change: lastStaffChange,
      updated_at: Date.now(),
    });

    return {
      success: true,
      previousStaff: {
        id: lastStaffChange.previous_staff_id,
        name: lastStaffChange.previous_staff_name,
      },
      newStaff: {
        id: newStaff._id,
        name: newStaff.name || '',
      },
      wasSwapped,
      swappedReservation: swappedReservationInfo,
    };
  },
})

/**
 * Supabase移行後にConvexの予約データを削除する内部ミューテーション
 * 移行成功後のデータ重複を防ぐために使用
 */
export const deleteReservationAfterMigration = internalMutation({
  args: {
    reservation_id: v.id('reservation'),
  },
  handler: async (ctx, args) => {
    try {
      console.log(`[deleteReservationAfterMigration] Starting deletion for reservation: ${args.reservation_id}`);
      
      // 予約の存在確認
      const reservation = await ctx.db.get(args.reservation_id);
      if (!reservation) {
        console.log(`[deleteReservationAfterMigration] Reservation not found: ${args.reservation_id}`);
        return { success: true, reason: 'already_deleted' };
      }
      
      // 共通ヘルパーで予約と関連データを完全削除
      await deleteReservationWithDetails(ctx, args.reservation_id);
      
      console.log(`[deleteReservationAfterMigration] Successfully deleted reservation: ${args.reservation_id}`);
      return { success: true };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[deleteReservationAfterMigration] Failed to delete reservation ${args.reservation_id}:`, errorMessage);
      
      // 削除失敗は重要だが、Supabase移行は成功しているので再スローしない
      // エラーログを記録するのみ
      return { success: false, error: errorMessage };
    }
  },
});