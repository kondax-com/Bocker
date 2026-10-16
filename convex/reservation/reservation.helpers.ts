import { MutationCtx, QueryCtx } from '@/convex/_generated/server';
import { Id, Doc } from '@/convex/_generated/dataModel';
import { createRecord, archiveRecord, killRecord } from '@/convex/utils/helpers';
import {
  ReservationMenu,
  ReservationOption,
  ImageType,
  PaymentMethod,
  ReservationStatus,
  ReservationPaymentStatus,
} from '@/convex/types';
import { ConvexError } from 'convex/values';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';
// Convex環境内では fetchQuery は使用できないためコメントアウト
// import { fetchQuery } from 'convex/nextjs';
import { internal } from '@/convex/_generated/api'
import { SupabaseService } from '@/services/supabase/SupabaseService'
import { getDayOfWeek, convertHourToTimestamp } from '@/lib/schedules'
import { DayOfWeek } from '@/convex/types'
import {
  PointTaskQueueRepository,
  PointTransactionRepository,
} from '@/services/supabase/repositories/point'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import { CarteRepository } from '@/services/supabase/repositories/carte'

export const getReservationWithDetail = async (
  ctx: QueryCtx,
  reservationId: Id<'reservation'>
) => {
  const reservation = await ctx.db.get(reservationId)
  if (!reservation) {
    return null
  }

  const reservationDetail = await ctx.db
    .query('reservation_detail')
    .withIndex('by_reservation_archive', (q) =>
      q.eq('reservation_id', reservationId).eq('is_archive', false)
    )
    .first()
    
  return { reservation, reservationDetail }
}

/**
 * 予約と予約詳細を同時に作成するためのヘルパー関数です。
 * この関数は、予約の基本情報と詳細情報を一括して登録することで、
 * データの整合性を保ちつつ処理を簡潔にします。
 * 
 * 引数には予約に必要な情報をすべて含めて渡してください。
 * 予約の基本情報と詳細情報を関連付けて両テーブルにデータを挿入します。
 * 
 * @param ctx Mutationコンテキスト（DBアクセス用）
 * @param args 予約情報の詳細
 * @returns 作成した予約IDと予約詳細ID
 */
/**
 * 予約の重複チェックを行う共通関数
 * データベースアクセスを直接行い、ctx.runQueryを使用しない
 * 
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args チェックパラメータ
 * @returns 重複があればtrue、なければfalse
 */
export async function checkReservationDoubleBooking(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    date: string
    start_time_unix: number
    end_time_unix: number
    excludeReservationId?: Id<'reservation'>
    ignoreGlobalSheet?: boolean 
  }
): Promise<boolean> {
  // 予約設定を取得
  const reservationConfig = await ctx.db
    .query('reservation_config')
    .withIndex('by_tenant_org_archive', (q) =>
      q.eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('is_archive', false)
    )
    .first()

  // 店舗ごとの同時受付可能席数を取得
  const availableSheet = reservationConfig?.available_sheet || 3

  // 組織全体で、該当日の confirmed かつ is_archive: false の予約のみ取得
  const orgReservations = await ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_date_status_archive', (q) =>
      q.eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('date', args.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .collect()

  const overlappingReservations = orgReservations.filter((reservation) => {
    // 除外ID（自分自身）は外す
    if (args.excludeReservationId && args.excludeReservationId === reservation._id) return false
    
    // 連続した予約（終了時刻 = 開始時刻）は重複とみなさない
    // 例: 13:00~14:00と14:00~15:00は許可、13:00~14:01と14:00~15:00は拒否
    const isOverlapping = reservation.start_time_unix < args.end_time_unix &&
      reservation.end_time_unix > args.start_time_unix
    
    return isOverlapping
  })
  
  const overlapCount = overlappingReservations.length

  if (!args.ignoreGlobalSheet && overlapCount >= availableSheet) {
    throw new ConvexError({
      statusCode: ERROR_STATUS_CODE.CONFLICT,
      severity: ERROR_SEVERITY.ERROR,
      callFunc: 'reservation.checkReservationOverlap',
      message: 'この時間帯の最大同時予約数は上限です。別の時間を選択してください。',
      code: 'CONFLICT',
      status: 409,
      details: {
        ...args,
        overlapCount,
        availableSheet
      },
    })
  }

  // 指定された条件に合致する予約を検索し、
  // 時間帯が重複している予約が存在するかを判定
  const query = ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .filter((q) =>
      q.and(
        // 時間の重複をチェック（開始時間が相手の終了時間前、終了時間が相手の開始時間後）
        q.lt(q.field('start_time_unix'), args.end_time_unix),
        q.gt(q.field('end_time_unix'), args.start_time_unix),
        // 除外IDがあればそれを除外、なければ常にtrueの条件
        args.excludeReservationId
          ? q.neq(q.field('_id'), args.excludeReservationId)
          : q.eq(q.field('_id'), q.field('_id')) // 常にtrueになる条件
      )
    )

  const overlapping = await query.first()
  return !!overlapping
}

/**
 * スタッフの同一時間帯に重複する予約を取得する関数
 * 指名フリー同士の入れ替え機能で使用
 * 
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args チェックパラメータ
 * @returns 重複している予約（なければnull）
 */
export async function getConflictingReservation(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    date: string
    start_time_unix: number
    end_time_unix: number
    excludeReservationId?: Id<'reservation'>
  }
): Promise<Doc<'reservation'> | null> {
  // 指定された条件に合致する予約を検索し、
  // 時間帯が重複している予約を取得
  const query = ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .filter((q) =>
      q.and(
        // 時間の重複をチェック（開始時間が相手の終了時間前、終了時間が相手の開始時間後）
        q.lt(q.field('start_time_unix'), args.end_time_unix),
        q.gt(q.field('end_time_unix'), args.start_time_unix),
        // 除外IDがあればそれを除外、なければ常にtrueの条件
        args.excludeReservationId
          ? q.neq(q.field('_id'), args.excludeReservationId)
          : q.eq(q.field('_id'), q.field('_id')) // 常にtrueになる条件
      )
    )

  return await query.first()
}

