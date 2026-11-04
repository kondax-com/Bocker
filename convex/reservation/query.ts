/**
 * ■ 責任範囲
 *   - 効率的な予約データ取得（複合インデックス最適利用）
 *   - is_archive考慮で論理削除レコードを自動除外
 *   - フロント・管理画面用途に応じた柔軟なフィルタ/ソート/ページネーション
 *
 * ■ 非責任範囲
 *   - 同時間帯重複排除
 *   - 同時利用席数チェック
 *   - 業務バリデーション
 *   → これらは必ずmutation/helpers（checkDoubleBooking）側で担保すること
 * ---------------------------------------------------------------
 */

import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { paginationOptsValidator } from 'convex/server'
import { reservationStatusType } from '@/convex/types'
import { checkAuth } from '@/convex/utils/auth'
import { AvailableStaff } from '@/hooks/usePriceCalculation'
import { Doc } from '@/convex/_generated/dataModel'
import { query } from '@/convex/_generated/server'
import { api, internal } from '@/convex/_generated/api'
import { v } from 'convex/values'
import { getPlanLimits } from '@/convex/utils/helpers'
import { subscriptionPlanNameType } from '@/convex/types'
import { validateDateStrFormat, validateStringLength } from '@/convex/utils/validations'
import {
  convertHourToTimestamp,
  getDayOfWeek,
  hourToMinutes,
  toHourString,
  convertTimestampToHour,
} from '@/lib/schedules'
import { TimeRange, IntegratedAvailabilityInfo } from '@/lib/types'
import { validateDateStrToDate } from '@/convex/utils/validations'
import { ConvexError } from 'convex/values'
import { getReservationWithDetail, checkReservationDoubleBooking } from './reservation.helpers'
import { internalQuery } from '@/convex/_generated/server'
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants'
import { IntegratedTimeSlot, integratedTimeSlotType, DayOfWeek } from '@/convex/types'

/**
 * 予約IDによる単一予約取得
 * - 主に詳細画面や個別予約表示用途
 * - 論理削除(is_archive)は考慮しないため利用時は注意
 * - 取得のみで、重複や席数バリデーションはmutation側で実施
 * データ取得専用でバリデーションはmutationで担保
 */
export const getById = query({
  args: {
    id: v.id('reservation'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

/**
 * リマインダー送信対象の予約を取得（内部使用専用）
 * - 指定時間範囲内に開始される予約受付済み予約を取得
 * - リマインダー未送信のものだけを対象
 * - is_archive: false のみ対象
 */
export const getReservationsForReminder = internalQuery({
  args: {
    startTimeFrom: v.number(), // 開始時刻の下限（Unix timestamp）
    startTimeTo: v.number(), // 開始時刻の上限（Unix timestamp）
  },
  handler: async (ctx, args) => {
    const date = format(new Date(args.startTimeFrom), 'yyyy-MM-dd', { locale: ja })
    // 予約受付済みで、指定時間範囲内に開始される予約を取得
    const reservations = await ctx.db
      .query('reservation')
      .withIndex('reminder_sent_date_status_start_time_end_time_archive', (q) =>
        q
          .eq('reminder_sent', false)
          .eq('date', date)
          .eq('status', 'confirmed')
          .gte('start_time_unix', args.startTimeFrom)
          .lte('start_time_unix', args.startTimeTo)
      )
      .collect()

    // 詳細情報を付加して返却
    const reservationsWithDetails = await Promise.all(
      reservations.map(async (reservation) => {
        const detail = await ctx.db
          .query('reservation_detail')
          .withIndex('by_reservation_archive', (q) =>
            q.eq('reservation_id', reservation._id).eq('is_archive', false)
          )
          .first()

        const org = await ctx.db.get(reservation.org_id)
        if (!org) {
          throw new ConvexError({
            message: 'Organization not found',
            statusCode: ERROR_STATUS_CODE.NOT_FOUND,
            severity: ERROR_SEVERITY.ERROR,
            code: 'ORG_NOT_FOUND',
            details: {
              org_id: reservation.org_id,
            },
          })
        }

        return {
          org_name: org?.org_name,
          reservation: reservation,
          menus: detail?.menus || [],
          options: detail?.options || [],
          extra_charge: detail?.extra_charge || 0,
          coupon_discount: detail?.coupon_discount || 0,
          use_points: detail?.use_points || 0,
          total_price: detail?.total_price || 0,
        }
      })
    )
    return reservationsWithDetails
  },
})

export const getWithDetailById = query({
  args: {
    id: v.id('reservation'),
  },
  handler: async (ctx, args) => {
    // 削除・移行済みの予約はクライアントで「見つからない」として扱う。
    return await getReservationWithDetail(ctx, args.id)
  },
})

/**
 * 指定テナント・組織・予約ステータスでの予約一覧取得
 * - 管理画面/予約カレンダー等の一覧用途
 * - is_archive: false のみ対象
 * - target_status指定で柔軟なフィルタ
 * - ページネーション・昇降順指定可
 * - 重複/席数バリデーションはmutation/helpersで必須
 * データ取得専用でバリデーションはmutationで担保
 */
export const list = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    target_status: v.optional(reservationStatusType),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.org_id, 'org_id')
    const reservationQuery = await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_status_date_start_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('status', args.target_status ? args.target_status : 'confirmed')
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    return reservationQuery.order(args.sort || 'desc').paginate(args.paginationOpts)
  },
})

/**
 * 組織レベルで全ステータスの予約一覧を取得
 * - 組織全体の予約管理画面用
 * - is_archive: false のみ対象
 * - 全ステータスまたは特定ステータスでフィルタ可能
 * - 日付範囲での絞り込み対応
 * データ取得専用でバリデーションはmutationで担保
 */
export const listOrganizationAllStatus = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    status_filter: v.optional(reservationStatusType),
    start_date: v.optional(v.string()),
    end_date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.org_id, 'org_id')
    if (args.start_date) validateDateStrFormat(args.start_date, 'start_date')
    if (args.end_date) validateDateStrFormat(args.end_date, 'end_date')

    let reservationQuery = ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    // ステータスフィルター
    if (args.status_filter) {
      reservationQuery = reservationQuery.filter((q) => q.eq(q.field('status'), args.status_filter))
    }

    // 日付範囲フィルター
    if (args.start_date && args.end_date) {
      reservationQuery = reservationQuery.filter((q) =>
        q.and(q.gte(q.field('date'), args.start_date!), q.lte(q.field('date'), args.end_date!))
      )
    } else if (args.start_date) {
      reservationQuery = reservationQuery.filter((q) => q.gte(q.field('date'), args.start_date!))
    } else if (args.end_date) {
      reservationQuery = reservationQuery.filter((q) => q.lte(q.field('date'), args.end_date!))
    }

    return reservationQuery.order(args.sort || 'desc').paginate(args.paginationOpts)
  },
})

