import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getFunctionName } from 'convex/server'
import { POST } from '@/app/api/stripe/checkout/route'
import { reservationMutationResource } from '@/lib/auth/reservation-capability'
import { verifyServerCapability } from '@/lib/auth/server-capability'
import type Stripe from 'stripe'
import type { Id } from '@/convex/_generated/dataModel'

const mocks = vi.hoisted(() => ({
  customerSession: vi.fn(),
  staffClient: vi.fn(),
  staffQuery: vi.fn(),
  fetchQuery: vi.fn(),
  fetchMutation: vi.fn(),
  createCheckout: vi.fn(),
}))
vi.mock('@/lib/auth/customer', () => ({ getCustomerSession: mocks.customerSession }))
vi.mock('@/lib/auth/staff-management', () => ({ getStaffManagementClient: mocks.staffClient }))
vi.mock('convex/nextjs', () => ({
  fetchQuery: mocks.fetchQuery,
  fetchMutation: mocks.fetchMutation,
}))
vi.mock('@/services/stripe/StripeService', () => ({
  stripeService: { createCheckoutSession: mocks.createCheckout },
}))
vi.mock('@/lib/constants', () => ({ BASE_URL: 'https://example.test' }))

const reservation = {
  _id: 'reservation-a-1234567890',
  tenant_id: 'tenant-a-123456789012345',
  org_id: 'organization-a-12345678',
  customer_uid: 'customer-a',
  status: 'pending',
  payment_status: 'pending',
  is_archive: false,
}
const customerSession = {
  customerUid: 'customer-a',
  tenantId: reservation.tenant_id,
  orgId: reservation.org_id,
}
const organization = {
  _id: reservation.org_id,
  tenant_id: reservation.tenant_id,
  stripe_account_id: 'acct_stored_salon',
  is_active: true,
  is_archive: false,
}

function checkoutRequest(overrides: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('https://example.test/api/stripe/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reservationId: reservation._id,
        tenantId: reservation.tenant_id,
        orgId: reservation.org_id,
        stripeConnectId: 'acct_browser_supplied',
        customerEmail: 'customer@example.test',
        lineItems: [
          {
            price_data: { currency: 'jpy', unit_amount: 1000, product_data: { name: 'Menu' } },
            quantity: 1,
          },
        ],
        ...overrides,
      }),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.customerSession.mockResolvedValue(null)
  mocks.staffClient.mockRejectedValue(new Error('Unauthorized'))
  mocks.fetchQuery.mockImplementation(async (reference) => {
    const name = getFunctionName(reference)
    if (name === 'reservation/query:getById') return { ...reservation }
    if (name === 'organization/query:getOrgAndConfig')
      return { organization: { ...organization }, config: null }
    throw new Error(`Unexpected query ${name}`)
  })
  mocks.fetchMutation.mockResolvedValue(true)
  mocks.createCheckout.mockResolvedValue({
    success: true,
    data: { sessionId: 'cs_server_created', url: 'https://checkout.stripe.test/session' },
  })
})
afterEach(() => vi.restoreAllMocks())