export async function createReservationWithDetails(
  ctx: MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    customer_uid?: string
    staff_id?: Id<'staff'>
    customer_name: string
    staff_name?: string
    is_free_nomination?: boolean
    status: ReservationStatus
    date: string
    start_time_unix: number
    end_time_unix: number
    payment_method: PaymentMethod
    payment_status: ReservationPaymentStatus
    stripe_checkout_session_id?: string
    coupon_id?: Id<'coupon'>
    total_price: number
    menus: ReservationMenu[]
    options: ReservationOption[]
    extra_charge?: number
    use_points?: number
    coupon_discount?: number
    featured_hair_images: ImageType[]
    notes?: string
    pending_expiry?: number
    assigned_staff_id?: Id<'staff'>
    assigned_staff_name?: string
    assignment_timestamp?: number
  }
) {
  // 予約テーブルに基本情報を作成
  const reservationId = await createRecord(ctx, 'reservation', {
    tenant_id: args.tenant_id,
    org_id: args.org_id,
    customer_uid: args.customer_uid,
    staff_id: args.staff_id,
    customer_name: args.customer_name,
    staff_name: args.staff_name,
    is_free_nomination: args.is_free_nomination,
    status: args.status,
    payment_status: args.payment_status,
    stripe_checkout_session_id: args.stripe_checkout_session_id,
    date: args.date,
    start_time_unix: args.start_time_unix,
    end_time_unix: args.end_time_unix,
    pending_expiry: args.pending_expiry,
    assigned_staff_id: args.assigned_staff_id,
    assigned_staff_name: args.assigned_staff_name,
    assignment_timestamp: args.assignment_timestamp,
    reminder_sent: false, // リマインダー送信フラグの初期値
  })

  // 予約詳細テーブルにメニューやオプション等の詳細情報を作成
  const reservationDetailId = await createRecord(ctx, 'reservation_detail', {
    tenant_id: args.tenant_id,
    org_id: args.org_id,
    reservation_id: reservationId,
    coupon_id: args.coupon_id,
    payment_method: args.payment_method,
    total_price: args.total_price,
    menus: args.menus,
    options: args.options,
    extra_charge: args.extra_charge,
    use_points: args.use_points,
    coupon_discount: args.coupon_discount,
    featured_hair_images: args.featured_hair_images,
    notes: args.notes,
  })

  const notificationId = await createRecord(ctx, 'reservation_notification', {
    tenant_id: args.tenant_id,
    org_id: args.org_id,
    reservation_id: reservationId,
    notification_sent: false,
    notification_sent_at: new Date().getTime(),
    date: args.date,
    start_time_unix: args.start_time_unix,
    end_time_unix: args.end_time_unix,
    customer_name: args.customer_name,
    staff_name: args.staff_name,
    status: args.status,
    payment_status: args.payment_status,
  })

  return { reservationId, reservationDetailId, notificationId }
}

/**
 * 予約とその予約詳細を同時に論理削除（アーカイブ）するヘルパー関数です。
 * 論理削除によりデータはDB上に残りつつ、通常の検索や表示から除外されます。
 * 予約詳細が存在しない場合はエラーをコンソールに出力します。
 *
 * @param ctx Mutationコンテキスト（DBアクセス用）
 * @param reservationId アーカイブ対象の予約ID
 * @returns 常にtrueを返します（処理完了の目印）
 */
export async function archiveReservationWithDetails(
  ctx: MutationCtx,
  reservationId: Id<'reservation'>
) {
  // 予約詳細を取得し、存在すればアーカイブ処理を行う
  const reservationDetail = await ctx.db
    .query('reservation_detail')
    .withIndex('by_reservation_archive', (q) =>
      q.eq('reservation_id', reservationId).eq('is_archive', false)
    )
    .first()

  if (reservationDetail) {
    // 予約詳細を論理削除（アーカイブ）
    await archiveRecord(ctx, reservationDetail._id)
  } else {
    console.error('予約の詳細が存在しません: ' + reservationId)
  }

  // 予約自体も論理削除（アーカイブ）
  await archiveRecord(ctx, reservationId)

  return true
}

/**
 * 予約と予約詳細を同時に物理削除（完全削除）するヘルパー関数です。
 * データベースから完全に削除されるため、元に戻せません。
 * 予約詳細が存在しない場合はエラーをコンソールに出力します。
 *
 * @param ctx Mutationコンテキスト（DBアクセス用）
 * @param reservationId 削除対象の予約ID
 * @returns 常にtrueを返します（処理完了の目印）
 */
export async function deleteReservationWithDetails(
  ctx: MutationCtx,
  reservationId: Id<'reservation'>
) {
  // 予約詳細を取得し、存在すれば物理削除を行う
  const reservationDetail = await ctx.db
    .query('reservation_detail')
    .withIndex('by_reservation_archive', (q) =>
      q.eq('reservation_id', reservationId).eq('is_archive', false)
    )
    .first()

  if (reservationDetail) {
    // 予約詳細を物理削除（完全削除）
    await killRecord(ctx, reservationDetail._id)
  } else {
    console.error('予約の詳細が存在しません: ' + reservationId)
  }

  // 予約自体も物理削除（完全削除）
  await killRecord(ctx, reservationId)

  return true
}