/**
 * 顧客IDからの予約一覧取得
 * - 顧客マイページや予約履歴画面用途
 * - is_archive: false のみ対象
 * - 昇降順・ページネーション対応
 * - バリデーション/競合判定はmutationで担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByCustomerUid = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    customer_uid: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.customer_uid, 'customer_uid')
    validateStringLength(args.org_id, 'org_id')

    const reservationQuery = await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_customer_date_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('customer_uid', args.customer_uid)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    return reservationQuery.order(args.sort || 'desc').paginate(args.paginationOpts)
  },
})

/**
 * 顧客IDからの予約一覧を詳細情報付きで取得
 * - カルテ画面での予約履歴表示用途
 * - is_archive: false のみ対象
 * - 予約詳細も同時に取得
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByCustomerUidWithDetails = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    customer_uid: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.customer_uid, 'customer_uid')
    validateStringLength(args.org_id, 'org_id')

    const reservationQuery = ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_customer_date_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('customer_uid', args.customer_uid)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))
      .order(args.sort || 'desc')

    const paginatedReservations = await reservationQuery.paginate(args.paginationOpts)

    // 詳細情報を一括取得
    const reservationsWithDetails = await Promise.all(
      paginatedReservations.page.map(async (reservation) => {
        const detail = await ctx.db
          .query('reservation_detail')
          .withIndex('by_reservation_archive', (q) =>
            q.eq('reservation_id', reservation._id).eq('is_archive', false)
          )
          .first()
        return { reservation, detail }
      })
    )

    return {
      ...paginatedReservations,
      page: reservationsWithDetails,
    }
  },
})

/**
 * スタッフIDによる予約一覧取得
 * - スタッフ毎の予約確認・シフト管理等の用途
 * - is_archive: false のみ対象
 * - バリデーション/重複管理はmutationで担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByStaffId = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.org_id, 'org_id')

    const reservationQuery = ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('staff_id', args.staff_id)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    return await reservationQuery.order(args.sort || 'desc').paginate(args.paginationOpts)
  },
})

/**
 * ステータス指定での予約一覧取得
 * - キャンセル/未完了/完了等の抽出用途
 * - 論理削除は未考慮なので利用時は注意
 * - 業務ロジックはmutation側で担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByStatus = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    status: reservationStatusType,
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.org_id, 'org_id')

    return await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_status_date_start_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('status', args.status)
      )
      .order(args.sort || 'desc')
      .paginate(args.paginationOpts)
  },
})

/**
 * 日付指定による予約一覧取得
 * - 特定日付の予約確認・日次集計等に活用
 * - is_archive: false のみ対象
 * - 認証必須
 * - 重複/バリデーションはmutationで担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByDate = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    date: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateStringLength(args.org_id, 'org_id')
    validateDateStrFormat(args.date, 'date')
    return await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('date', args.date)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))
      .order(args.sort || 'desc')
      .paginate(args.paginationOpts)
  },
})

/**
 * スタッフID＋日付での予約一覧取得
 * - シフト表や日次確認用途
 * - is_archive: false のみ対象
 * - 認証必須
 * - 重複/席数判定はmutation/helpersで
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByStaffAndDate = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateDateStrFormat(args.date, 'date')
    validateStringLength(args.org_id, 'org_id')
    return await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('staff_id', args.staff_id)
          .eq('date', args.date)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))
      .order(args.sort || 'desc')
      .paginate(args.paginationOpts)
  },
})

/**
 * 顧客ID＋日付での予約取得
 * - マイページでの本日予約確認等に利用
 * - is_archive: false のみ抽出
 * - 認証必須
 * - 重複排除はmutationで担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const findByCustomerAndDate = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    customer_uid: v.string(),
    date: v.string(),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
    includeArchive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateStringLength(args.customer_uid, 'customer_uid')
    validateStringLength(args.org_id, 'org_id')
    validateDateStrFormat(args.date, 'date')
    return await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_customer_date_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('customer_uid', args.customer_uid)
          .eq('date', args.date)
          .eq('is_archive', false)
      )
      .order(args.sort || 'desc')
      .paginate(args.paginationOpts)
  },
})

// /**
//  * サロン・スタッフ・日付から当日の予約受付可能時間帯を算出
//  * - サロン・スタッフ・例外休業を考慮し予約枠を算出
//  * - 重複・席数・既存予約考慮はmutation/helpersに委譲
//  * - 本関数は「予約可能な時間帯」の情報のみ返す
//  * データ取得専用でバリデーションはmutationで担保
//  */
export const findAvailableTimeSlots = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    // 共通日付バリデーション
    const targetDate = validateDateStrToDate(args.date, 'findAvailableTimeSlots')
    const dayOfWeek = getDayOfWeek(targetDate)
    const dayOfWeekJa = getDayOfWeek(targetDate, true)

    const tenantReservationConfig = await ctx.db
      .query('reservation_config')
      .withIndex('by_tenant_org_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('is_archive', false)
      )
      .first()

    const todayFirstLaterMinutes = tenantReservationConfig?.today_first_later_minutes
      ? tenantReservationConfig.today_first_later_minutes * 60 * 1000
      : 30 * 60 * 1000 // 未設定の場合は30分後から予約可能

    // 1. サロンの週間スケジュール取得
    const tenantWeekSchedule = await ctx.db
      .query('week_schedule')
      .withIndex('by_tenant_org_week_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq(
            'day_of_week',
            dayOfWeek as
              | 'monday'
              | 'tuesday'
              | 'wednesday'
              | 'thursday'
              | 'friday'
              | 'saturday'
              | 'sunday'
          )
          .eq('is_archive', false)
      )
      .filter((q) => q.eq(q.field('is_open'), true))
      .first()
    if (!tenantWeekSchedule) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findAvailableTimeSlots',
        message: `サロンは${dayOfWeekJa}曜日は営業していません`,
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }
    if (!tenantWeekSchedule.start_hour || !tenantWeekSchedule.end_hour) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findAvailableTimeSlots',
        message: `サロンの${dayOfWeekJa}曜日の営業時間が設定されていません`,
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
          date: args.date,
        },
      })
    }

    // 2. サロンの例外スケジュール (休業日) チェック
    const tenantException = await ctx.db
      .query('exception_schedule')
      .withIndex('by_tenant_org_date_type_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('date', args.date)
          .eq('type', 'holiday')
          .eq('is_archive', false)
      )
      .first()
    if (tenantException) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findAvailableTimeSlots',
        message: `サロンの臨時休業日です: ${args.date}`,
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }

    // 3. スタッフの営業時間取得
    const staffWeekSchedule = await ctx.db
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
    if (!staffWeekSchedule) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findAvailableTimeSlots',
        message: 'スタッフの営業時間が見つかりません',
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }
    if (!staffWeekSchedule.is_open) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findAvailableTimeSlots',
        message: `スタッフは${dayOfWeekJa}出勤していません。別の曜日を選択してください。`,
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }

    const salonStart = convertHourToTimestamp(tenantWeekSchedule.start_hour, args.date)
    const salonEnd = convertHourToTimestamp(tenantWeekSchedule.end_hour, args.date)

    const staffStart = staffWeekSchedule?.start_hour
      ? convertHourToTimestamp(staffWeekSchedule?.start_hour, args.date)
      : Number.MIN_SAFE_INTEGER
    const staffEnd = staffWeekSchedule?.end_hour
      ? convertHourToTimestamp(staffWeekSchedule?.end_hour, args.date)
      : Number.MAX_SAFE_INTEGER

    // サロン開始時刻とスタッフ開始時刻のうち、遅い方を採用
    let resultStart = Math.max(salonStart!, staffStart!)
    // 現在日時 (JST) を取得
    const nowJstDateStr = new Date()
      .toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tokyo',
      })
      .replace(/\//g, '-')

    // 当日判定（JST ベース）
    if (nowJstDateStr === args.date) {
      // 現在時刻＋待機時間を10分刻みに丸め
      const rawNextLater = Date.now() + todayFirstLaterMinutes
      const stepMs = 10 * 60 * 1000
      const alignedNextLater = Math.ceil(rawNextLater / stepMs) * stepMs
      resultStart = Math.max(resultStart, alignedNextLater)
    }

    // 予約可能開始 >= 終了 の場合のガードは resultEnd 計算後に実施（下部へ移動）

    // サロン終了時刻とスタッフ終了時刻のうち、早い方を採用
    const resultEnd = Math.min(salonEnd!, staffEnd!)

    // --- 追加ガード: 予約可能開始 >= 終了なら予約枠無しを返す ---
    if (resultStart >= resultEnd) {
      return {
        startHour: convertTimestampToHour(resultEnd),
        endHour: convertTimestampToHour(resultEnd),
      }
    }

    // 予約できる時間の範囲の開始時刻と終了時刻を文字列に変換
    const startHour = convertTimestampToHour(resultStart)
    const endHour = convertTimestampToHour(resultEnd)

    return {
      startHour,
      endHour,
    }
  },
})

