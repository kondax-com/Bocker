import { NextRequest, NextResponse } from 'next/server'
import { fetchMutation, fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { stripeService } from '@/services/stripe/StripeService'
import { validateRequest, createValidationErrorResponse } from '@/lib/api/validation'
import { stripeCheckoutSchema } from '@/lib/validations/api'
import { getCustomerSession } from '@/lib/auth/customer'
import { getStaffManagementClient } from '@/lib/auth/staff-management'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'
import { BASE_URL } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequest(request, stripeCheckoutSchema)
    if (!validation.success) return createValidationErrorResponse(validation.error)
    const body = validation.data
    const reservation = await fetchQuery(api.reservation.query.getById, {
      id: body.reservationId as Id<'reservation'>,
    })
    if (
      !reservation ||
      reservation.is_archive ||
      reservation.tenant_id !== body.tenantId ||
      reservation.org_id !== body.orgId
    ) {
      return NextResponse.json({ error: 'この予約の決済を行う権限がありません' }, { status: 403 })
    }

    const customer = await getCustomerSession()
    const isCustomerOwner = Boolean(
      customer &&
        customer.tenantId === reservation.tenant_id &&
        customer.orgId === reservation.org_id &&
        customer.customerUid === reservation.customer_uid
    )
    let authorized = isCustomerOwner
    if (!authorized) {
      try {
        const { convex } = await getStaffManagementClient()
        const access = await convex.query(api.reservation.notification.query.authorize, {
          tenant_id: reservation.tenant_id,
          org_id: reservation.org_id,
        })
        authorized = access.authorized
      } catch {
        authorized = false
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: 'この予約の決済を行う権限がありません' }, { status: 403 })
    }
    if (
      reservation.status !== 'pending' ||
      reservation.payment_status !== 'pending' ||
      !reservation.customer_uid
    ) {
      return NextResponse.json(
        { error: 'この予約のCheckoutセッションは作成できません' },
        { status: 409 }
      )
    }

    const { organization } = await fetchQuery(api.organization.query.getOrgAndConfig, {
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
    })
    if (
      organization.tenant_id !== reservation.tenant_id ||
      organization.is_archive ||
      !organization.is_active ||
      !organization.stripe_account_id
    ) {
      return NextResponse.json({ error: '店舗の決済設定が利用できません' }, { status: 409 })
    }

    const result = await stripeService.createCheckoutSession({
      stripe_account_id: organization.stripe_account_id,
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
      reservation_id: reservation._id,
      line_items: body.lineItems,
      customer_email: isCustomerOwner ? customer?.email : undefined,
      success_url: `${BASE_URL}/reservation/${reservation.org_id}/calendar/complete?reservationId=${reservation._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/reservation/${reservation.org_id}/calendar?canceled=true&reservationId=${reservation._id}`,
      metadata: {
        reservationId: reservation._id,
        tenantId: reservation.tenant_id,
        orgId: reservation.org_id,
        customerUid: reservation.customer_uid,
        couponId: body.couponId || '',
        pointsUsedAmount: body.pointsUsedAmount?.toString() || '0',
      },
    })
    if (!result.success || !result.data?.url || !result.data.sessionId) {
      return NextResponse.json({ error: 'Checkoutセッションの作成に失敗しました' }, { status: 400 })
    }

    await fetchMutation(
      api.reservation.checkout.mutation.attachSession,
      withReservationMutationCapability('checkout:attach-session', {
        reservation_id: reservation._id,
        tenant_id: reservation.tenant_id,
        org_id: reservation.org_id,
        customer_uid: reservation.customer_uid,
        stripe_checkout_session_id: result.data.sessionId,
      })
    )
    return NextResponse.json({ sessionId: result.data.sessionId, checkoutUrl: result.data.url })
  } catch {
    return NextResponse.json({ error: 'Checkoutセッションの作成に失敗しました' }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
