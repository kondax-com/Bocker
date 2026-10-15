import type { Doc } from '@/convex/_generated/dataModel'
import { getCustomerSession } from '@/lib/auth/customer'
import { getOrganizationAuth } from '@/lib/auth/getOrganizationAuth'
import { reservationResource, verifyServerCapability } from '@/lib/auth/server-capability'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'

export type NotificationKind = 'confirmation' | 'cancellation' | 'reminder'

export class NotificationError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function authorizeReservationNotification(
  request: Request,
  reservation: Doc<'reservation'>,
  kind: NotificationKind
): Promise<void> {
  const capability = request.headers.get('x-notification-authorization')
  if (capability !== null) {
    if (
      !verifyServerCapability(
        capability,
        `notification:${kind}`,
        reservationResource(reservation._id)
      )
    ) {
      throw new NotificationError(401, '通知の認証に失敗しました')
    }
    return
  }

  if (kind === 'reminder') {
    throw new NotificationError(401, '通知の認証が必要です')
  }

  const customer = await getCustomerSession()
  if (
    customer?.tenantId === reservation.tenant_id &&
    customer.orgId === reservation.org_id &&
    customer.customerUid === reservation.customer_uid
  ) {
    return
  }

  try {
    const staff = await getOrganizationAuth()
    if (
      staff.tenantId === reservation.tenant_id &&
      staff.orgId === reservation.org_id &&
      staff.token
    ) {
      const access = await fetchQuery(
        api.reservation.notification.query.authorize,
        { tenant_id: reservation.tenant_id, org_id: reservation.org_id },
        { token: staff.token }
      )
      if (access.authorized) return
    }
  } catch {
    // Clerkの認証がない顧客リクエストも、この共通入口を使用する。
  }

  throw new NotificationError(403, 'この予約の通知を送信する権限がありません')
}