/**
 * スタッフの例外スケジュール取得
 * - is_all_day指定で終日・部分取得
 * - 予約バリデーションや重複判定はmutationで必須
 * - 取得専用
 * データ取得専用でバリデーションはmutationで担保
 */
export const findStaffSchedules = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(), // "YYYY-MM-DD"
    is_all_day: v.boolean(),
  },
  handler: async (ctx, args) => {
    // 共通日付バリデーション
    validateDateStrFormat(args.date, 'findStaffSchedules')
    validateStringLength(args.org_id, 'org_id')

    let staffSchedules
    if (args.is_all_day) {
      staffSchedules = await ctx.db
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
    } else {
      staffSchedules = await ctx.db
        .query('staff_exception_schedule')
        .withIndex('by_tenant_org_staff_date_archive', (q) =>
          q
            .eq('tenant_id', args.tenant_id)
            .eq('org_id', args.org_id)
            .eq('staff_id', args.staff_id)
            .eq('date', args.date)
        )
        .filter((q) => q.eq(q.field('is_all_day'), false))
        .collect()
    }

    return staffSchedules.map((staffSchedule) => {
      return {
        date: staffSchedule.date,
        is_all_day: staffSchedule.is_all_day,
        type: staffSchedule.type,
        start_time_unix: staffSchedule.start_time_unix!,
        end_time_unix: staffSchedule.end_time_unix!,
      }
    })
  },
})

/**
 * スタッフの当日予約（confirmedのみ）を取得
 * - スケジュールやダッシュボード向け
 * - 予約バリデーションはmutation側で担保
 * データ取得専用でバリデーションはmutationで担保
 */
export const findStaffReservations = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    // 共通日付バリデーション
    validateDateStrToDate(args.date, 'findStaffReservations')
    validateStringLength(args.org_id, 'org_id')

    // 引数の date に対応する日の予約を UNIX タイム範囲で取得
    const startOfDay = convertHourToTimestamp('00:00', args.date)
    const endOfDay = convertHourToTimestamp('23:59', args.date)

    const startOfDaySec = Math.floor(startOfDay!)
    const endOfDaySec = Math.floor(endOfDay!)

    if (startOfDaySec === null || endOfDaySec === null) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'findStaffReservations',
        message: '日付形式が不正です',
        code: 'BAD_REQUEST',
        status: 400,
        details: {
          ...args,
        },
      })
    }
    const staffReservationSchedules = await ctx.db
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

    return staffReservationSchedules.map((reservationSchedule) => {
      return {
        date: args.date,
        is_all_day: false,
        type: 'reservation',
        start_time_unix: reservationSchedule.start_time_unix!,
        end_time_unix: reservationSchedule.end_time_unix!,
      }
    })
  },
})

// --- ユーティリティ関数としてファイル下部にまとめる ---
function subtractScheduleFromAvailable(
  available: TimeRange,
  staffSchedules: TimeRange[]
): TimeRange[] {
  // 初期スロットは受付可能時間のみ
  let slots: TimeRange[] = [available]

  for (const sched of staffSchedules) {
    const scStart = hourToMinutes(sched.startHour)
    const scEnd = hourToMinutes(sched.endHour)
    const nextSlots: TimeRange[] = []

    for (const slot of slots) {
      const avStart = hourToMinutes(slot.startHour)
      const avEnd = hourToMinutes(slot.endHour)

      // スケジュールがスロットと重ならない場合
      if (scEnd <= avStart || scStart >= avEnd) {
        nextSlots.push(slot)
        continue
      }

      // スロットの前半部分が残る場合
      if (avStart < scStart) {
        const newSlot = {
          startHour: slot.startHour,
          endHour: toHourString(scStart),
        }
        nextSlots.push(newSlot)
      }

      // スロットの後半部分が残る場合
      if (scEnd < avEnd) {
        const newSlot = {
          startHour: toHourString(scEnd),
          endHour: slot.endHour,
        }
        nextSlots.push(newSlot)
      }
    }
    slots = nextSlots
  }

  return slots
}

function computeNextAlignedStart(
  minNextStart: number,
  durationMin: number,
  maxStart: number,
  stepMin: number // ← 追加: アライメントの間隔（例 30 分）
): number | null {
  const kStart = Math.ceil(minNextStart / stepMin)
  const candStart = kStart * stepMin
  const kEnd = Math.ceil((minNextStart + durationMin) / stepMin)
  const candEnd = kEnd * stepMin - durationMin
  const candidates: number[] = []
  if (candStart >= minNextStart) candidates.push(candStart)
  if (candEnd >= minNextStart) candidates.push(candEnd)
  if (candidates.length === 0) return null
  const next = Math.min(...candidates)
  return next <= maxStart ? next : null
}

