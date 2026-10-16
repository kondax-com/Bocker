import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'

const notifications = vi.hoisted(() => ({ cancel: vi.fn(), create: vi.fn() }))
vi.mock('@/convex/reservation/reservation.helpers', () => ({
  cancelNotification: notifications.cancel,
  cancelableDeadline: (days: number, start: number) => start - days * 86_400_000,
  checkReservationDoubleBooking: vi.fn(async () => false),
  createReservationWithDetails: notifications.create,
}))

const modules = {
  ...import.meta.glob('../**/*.*s'),
  '../reservation/manage.ts': () => import('./manage'),
  '../reservation/mutation.ts': () => import('./mutation'),
  '../reservation/payment.ts': () => import('./payment'),
}

beforeEach(() => {
  vi.useFakeTimers()
  notifications.cancel.mockClear()
  process.env.INTERNAL_NOTIFICATION_SECRET = 'reservation-mutation-test-secret'
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'owner',
      user_email: 'owner@example.test',
      is_archive: false,
    })
    const orgId = await ctx.db.insert('organization', {
      tenant_id: tenantId,
      org_name: 'Salon',
      is_active: true,
      is_archive: false,
    })
    const reservationId = await ctx.db.insert('reservation', {
      tenant_id: tenantId,
      org_id: orgId,
      customer_uid: 'customer-a',
      customer_name: 'Customer',
      status: 'confirmed',
      payment_status: 'pending',
      date: '2030-10-15',
      start_time_unix: Date.now() + 10 * 86_400_000,
      end_time_unix: Date.now() + 10 * 86_400_000 + 3600000,
      is_archive: false,
    })
    await ctx.db.insert('reservation_detail', {
      tenant_id: tenantId,
      org_id: orgId,
      reservation_id: reservationId,
      payment_method: 'cash',
      menus: [],
      options: [],
      featured_hair_images: [],
      is_archive: false,
    })
    return { tenantId, orgId, reservationId }
  })
  notifications.create.mockResolvedValue({ reservationId: ids.reservationId })
  return { t, ...ids }
}

test('anonymous cancel cannot bypass checks, change a victim reservation, or trigger notifications', async () => {
  const f = await fixture()
  await expect(
    f.t.mutation(api.reservation.manage.handleReservationManage, {
      mode: 'cancel',
      payload: {
        reservationId: f.reservationId,
        cancelledBy: 'system',
        skipValidation: true,
        checkCancelable: false,
        cancelReason: 'attacker supplied',
      },
    })
  ).rejects.toThrow(/認証|アクセス権限/)
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.status).toBe('confirmed')
  expect(notifications.cancel).not.toHaveBeenCalled()
})

test('outsiders and anonymous users cannot change status or confirm payment', async () => {
  const f = await fixture()
  for (const user of [f.t, f.t.withIdentity({ subject: 'outsider' })]) {
    await expect(
      user.mutation(api.reservation.manage.handleReservationManage, {
        mode: 'status',
        payload: { reservationId: f.reservationId, status: 'pending' },
      })
    ).rejects.toThrow(/認証|アクセス権限/)
    await expect(
      user.mutation(api.reservation.manage.handleReservationManage, {
        mode: 'confirm',
        payload: { reservation_id: f.reservationId, stripe_payment_intent_id: 'forged' },
      })
    ).rejects.toThrow(/認証|アクセス権限/)
  }
})

test('owners retain authenticated status and cancellation operations', async () => {
  const f = await fixture()
  const owner = f.t.withIdentity({ subject: 'owner' })
  await owner.mutation(api.reservation.manage.handleReservationManage, {
    mode: 'status',
    payload: { reservationId: f.reservationId, status: 'pending' },
  })
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.status).toBe('pending')
  await owner.mutation(api.reservation.manage.handleReservationManage, {
    mode: 'cancel',
    payload: { reservationId: f.reservationId, cancelledBy: 'staff', checkCancelable: false },
  })
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.status).toBe('cancelled')
  expect(notifications.cancel).toHaveBeenCalledTimes(1)
})

test('customer cancellation signature cannot alter reservation, reason, role, or validation flags', async () => {
  const f = await fixture()
  const payload = {
    reservationId: f.reservationId,
    cancelledBy: 'customer' as const,
    skipValidation: false,
    checkCancelable: true,
    cancelReason: 'My reason',
  }
  const { server_token } = withReservationMutationCapability('customer-cancel', payload)
  for (const changed of [
    { cancelReason: 'Injected reason' },
    { cancelledBy: 'system' as const },
    { skipValidation: true },
    { checkCancelable: false },
  ]) {
    await expect(
      f.t.mutation(api.reservation.manage.handleReservationManage, {
        mode: 'cancel',
        payload: { ...payload, ...changed },
        server_token,
      })
    ).rejects.toThrow(/アクセス権限/)
  }
  await expect(
    f.t.mutation(api.reservation.manage.handleReservationManage, {
      mode: 'status',
      payload: { reservationId: f.reservationId, status: 'confirmed' },
      server_token,
    })
  ).rejects.toThrow(/アクセス権限/)
  await f.t.mutation(api.reservation.manage.handleReservationManage, {
    mode: 'cancel',
    payload,
    server_token,
  })
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.cancelled_by).toBe('customer')
})