export function cancelableDeadline(availableCancelDays: number, start_time_unix: number) {
  const MS_PER_DAY = 86_400_000 // 24 * 60 * 60 * 1000 1日のミリ秒
  // 予約日の 0:00を取得
  const reservationMidnight = new Date(start_time_unix).setHours(0, 0, 0, 0)
  // (n-1) 日分をミリ秒で前倒し
  return reservationMidnight - (availableCancelDays - 1) * MS_PER_DAY
}

/**
 * フリー指名で指定時間帯に対応可能な最優先スタッフを自動選択する関数
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args 選択パラメータ
 * @returns 最適なスタッフ情報、または対応可能なスタッフがいない場合はnull
 */
export async function findBestAvailableStaffForTimeSlot(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    menu_ids: Id<'menu'>[]
    date: string
    start_time_unix: number
    end_time_unix: number
  }
): Promise<{
  staff_id: Id<'staff'>
  staff_name: string
  priority: number
  extra_charge: number
} | null> {
  console.log('=== findBestAvailableStaffForTimeSlot デバッグ開始 ===')
  console.log('引数:', args)

  // 1. 全アクティブスタッフを取得
  const allStaff = await ctx.db
    .query('staff')
    .withIndex('by_tenant_org_active_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('is_active', true)
        .eq('is_archive', false)
    )
    .collect()

  console.log('1. 全アクティブスタッフ数:', allStaff.length)
  console.log(
    'スタッフリスト:',
    allStaff.map((s) => ({ id: s._id, name: s.name }))
  )

  if (allStaff.length === 0) {
    console.log('アクティブスタッフが0人のため終了')
    return null
  }

  // 2. 各メニューに対応しないスタッフ（除外スタッフ）を取得
  const excludedIds = new Set<string>()
  const exclusionsPromises = args.menu_ids.map((menu_id) =>
    ctx.db
      .query('menu_exclusion_staff')
      .withIndex('by_tenant_org_menu_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('menu_id', menu_id)
          .eq('is_archive', false)
      )
      .collect()
  )
  const allExclusions = await Promise.all(exclusionsPromises)
  allExclusions.forEach((exclusions) => {
    exclusions.forEach((ex) => excludedIds.add(ex.staff_id))
  })

  // 3. メニューに対応可能なスタッフのみフィルタリング
  const availableStaff = allStaff.filter((staff) => !excludedIds.has(staff._id))

  console.log('2. 除外されたスタッフID:', Array.from(excludedIds))
  console.log('3. メニュー対応可能スタッフ数:', availableStaff.length)
  console.log(
    '対応可能スタッフリスト:',
    availableStaff.map((s) => ({ id: s._id, name: s.name }))
  )

  if (availableStaff.length === 0) {
    console.log('メニュー対応可能スタッフが0人のため終了')
    return null
  }

  // 4. スケジュール・週間勤務時間チェックで更にスタッフを絞り込み
  // ------------------------------------------------------------
  // ・当日の例外スケジュール(staff_exception_schedule)
  // 　 - is_all_day = true なら終日休み → 除外
  // 　 - is_all_day = false なら部分休み → 予約時間帯と被れば除外
  // ・週間スケジュール(staff_week_schedule)
  // 　 - is_open = false なら出勤していない → 除外
  // 　 - 勤務時間外(開始/終了)に被れば除外
  // ------------------------------------------------------------

  // 対象日の曜日を取得 (例: "monday")
  const dayOfWeek = getDayOfWeek(new Date(args.date))

  const filteredBySchedule: typeof availableStaff = []

  for (const staff of availableStaff) {
    let skip = false

    // 4.1 当日の例外スケジュール取得
    const staffSchedules = await ctx.db
      .query('staff_exception_schedule')
      .withIndex('by_tenant_org_staff_date_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', staff._id)
          .eq('date', args.date)
          .eq('is_archive', false)
      )
      .collect()

    // 例外スケジュールチェック
    for (const sch of staffSchedules) {
      if (sch.is_all_day) {
        skip = true
        break
      }
      if (
        !sch.is_all_day &&
        sch.start_time_unix !== undefined &&
        sch.end_time_unix !== undefined &&
        args.start_time_unix < sch.end_time_unix &&
        args.end_time_unix > sch.start_time_unix
      ) {
        skip = true
        break
      }
    }

    if (skip) continue

    // 4.2 週間スケジュール取得
    const weekSchedule = await ctx.db
      .query('staff_week_schedule')
      .withIndex('by_tenant_org_staff_week_open_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', staff._id)
          .eq('day_of_week', dayOfWeek as DayOfWeek)
          .eq('is_open', true)
          .eq('is_archive', false)
      )
      .first()

    if (!weekSchedule) {
      // 出勤していない
      continue
    }

    // 1. 勤務時間内判定
    const workStart = weekSchedule.start_hour
      ? (convertHourToTimestamp(weekSchedule.start_hour, args.date) ?? Number.MIN_SAFE_INTEGER)
      : Number.MIN_SAFE_INTEGER
    const workEnd = weekSchedule.end_hour
      ? (convertHourToTimestamp(weekSchedule.end_hour, args.date) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER

    console.log(`\n=== ${staff.name} のスケジュールチェック ===`)
    console.log(`日付: ${args.date}`)
    console.log(`勤務時間設定: ${weekSchedule.start_hour} - ${weekSchedule.end_hour}`)
    console.log(
      `予約時間: ${new Date(args.start_time_unix).toLocaleString('ja-JP')} - ${new Date(args.end_time_unix).toLocaleString('ja-JP')}`
    )

    if (args.start_time_unix < workStart || args.end_time_unix > workEnd) {
      console.log(`→ 勤務時間外のため除外`)
      continue
    }

    // 2. 実際の空き時間チェック（既存予約を考慮）
    const isAvailableForTimeSlot = await checkStaffAvailabilityForTimeSlot(ctx, {
      tenant_id: args.tenant_id,
      org_id: args.org_id,
      staff_id: staff._id,
      date: args.date,
      start_time_unix: args.start_time_unix,
      end_time_unix: args.end_time_unix,
      excludeReservationIds: [],
    })

    console.log(`勤務時間内: OK`)
    console.log(`空き状況: ${isAvailableForTimeSlot ? '利用可能' : '利用不可（既存予約あり）'}`)

    if (!isAvailableForTimeSlot) {
      console.log(`→ 既存予約により利用不可のため除外`)
      continue
    }

    console.log(`→ 両方OK、追加`)

    // ここまで到達すればスケジュールOK
    filteredBySchedule.push(staff)
  }

  console.log('4. スケジュール確認後のスタッフ数:', filteredBySchedule.length)
  console.log(
    'スケジュール確認後スタッフリスト:',
    filteredBySchedule.map((s) => ({ id: s._id, name: s.name }))
  )

  if (filteredBySchedule.length === 0) {
    console.log('スケジュール確認後スタッフが0人のため終了')
    return null
  }

  // 4. スタッフ設定（優先度、指名料）を取得
  const configs = await ctx.db
    .query('staff_config')
    .withIndex('by_tenant_org_staff_archive', (q) =>
      q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
    )
    .filter((q) => q.eq(q.field('is_archive'), false))
    .collect()
  const configMap = new Map(configs.map((config) => [config.staff_id, config]))

  console.log('5. スタッフ設定数:', configs.length)
  console.log(
    '設定があるスタッフID:',
    configs.map((c) => c.staff_id)
  )

  // 5. ダブルブッキングをチェックし、対応可能なスタッフを絞り込み
  const availableStaffWithConfigs = []
  for (const staff of filteredBySchedule) {
    const config = configMap.get(staff._id)
    console.log(`スタッフ ${staff.name} (${staff._id}): 設定=${config ? 'あり' : 'なし'}`)
    if (!config) {
      console.log(`スタッフ ${staff.name} は設定がないため除外`)
      continue
    }

    // ダブルブッキングチェック（エラーを詳細にハンドリング）
    try {
      const isDoubleBooked = await checkReservationDoubleBooking(ctx, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        staff_id: staff._id,
        date: args.date,
        start_time_unix: args.start_time_unix,
        end_time_unix: args.end_time_unix,
      })

      if (!isDoubleBooked) {
        console.log(`スタッフ ${staff.name}: ダブルブッキングなし、追加対象`)
        availableStaffWithConfigs.push({
          staff_id: staff._id,
          staff_name: staff.name || '',
          priority: config?.priority || 1, // 優先度が設定されていない場合はデフォルト優先度
          extra_charge: config?.extra_charge || 0,
        })
      } else {
        console.log(`スタッフ ${staff.name}: ダブルブッキングあり、除外`)
      }
    } catch (error) {
      // ダブルブッキング、席数上限、その他のエラーの場合はスキップ
      console.warn(`スタッフ ${staff.name} (${staff._id}) の可用性チェックでエラー:`, error)
      continue
    }
  }

  console.log('6. 最終利用可能スタッフ数:', availableStaffWithConfigs.length)
  console.log('最終スタッフリスト:', availableStaffWithConfigs)

  if (availableStaffWithConfigs.length === 0) {
    console.log('最終的に利用可能なスタッフが0人のため終了')
    return null
  }

  // 6. 既に空き時間チェック済みなので、全スタッフが利用可能
  const availableAtRequestedTime = availableStaffWithConfigs.map((staff) => ({
    ...staff,
    canStartAtRequestedTime: true,
  }))

  console.log('7. 指定時間で利用可能なスタッフ数:', availableAtRequestedTime.length)
  console.log(
    '指定時間で利用可能なスタッフ一覧:',
    availableAtRequestedTime.map((s) => ({
      name: s.staff_name,
      priority: s.priority,
      extra_charge: s.extra_charge,
    }))
  )

  // 指定時間で利用可能なスタッフがいない場合はnullを返す
  if (availableAtRequestedTime.length === 0) {
    console.log('指定時間で利用可能なスタッフが0人のため終了')
    console.log('=== findBestAvailableStaffForTimeSlot デバッグ終了 ===')
    return null
  }

  // 指定時間で利用可能なスタッフを優先度順でソート（優先度が高い方が優先）
  availableAtRequestedTime.sort((a, b) => b.priority - a.priority)

  const selectedStaff = availableAtRequestedTime[0]
  console.log('8. 選択されたスタッフ（指定時間で利用可能な最優先スタッフ）:', {
    name: selectedStaff.staff_name,
    priority: selectedStaff.priority,
    extra_charge: selectedStaff.extra_charge,
    staff_id: selectedStaff.staff_id,
    canStartAtRequestedTime: selectedStaff.canStartAtRequestedTime,
  })
  console.log('=== findBestAvailableStaffForTimeSlot デバッグ終了 ===')

  // 7. 指定時間で利用可能な最優先スタッフを返す
  return {
    staff_id: selectedStaff.staff_id,
    staff_name: selectedStaff.staff_name,
    priority: selectedStaff.priority,
    extra_charge: selectedStaff.extra_charge,
  }
}