function generateTimeSlotsWithAlignment(
  availableTimeSlot: TimeRange,
  durationMin: number,
  includeTrailing: boolean = false,
  minSlotSize: number = 60
): TimeRange[] {
  // ───────────────────────────────────────────────────────────────
  //  予約可能なウィンドウ（availableTimeSlot）から、施術時間 durationMin
  //  をピッタリ充填できる時間スロット一覧を生成する。
  //
  //  例）
  //    availableTimeSlot: { 10:00 ~ 16:00 }, durationMin: 90
  //      → 10:00~11:30, 11:30~13:00, 13:00~14:30, 14:30~16:00
  //
  //  オプション:
  //    includeTrailing : 最後に「余り」を強制的に入れるか
  //    minSlotSize     : スロットのアライメント間隔（例 30 分）兼ギャップ判定
  // ───────────────────────────────────────────────────────────────
  const { startHour, endHour } = availableTimeSlot

  // HH:mm 文字列 → 分数に変換
  const windowStart = hourToMinutes(startHour)
  const windowEnd = hourToMinutes(endHour)
  const windowLen = windowEnd - windowStart
  // 予約ウィンドウ自体が施術時間より短ければスロット 0
  if (windowLen < durationMin) return []

  // === 1. 最初のスロット（ウィンドウ開始から durationMin 分） ===
  const result: TimeRange[] = [
    {
      startHour: toHourString(windowStart),
      endHour: toHourString(windowStart + durationMin),
    },
  ]

  // lastStart: 直近でスロット開始に採用した minutes 値
  let lastStart = windowStart

  // === 2. 前回スロット開始から durationMin 以上空けて、
  //        かつ minSlotSize 分単位に「良い感じ」で揃った次の開始時刻を探す ===
  while (true) {
    const minNext = lastStart + minSlotSize // 次スロットが始められる最短分
    // minSlotSize 分単位の「揃った」時刻を算出（helper）
    const aligned = computeNextAlignedStart(
      minNext,
      durationMin,
      windowEnd - durationMin,
      minSlotSize
    )
    if (aligned === null) break // もう置けない
    result.push({
      startHour: toHourString(aligned),
      endHour: toHourString(aligned + durationMin),
    })
    lastStart = aligned
  }

  // === 3. includeTrailing が true のとき、末尾ギリギリのスロットも追加 ===
  if (includeTrailing) {
    const backStart = windowEnd - durationMin
    const alreadyExists = result.some((r) => hourToMinutes(r.startHour) === backStart)
    if (backStart >= windowStart && !alreadyExists) {
      result.push({
        startHour: toHourString(backStart),
        endHour: toHourString(windowEnd),
      })
    }
  }

  // === 4. スロットをフィルタ：
  //       ・ウィンドウの端を含むものは常に残す
  //       ・それ以外は、前後ギャップが minSlotSize 以上あるものだけ残す
  const filtered = result.filter((slot) => {
    const startMin = hourToMinutes(slot.startHour)
    const endMin = hourToMinutes(slot.endHour)
    if (startMin === windowStart || endMin === windowEnd) return true
    const beforeGap = startMin - windowStart
    const afterGap = windowEnd - endMin
    return beforeGap >= minSlotSize && afterGap >= minSlotSize
  })

  return filtered
}

/**
 * 指定スタッフ・日付・施術時間で予約可能スロットを計算
 * - 空き枠計算ロジックの中心
 * - 実際の予約確保や重複排除はmutation/helpersで厳格管理
 * - 本関数は「計算上の予約可能スロット」提示のみ
 * データ取得専用でバリデーションはmutationで担保
 */
export const calculateReservationTime = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(), // "YYYY-MM-DD"
    duration_min: v.number(), // 50分などの施術時間 数値のみ
  },
  handler: async (ctx, args): Promise<TimeRange[]> => {
    // 共通日付バリデーション
    const targetDate = validateDateStrToDate(args.date, 'calculateReservationTime')
    validateStringLength(args.org_id, 'org_id')
    const dayOfWeek = getDayOfWeek(targetDate)
    const dayOfWeekJa = getDayOfWeek(targetDate, true)

    // 並列でデータを取得（パフォーマンス向上）
    const [tenantReservationConfig, tenantWeekSchedule, tenantException, staffWeekSchedule] =
      await Promise.all([
        // 1. 予約設定
        ctx.db
          .query('reservation_config')
          .withIndex('by_tenant_org_archive', (q) =>
            q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('is_archive', false)
          )
          .first(),

        // 2. サロンの週間スケジュール
        ctx.db
          .query('week_schedule')
          .withIndex('by_tenant_org_week_archive', (q) =>
            q
              .eq('tenant_id', args.tenant_id)
              .eq('org_id', args.org_id)
              .eq('day_of_week', dayOfWeek as DayOfWeek)
              .eq('is_archive', false)
          )
          .filter((q) => q.eq(q.field('is_open'), true))
          .first(),

        // 3. サロンの例外スケジュール
        ctx.db
          .query('exception_schedule')
          .withIndex('by_tenant_org_date_type_archive', (q) =>
            q
              .eq('tenant_id', args.tenant_id)
              .eq('org_id', args.org_id)
              .eq('date', args.date)
              .eq('type', 'holiday')
              .eq('is_archive', false)
          )
          .first(),

        // 4. スタッフの週間スケジュール
        ctx.db
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
          .first(),
      ])

    // バリデーションチェック
    if (!tenantWeekSchedule) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'calculateReservationTime',
        message: `サロンは${dayOfWeekJa}曜日は営業していません`,
        code: 'BAD_REQUEST',
        status: 400,
        details: args,
      })
    }

    if (tenantException) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'calculateReservationTime',
        message: `サロンの臨時休業日です: ${args.date}`,
        code: 'BAD_REQUEST',
        status: 400,
        details: args,
      })
    }

    if (!staffWeekSchedule || !staffWeekSchedule.is_open) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'calculateReservationTime',
        message: `スタッフは${dayOfWeekJa}出勤していません`,
        code: 'BAD_REQUEST',
        status: 400,
        details: args,
      })
    }

    // 並列でスケジュールと予約を取得
    const [staffAllDaySchedules, staffSchedules, staffReservations] = await Promise.all([
      // 終日スケジュール
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
        .filter((q) => q.eq(q.field('is_all_day'), true))
        .collect(),

      // 部分スケジュール
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

      // 予約受付済み予約
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

    if (staffAllDaySchedules.length > 0) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'calculateReservationTime',
        status: 400,
        message: 'スタッフには終日のスケジュールがあります。予約受け付けできません。',
        code: 'BAD_REQUEST',
        details: args,
      })
    }

    // 時間計算
    const todayFirstLaterMinutes = tenantReservationConfig?.today_first_later_minutes
      ? tenantReservationConfig.today_first_later_minutes * 60 * 1000
      : 30 * 60 * 1000

    const salonStart = convertHourToTimestamp(tenantWeekSchedule.start_hour!, args.date)
    const salonEnd = convertHourToTimestamp(tenantWeekSchedule.end_hour!, args.date)
    const staffStart = staffWeekSchedule?.start_hour
      ? convertHourToTimestamp(staffWeekSchedule.start_hour, args.date)
      : Number.MIN_SAFE_INTEGER
    const staffEnd = staffWeekSchedule?.end_hour
      ? convertHourToTimestamp(staffWeekSchedule.end_hour, args.date)
      : Number.MAX_SAFE_INTEGER

    let resultStart = Math.max(salonStart!, staffStart!)

    // 現在時刻を日本時間で取得して当日判定
    const nowJST = new Date(Date.now())
    const jstDateStr = nowJST
      .toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Tokyo',
      })
      .replace(/\//g, '-')

    // targetDateの日付文字列（YYYY-MM-DD形式）と比較
    if (jstDateStr === args.date) {
      const rawNextLater = Date.now() + todayFirstLaterMinutes
      const stepMs = 10 * 60 * 1000
      const alignedNextLater = Math.ceil(rawNextLater / stepMs) * stepMs
      resultStart = Math.max(resultStart, alignedNextLater)
    }
    const resultEnd = Math.min(salonEnd!, staffEnd!)

    const availableTimeSlots = {
      startHour: convertTimestampToHour(resultStart),
      endHour: convertTimestampToHour(resultEnd),
    }

    // スケジュールを時刻文字列に変換
    const allSchedules = [
      ...staffSchedules.map((schedule) => ({
        startHour: convertTimestampToHour(schedule.start_time_unix!, 'Asia/Tokyo'),
        endHour: convertTimestampToHour(schedule.end_time_unix!, 'Asia/Tokyo'),
      })),
      ...staffReservations.map((reservation) => ({
        startHour: convertTimestampToHour(reservation.start_time_unix!, 'Asia/Tokyo'),
        endHour: convertTimestampToHour(reservation.end_time_unix!, 'Asia/Tokyo'),
      })),
    ]

    const subtractedSchedules = subtractScheduleFromAvailable(
      availableTimeSlots,
      allSchedules.map((schedule) => ({
        startHour: schedule.startHour,
        endHour: schedule.endHour,
      }))
    )

    const subtractedSchedulesWithStep = subtractedSchedules.map((schedule) => {
      const timeSlots = generateTimeSlotsWithAlignment(
        schedule,
        args.duration_min,
        true,
        tenantReservationConfig?.reservation_interval_minutes
      )
      return timeSlots
    })

    // 同時予約制限を超えた時間枠を除外
    const unfilteredSlots = subtractedSchedulesWithStep.flat()

    // 指定日の全ての確定予約を取得（店舗全体）
    const allReservationsOnDate = await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('date', args.date)
          .eq('status', 'confirmed')
          .eq('is_archive', false)
      )
      .collect()

    // 店舗の同時受付可能席数を取得
    const availableSheet = tenantReservationConfig?.available_sheet || 3

    // 各時間スロットで既存予約数をチェックし、availableSheetを超える時間帯を除外
    const finalSlots = unfilteredSlots.filter((slot) => {
      // 時間文字列をタイムスタンプに変換
      const startTimestamp = convertHourToTimestamp(slot.startHour, args.date)
      const endTimestamp = convertHourToTimestamp(slot.endHour, args.date)

      if (!startTimestamp || !endTimestamp) {
        console.warn(`時間変換失敗: ${slot.startHour}-${slot.endHour}`)
        return false
      }

      // この時間帯と重複する既存予約数をカウント
      // 連続した予約（終了時刻 = 開始時刻）は重複とみなさない
      const overlappingReservations = allReservationsOnDate.filter((reservation) => {
        return (
          reservation.start_time_unix < endTimestamp && reservation.end_time_unix > startTimestamp
        )
      })

      const conflictCount = overlappingReservations.length
      const remainingCapacity = availableSheet - conflictCount

      // 残り枠がある場合のみスロットを保持
      if (remainingCapacity <= 0) {
        console.log(
          `時間帯 ${slot.startHour}-${slot.endHour}: 席数上限(${availableSheet})に達しているため除外 (既存予約: ${conflictCount}件)`
        )
        return false
      }

      return true
    })

    return finalSlots
  },
})

