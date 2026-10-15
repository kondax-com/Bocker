import React from 'react'
import { NextResponse } from 'next/server'
import { fetchQuery } from 'convex/nextjs'
import { render } from '@react-email/render'
import { Resend } from 'resend'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { StaffDisplay } from '@/lib/types'
import { getAppUrl, getEnv } from '@/lib/env-config'
import {
  formatReservationDateInJapan,
  formatReservationTimeInJapan,
  formatReservationTimeRangeInJapan,
} from '@/lib/reservationDateTime'
import ReservationConfirmationEmail from '@/components/emails/ReservationConfirmationEmail'
import ReservationReminderEmail from '@/components/emails/ReservationReminderEmail'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import { getSupabaseAdminService } from '@/services/supabase/SupabaseService'
import { reservationFlexMessageTemplate } from '@/services/line/message_template/reservation_flex'
import { createReminderFlexMessage } from '@/services/line/message_template/reminder_flex'
import {
  createCustomerCancellationNotification,
  createSalonCancellationNotification,
} from '@/services/line/message_template/cancellation_flex'
import { createSalonReservationNotification } from '@/services/line/message_template/salon_reservation_notification'
import { sendLineFlexMessageOrThrow } from '@/services/line/sendLineFlexMessageOrThrow'
import { getServerApiConfig } from './apiConfig'
import { authorizeReservationNotification, NotificationError, type NotificationKind } from './auth'

interface ReservationNotificationContext {
  reservation: Doc<'reservation'>
  detail: Doc<'reservation_detail'> & { total_price: number }
  organization: Doc<'organization'>
  config: Doc<'config'>
  reservationConfig: Doc<'reservation_config'> | null | undefined
  apiConfig: Awaited<ReturnType<typeof getServerApiConfig>>
}

async function loadNotificationContext(
  request: Request,
  kind: NotificationKind
): Promise<ReservationNotificationContext> {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    throw new NotificationError(400, '予約IDを指定してください')
  }

  if (typeof body.reservationId !== 'string' || !body.reservationId.trim()) {
    throw new NotificationError(400, '予約IDを指定してください')
  }

  const result = await fetchQuery(api.reservation.query.getWithDetailById, {
    id: body.reservationId as Id<'reservation'>,
  })
  const reservation = result?.reservation
  const detail = result?.reservationDetail
  if (
    !reservation ||
    !detail ||
    reservation.is_archive ||
    detail.is_archive ||
    detail.reservation_id !== reservation._id ||
    detail.tenant_id !== reservation.tenant_id ||
    detail.org_id !== reservation.org_id
  ) {
    throw new NotificationError(404, '予約が見つかりません')
  }

  await authorizeReservationNotification(request, reservation, kind)

  // 旧形式の店舗指定が残っている場合も、保存済み予約との一致を必須にする。
  for (const [key, expected] of [
    ['tenantId', reservation.tenant_id],
    ['tenant_id', reservation.tenant_id],
    ['organizationId', reservation.org_id],
    ['orgId', reservation.org_id],
    ['org_id', reservation.org_id],
    ['customerUid', reservation.customer_uid],
  ] as const) {
    if (body[key] !== undefined && body[key] !== expected) {
      throw new NotificationError(403, '予約の所属情報が一致しません')
    }
  }

  if (kind === 'cancellation') {
    if (reservation.status !== 'cancelled' && reservation.status !== 'refunded') {
      throw new NotificationError(409, 'キャンセル済みの予約ではありません')
    }
  } else {
    if (
      reservation.status !== 'confirmed' ||
      ['failed', 'cancelled'].includes(reservation.payment_status) ||
      (detail.payment_method === 'credit_card' &&
        !['paid', 'completed'].includes(reservation.payment_status))
    ) {
      throw new NotificationError(409, '確定済みの予約ではありません')
    }
    if (
      kind === 'reminder' &&
      (reservation.reminder_sent || reservation.start_time_unix <= Date.now())
    ) {
      throw new NotificationError(409, 'リマインダーの送信対象ではありません')
    }
  }

  const [relations, apiConfig] = await Promise.all([
    fetchQuery(api.organization.query.getRelations, {
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
    }),
    getServerApiConfig(reservation.tenant_id, reservation.org_id),
  ])
  if (
    !relations.organization ||
    !relations.config ||
    relations.organization._id !== reservation.org_id ||
    relations.organization.tenant_id !== reservation.tenant_id ||
    relations.organization.is_archive ||
    relations.config.tenant_id !== reservation.tenant_id ||
    relations.config.org_id !== reservation.org_id ||
    relations.config.is_archive ||
    (apiConfig &&
      (apiConfig.tenant_id !== reservation.tenant_id ||
        apiConfig.org_id !== reservation.org_id ||
        apiConfig.is_archive))
  ) {
    throw new NotificationError(404, '店舗情報が見つかりません')
  }

  return {
    reservation,
    detail: { ...detail, total_price: detail.total_price ?? 0 },
    organization: relations.organization,
    config: relations.config,
    reservationConfig: relations.reservationConfig,
    apiConfig,
  }
}