test('signed customer cancellation still enforces cancellation deadline', async () => {
  const f = await fixture()
  await f.t.run((ctx) => ctx.db.patch(f.reservationId, { start_time_unix: Date.now() + 1000 }))
  const payload = {
    reservationId: f.reservationId,
    cancelledBy: 'customer' as const,
    skipValidation: false,
    checkCancelable: true,
  }
  const { server_token } = withReservationMutationCapability('customer-cancel', payload)
  await expect(
    f.t.mutation(api.reservation.manage.handleReservationManage, {
      mode: 'cancel',
      payload,
      server_token,
    })
  ).rejects.toThrow(/キャンセル期限/)
  expect(notifications.cancel).not.toHaveBeenCalled()
})

test('legacy cancellation, status, and payment APIs cannot bypass the same access boundary', async () => {
  const f = await fixture()
  for (const user of [f.t, f.t.withIdentity({ subject: 'outsider' })]) {
    await expect(
      user.mutation(api.reservation.mutation.cancelReservation, {
        reservationId: f.reservationId,
        cancelledBy: 'system',
        skipValidation: true,
      })
    ).rejects.toThrow(/認証|アクセス権限/)
    await expect(
      user.mutation(api.reservation.mutation.updateStatus, {
        reservation_id: f.reservationId,
        status: 'pending',
      })
    ).rejects.toThrow(/認証|アクセス権限/)
    for (const reference of [
      api.reservation.mutation.confirmPayment,
      api.reservation.payment.confirmPayment,
    ]) {
      await expect(user.mutation(reference, { reservation_id: f.reservationId })).rejects.toThrow(
        /認証|アクセス権限/
      )
    }
    await expect(
      user.mutation(api.reservation.payment.retryPayment, { reservation_id: f.reservationId })
    ).rejects.toThrow(/認証|アクセス権限/)
  }
})

test('verified payment and system cancellation callers retain their signed operations', async () => {
  const f = await fixture()
  const payment = withReservationMutationCapability('payment-confirm', {
    reservation_id: f.reservationId,
    stripe_payment_intent_id: 'pi_verified',
  })
  await expect(
    f.t.mutation(api.reservation.payment.confirmPayment, {
      ...payment,
      stripe_payment_intent_id: 'pi_forged',
    })
  ).rejects.toThrow(/アクセス権限/)
  await f.t.mutation(api.reservation.payment.confirmPayment, payment)
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.payment_status).toBe('completed')
  await f.t.mutation(
    api.reservation.mutation.cancelReservation,
    withReservationMutationCapability('cancel', {
      reservationId: f.reservationId,
      cancelledBy: 'system' as const,
      cancelReason: 'Trusted system',
      skipValidation: true,
    })
  )
  expect((await f.t.run((ctx) => ctx.db.get(f.reservationId)))?.status).toBe('cancelled')
})

test('new reservations need staff membership or an exact customer-create signature', async () => {
  const f = await fixture()
  const payload = {
    tenant_id: f.tenantId,
    org_id: f.orgId,
    customer_uid: 'customer-a',
    customer_name: 'Customer',
    status: 'confirmed' as const,
    date: '2030-10-15',
    start_time_unix: Date.now() + 86_400_000,
    end_time_unix: Date.now() + 90_000_000,
    total_price: 1000,
    payment_method: 'cash' as const,
    menus: [],
    options: [],
    featured_hair_images: [],
  }
  for (const user of [f.t, f.t.withIdentity({ subject: 'outsider' })]) {
    await expect(
      user.mutation(api.reservation.manage.handleReservationManage, { mode: 'create', payload })
    ).rejects.toThrow(/認証|アクセス権限/)
    await expect(
      user.mutation(api.reservation.mutation.create, { ...payload, payment_status: 'pending' })
    ).rejects.toThrow(/認証|アクセス権限/)
  }
  const { server_token } = withReservationMutationCapability('customer-create', payload)
  await expect(
    f.t.mutation(api.reservation.manage.handleReservationManage, {
      mode: 'create',
      payload: { ...payload, customer_uid: 'victim' },
      server_token,
    })
  ).rejects.toThrow(/アクセス権限/)
  await f.t.mutation(api.reservation.manage.handleReservationManage, {
    mode: 'create',
    payload,
    server_token,
  })
  await f.t
    .withIdentity({ subject: 'owner' })
    .mutation(api.reservation.manage.handleReservationManage, {
      mode: 'create',
      payload: { ...payload, customer_uid: undefined },
    })
})