/**
 * 指定された日のスタッフの空き時間を分単位で計算する関数
 * 営業時間から既存予約と例外スケジュールを差し引いて、実際の空き時間を算出
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args 計算パラメータ
 * @returns 空き時間（分）
 */
export async function calculateStaffAvailableMinutesForDay(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    date: string // YYYY/MM/DD形式
  }
): Promise<number> {
  console.log(`=== スタッフ空き時間計算開始: ${args.staff_id} (${args.date}) ===`)

  // 1. 対象日の曜日を取得
  const dayOfWeek = getDayOfWeek(new Date(args.date))

  // 2. スタッフの週間スケジュールを取得
  const weekSchedule = await ctx.db
    .query('staff_week_schedule')
    .withIndex('by_tenant_org_staff_week_open_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('day_of_week', dayOfWeek as DayOfWeek)
        .eq('is_open', true)
        .eq('is_archive', false)
    )
    .first()

  if (!weekSchedule) {
    console.log('週間スケジュールが見つからないため空き時間0分')
    return 0
  }

  // 3. 例外スケジュール（終日休み）をチェック
  const allDaySchedules = await ctx.db
    .query('staff_exception_schedule')
    .withIndex('by_tenant_org_staff_date_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('is_archive', false)
    )
    .filter((q) => q.eq(q.field('is_all_day'), true))
    .collect()

  if (allDaySchedules.length > 0) {
    console.log('終日スケジュールがあるため空き時間0分')
    return 0
  }

  // 4. 営業時間を分単位で計算
  const workStartHour = weekSchedule.start_hour || '09:00'
  const workEndHour = weekSchedule.end_hour || '18:00'

  const workStartTimestamp = convertHourToTimestamp(workStartHour, args.date)
  const workEndTimestamp = convertHourToTimestamp(workEndHour, args.date)

  if (!workStartTimestamp || !workEndTimestamp) {
    console.log('営業時間の変換に失敗したため空き時間0分')
    return 0
  }

  const totalWorkMinutes = Math.floor((workEndTimestamp - workStartTimestamp) / (1000 * 60))
  console.log(`営業時間: ${workStartHour} - ${workEndHour} (${totalWorkMinutes}分)`)

  // 5. 部分例外スケジュールを取得
  const partialSchedules = await ctx.db
    .query('staff_exception_schedule')
    .withIndex('by_tenant_org_staff_date_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('is_archive', false)
    )
    .filter((q) => q.eq(q.field('is_all_day'), false))
    .collect()

  // 6. 既存予約を取得
  const existingReservations = await ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .collect()

  // 7. 占有時間を計算（例外スケジュール + 既存予約）
  let occupiedMinutes = 0

  // 部分例外スケジュールの時間を加算
  partialSchedules.forEach((schedule) => {
    if (schedule.start_time_unix && schedule.end_time_unix) {
      const duration = Math.floor((schedule.end_time_unix - schedule.start_time_unix) / (1000 * 60))
      occupiedMinutes += duration
      console.log(`部分例外スケジュール: ${duration}分`)
    }
  })

  // 既存予約の時間を加算
  existingReservations.forEach((reservation) => {
    const duration = Math.floor(
      (reservation.end_time_unix - reservation.start_time_unix) / (1000 * 60)
    )
    occupiedMinutes += duration
    console.log(`既存予約: ${duration}分`)
  })

  // 8. 空き時間を計算
  const availableMinutes = Math.max(0, totalWorkMinutes - occupiedMinutes)

  console.log(
    `営業時間: ${totalWorkMinutes}分、占有時間: ${occupiedMinutes}分、空き時間: ${availableMinutes}分`
  )
  console.log(`=== スタッフ空き時間計算終了: ${args.staff_id} ===`)

  return availableMinutes
}