function staffName(reservation: Doc<'reservation'>): string {
  return reservation.is_free_nomination
    ? reservation.assigned_staff_name || reservation.staff_name || '指名フリー'
    : reservation.staff_name || '指名フリー'
}

function cancellationData({ reservation, detail }: ReservationNotificationContext) {
  return {
    reservationId: reservation._id,
    customerName: reservation.customer_name,
    date: reservation.date,
    startTimeUnix: reservation.start_time_unix,
    endTimeUnix: reservation.end_time_unix,
    staffName: staffName(reservation),
    menus: detail.menus,
    options: detail.options,
    totalPrice: detail.total_price,
    cancelledBy: reservation.cancelled_by || ('system' as const),
    cancelReason: reservation.cancel_reason || '',
  }
}

async function sendCustomerNotification(
  context: ReservationNotificationContext,
  kind: NotificationKind
) {
  const { reservation, detail, organization, config, apiConfig } = context
  if (!reservation.customer_uid) {
    throw new NotificationError(404, '顧客情報が見つかりません')
  }
  const customer = await new CustomerRepository(getSupabaseAdminService()).findOne({
    uid: reservation.customer_uid,
    tenant_id: reservation.tenant_id,
    org_id: reservation.org_id,
    is_archive: false,
  })
  if (
    !customer ||
    customer.uid !== reservation.customer_uid ||
    customer.tenant_id !== reservation.tenant_id ||
    customer.org_id !== reservation.org_id ||
    customer.is_archive
  ) {
    throw new NotificationError(404, '顧客情報が見つかりません')
  }

  if (customer.line_id) {
    if (!apiConfig?.line_access_token) {
      throw new NotificationError(503, '店舗のLINE通知が設定されていません')
    }

    let messages
    if (kind === 'reminder') {
      messages = createReminderFlexMessage({
        organization,
        orgConfig: config,
        reservationData: {
          id: reservation._id,
          customerName: reservation.customer_name,
          staffName: staffName(reservation),
          startTimeUnix: reservation.start_time_unix,
          endTimeUnix: reservation.end_time_unix,
          menus: detail.menus,
          options: detail.options || [],
          extraCharge: detail.extra_charge || 0,
          couponDiscount: detail.coupon_discount || 0,
          usePoints: detail.use_points || 0,
          totalPrice: detail.total_price,
          orgName: organization.org_name,
        },
      })
    } else if (kind === 'cancellation') {
      messages = createCustomerCancellationNotification({
        organization,
        orgConfig: config,
        customerName: reservation.customer_name,
        customerUid: customer.uid,
        orgId: reservation.org_id,
        reservationData: cancellationData(context),
      })
    } else {
      // 既存テンプレートはメニュー/オプションの名前と担当名・指名料だけを参照する。
      // 予約時点のスナップショットを渡し、現在のマスタ変更を通知へ混入させない。
      messages = reservationFlexMessageTemplate(
        organization,
        config,
        reservation.customer_name,
        reservation.org_id,
        customer.uid,
        reservation.is_free_nomination
          ? null
          : ({ name: staffName(reservation), extra_charge: detail.extra_charge } as StaffDisplay),
        new Date(`${reservation.date}T12:00:00`),
        {
          startHour: formatReservationTimeInJapan(reservation.start_time_unix),
          endHour: formatReservationTimeInJapan(reservation.end_time_unix),
        },
        detail.menus as unknown as Doc<'menu'>[],
        (detail.options || []) as unknown as Doc<'option'>[],
        detail.use_points || 0,
        detail.coupon_discount || 0,
        detail.total_price,
        reservation._id,
        context.reservationConfig?.available_cancel_days ?? 3
      )
    }
    await sendLineFlexMessageOrThrow({
      lineId: customer.line_id,
      accessToken: apiConfig.line_access_token,
      messages,
    })
    return { channel: 'line' }
  }

  if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new NotificationError(422, '通知先が設定されていません')
  }
  const apiKey = getEnv('RESEND_API_KEY')
  const from = getEnv('RESEND_FROM_EMAIL')
  if (!apiKey || !from) throw new NotificationError(503, 'メール通知が設定されていません')

  const date = formatReservationDateInJapan(reservation.start_time_unix)
  const time = formatReservationTimeRangeInJapan(
    reservation.start_time_unix,
    reservation.end_time_unix
  )
  const title =
    kind === 'reminder'
      ? '【リマインダー】本日のご予約について'
      : kind === 'cancellation'
        ? '予約キャンセルのお知らせ'
        : 'ご予約内容の確認'
  const content =
    kind === 'cancellation'
      ? {
          text: `${reservation.customer_name} 様\n以下のご予約がキャンセルされました。\n${organization.org_name}\n${date} ${time}\n担当: ${staffName(reservation)}\n予約番号: ${reservation._id}\nキャンセル理由: ${reservation.cancel_reason || ''}`,
        }
      : {
          html: await render(
            kind === 'reminder'
              ? React.createElement(ReservationReminderEmail, {
                  customerName: reservation.customer_name,
                  organizationName: organization.org_name,
                  reservationDate: date,
                  startTime: formatReservationTimeInJapan(reservation.start_time_unix),
                  endTime: formatReservationTimeInJapan(reservation.end_time_unix),
                  menus: detail.menus,
                  options: detail.options,
                  staffName: staffName(reservation),
                  extraCharge: detail.extra_charge,
                  couponDiscount: detail.coupon_discount,
                  usePoints: detail.use_points,
                  totalPrice: detail.total_price,
                  reservationId: reservation._id,
                  orgAddress: config.address,
                  orgPhone: config.phone,
                })
              : React.createElement(ReservationConfirmationEmail, {
                  customerName: reservation.customer_name,
                  customerEmail: customer.email,
                  orgName: organization.org_name,
                  orgPhone: config.phone || '',
                  orgAddress: config.address || '',
                  orgPostalCode: config.postal_code || '',
                  reservationDate: date,
                  reservationTime: time,
                  staffName: staffName(reservation),
                  extraCharge: detail.extra_charge,
                  menus: detail.menus,
                  options: (detail.options || []).map((option) => ({
                    name: option.name,
                    price: option.price,
                    count: option.quantity,
                  })),
                  subtotal:
                    detail.menus.reduce((sum, menu) => sum + menu.price * menu.quantity, 0) +
                    (detail.options || []).reduce(
                      (sum, option) => sum + option.price * option.quantity,
                      0
                    ) +
                    (detail.extra_charge || 0),
                  pointsUsed: detail.use_points,
                  couponDiscount: detail.coupon_discount,
                  totalAmount: detail.total_price,
                  reservationRules: config.reservation_rules,
                  reservationDetailUrl: `${getAppUrl()}/customer/${reservation.org_id}/${customer.uid}/reservation`,
                })
          ),
        }
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: [customer.email],
    subject: `【${organization.org_name}】${title}`,
    ...content,
  })
  if (error) throw new NotificationError(502, 'メール通知を送信できませんでした')
  return { channel: 'email' }
}

