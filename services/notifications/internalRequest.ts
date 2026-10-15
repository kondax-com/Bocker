import { getAppUrl } from '@/lib/env-config'
import { createServerCapability, reservationResource } from '@/lib/auth/server-capability'

export async function sendInternalReservationNotification(
  endpoint: string,
  reservationId: string,
  type: 'reminder' | 'cancellation',
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(`${getAppUrl()}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-notification-authorization': createServerCapability(
        `notification:${type}`,
        reservationResource(reservationId)
      ),
    },
    body: JSON.stringify({ reservationId }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.success !== true) {
    throw new Error(`Reservation notification failed (${response.status})`)
  }
}