/**
 * スタッフの次に利用可能な時間を計算する関数
 * 指定された時間以降で最も早く施術可能な時間を返す
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args 計算パラメータ
 * @returns 次に利用可能な開始時間（Unix timestamp）、利用不可能な場合はnull
 */
export async function findNextAvailableTimeForStaff(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    date: string // YYYY/MM/DD形式
    requested_start_time: number // 希望開始時間（Unix timestamp）
    duration_minutes: number // 施術時間（分）
  }
): Promise<number | null> {
  console.log(`=== 次回利用可能時間計算開始: ${args.staff_id} (${args.date}) ===`)
  console.log(
    `希望開始時間: ${new Date(args.requested_start_time).toLocaleString('ja-JP')}, 施術時間: ${args.duration_minutes}分`
  )

  // 1. 対象日の曜日を取得
  const dayOfWeek = getDayOfWeek(new Date(args.date))

  // 2. スタッフの週間スケジュールを取得
  const weekSchedule = await ctx.db
    .query('staff_week_schedule')
    .withIndex('by_tenant_org_staff_week_open_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('day_of_week', dayOfWeek as DayOfWeek)
        .eq('is_open', true)
        .eq('is_archive', false)
    )
    .first()

  if (!weekSchedule) {
    console.log('週間スケジュールが見つからないため利用不可能')
    return null
  }

  // 3. 営業時間の計算
  const workStartHour = weekSchedule.start_hour || '09:00'
  const workEndHour = weekSchedule.end_hour || '18:00'

  const workStartTimestamp = convertHourToTimestamp(workStartHour, args.date)
  const workEndTimestamp = convertHourToTimestamp(workEndHour, args.date)

  if (!workStartTimestamp || !workEndTimestamp) {
    console.log('営業時間の変換に失敗したため利用不可能')
    return null
  }

  // 4. 部分例外スケジュールと既存予約を取得
  const [partialSchedules, existingReservations] = await Promise.all([
    ctx.db
      .query('staff_exception_schedule')
      .withIndex('by_tenant_org_staff_date_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', args.staff_id)
          .eq('date', args.date)
          .eq('is_archive', false)
      )
      .filter((q) => q.eq(q.field('is_all_day'), false))
      .collect(),

    ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', args.staff_id)
          .eq('date', args.date)
          .eq('status', 'confirmed')
          .eq('is_archive', false)
      )
      .collect(),
  ])

  // 5. 占有時間帯を作成（例外スケジュール + 既存予約）
  const occupiedTimeSlots: { start: number; end: number }[] = []

  // 部分例外スケジュールを追加
  partialSchedules.forEach((schedule) => {
    if (schedule.start_time_unix && schedule.end_time_unix) {
      occupiedTimeSlots.push({
        start: schedule.start_time_unix,
        end: schedule.end_time_unix,
      })
    }
  })

  // 既存予約を追加
  existingReservations.forEach((reservation) => {
    occupiedTimeSlots.push({
      start: reservation.start_time_unix,
      end: reservation.end_time_unix,
    })
  })

  // 時間順でソート
  occupiedTimeSlots.sort((a, b) => a.start - b.start)

  console.log(
    '占有時間帯:',
    occupiedTimeSlots.map((slot) => ({
      start: new Date(slot.start).toLocaleString('ja-JP'),
      end: new Date(slot.end).toLocaleString('ja-JP'),
    }))
  )

  // 6. 利用可能な時間帯を探す
  const durationMs = args.duration_minutes * 60 * 1000
  const searchStartTime = Math.max(args.requested_start_time, workStartTimestamp)

  // 最初の空き時間をチェック（営業開始 ～ 最初の占有時間）
  if (occupiedTimeSlots.length === 0) {
    // 占有時間がない場合、営業時間内であれば希望時間で可能
    if (searchStartTime + durationMs <= workEndTimestamp) {
      console.log(
        `占有なし、希望時間で利用可能: ${new Date(searchStartTime).toLocaleString('ja-JP')}`
      )
      return searchStartTime
    }
  } else {
    // 最初の占有より前に空きがあるかチェック
    const firstOccupied = occupiedTimeSlots[0]
    if (searchStartTime + durationMs <= firstOccupied.start) {
      console.log(`最初の占有前に利用可能: ${new Date(searchStartTime).toLocaleString('ja-JP')}`)
      return searchStartTime
    }

    // 占有時間帯の間の空きをチェック
    for (let i = 0; i < occupiedTimeSlots.length - 1; i++) {
      const currentEnd = occupiedTimeSlots[i].end
      const nextStart = occupiedTimeSlots[i + 1].start

      const gapStartTime = Math.max(currentEnd, searchStartTime)

      if (gapStartTime + durationMs <= nextStart) {
        console.log(`占有時間帯の間に利用可能: ${new Date(gapStartTime).toLocaleString('ja-JP')}`)
        return gapStartTime
      }
    }

    // 最後の占有時間後の空きをチェック
    const lastOccupied = occupiedTimeSlots[occupiedTimeSlots.length - 1]
    const finalGapStartTime = Math.max(lastOccupied.end, searchStartTime)

    if (finalGapStartTime + durationMs <= workEndTimestamp) {
      console.log(`最後の占有後に利用可能: ${new Date(finalGapStartTime).toLocaleString('ja-JP')}`)
      return finalGapStartTime
    }
  }

  console.log('当日は利用可能な時間がありません')
  return null
}