async function sendSalonNotification(
  context: ReservationNotificationContext,
  kind: NotificationKind
) {
  const { reservation, detail, organization, apiConfig } = context
  if (!apiConfig?.org_line_id) return { skipped: true, message: 'No salon LINE ID configured' }
  if (!apiConfig.line_access_token) {
    throw new NotificationError(503, '店舗のLINE通知が設定されていません')
  }
  const paymentMethod = detail.payment_method
  if (paymentMethod !== 'cash' && paymentMethod !== 'credit_card') {
    throw new NotificationError(409, '予約の支払い方法が不正です')
  }
  const message =
    kind === 'cancellation'
      ? createSalonCancellationNotification({
          organization,
          reservationData: cancellationData(context),
        })
      : createSalonReservationNotification({
          organization,
          reservation: {
            ...reservation,
            staff_name: staffName(reservation),
            is_free_nomination: reservation.is_free_nomination ?? false,
          },
          reservationDetail: detail,
          customer: {},
          paymentMethod,
        })
  await sendLineFlexMessageOrThrow({
    lineId: apiConfig.org_line_id,
    accessToken: apiConfig.line_access_token,
    messages: [message],
  })
  return { channel: 'line' }
}

export async function handleReservationNotification(
  request: Request,
  kind: NotificationKind,
  audience: 'customer' | 'salon' = 'customer'
): Promise<NextResponse> {
  try {
    const context = await loadNotificationContext(request, kind)
    const result =
      audience === 'salon'
        ? await sendSalonNotification(context, kind)
        : await sendCustomerNotification(context, kind)
    return NextResponse.json({ success: true, message: '通知を処理しました', ...result })
  } catch (error) {
    const status = error instanceof NotificationError ? error.status : 500
    // 送信サービスの例外は宛先やHTTP認証情報を含み得るため、本文や例外を出力しない。
    return NextResponse.json(
      {
        success: false,
        error: error instanceof NotificationError ? error.message : '通知を処理できませんでした',
      },
      { status }
    )
  }
}
