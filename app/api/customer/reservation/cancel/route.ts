import { NextRequest, NextResponse } from 'next/server'
import { fetchMutation, fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getCustomerSession } from '@/lib/auth/customer'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'

export async function POST(request: NextRequest) {
  const session = await getCustomerSession()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  let body: { reservationId?: unknown; cancelReason?: unknown }
  try {
    body = await request.json()
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.reservationId !== 'string' ||
      !body.reservationId ||
      (body.cancelReason !== undefined &&
        (typeof body.cancelReason !== 'string' || body.cancelReason.length > 1000))
    ) {
      return NextResponse.json({ error: '予約情報が不正です' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: '予約情報が不正です' }, { status: 400 })
  }

  try {
    const reservation = await fetchQuery(api.reservation.query.getById, {
      id: body.reservationId as Id<'reservation'>,
    })
    if (
      !reservation ||
      reservation.is_archive ||
      reservation.tenant_id !== session.tenantId ||
      reservation.org_id !== session.orgId ||
      !reservation.customer_uid ||
      reservation.customer_uid !== session.customerUid
    ) {
      return NextResponse.json({ error: 'この予約を変更する権限がありません' }, { status: 403 })
    }
    const payload = {
      reservationId: reservation._id,
      cancelledBy: 'customer' as const,
      cancelReason:
        typeof body.cancelReason === 'string' ? body.cancelReason : 'お客様都合によるキャンセル',
      skipValidation: false,
      checkCancelable: true,
    }
    const { server_token } = withReservationMutationCapability('customer-cancel', payload)
    await fetchMutation(api.reservation.manage.handleReservationManage, {
      mode: 'cancel',
      payload,
      server_token,
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: '予約をキャンセルできませんでした。期限と予約状況をご確認ください' },
      { status: 400 }
    )
  }
}