// 予約更新のコミット後に、更新済みデータからキャンセル通知を構築する。
export async function cancelNotification(
  ctx: MutationCtx,
  args: { reservation: Doc<'reservation'> }
) {
  await ctx.scheduler.runAfter(0, internal.reservation.action.sendCancellationNotifications, {
    reservation_id: args.reservation._id,
  })
}

/**
 * 高度なスタッフ入れ替え可能性チェック関数
 * 指名フリー予約同士のスタッフ入れ替えが可能かを詳細に判定する
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args チェック対象パラメータ
 * @returns 入れ替え可能な予約候補とその詳細情報
 */
export async function checkAdvancedStaffSwapPossibility(
  ctx: QueryCtx | MutationCtx,
  args: {
    current_reservation: Doc<'reservation'>
    current_reservation_detail: Doc<'reservation_detail'>
    target_staff_id: Id<'staff'>
    target_staff: Doc<'staff'>
  }
): Promise<{
  canSwap: boolean
  swappableReservation?: Doc<'reservation'>
  swappableReservationDetail?: Doc<'reservation_detail'>
  reason?: string
}> {
  console.log('=== 高度なスタッフ入れ替えチェック開始 ===')
  console.log('現在の予約:', {
    id: args.current_reservation._id,
    time: `${args.current_reservation.start_time_unix}-${args.current_reservation.end_time_unix}`,
    staff_id: args.current_reservation.staff_id,
  })
  console.log('対象スタッフ:', { id: args.target_staff_id, name: args.target_staff.name })

  // 1. 対象スタッフの同日予約を全て取得
  const targetStaffReservations = await ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
      q
        .eq('tenant_id', args.current_reservation.tenant_id)
        .eq('org_id', args.current_reservation.org_id)
        .eq('staff_id', args.target_staff_id)
        .eq('date', args.current_reservation.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .collect()

  console.log('対象スタッフの同日予約数:', targetStaffReservations.length)

  // 2. 現在の予約と時間帯が重複する予約を特定
  const overlappingReservations = targetStaffReservations.filter((reservation) => {
    const isOverlapping =
      reservation.start_time_unix < args.current_reservation.end_time_unix &&
      reservation.end_time_unix > args.current_reservation.start_time_unix
    console.log(
      `予約 ${reservation._id}: ${isOverlapping ? '重複あり' : '重複なし'} (${reservation.start_time_unix}-${reservation.end_time_unix} vs ${args.current_reservation.start_time_unix}-${args.current_reservation.end_time_unix})`
    )
    return isOverlapping
  })

  console.log(`重複する予約の総数: ${overlappingReservations.length}`)

  if (overlappingReservations.length === 0) {
    console.log('重複する予約がないため、入れ替え不要')
    return { canSwap: true, reason: '重複する予約がないため入れ替え不要' }
  }

  // 3. 最適な入れ替え候補を選定
  for (const conflictingReservation of overlappingReservations) {
    console.log(`入れ替え候補をチェック中: 予約ID ${conflictingReservation._id}`)

    // 3.1 指名フリー予約同士かチェック
    if (
      !conflictingReservation.is_free_nomination ||
      !args.current_reservation.is_free_nomination
    ) {
      console.log('指名フリー同士でないため、この候補をスキップ')
      continue
    }

    // 3.2 予約詳細を取得
    const conflictingDetail = await ctx.db
      .query('reservation_detail')
      .withIndex('by_reservation_archive', (q) =>
        q.eq('reservation_id', conflictingReservation._id).eq('is_archive', false)
      )
      .first()

    if (!conflictingDetail) {
      console.log('予約詳細が見つからないため、この候補をスキップ')
      continue
    }

    // 3.3 現在のスタッフが対象予約のメニューに対応可能かチェック
    const currentStaffId =
      args.current_reservation.assigned_staff_id || args.current_reservation.staff_id
    if (!currentStaffId) {
      console.log('現在のスタッフIDが取得できないため、この候補をスキップ')
      continue
    }

    console.log('3.3 現在のスタッフのメニュー対応チェック開始')
    console.log('現在のスタッフID:', currentStaffId)
    console.log(
      '対象予約のメニューIDs:',
      conflictingDetail.menus.map((m) => m.id)
    )

    const canCurrentStaffHandleTargetMenus = await checkStaffMenuCompatibility(ctx, {
      tenant_id: args.current_reservation.tenant_id,
      org_id: args.current_reservation.org_id,
      staff_id: currentStaffId,
      menu_ids: conflictingDetail.menus.map((m) => m.id),
    })

    console.log('現在のスタッフのメニュー対応可否:', canCurrentStaffHandleTargetMenus)

    if (!canCurrentStaffHandleTargetMenus) {
      console.log('現在のスタッフが対象予約のメニューに対応できないため、この候補をスキップ')
      continue
    }

    // 3.4 対象スタッフが現在の予約のメニューに対応可能かチェック
    console.log('3.4 対象スタッフのメニュー対応チェック開始')
    console.log('対象スタッフID:', args.target_staff_id)
    console.log(
      '現在の予約のメニューIDs:',
      args.current_reservation_detail.menus.map((m) => m.id)
    )

    const canTargetStaffHandleCurrentMenus = await checkStaffMenuCompatibility(ctx, {
      tenant_id: args.current_reservation.tenant_id,
      org_id: args.current_reservation.org_id,
      staff_id: args.target_staff_id,
      menu_ids: args.current_reservation_detail.menus.map((m) => m.id),
    })

    console.log('対象スタッフのメニュー対応可否:', canTargetStaffHandleCurrentMenus)

    if (!canTargetStaffHandleCurrentMenus) {
      console.log('対象スタッフが現在の予約のメニューに対応できないため、この候補をスキップ')
      continue
    }

    // 3.5 入れ替え後の前後予約との重複チェック
    console.log('3.5 入れ替え後の空き状況チェック開始')
    console.log(
      '現在のスタッフ',
      currentStaffId,
      'が対象予約の時間帯',
      `${conflictingReservation.start_time_unix}-${conflictingReservation.end_time_unix}`,
      'で利用可能かチェック'
    )

    // 現在のスタッフの空き状況チェック時は、入れ替え対象の予約と現在の予約の両方を除外
    const isCurrentStaffAvailableForSwap = await checkStaffAvailabilityForTimeSlot(ctx, {
      tenant_id: args.current_reservation.tenant_id,
      org_id: args.current_reservation.org_id,
      staff_id: currentStaffId,
      date: args.current_reservation.date,
      start_time_unix: conflictingReservation.start_time_unix,
      end_time_unix: conflictingReservation.end_time_unix,
      excludeReservationIds: [conflictingReservation._id, args.current_reservation._id], // 両方の予約を除外
    })

    console.log('現在のスタッフの空き状況:', isCurrentStaffAvailableForSwap)

    if (!isCurrentStaffAvailableForSwap) {
      console.log('現在のスタッフが入れ替え先時間帯で他の予約と重複するため、この候補をスキップ')
      continue
    }

    console.log(
      '対象スタッフ',
      args.target_staff_id,
      'が現在の予約の時間帯',
      `${args.current_reservation.start_time_unix}-${args.current_reservation.end_time_unix}`,
      'で利用可能かチェック'
    )

    // 対象スタッフの空き状況チェック時は、現在の予約と入れ替え対象の予約の両方を除外
    const isTargetStaffAvailableForSwap = await checkStaffAvailabilityForTimeSlot(ctx, {
      tenant_id: args.current_reservation.tenant_id,
      org_id: args.current_reservation.org_id,
      staff_id: args.target_staff_id,
      date: args.current_reservation.date,
      start_time_unix: args.current_reservation.start_time_unix,
      end_time_unix: args.current_reservation.end_time_unix,
      excludeReservationIds: [args.current_reservation._id, conflictingReservation._id], // 両方の予約を除外
    })

    console.log('対象スタッフの空き状況:', isTargetStaffAvailableForSwap)

    if (!isTargetStaffAvailableForSwap) {
      console.log('対象スタッフが入れ替え先時間帯で他の予約と重複するため、この候補をスキップ')
      continue
    }

    // 3.6 全ての条件をクリア - この候補で入れ替え可能
    console.log('入れ替え可能な候補が見つかりました:', conflictingReservation._id)
    return {
      canSwap: true,
      swappableReservation: conflictingReservation,
      swappableReservationDetail: conflictingDetail,
      reason: '条件を満たす入れ替え候補が見つかりました',
    }
  }

  console.log('入れ替え可能な候補が見つかりませんでした')
  return {
    canSwap: false,
    reason: '入れ替え可能な条件を満たす予約が見つかりませんでした',
  }
}

/**
 * スタッフのメニュー対応可否をチェックする関数
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args チェックパラメータ
 * @returns 対応可能ならtrue、不可能ならfalse
 */
export async function checkStaffMenuCompatibility(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    menu_ids: Id<'menu'>[]
  }
): Promise<boolean> {
  // 各メニューに対する除外スタッフをチェック
  for (const menu_id of args.menu_ids) {
    const exclusion = await ctx.db
      .query('menu_exclusion_staff')
      .withIndex('by_tenant_org_staff_menu_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', args.staff_id)
          .eq('menu_id', menu_id)
          .eq('is_archive', false)
      )
      .first()

    if (exclusion) {
      console.log(`スタッフ ${args.staff_id} はメニュー ${menu_id} に対応できません`)
      return false
    }
  }

  return true
}

