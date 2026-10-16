import { reservationMutationResource } from '@/lib/auth/reservation-capability'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import type { UserJSON } from '@clerk/nextjs/server'
import type { WebhookDependencies } from '@/services/webhook/types'
import type { WebhookMetricsCollector } from '@/services/webhook/metrics'
import {
  handleCheckoutSessionCompleted,
  handleCheckoutSessionExpired,
  handlePaymentIntentFailed,
} from '@/services/webhook/stripe/handlers.checkout'
import { handleUserCreated } from '@/services/webhook/clerk/handlers'
import { clearTokens, refreshLineToken } from '@/lib/auth/token-manager'
import { organizationResource, verifyServerCapability } from '@/lib/auth/server-capability'
import { NextRequest } from 'next/server'
import { POST as startLineAuth } from '@/app/api/auth/line/start/route'
import { GET as completeLineAuth } from '@/app/api/auth/line/callback/route'
import { createSalonReservationNotification } from '@/services/line/message_template/salon_reservation_notification'

const mocks = vi.hoisted(() => ({
  fetchQuery: vi.fn(),
  fetchMutation: vi.fn(),
  getCustomer: vi.fn(),
  sendEmail: vi.fn(),
  sendLine: vi.fn(),
  clerkUpdate: vi.fn(),
  cookies: new Map<string, string>(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  verifyIdToken: vi.fn(),
  retrieveCheckout: vi.fn(),
}))

vi.mock('convex/nextjs', () => ({
  fetchQuery: mocks.fetchQuery,
  fetchMutation: mocks.fetchMutation,
}))
vi.mock('@/convex/_generated/api', () => ({
  api: {
    reservation: {
      query: { getWithDetailById: 'reservation-detail', getById: 'reservation-read' },
      payment: { confirmPayment: 'confirm-payment' },
      mutation: { cancelReservation: 'cancel-reservation' },
    },
    organization: {
      query: {},
      mutation: { create: 'organization-create' },
      config: {
        query: { findByTenantAndOrg: 'organization-config' },
        mutation: { create: 'config-create' },
      },
      api_config: {
        query: { getForServer: 'private-api-config' },
        mutation: { create: 'api-config-create' },
      },
      reservation_config: { mutation: { create: 'reservation-config-create' } },
    },
    tenant: {
      query: { findByUserId: 'tenant-find' },
      mutation: { create: 'tenant-create' },
      referral: { mutation: { create: 'referral-create' } },
    },
    staff: { invitation: { mutation: { acceptInvitation: 'staff-accept' } } },
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { updateUserMetadata: mocks.clerkUpdate } })),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@/services/supabase/SupabaseService', () => ({
  SupabaseService: class {},
}))
vi.mock('@/services/supabase/repositories/customer', () => ({
  CustomerRepository: class {
    getCompleteCustomerData = mocks.getCustomer
  },
}))
vi.mock('@/services/supabase/repositories/point', () => ({ PointTransactionRepository: vi.fn() }))
vi.mock('@/services/supabase/repositories/coupon', () => ({ CouponTransactionRepository: vi.fn() }))
vi.mock('@/lib/email_templates/reservation_email', () => ({
  sendReservationConfirmationEmail: mocks.sendEmail,
}))
vi.mock('@/services/line/sendLineFlexMessageOrThrow', () => ({
  sendLineFlexMessageOrThrow: mocks.sendLine,
}))
vi.mock('@/services/line/message_template/salon_reservation_notification', () => ({
  createSalonReservationNotification: vi.fn(() => ({ type: 'flex', altText: 'サロン通知' })),
}))
vi.mock('@/lib/env-config', () => ({
  getAppUrl: () => 'https://example.test',
  getEnv: () => 'test-setting',
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  })),
}))
vi.mock('@/lib/crypto-server', () => ({
  seal: (value: string) => `sealed:${value}`,
  open: (value: string) => value.replace(/^sealed:/, ''),
  constantTimeEqual: (left: string, right: string) => left === right,
}))
vi.mock('@/lib/verify-line-idtoken', () => ({ verifyLineIdToken: mocks.verifyIdToken }))
vi.mock('@/lib/line-oauth', () => ({
  createPreAuth: ({
    tenantId,
    orgId,
    next,
  }: {
    tenantId: string
    orgId: string
    next?: string
  }) => ({
    stateId: 'state-a',
    preAuth: { tenantId, orgId, next, cv: 'pkce-verifier', nonce: 'nonce-a', ts: Date.now() },
  }),
  ccFromVerifier: () => 'pkce-challenge',
  OAUTH_COOKIE_PREFIX: 'line_oauth_',
  OAUTH_TTL_MS: 600_000,
  OAUTH_DEBUG_MODE: true,
  getOptimalCookieConfig: () => ({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 }),
  getOAuthConfigSummary: () => ({}),
  extractState: (searchParams: URLSearchParams) => searchParams.get('state'),
  validatePreAuthEnhanced: () => ({ isValid: true, age: 100, timeRemaining: 599900 }),
  safeNext: (next?: string) => next || '/ja/reservation',
  debugLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const reservation = {
  _id: 'reservation-a',
  tenant_id: 'tenant-a',
  org_id: 'organization-a',
  customer_uid: 'customer-a',
  customer_name: '予約顧客',
  staff_name: '担当者',
  date: '2026-10-15',
  start_time_unix: 1792026000000,
  end_time_unix: 1792029600000,
  status: 'pending',
  payment_status: 'pending',
  stripe_checkout_session_id: 'cs_matching',
}
const apiConfig = {
  line_access_token: 'private-tenant-channel-token',
  line_channel_id: 'private-channel-id',
  line_channel_secret: 'private-channel-secret',
  org_line_id: 'salon-line-a',
}

function checkoutEvent(
  metadata = { reservationId: 'reservation-a', tenantId: 'tenant-a', orgId: 'organization-a' }
) {
  return {
    data: { object: { id: 'cs_matching', metadata, payment_intent: 'pi_a' } },
  } as unknown as Stripe.CheckoutSessionCompletedEvent
}

async function runCheckout(event = checkoutEvent()) {
  const { api } = await import('@/convex/_generated/api')
  const deps = {
    convex: api,
    stripe: { checkout: { sessions: { retrieve: mocks.retrieveCheckout } } },
    retry: (operation: () => Promise<unknown>) => operation(),
  } as unknown as WebhookDependencies
  return handleCheckoutSessionCompleted(event, 'evt_checkout', deps, {
    incrementApiCall: vi.fn(),
  } as unknown as WebhookMetricsCollector)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.cookies.clear()
  mocks.fetchQuery.mockImplementation(async (reference) => {
    if (reference === 'reservation-read') return { ...reservation }
    if (reference === 'reservation-detail')
      return {
        reservation: { ...reservation },
        reservationDetail: { total_price: 3000, menus: [], options: [], use_points: 0 },
      }
    if (reference === 'private-api-config') return { ...apiConfig }
    if (reference === 'organization-config') return { org: { org_name: 'サロンA' }, config: {} }
    return null
  })
  mocks.fetchMutation.mockImplementation(async (reference) => {
    if (reference === 'tenant-create') return 'tenant-a'
    if (reference === 'organization-create') return 'organization-a'
    return true
  })
  mocks.getCustomer.mockResolvedValue({
    customer: { line_id: 'customer-line-a', email: 'customer@example.test' },
  })
  mocks.sendLine.mockResolvedValue(undefined)
  mocks.sendEmail.mockResolvedValue(undefined)
  mocks.retrieveCheckout.mockResolvedValue({
    id: 'cs_matching',
    metadata: { reservationId: 'reservation-a', tenantId: 'tenant-a', orgId: 'organization-a' },
    payment_intent: 'pi_a',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Stripe Checkout tenant isolation', () => {
  it.each([
    ['tenant', { tenantId: 'tenant-b' }],
    ['organization', { orgId: 'organization-b' }],
  ])('rejects mismatched %s metadata before confirming or sending', async (_label, mismatch) => {
    const result = await runCheckout(
      checkoutEvent({
        reservationId: 'reservation-a',
        tenantId: 'tenant-a',
        orgId: 'organization-a',
        ...mismatch,
      })
    )

    expect(result.result).toBe('error')
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
    expect(mocks.getCustomer).not.toHaveBeenCalled()
    expect(mocks.fetchQuery).not.toHaveBeenCalledWith('private-api-config', expect.anything())
    expect(mocks.sendLine).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a checkout session belonging to another reservation', async () => {
    const event = checkoutEvent()
    event.data.object.id = 'cs_other'
    expect((await runCheckout(event)).result).toBe('error')
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
    expect(mocks.sendLine).not.toHaveBeenCalled()
  })

  it('requires a saved session binding before accepting a completion', async () => {
    mocks.fetchQuery.mockImplementation(async (reference) =>
      reference === 'reservation-detail'
        ? {
            reservation: { ...reservation, stripe_checkout_session_id: undefined },
            reservationDetail: { menus: [], options: [] },
          }
        : null
    )
    expect((await runCheckout()).result).toBe('error')
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
    expect(mocks.sendLine).not.toHaveBeenCalled()
  })

  it('rejects a customer metadata mismatch even within the same tenant and saved session', async () => {
    const event = checkoutEvent()
    event.data.object.metadata!.customerUid = 'other-customer'
    expect((await runCheckout(event)).result).toBe('error')
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
  })

  it('uses reservation tenant credentials and still notifies the salon when customer LINE fails', async () => {
    mocks.sendLine.mockRejectedValueOnce(new Error('Customer delivery failed'))

    const result = await runCheckout()
    expect(result.result, result.errorMessage).toBe('success')
    expect(mocks.fetchQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetchMutation.mock.invocationCallOrder[0]
    )
    expect(mocks.fetchMutation).toHaveBeenCalledWith('confirm-payment', {
      reservation_id: reservation._id,
      stripe_payment_intent_id: 'pi_a',
      server_token: expect.any(String),
    })
    const [, paymentArgs] = mocks.fetchMutation.mock.calls.find(
      ([reference]) => reference === 'confirm-payment'
    )!
    expect(
      verifyServerCapability(
        paymentArgs.server_token,
        'reservation:payment-confirm',
        reservationMutationResource(paymentArgs)
      )
    ).toBe(true)
    expect(mocks.getCustomer).toHaveBeenCalledWith('customer-a', 'tenant-a', 'organization-a')
    const [, configArgs] = mocks.fetchQuery.mock.calls.find(
      ([reference]) => reference === 'private-api-config'
    )!
    expect(configArgs).toMatchObject({ tenant_id: 'tenant-a', org_id: 'organization-a' })
    expect(
      verifyServerCapability(
        configArgs.server_token,
        'api-config:read',
        organizationResource('tenant-a', 'organization-a')
      )
    ).toBe(true)
    expect(mocks.sendLine).toHaveBeenCalledTimes(2)
    expect(mocks.sendLine).toHaveBeenCalledWith(
      expect.objectContaining({
        lineId: 'customer-line-a',
        accessToken: apiConfig.line_access_token,
      })
    )
    expect(mocks.sendLine).toHaveBeenCalledWith(
      expect.objectContaining({
        lineId: 'salon-line-a',
        accessToken: apiConfig.line_access_token,
      })
    )
    expect(createSalonReservationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        reservation: expect.objectContaining({ status: 'confirmed', payment_status: 'completed' }),
      })
    )
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('preserves customer email delivery when no LINE account is registered', async () => {
    mocks.getCustomer.mockResolvedValue({
      customer: { email: 'customer@example.test', line_id: null },
    })
    const result = await runCheckout()
    expect(result.result, result.errorMessage).toBe('success')
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.test',
        orgName: 'サロンA',
        reservationId: 'reservation-a',
      })
    )
    expect(mocks.sendLine).toHaveBeenCalledTimes(1)
    expect(mocks.sendLine).toHaveBeenCalledWith(expect.objectContaining({ lineId: 'salon-line-a' }))
  })
})

describe('Stripe cancellation lifecycle session binding', () => {
  async function runCancellation(
    kind: 'failed' | 'expired',
    overrides: Record<string, unknown> = {}
  ) {
    const { api } = await import('@/convex/_generated/api')
    const object = {
      id: kind === 'failed' ? 'pi_a' : 'cs_matching',
      expires_at: 1_800_000_000,
      metadata: { reservationId: 'reservation-a', tenantId: 'tenant-a', orgId: 'organization-a' },
      ...overrides,
    }
    const deps = {
      convex: api,
      stripe: { checkout: { sessions: { retrieve: mocks.retrieveCheckout } } },
      retry: (operation: () => Promise<unknown>) => operation(),
    } as unknown as WebhookDependencies
    const metrics = { incrementApiCall: vi.fn() } as unknown as WebhookMetricsCollector
    return kind === 'failed'
      ? handlePaymentIntentFailed(
          { data: { object } } as unknown as Stripe.PaymentIntentPaymentFailedEvent,
          'evt_failed',
          deps,
          metrics
        )
      : handleCheckoutSessionExpired(
          { data: { object } } as unknown as Stripe.CheckoutSessionExpiredEvent,
          'evt_expired',
          deps,
          metrics
        )
  }

  it.each(['failed', 'expired'] as const)(
    '%s rejects cross-tenant and same-tenant other-customer metadata',
    async (kind) => {
      for (const mismatch of [
        { tenantId: 'other' },
        { orgId: 'other' },
        { customerUid: 'other-customer' },
      ]) {
        mocks.fetchMutation.mockClear()
        const result = await runCancellation(kind, {
          metadata: {
            reservationId: 'reservation-a',
            tenantId: 'tenant-a',
            orgId: 'organization-a',
            ...mismatch,
          },
        })
        expect(result.result).toBe('error')
        expect(mocks.fetchMutation).not.toHaveBeenCalled()
      }
    }
  )

  it.each(['failed', 'expired'] as const)(
    '%s refuses cancellation when no session was ever attached',
    async (kind) => {
      mocks.fetchQuery.mockResolvedValue({ ...reservation, stripe_checkout_session_id: undefined })
      expect((await runCancellation(kind)).result).toBe('error')
      expect(mocks.fetchMutation).not.toHaveBeenCalled()
    }
  )

  it('expired ignores a different session while failed requires the saved session payment intent', async () => {
    expect((await runCancellation('expired', { id: 'cs_other' })).result).toBe('error')
    mocks.retrieveCheckout.mockResolvedValue({
      id: 'cs_matching',
      payment_intent: 'pi_other',
      metadata: {
        reservationId: 'reservation-a',
        tenantId: 'tenant-a',
        orgId: 'organization-a',
      },
    })
    expect((await runCancellation('failed')).result).toBe('error')
    expect(mocks.retrieveCheckout).toHaveBeenCalledWith('cs_matching')
    expect(mocks.fetchMutation).not.toHaveBeenCalled()
  })

  it.each(['failed', 'expired'] as const)(
    '%s preserves legacy UID-less events when the saved session matches',
    async (kind) => {
      const result = await runCancellation(kind)
      expect(result.result, result.errorMessage).toBe('success')
      const [, args] = mocks.fetchMutation.mock.calls.find(
        ([reference]) => reference === 'cancel-reservation'
      )!
      expect(
        verifyServerCapability(
          args.server_token,
          'reservation:cancel',
          reservationMutationResource(args)
        )
      ).toBe(true)
    }
  )

  it.each(['failed', 'expired'] as const)(
    '%s never cancels a payment which is already completed',
    async (kind) => {
      mocks.fetchQuery.mockResolvedValue({
        ...reservation,
        status: 'confirmed',
        payment_status: 'completed',
      })
      expect((await runCancellation(kind)).result).toBe('skipped')
      expect(mocks.fetchMutation).not.toHaveBeenCalled()
    }
  )
})

describe('Clerk provisioning server capabilities', () => {
  async function runUserCreated(publicMetadata: Record<string, unknown> = {}) {
    const { api } = await import('@/convex/_generated/api')
    return handleUserCreated(
      {
        id: 'clerk-user-a',
        email_addresses: [{ email_address: 'owner@example.test' }],
        unsafe_metadata: {},
        public_metadata: publicMetadata,
      } as UserJSON,
      'evt_user',
      {
        convex: api,
        stripe: { customers: { create: vi.fn(async () => ({ id: 'cus_a' })), update: vi.fn() } },
        retry: (operation: () => Promise<unknown>) => operation(),
      } as unknown as WebhookDependencies,
      {
        incrementApiCall: vi.fn(),
      } as unknown as WebhookMetricsCollector
    )
  }

  it('creates initial organization API settings using a scoped server capability', async () => {
    expect((await runUserCreated()).result).toBe('success')
    const [, args] = mocks.fetchMutation.mock.calls.find(
      ([reference]) => reference === 'api-config-create'
    )!
    expect(args).toMatchObject({ tenant_id: 'tenant-a', org_id: 'organization-a' })
    expect(
      verifyServerCapability(
        args.server_token,
        'api-config:write',
        organizationResource('tenant-a', 'organization-a')
      )
    ).toBe(true)
  })

  it('binds an accepted staff invitation to the staff and Clerk user', async () => {
    expect(
      (
        await runUserCreated({
          staff_id: 'staff-a',
          tenant_id: 'tenant-a',
          org_id: 'organization-a',
          role: 'staff',
        })
      ).result
    ).toBe('success')
    const [, args] = mocks.fetchMutation.mock.calls.find(
      ([reference]) => reference === 'staff-accept'
    )!
    expect(args).toMatchObject({
      staff_id: 'staff-a',
      clerk_user_id: 'clerk-user-a',
      role: 'staff',
    })
    expect(
      verifyServerCapability(
        args.server_token,
        'staff:accept-invitation',
        JSON.stringify(['staff-invitation', 'staff-a', 'clerk-user-a'])
      )
    ).toBe(true)
  })
})

describe('LINE token lifecycle private configuration', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    mocks.cookies.set('line_ctx_tid', 'tenant-a')
    mocks.cookies.set('line_ctx_oid', 'organization-a')
    mocks.cookies.set('line_at_enc', 'sealed:old-access-token')
    mocks.cookies.set('line_rt_enc', 'sealed:old-refresh-token')
    mocks.cookies.set('line_at_exp', String(Date.now() + 60_000))
    mocks.cookies.set('line_at_iat', String(Date.now()))
  })

  it('refreshes with tenant credentials without returning those credentials', async () => {
    const request = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'new-access-token', expires_in: 3600 }),
    }))
    vi.stubGlobal('fetch', request)
    const result = await refreshLineToken()

    expect(result?.accessToken).toBe('new-access-token')
    const [, options] = request.mock.calls[0] as unknown as [string, RequestInit]
    expect((options.body as URLSearchParams).get('client_secret')).toBe(
      apiConfig.line_channel_secret
    )
    expect(mocks.fetchQuery).toHaveBeenCalledWith(
      'private-api-config',
      expect.objectContaining({
        tenant_id: 'tenant-a',
        org_id: 'organization-a',
        server_token: expect.any(String),
      })
    )
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      apiConfig.line_channel_secret
    )
  })

  it('revokes with tenant credentials and clears stored tokens', async () => {
    const request = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', request)
    await clearTokens()

    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.line.me/oauth2/v2.1/revoke')
    expect((options.body as URLSearchParams).get('client_secret')).toBe(
      apiConfig.line_channel_secret
    )
    expect(mocks.cookieDelete).toHaveBeenCalledWith('line_at_enc')
    expect(mocks.cookieDelete).toHaveBeenCalledWith('line_rt_enc')
  })
})