describe('checkout reservation ownership', () => {
  it('rejects anonymous callers before issuing a Stripe session', async () => {
    expect((await checkoutRequest()).status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
  })

  it.each([
    { customerUid: 'other-customer' },
    { tenantId: 'other-tenant' },
    { orgId: 'other-org' },
  ])('rejects a customer session that does not own the exact reservation %o', async (mismatch) => {
    mocks.customerSession.mockResolvedValue({ ...customerSession, ...mismatch })
    expect((await checkoutRequest()).status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('rejects mismatched request organization IDs even for the reservation owner', async () => {
    mocks.customerSession.mockResolvedValue(customerSession)
    expect((await checkoutRequest({ orgId: 'other-organization-1234567' })).status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('uses the stored Connect account and binds session metadata and storage to the reservation', async () => {
    mocks.customerSession.mockResolvedValue(customerSession)
    const response = await checkoutRequest()
    expect(response.status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_account_id: 'acct_stored_salon',
        reservation_id: reservation._id,
        tenant_id: reservation.tenant_id,
        org_id: reservation.org_id,
        metadata: expect.objectContaining({
          reservationId: reservation._id,
          tenantId: reservation.tenant_id,
          orgId: reservation.org_id,
          customerUid: 'customer-a',
        }),
      })
    )
    expect(mocks.fetchMutation).toHaveBeenCalledTimes(1)
    const [reference, args] = mocks.fetchMutation.mock.calls[0]
    expect(getFunctionName(reference)).toBe('reservation/checkout/mutation:attachSession')
    expect(args).toMatchObject({
      reservation_id: reservation._id,
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
      customer_uid: 'customer-a',
      stripe_checkout_session_id: 'cs_server_created',
    })
    expect(
      verifyServerCapability(
        args.server_token,
        'reservation:checkout:attach-session',
        reservationMutationResource(args)
      )
    ).toBe(true)
    expect(mocks.createCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetchMutation.mock.invocationCallOrder[0]
    )
    expect(await response.json()).toEqual({
      sessionId: 'cs_server_created',
      checkoutUrl: 'https://checkout.stripe.test/session',
    })
  })

  it('allows currently authorized staff to issue a reservation checkout', async () => {
    mocks.staffClient.mockResolvedValue({ convex: { query: mocks.staffQuery }, userId: 'staff-a' })
    mocks.staffQuery.mockResolvedValue({ authorized: true })
    expect((await checkoutRequest()).status).toBe(200)
    expect(mocks.staffQuery).toHaveBeenCalledWith(expect.anything(), {
      tenant_id: reservation.tenant_id,
      org_id: reservation.org_id,
    })
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customer_email: undefined })
    )
  })

  it('ignores an arbitrary request email and uses the authenticated customer email', async () => {
    mocks.customerSession.mockResolvedValue({ ...customerSession, email: 'verified@example.test' })
    expect((await checkoutRequest({ customerEmail: 'attacker@example.test' })).status).toBe(200)
    expect(mocks.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customer_email: 'verified@example.test' })
    )
  })

  it('rejects staff whose current DB membership was revoked', async () => {
    mocks.staffClient.mockResolvedValue({ convex: { query: mocks.staffQuery }, userId: 'staff-a' })
    mocks.staffQuery.mockRejectedValue(new Error('FORBIDDEN'))
    expect((await checkoutRequest()).status).toBe(403)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('does not issue another session for a completed or cancelled reservation', async () => {
    mocks.customerSession.mockResolvedValue(customerSession)
    mocks.fetchQuery.mockResolvedValue({
      ...reservation,
      status: 'confirmed',
      payment_status: 'completed',
    })
    expect((await checkoutRequest()).status).toBe(409)
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('does not return a checkout URL if binding the generated session fails', async () => {
    mocks.customerSession.mockResolvedValue(customerSession)
    mocks.fetchMutation.mockRejectedValue(new Error('Reservation changed'))
    const response = await checkoutRequest()
    expect(response.status).toBe(500)
    expect(await response.json()).not.toHaveProperty('checkoutUrl')
  })
})

it('copies the reservation scope and customer UID into PaymentIntent metadata', async () => {
  const { StripeConnectRepository } = await import(
    '@/services/stripe/repositories/StripeConnectRepository'
  )
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: 'cs_created',
    url: params.success_url,
  }))
  const repo = StripeConnectRepository.getInstance({
    checkout: { sessions: { create } },
  } as unknown as Stripe)
  const result = await repo.createCheckoutSession({
    stripe_account_id: 'acct_stored_salon',
    tenant_id: reservation.tenant_id as Id<'tenant'>,
    org_id: reservation.org_id as Id<'organization'>,
    reservation_id: reservation._id as Id<'reservation'>,
    line_items: [
      {
        price_data: { currency: 'jpy', unit_amount: 1000, product_data: { name: 'Menu' } },
        quantity: 1,
      },
    ],
    success_url: 'https://example.test/success',
    cancel_url: 'https://example.test/cancel',
    metadata: { customerUid: 'customer-a' },
  })
  expect(result.success).toBe(true)
  const args = create.mock.calls[0][0] as Stripe.Checkout.SessionCreateParams
  expect(args.payment_intent_data?.metadata).toEqual(args.metadata)
  expect(args.metadata).toMatchObject({
    customerUid: 'customer-a',
    reservation_id: reservation._id,
    tenant_id: reservation.tenant_id,
    org_id: reservation.org_id,
  })
})
