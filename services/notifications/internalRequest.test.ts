import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendInternalReservationNotification } from './internalRequest'
import { reservationResource, verifyServerCapability } from '@/lib/auth/server-capability'

vi.mock('@/lib/env-config', () => ({ getAppUrl: () => 'https://application.example' }))
afterEach(() => vi.unstubAllEnvs())

describe('internal reservation notification requests', () => {
  it('sends only the reservation ID with authentication bound to that notification', async () => {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', 'test-private-key')
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    await sendInternalReservationNotification(
      '/api/line/reminder',
      'reservation-a',
      'reminder',
      fetcher
    )
    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('https://application.example/api/line/reminder')
    expect(JSON.parse(request.body)).toEqual({ reservationId: 'reservation-a' })
    const token = request.headers['x-notification-authorization']
    expect(
      verifyServerCapability(token, 'notification:reminder', reservationResource('reservation-a'))
    ).toBe(true)
    expect(
      verifyServerCapability(
        token,
        'notification:cancellation',
        reservationResource('reservation-a')
      )
    ).toBe(false)
    expect(
      verifyServerCapability(token, 'notification:reminder', reservationResource('reservation-b'))
    ).toBe(false)
  })

  it.each([200, 500])('does not mark a failed delivery as sent (HTTP %s)', async (status) => {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', 'test-private-key')
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: false }), { status }))
    await expect(
      sendInternalReservationNotification(
        '/api/resend/reminder',
        'reservation-a',
        'reminder',
        fetcher
      )
    ).rejects.toThrow('Reservation notification failed')
  })

  it('does not issue a request when no internal secret is configured', async () => {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')
    const fetcher = vi.fn()
    await expect(
      sendInternalReservationNotification(
        '/api/line/reminder',
        'reservation-a',
        'reminder',
        fetcher
      )
    ).rejects.toThrow('not configured')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