/**
 * 指名フリー予約用：複数スタッフの統合空き時間を計算
 * 同一時間帯の最大予約数（availableSheet）を考慮して利用可能な時間枠のみを返す
 * @returns IntegratedAvailabilityInfo 統合された空き時間情報
 */
export const calculateIntegratedAvailableTimes = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    menu_ids: v.array(v.id('menu')),
    option_ids: v.array(v.id('option')),
    date: v.string(), // YYYY-MM-DD
  },
  returns: v.object({
    available: v.boolean(),
    timeSlots: v.array(integratedTimeSlotType),
    totalAvailableStaffs: v.number(),
  }),
  handler: async (ctx, args): Promise<IntegratedAvailabilityInfo> => {
    // 日付形式バリデーション
    if (!validateDateStrFormat(args.date)) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.BAD_REQUEST,
        severity: ERROR_SEVERITY.ERROR,
        message: '日付形式が正しくありません',
      })
    }

    // 1. 予約設定と対応可能なスタッフを並列で取得
    const [reservationConfig, availableStaffs] = await Promise.all([
      // 予約設定取得（availableSheet取得のため）
      ctx.db
        .query('reservation_config')
        .withIndex('by_tenant_org_archive', (q) =>
          q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('is_archive', false)
        )
        .first(),

      // 対応可能なスタッフを取得（認証チェックをスキップ）
      ctx.runQuery(internal.staff.query.findByAvailableStaffsInternal, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        menu_ids: args.menu_ids,
      }),
    ])

    if (availableStaffs.length === 0) {
      console.log('対応可能スタッフが0人のため終了')
      return {
        available: false,
        timeSlots: [],
        totalAvailableStaffs: 0,
      }
    }

    // 店舗ごとの同時受付可能席数を取得
    const availableSheet = reservationConfig?.available_sheet || 3

    // 2. 当日の既存予約を取得
    const existingReservations = await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .eq('date', args.date)
          .eq('status', 'confirmed')
          .eq('is_archive', false)
      )
      .collect()

    // メニューとオプションの合計時間を計算（パフォーマンス最適化：並列取得）
    const [menus, options] = await Promise.all([
      // メニュー取得
      Promise.all(args.menu_ids.map((id) => ctx.db.get(id))),
      // オプション取得
      args.option_ids.length > 0
        ? Promise.all(args.option_ids.map((id) => ctx.db.get(id)))
        : Promise.resolve([]),
    ])

    // null除外とアーカイブチェック
    const validMenus = menus.filter(
      (menu): menu is NonNullable<typeof menu> => menu !== null && !menu.is_archive
    )
    const validOptions = options.filter(
      (option): option is NonNullable<typeof option> => option !== null && !option.is_archive
    )

    const totalDuration =
      validMenus.reduce((sum, menu) => sum + (menu.duration_min || 0), 0) +
      validOptions.reduce((sum, option) => sum + (option?.duration_min || 0), 0)

    // 3. 各スタッフの空き時間を並列で取得（エラーハンドリング付き）
    const staffAvailabilities = await Promise.all(
      availableStaffs.map(async (staff) => {
        try {
          const times = await ctx.runQuery(api.reservation.query.calculateReservationTime, {
            tenant_id: args.tenant_id,
            org_id: args.org_id,
            staff_id: staff._id,
            date: args.date,
            duration_min: totalDuration,
          })
          return {
            staff: {
              _id: staff._id,
              name: staff.name || '',
              priority: staff.priority || 0,
              extra_charge: staff.extra_charge || 0,
            },
            times,
          }
        } catch {
          // スタッフが休みの日などのエラーは無視して、空の時間枠を返す
          return {
            staff: {
              _id: staff._id,
              name: staff.name || '',
              priority: staff.priority || 0,
              extra_charge: staff.extra_charge || 0,
            },
            times: [], // 空の時間枠
          }
        }
      })
    )

    // 4. 時間帯ごとに統合（Map使用でO(n)で処理）
    const integratedSlots = new Map<string, IntegratedTimeSlot>()

    staffAvailabilities.forEach(({ staff, times }) => {
      console.log('staff', staff)
      if (times && times.length > 0) {
        times.forEach((timeRange: TimeRange) => {
          const key = `${timeRange.startHour}-${timeRange.endHour}`
          const existing = integratedSlots.get(key)

          if (existing) {
            existing.availableStaffs.push({
              id: staff._id,
              name: staff.name,
              priority: staff.priority,
              extra_charge: staff.extra_charge,
            })
          } else {
            integratedSlots.set(key, {
              start: timeRange.startHour,
              end: timeRange.endHour,
              availableStaffs: [
                {
                  id: staff._id,
                  name: staff.name,
                  priority: staff.priority,
                  extra_charge: staff.extra_charge,
                },
              ],
            })
          }
        })
      }
    })

    // 5. 各時間帯で既存予約数をチェックし、availableSheetを超える時間帯を除外
    const filteredSlots = new Map<string, IntegratedTimeSlot>()

    for (const [key, slot] of integratedSlots.entries()) {
      // 時間文字列をタイムスタンプに変換
      const startTimestamp = convertHourToTimestamp(slot.start, args.date)
      const endTimestamp = convertHourToTimestamp(slot.end, args.date)

      if (!startTimestamp || !endTimestamp) {
        console.warn(`時間変換失敗: ${key}`)
        continue
      }

      // この時間帯と重複する既存予約数をカウント
      // 連続した予約（終了時刻 = 開始時刻）は重複とみなさない
      // 例: 13:00~14:00と14:00~15:00は許可、13:00~14:01と14:00~15:00は拒否
      const overlappingReservations = existingReservations.filter((reservation) => {
        const isOverlapping =
          reservation.start_time_unix < endTimestamp && reservation.end_time_unix > startTimestamp

        return isOverlapping
      })
      const conflictCount = overlappingReservations.length
      const remainingCapacity = availableSheet - conflictCount

      // 残り枠がある場合のみスロットを追加
      if (remainingCapacity > 0) {
        filteredSlots.set(key, slot)
      } else {
        console.log(`時間帯 ${key}: 上限に達しているため除外`)
      }
    }

    // 6. 各スロットのスタッフを優先度でソート
    const sortedSlots: IntegratedTimeSlot[] = Array.from(filteredSlots.values()).map((slot) => ({
      ...slot,
      availableStaffs: slot.availableStaffs.sort((a, b) => {
        const priorityDiff = b.priority - a.priority
        if (priorityDiff !== 0) return priorityDiff
        return a.extra_charge - b.extra_charge
      }),
    }))

    // 7. スロット自体を開始時間でソート
    sortedSlots.sort((a, b) => {
      const aMinutes = hourToMinutes(a.start)
      const bMinutes = hourToMinutes(b.start)
      return aMinutes - bMinutes
    })

    return {
      available: sortedSlots.length > 0,
      timeSlots: sortedSlots,
      totalAvailableStaffs: availableStaffs.length,
    }
  },
})