/**
 * 指定時間帯でのスタッフの空き状況をチェックする関数
 *
 * @param ctx クエリまたはミューテーションコンテキスト
 * @param args チェックパラメータ
 * @returns 空いていればtrue、他の予約があればfalse
 */
export async function checkStaffAvailabilityForTimeSlot(
  ctx: QueryCtx | MutationCtx,
  args: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    staff_id: Id<'staff'>
    date: string
    start_time_unix: number
    end_time_unix: number
    excludeReservationIds: Id<'reservation'>[]
  }
): Promise<boolean> {
  console.log(`-- checkStaffAvailabilityForTimeSlot 開始 --`)
  console.log(`スタッフ: ${args.staff_id}, 時間帯: ${args.start_time_unix}-${args.end_time_unix}`)
  console.log(`除外予約ID: ${args.excludeReservationIds}`)

  // 指定時間帯で重複する予約を検索
  const overlappingReservations = await ctx.db
    .query('reservation')
    .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
      q
        .eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('staff_id', args.staff_id)
        .eq('date', args.date)
        .eq('status', 'confirmed')
        .eq('is_archive', false)
    )
    .filter((q) =>
      q.and(
        // 時間の重複をチェック
        q.lt(q.field('start_time_unix'), args.end_time_unix),
        q.gt(q.field('end_time_unix'), args.start_time_unix),
        // 除外IDリストに含まれない予約のみ
        ...args.excludeReservationIds.map((excludeId) => q.neq(q.field('_id'), excludeId))
      )
    )
    .collect()

  console.log(`重複する予約数: ${overlappingReservations.length}`)
  overlappingReservations.forEach((reservation) => {
    console.log(
      `重複予約: ID=${reservation._id}, 時間=${reservation.start_time_unix}-${reservation.end_time_unix}`
    )
  })

  const isAvailable = overlappingReservations.length === 0
  console.log(`空き状況結果: ${isAvailable ? '利用可能' : '利用不可'}`)
  console.log(`-- checkStaffAvailabilityForTimeSlot 終了 --`)

  return isAvailable
}

