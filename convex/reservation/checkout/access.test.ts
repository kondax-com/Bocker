import { convexTest } from 'convex-test'
import { beforeEach, describe, expect, it } from 'vitest'
import schema from '@/convex/schema'
import { api } from '@/convex/_generated/api'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'

const modules = {
  ...import.meta.glob('../../**/*.*s'),
  '../../reservation/checkout/mutation.ts': () => import('./mutation'),
}
beforeEach(() => {
  process.env.INTERNAL_NOTIFICATION_SECRET = 'checkout-storage-test-secret'
})

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const tenant = await ctx.db.insert('tenant', {
      user_id: 'owner',
      user_email: 'owner@example.test',
      is_archive: false,
    })
    const org = await ctx.db.insert('organization', {
      tenant_id: tenant,
      org_name: 'Salon',
      is_active: true,
      is_archive: false,
      stripe_account_id: 'acct_stored',
    })
    const reservation = await ctx.db.insert('reservation', {
      tenant_id: tenant,
      org_id: org,
      customer_uid: 'customer-a',
      customer_name: 'Customer',
      status: 'pending',
      payment_status: 'pending',
      date: '2026-10-15',
      start_time_unix: 1792026000000,
      end_time_unix: 1792029600000,
      is_archive: false,
    })
    return { tenant, org, reservation }
  })
  const payload = {
    reservation_id: ids.reservation,
    tenant_id: ids.tenant,
    org_id: ids.org,
    customer_uid: 'customer-a',
    stripe_checkout_session_id: 'cs_server_created',
  }
  return { t, ...ids, payload }
}

describe('checkout session storage capability', () => {
  it('rejects an unsigned direct session overwrite', async () => {
    const f = await fixture()
    await expect(
      f.t.mutation(api.reservation.checkout.mutation.attachSession, {
        ...f.payload,
        server_token: '',
      })
    ).rejects.toThrow()
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.reservation)))?.stripe_checkout_session_id
    ).toBeUndefined()
  })

  it('stores the session only with a capability covering the entire payload', async () => {
    const f = await fixture()
    await f.t.mutation(
      api.reservation.checkout.mutation.attachSession,
      withReservationMutationCapability('checkout:attach-session', f.payload)
    )
    expect((await f.t.run((ctx) => ctx.db.get(f.reservation)))?.stripe_checkout_session_id).toBe(
      'cs_server_created'
    )
  })

  it('rejects changing the session ID after signing', async () => {
    const f = await fixture()
    const signed = withReservationMutationCapability('checkout:attach-session', f.payload)
    await expect(
      f.t.mutation(api.reservation.checkout.mutation.attachSession, {
        ...signed,
        stripe_checkout_session_id: 'cs_attacker',
      })
    ).rejects.toThrow()
  })

  it('rejects a customer UID that differs from the reservation even with a valid server signature', async () => {
    const f = await fixture()
    await expect(
      f.t.mutation(
        api.reservation.checkout.mutation.attachSession,
        withReservationMutationCapability('checkout:attach-session', {
          ...f.payload,
          customer_uid: 'other-customer',
        })
      )
    ).rejects.toThrow()
  })

  it('rejects attaching a session after payment or cancellation', async () => {
    const f = await fixture()
    await f.t.run((ctx) => ctx.db.patch(f.reservation, { status: 'cancelled' }))
    await expect(
      f.t.mutation(
        api.reservation.checkout.mutation.attachSession,
        withReservationMutationCapability('checkout:attach-session', f.payload)
      )
    ).rejects.toThrow()
  })
})