/**
 * 予約の重複を防ぐために、指定したスタッフの同じ時間帯に
 * 既に予約が存在しないかをチェックするヘルパー関数です。
 *
 * この関数は競合状態（race condition）を防ぐために、
 * mutation内で呼び出してから即座に予約を挿入することを推奨します。
 * 更新時には自身の予約IDを除外してチェック可能です。
 * 同時予約数の上限とスタッフの同時予約数の上限をチェックします。
 *
 * @param ctx Mutationコンテキスト（DBアクセス用）
 * @param args チェックに必要な情報（日時・スタッフID等）
 * @returns 重複予約があればtrue、なければfalse
 */
export const checkDoubleBooking = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(),
    start_time_unix: v.number(),
    end_time_unix: v.number(),
    excludeReservationId: v.optional(v.id('reservation')), // 更新時に自分自身を除外するため
  },
  handler: async (ctx, args): Promise<boolean> => {
    return await checkReservationDoubleBooking(ctx, args)
  },
})

/**
 * 全スタッフの予約を日付範囲で一括取得
 * - タイムライン画面での全スタッフ表示用
 * - is_archive: false のみ対象
 * - confirmed ステータスのみを取得
 * - 日付範囲での絞り込み可能
 * データ取得専用でバリデーションはmutationで担保
 */
export const listAllStaffsByDateRange = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    start_date: v.string(), // "YYYY-MM-DD"
    end_date: v.string(), // "YYYY-MM-DD"
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateStringLength(args.org_id, 'org_id')
    validateDateStrFormat(args.start_date, 'start_date')
    validateDateStrFormat(args.end_date, 'end_date')

    // 日付範囲での予約を取得
    return await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .gte('date', args.start_date)
          .lte('date', args.end_date)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))
      .filter((q) => q.eq(q.field('status'), 'confirmed'))
      .order(args.sort || 'desc')
      .paginate(args.paginationOpts)
  },
})

/**
 * スタッフ別の予約をまとめて取得（最適化版）
 * - 全スタッフのタイムライン表示専用
 * - 指定したスタッフIDリストの予約のみ取得
 * - パフォーマンス向上のため使用
 * データ取得専用でバリデーションはmutationで担保
 */
export const listByStaffIds = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_ids: v.array(v.id('staff')),
    paginationOpts: paginationOptsValidator,
    sort: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateStringLength(args.org_id, 'org_id')

    if (args.staff_ids.length === 0) {
      return { page: [], isDone: true, continueCursor: null }
    }

    // 各スタッフの予約を効率的に取得
    const allReservations: Doc<'reservation'>[] = []

    // スタッフごとの予約を並列取得
    const reservationPromises = args.staff_ids.map(async (staff_id) => {
      const reservations = await ctx.db
        .query('reservation')
        .withIndex('by_tenant_org_staff_date_status_archive', (q) =>
          q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('staff_id', staff_id)
        )
        .filter((q) => q.eq(q.field('is_archive'), false))
        .filter((q) => q.eq(q.field('status'), 'confirmed'))
        .order('desc')
        .take(50) // 各スタッフ最大50件
      return reservations
    })

    const results = await Promise.all(reservationPromises)
    results.forEach((reservations) => allReservations.push(...reservations))

    // 日付・時間順でソート
    allReservations.sort((a, b) => {
      const timeA = a.start_time_unix || 0
      const timeB = b.start_time_unix || 0
      return args.sort === 'desc' ? timeB - timeA : timeA - timeB
    })

    // ページネーション形式に合わせて返す
    const pageSize = args.paginationOpts.numItems
    const startIndex = args.paginationOpts.cursor ? parseInt(args.paginationOpts.cursor) : 0
    const endIndex = startIndex + pageSize
    const page = allReservations.slice(startIndex, endIndex)
    const isDone = endIndex >= allReservations.length
    const continueCursor = isDone ? null : endIndex.toString()

    return { page, isDone, continueCursor }
  },
})

/**
 * 予約フォーム画面用の統合データ取得
 * Backend for Frontendパターンで複数クエリを統合
 */