export async function cancelForCompletedReservation(
  supabaseService: SupabaseService,
  reservation: Doc<'reservation'> & {
    detail?: Doc<'reservation_detail'> | null
  }
) {
  if (reservation.status === 'completed' && reservation.customer_uid) {
    const pointTaskQueueRepo = new PointTaskQueueRepository(supabaseService)
    const customerRepo = new CustomerRepository(supabaseService)
    const carteRepo = new CarteRepository(supabaseService)

    // 1. カルテを取得し、LTV価格から今回の支払総額を減算
    const carte = await carteRepo.findOrCreateByCustomer(
      reservation.tenant_id,
      reservation.org_id,
      reservation.customer_uid,
      {
        ltv_price: 0, // 初期値
      }
    )
    await carteRepo.update(carte.id, {
      ltv_price: (carte.ltv_price || 0) - (reservation.detail?.total_price || 0),
      updated_at: new Date().toISOString(),
    })

    // 2. ポイント返還処理
    const pointTransactionRepo = new PointTransactionRepository(supabaseService)
    if (reservation.detail?.use_points && reservation.detail.use_points > 0) {
      await pointTransactionRepo.create({
        tenant_id: reservation.tenant_id,
        org_id: reservation.org_id,
        customer_uid: reservation.customer_uid,
        reservation_id: reservation._id,
        points: reservation.detail.use_points, // プラスで返還
        transaction_type: 'refunded',
        transaction_date_unix: Date.now(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      // 顧客ポイント更新
      const { customer, customerPoints } = await customerRepo.getCompleteCustomerData(
        reservation.customer_uid,
        reservation.tenant_id,
        reservation.org_id
      )
      if (customer) {
        await customerRepo.updateCustomerWithDetailsAndPoints(
          reservation.customer_uid,
          reservation.tenant_id,
          reservation.org_id,
          {},
          {},
          (customerPoints?.total_points || 0) + reservation.detail.use_points,
          []
        )
      }
    }

    // 3. ポイント付与タスク削除
    const pointTask = await pointTaskQueueRepo.findByReservation(
      reservation.tenant_id,
      reservation.org_id,
      reservation._id
    )

    if (pointTask && pointTask.status === 'pending') {
      await pointTaskQueueRepo.deleteRecord('id', pointTask.id)
    }
    // 3. 顧客情報を取得・更新
    const { customer, customerPoints } = await customerRepo.getCompleteCustomerData(
      reservation.customer_uid,
      reservation.tenant_id,
      reservation.org_id
    )

    if (customer && reservation.detail?.use_points && reservation.detail.use_points > 0) {
      const updateData: Record<string, unknown> = {
        // 4. total_reservation_countを1 減らす
        total_reservation_count: (customer.total_reservation_count || 0) - 1,
      }

      await customerRepo.updateCustomerWithDetailsAndPoints(
        reservation.customer_uid,
        reservation.tenant_id,
        reservation.org_id,
        updateData,
        {},
        (customerPoints?.total_points || 0) + reservation.detail.use_points,
        []
      )
    }
  }
}
