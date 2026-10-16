import { convexTest } from 'convex-test'
import { format } from 'date-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import schema from '@/convex/schema'
import { internal } from '@/convex/_generated/api'
import { cancelNotification } from '@/convex/reservation/reservation.helpers'
import { reservationResource, verifyServerCapability } from '@/lib/auth/server-capability'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), customer: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/services/supabase/SupabaseService', () => ({ SupabaseService: class {} }))
vi.mock('@/services/supabase/repositories/customer', () => ({
  CustomerRepository: class {
    getCompleteCustomerData = mocks.customer
  },
}))
vi.mock('@/services/supabase/repositories/point', () => ({
  PointTaskQueueRepository: class {},
  PointTransactionRepository: class {},
}))
vi.mock('@/services/supabase/repositories/coupon', () => ({
  CouponTransactionRepository: class {},
}))
vi.mock('@/services/supabase/repositories/carte', () => ({
  CarteRepository: class {},
  CarteDetailRepository: class {},
}))
vi.mock('@/lib/env-config', () => ({
  getEnv: () => 'test-setting',
  getAppUrl: () => 'https://application.example',
}))

const modules = {
  ...import.meta.glob('../../convex/**/*.*s'),
}
const NOW = new Date('2030-01-01T09:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', 'scheduler-test-secret')
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockReset()
  mocks.customer.mockReset()
  mocks.fetch.mockRejectedValue(new Error('Unexpected HTTP request'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function fixture(customerUids = ['line-customer']) {
  const t = convexTest(schema, modules)
  const reservations = await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'owner',
      user_email: 'owner@example.test',
      is_archive: false,
    })
    const orgId = await ctx.db.insert('organization', {
      tenant_id: tenantId,
      org_name: 'Stored Salon',
      is_active: true,
      is_archive: false,
    })
    const startTime = NOW + 3.5 * 60 * 60 * 1000
    const result = []
    for (const customerUid of customerUids) {
      const id = await ctx.db.insert('reservation', {
        tenant_id: tenantId,
        org_id: orgId,
        customer_uid: customerUid,
        customer_name: 'Private Customer',
        status: 'confirmed',
        payment_status: 'pending',
        date: format(new Date(startTime), 'yyyy-MM-dd'),
        start_time_unix: startTime,
        end_time_unix: startTime + 60 * 60 * 1000,
        reminder_sent: false,
        is_archive: false,
      })
      await ctx.db.insert('reservation_detail', {
        tenant_id: tenantId,
        org_id: orgId,
        reservation_id: id,
        payment_method: 'cash',
        menus: [],
        options: [],
        total_price: 3000,
        featured_hair_images: [],
        is_archive: false,
      })
      result.push(id)
    }
    return result
  })
  return { t, reservations }
}

describe('予約通知のスケジュールと送信結果', () => {
  it('キャンセル確定後に内部Actionを実行し、顧客送信失敗でもサロンへ送る', async () => {
    const {
      t,
      reservations: [reservationId],
    } = await fixture()
    mocks.fetch.mockImplementation(
      async (url: string) =>
        new Response(JSON.stringify({ success: !url.includes('customer-cancellation') }), {
          status: url.includes('customer-cancellation') ? 500 : 200,
        })
    )

    await t.run(async (ctx) => {
      const reservation = await ctx.db.get(reservationId)
      if (!reservation) throw new Error('Missing fixture')
      await ctx.db.patch(reservationId, { status: 'cancelled', cancel_reason: 'Stored reason' })
      await cancelNotification(ctx, { reservation })
      expect(mocks.fetch).not.toHaveBeenCalled()
    })
    expect((await t.run((ctx) => ctx.db.get(reservationId)))?.status).toBe('cancelled')
    expect(mocks.fetch).not.toHaveBeenCalled()

    await t.finishAllScheduledFunctions(() => vi.runAllTimers())

    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://application.example/api/line/customer-cancellation-notification',
      'https://application.example/api/line/salon-cancellation-notification',
    ])
    for (const [, init] of mocks.fetch.mock.calls) {
      expect(JSON.parse(init.body)).toEqual({ reservationId })
      expect(
        verifyServerCapability(
          init.headers['x-notification-authorization'],
          'notification:cancellation',
          reservationResource(reservationId)
        )
      ).toBe(true)
    }
    expect(mocks.customer).not.toHaveBeenCalled()
  })

  it('サロン送信の失敗も顧客送信を失敗扱いにしない', async () => {
    const {
      t,
      reservations: [reservationId],
    } = await fixture()
    mocks.fetch.mockImplementation(
      async (url: string) =>
        new Response(JSON.stringify({ success: !url.includes('salon-cancellation') }), {
          status: url.includes('salon-cancellation') ? 500 : 200,
        })
    )
    const result = await t.action(internal.reservation.action.sendCancellationNotifications, {
      reservation_id: reservationId,
    })
    expect(result).toEqual({ customer: true, salon: false })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('リマインダーの成功応答だけを送信済みにし、失敗予約のフラグを維持する', async () => {
    const { t, reservations } = await fixture([
      'line-success',
      'email-negative',
      'line-http-error',
      'email-network-error',
    ])
    const [successId, negativeId, httpErrorId, networkErrorId] = reservations
    mocks.customer.mockImplementation(async (uid: string) => ({
      customer: uid.startsWith('line')
        ? { line_id: 'private-line-recipient', email: 'private@example.test' }
        : { line_id: null, email: 'private@example.test' },
    }))
    mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const { reservationId } = JSON.parse(init.body as string)
      if (reservationId === networkErrorId) throw new Error('Simulated network failure')
      return new Response(JSON.stringify({ success: reservationId !== negativeId }), {
        status: reservationId === httpErrorId ? 500 : 200,
      })
    })

    const result = await t.action(internal.reservation.action.sendHourlyReminders, {})

    expect(result).toMatchObject({ processed: 4, sent: 1 })
    expect(result.errors.map((error) => error.reservationId).sort()).toEqual(
      [negativeId, httpErrorId, networkErrorId].sort()
    )
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://application.example/api/line/reminder',
      'https://application.example/api/resend/reminder',
      'https://application.example/api/line/reminder',
      'https://application.example/api/resend/reminder',
    ])
    const rows = await t.run(async (ctx) => Promise.all(reservations.map((id) => ctx.db.get(id))))
    expect(rows[0]).toMatchObject({ _id: successId, reminder_sent: true, reminder_sent_at: NOW })
    for (const row of rows.slice(1)) {
      expect(row?.reminder_sent).toBe(false)
      expect(row?.reminder_sent_at).toBeUndefined()
    }
  })
})