export const getReservationFormData = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    planName: subscriptionPlanNameType,
    menu_ids: v.optional(v.array(v.id('menu'))),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    reservationConfig: Doc<'reservation_config'> | null
    weekSchedules: Doc<'week_schedule'>[]
    menus: Doc<'menu'>[]
    options: Doc<'option'>[]
    availableStaff: AvailableStaff[]
  }> => {
    try {
      const limits = getPlanLimits(args.planName)
      // 並列でデータを取得（直接クエリを実行することでパフォーマンス向上）
      const [reservationConfig, weekSchedules, menus, options, availableStaffData] =
        await Promise.all([
          // 予約設定取得
          ctx.db
            .query('reservation_config')
            .withIndex('by_tenant_org_archive', (q) =>
              q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('is_archive', false)
            )
            .first(),

          // 営業時間取得
          ctx.db
            .query('week_schedule')
            .withIndex('by_tenant_org_week_archive', (q) =>
              q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
            )
            .filter((q) => q.eq(q.field('is_archive'), false))
            .order('desc')
            .collect(),

          // メニュー一覧取得
          ctx.db
            .query('menu')
            .withIndex('by_tenant_org_active_archive', (q) =>
              q
                .eq('tenant_id', args.tenant_id)
                .eq('org_id', args.org_id)
                .eq('is_active', true)
                .eq('is_archive', false)
            )
            .order('asc')
            .take(limits.maxMenuCount),

          // オプション一覧取得
          ctx.db
            .query('option')
            .withIndex('by_tenant_org_active_archive', (q) =>
              q
                .eq('tenant_id', args.tenant_id)
                .eq('org_id', args.org_id)
                .eq('is_active', true)
                .eq('is_archive', false)
            )
            .order('asc')
            .take(limits.maxOptionCount),

          // 選択メニューがある場合のみ利用可能スタッフ取得
          args.menu_ids && args.menu_ids.length > 0
            ? (async () => {
              // メニュー除外スタッフを取得
              const exclusionStaffIds = new Set<string>()
              await Promise.all(
                args.menu_ids!.map(async (menu_id) => {
                  const exclusions = await ctx.db
                    .query('menu_exclusion_staff')
                    .withIndex('by_tenant_org_menu_archive', (q) =>
                      q
                        .eq('tenant_id', args.tenant_id)
                        .eq('org_id', args.org_id)
                        .eq('menu_id', menu_id)
                        .eq('is_archive', false)
                    )
                    .collect()
                  exclusions.forEach((e) => exclusionStaffIds.add(e.staff_id))
                })
              )

              // アクティブなスタッフを取得
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

              // 除外スタッフをフィルタリング
              const availableStaffList = allStaff.filter(
                (staff) => !exclusionStaffIds.has(staff._id)
              )

              // スタッフ設定を取得
              const staffConfigs = await Promise.all(
                availableStaffList.map((staff) =>
                  ctx.db
                    .query('staff_config')
                    .withIndex('by_tenant_org_staff_archive', (q) =>
                      q
                        .eq('tenant_id', args.tenant_id)
                        .eq('org_id', args.org_id)
                        .eq('staff_id', staff._id)
                        .eq('is_archive', false)
                    )
                    .first()
                )
              )

              // スタッフと設定データをマッピング
              const staffWithConfigs = availableStaffList.map((staff, index) => ({
                _id: staff._id,
                name: staff.name,
                images: staff.images,
                extra_charge: staffConfigs[index]?.extra_charge || 0,
                priority: staffConfigs[index]?.priority || 0,
              }))

              // 1名のスタッフのみを返す（優先度が最も高く、同優先度の場合は追加料金が最も安いスタッフ）
              if (staffWithConfigs.length === 0) {
                return []
              }

              // 優先度の降順、追加料金の昇順でソート
              staffWithConfigs.sort((a, b) => {
                if (a.priority !== b.priority) {
                  return b.priority - a.priority // 優先度が高い順
                }
                return a.extra_charge - b.extra_charge // 追加料金が安い順
              })

              // プラン制限に応じたスタッフ数を返す（優先度順でソート済み）
              return staffWithConfigs.slice(0, limits.maxStaffCount)
            })()
            : [],
        ])

      return {
        reservationConfig,
        weekSchedules,
        menus: menus,
        options: options,
        availableStaff: availableStaffData as AvailableStaff[],
      }
    } catch (error) {
      console.error('予約フォームデータ取得エラー:', error)
      throw new Error('予約フォームデータの取得に失敗しました')
    }
  },
})

/**
 * スケジュール表示用の統合データ取得
 */
export const getScheduleData = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    staff_id: v.id('staff'),
    date: v.string(),
    duration_min: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    availableSlots: TimeRange[]
    organizationSchedule: Doc<'week_schedule'>[]
  }> => {
    try {
      // 並列でデータを取得（直接クエリを実行することでパフォーマンス向上）
      const [availableSlots, organizationSchedule] = await Promise.all([
        // 利用可能時間スロット計算
        ctx.runQuery(api.reservation.query.calculateReservationTime, {
          tenant_id: args.tenant_id,
          org_id: args.org_id,
          staff_id: args.staff_id,
          date: args.date,
          duration_min: args.duration_min,
        }),

        // 組織営業時間取得
        ctx.db
          .query('week_schedule')
          .withIndex('by_tenant_org_week_archive', (q) =>
            q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
          )
          .filter((q) => q.eq(q.field('is_archive'), false))
          .order('desc')
          .collect(),
      ])

      return {
        availableSlots,
        organizationSchedule,
      }
    } catch (error) {
      console.error('スケジュールデータ取得エラー:', error)
      throw new Error('スケジュールデータの取得に失敗しました')
    }
  },
})
// pending状態の予約を取得（有効期限切れ含む）
export const getPendingReservations = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    includeExpired: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    checkAuth(ctx)

    const now = Date.now()

    // pending状態の予約を取得
    let query = ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_status_date_start_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id).eq('status', 'pending')
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    // 期限切れフィルタリング
    if (!args.includeExpired) {
      query = query.filter((q) =>
        q.or(q.eq(q.field('pending_expiry'), undefined), q.gt(q.field('pending_expiry'), now))
      )
    }

    const result = await query.paginate(args.paginationOpts)

    // 各予約に期限切れフラグを追加
    const enrichedData = result.page.map((reservation) => ({
      ...reservation,
      isExpired: reservation.pending_expiry ? reservation.pending_expiry < now : false,
      expiresIn: reservation.pending_expiry ? reservation.pending_expiry - now : null,
      expiresInMinutes: reservation.pending_expiry
        ? Math.floor((reservation.pending_expiry - now) / (1000 * 60))
        : null,
    }))

    return {
      ...result,
      page: enrichedData,
    }
  },
})

/**
 * フリー指名用：指定時間帯に対応可能な最優先スタッフを取得
 * DateView コンポーネントから呼び出され、時間選択時に自動でスタッフを割り当てる
 */