describe('Public LINE OAuth server configuration', () => {
  it('starts anonymous OAuth with organization credentials without returning secrets', async () => {
    const response = await startLineAuth(
      new NextRequest('http://localhost:3000/api/auth/line/start', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-a',
          orgId: 'organization-a',
          redirectUri: 'http://localhost:3000/callback',
        }),
      })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(new URL(body.authorizationUrl).searchParams.get('client_id')).toBe(
      apiConfig.line_channel_id
    )
    expect(mocks.fetchQuery).toHaveBeenCalledWith(
      'private-api-config',
      expect.objectContaining({
        tenant_id: 'tenant-a',
        org_id: 'organization-a',
        server_token: expect.any(String),
      })
    )
    expect(JSON.stringify(body)).not.toContain(apiConfig.line_channel_secret)
    expect(JSON.stringify(body)).not.toContain(apiConfig.line_access_token)
  })

  it('completes anonymous OAuth using the validated pre-auth organization', async () => {
    vi.stubGlobal('window', undefined)
    mocks.cookies.set(
      'line_oauth_state-a',
      `sealed:${JSON.stringify({
        tenantId: 'tenant-a',
        orgId: 'organization-a',
        cv: 'pkce-verifier',
        nonce: 'nonce-a',
        ts: Date.now(),
      })}`
    )
    mocks.verifyIdToken.mockResolvedValue({ sub: 'line-user-a' })
    const request = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'new-user-token',
        id_token: 'signed-user-id-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      }),
    }))
    vi.stubGlobal('fetch', request)
    const response = await completeLineAuth(
      new NextRequest(
        'http://localhost:3000/api/auth/line/callback?code=private-auth-code&state=state-a'
      )
    )

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).searchParams.get('auth_success')).toBe('true')
    expect(mocks.verifyIdToken).toHaveBeenCalledWith(
      'signed-user-id-token',
      expect.objectContaining({
        channelId: apiConfig.line_channel_id,
        channelSecret: apiConfig.line_channel_secret,
        expectedNonce: 'nonce-a',
      })
    )
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      'line_at_enc',
      'sealed:new-user-token',
      expect.anything()
    )
    expect(response.headers.get('location')).not.toContain('private-auth-code')
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-auth-code')
  })
})