export const getBestAvailableStaffForTimeSlot = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    menu_ids: v.array(v.id('menu')),
    date: v.string(),
    start_time_unix: v.number(),
    end_time_unix: v.number(),
  },
  returns: v.union(
    v.object({
      staff_id: v.id('staff'),
      staff_name: v.string(),
      priority: v.number(),
      extra_charge: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    console.log('=== findBestAvailableStaffForTimeSlot デバッグ開始 ===')
    console.log('引数:', {
      ...args,
      start_time_str: new Date(args.start_time_unix).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
      }),
      end_time_str: new Date(args.end_time_unix).toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
      }),
    })

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

    if (allStaff.length === 0) {
      console.log('アクティブスタッフが0人のため終了')
      return null
    }

    // 2. 各メニューに対応しないスタッフ（除外スタッフ）を取得
    const excludedIds = new Set<string>()
    const exclusionsPromises = args.menu_ids.map(async (menu_id) => {
      const exclusions = await ctx.db
        .query('menu_exclusion_staff')
        .withIndex('by_tenant_org_menu_archive', (q) =>
          q
            .eq('tenant_id', args.tenant_id)
            .eq('org_id', args.org_id)
            .eq('menu_id', menu_id)
            .eq('is_archive', false)
        )
        .collect()
      return exclusions
    })
    const allExclusions = await Promise.all(exclusionsPromises)
    allExclusions.forEach((exclusions) => {
      exclusions.forEach((ex) => excludedIds.add(ex.staff_id))
    })

    // 3. メニューに対応可能なスタッフのみフィルタリング
    const availableStaff = allStaff.filter((staff) => !excludedIds.has(staff._id))

    if (availableStaff.length === 0) {
      console.log('メニュー対応可能スタッフが0人のため終了')
      return null
    }

    // 対象日の曜日を取得
    const targetDate = new Date(args.date)
    const dayOfWeek = getDayOfWeek(targetDate)

    const filteredBySchedule: typeof availableStaff = []

    // 4. スケジュール・週間勤務時間チェックで更にスタッフを絞り込み
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
        console.log('例外スケジュール:', {
          is_all_day: sch.is_all_day,
          start: sch.start_time_unix
            ? new Date(sch.start_time_unix).toLocaleString('ja-JP')
            : undefined,
          end: sch.end_time_unix ? new Date(sch.end_time_unix).toLocaleString('ja-JP') : undefined,
        })

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

      if (skip) {
        console.log('例外スケジュールにより除外')
        continue
      }

      // 4.2 週間スケジュール取得（クエリ実行前のログ）
      console.log(`週間スケジュール検索条件:`, {
        tenant_id: args.tenant_id,
        org_id: args.org_id,
        staff_id: staff._id,
        day_of_week: dayOfWeek,
        is_open: true,
        is_archive: false,
      })

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
        console.log('→ 週間スケジュールなし or is_open=false、スキップ')
        continue
      }

      console.log(args.date)

      // 勤務時間内判定
      const workStart = weekSchedule.start_hour
        ? (convertHourToTimestamp(weekSchedule.start_hour, args.date) ?? Number.MIN_SAFE_INTEGER)
        : Number.MIN_SAFE_INTEGER
      const workEnd = weekSchedule.end_hour
        ? (convertHourToTimestamp(weekSchedule.end_hour, args.date) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER

      console.log('勤務時間チェック:', {
        workStart: convertTimestampToHour(workStart),
        workEnd: convertTimestampToHour(workEnd),
        reservationStart: convertTimestampToHour(args.start_time_unix),
        reservationEnd: convertTimestampToHour(args.end_time_unix),
        workStartHour: weekSchedule.start_hour,
        workEndHour: weekSchedule.end_hour,
      })

      if (args.start_time_unix < workStart || args.end_time_unix > workEnd) {
        console.log('→ 勤務時間外、スキップ')
        continue
      }

      console.log('→ スケジュールOK、追加')
      filteredBySchedule.push(staff)
    }
    if (filteredBySchedule.length === 0) {
      console.log('スケジュール確認後スタッフが0人のため終了')
      return null
    }

    // 5. スタッフ設定（優先度、指名料）を取得
    const configs = await ctx.db
      .query('staff_config')
      .withIndex('by_tenant_org_staff_archive', (q) =>
        q.eq('tenant_id', args.tenant_id).eq('org_id', args.org_id)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))
      .collect()
    const configMap = new Map(configs.map((config) => [config.staff_id, config]))

    // 6. ダブルブッキングをチェックし、対応可能なスタッフを絞り込み
    const availableStaffWithConfigs = []
    for (const staff of filteredBySchedule) {
      const config = configMap.get(staff._id)

      if (!config) {
        console.log(`→ 設定がないため除外`)
        continue
      }

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
          availableStaffWithConfigs.push({
            staff_id: staff._id,
            staff_name: staff.name || '',
            priority: config?.priority || 1,
            extra_charge: config?.extra_charge || 0,
          })
        }
      } catch {
        continue
      }
    }

    console.log('\n6. 最終利用可能スタッフ数:', availableStaffWithConfigs.length)
    console.log('最終スタッフリスト:', availableStaffWithConfigs)

    if (availableStaffWithConfigs.length === 0) {
      console.log('最終的に利用可能なスタッフが0人のため終了')
      return null
    }

    // 7. 優先度順でソート（数値が高いほど優先度が高い）
    availableStaffWithConfigs.sort((a, b) => b.priority - a.priority)

    console.log('7. 選択されたスタッフ:', availableStaffWithConfigs[0])
    console.log('=== findBestAvailableStaffForTimeSlot デバッグ終了 ===')

    // 8. 最優先スタッフを返す
    return availableStaffWithConfigs[0]
  },
})

/**
 * 指定期間内の日毎の予約件数を取得
 * - タイムライン画面での予約件数表示とカレンダー表示用
 * - confirmed ステータスのみを対象
 * - 日付ごとの件数を軽量に返す
 */
export const getReservationCountsByDateRange = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    start_date: v.string(), // YYYY-MM-DD
    end_date: v.string(), // YYYY-MM-DD
  },
  returns: v.array(
    v.object({
      date: v.string(),
      count: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    checkAuth(ctx)
    validateDateStrFormat(args.start_date, 'start_date')
    validateDateStrFormat(args.end_date, 'end_date')

    // 指定期間の予約を一度に取得（最小限のフィールドのみ）
    const reservations = await ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .gte('date', args.start_date)
          .lte('date', args.end_date)
      )
      .filter((q) =>
        q.and(q.eq(q.field('is_archive'), false), q.eq(q.field('status'), 'confirmed'))
      )
      .collect()

    // 日付ごとに集計（Map使用でO(n)で処理）
    const dateCounts = new Map<string, number>()

    reservations.forEach((reservation) => {
      const date = reservation.date
      dateCounts.set(date, (dateCounts.get(date) || 0) + 1)
    })

    // 結果を配列形式に変換してソート
    const result = Array.from(dateCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return result
  },
})

/**
 * 組織の予約データを全件取得（CSV出力用）
 * - 期間絞り込み対応
 * - ページネーション無しで大量データを効率的に取得
 * - 最大3ヶ月間の制限はAPIエンドポイント側で実施
 */
export const listOrganizationAllStatusForExport = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    start_date: v.string(),
    end_date: v.string(),
    status_filter: v.optional(reservationStatusType),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.org_id, 'org_id')
    validateDateStrFormat(args.start_date, 'start_date')
    validateDateStrFormat(args.end_date, 'end_date')

    const limit = args.limit || 1000

    let reservationQuery = ctx.db
      .query('reservation')
      .withIndex('by_tenant_org_date_status_archive', (q) =>
        q
          .eq('tenant_id', args.tenant_id)
          .eq('org_id', args.org_id)
          .gte('date', args.start_date)
          .lte('date', args.end_date)
      )
      .filter((q) => q.eq(q.field('is_archive'), false))

    // ステータスフィルター
    if (args.status_filter) {
      reservationQuery = reservationQuery.filter((q) => q.eq(q.field('status'), args.status_filter))
    }

    // カーソルベースのページネーション
    if (args.cursor) {
      const [cursorDate, cursorId] = args.cursor.split('|')
      reservationQuery = reservationQuery.filter((q) =>
        q.or(
          q.gt(q.field('date'), cursorDate),
          q.and(q.eq(q.field('date'), cursorDate), q.gt(q.field('_id'), cursorId))
        )
      )
    }

    const reservations = await reservationQuery.order('desc').take(limit + 1) // +1で次のページがあるかチェック

    const hasMore = reservations.length > limit
    const resultReservations = hasMore ? reservations.slice(0, limit) : reservations

    let nextCursor = null
    if (hasMore && resultReservations.length > 0) {
      const lastReservation = resultReservations[resultReservations.length - 1]
      nextCursor = `${lastReservation.date}|${lastReservation._id}`
    }

    const reservationIds = reservations.map((r) => r._id)

    // 例: 複数のreservation_idでreservation_detailを取得
    const detailsList = await Promise.all(
      reservationIds.map((id) =>
        ctx.db
          .query('reservation_detail')
          .withIndex('by_reservation_archive', (q) => q.eq('reservation_id', id))
          .collect()
      )
    )
    // 結果をフラット化
    const details = detailsList.flat()

    return {
      reservations: reservations,
      details: details,
      hasMore,
      nextCursor,
    }
  },
})




