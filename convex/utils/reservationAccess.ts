import type { MutationCtx } from '@/convex/_generated/server'
import type { Id } from '@/convex/_generated/dataModel'
import { reservationMutationResource } from '@/lib/auth/reservation-capability'
import { verifyServerCapability } from '@/lib/auth/server-capability'
import {
  denyNotificationAccess,
  requireActiveOrganization,
  requireOrganizationAccess,
} from './notificationAccess'

export async function requireReservationMutation(
  ctx: MutationCtx,
  reservationId: Id<'reservation'>,
  operation: string,
  payload: object,
  serverToken?: string
) {
  const reservation = await ctx.db.get(reservationId)
  if (!reservation || reservation.is_archive) denyNotificationAccess()
  if (serverToken !== undefined) {
    const resource = reservationMutationResource(payload)
    const cancellation = payload as {
      cancelledBy?: string
      skipValidation?: boolean
      checkCancelable?: boolean
    }
    const validCustomerCancellation =
      operation === 'manage:cancel' &&
      cancellation.cancelledBy === 'customer' &&
      cancellation.skipValidation === false &&
      cancellation.checkCancelable === true &&
      verifyServerCapability(serverToken, 'reservation:customer-cancel', resource)
    if (
      !validCustomerCancellation &&
      !verifyServerCapability(serverToken, `reservation:${operation}`, resource)
    ) {
      denyNotificationAccess()
    }
    await requireActiveOrganization(ctx, reservation.tenant_id, reservation.org_id)
  } else {
    await requireOrganizationAccess(ctx, reservation.tenant_id, reservation.org_id)
  }
  return reservation
}

export async function requireReservationCreation(
  ctx: MutationCtx,
  payload: { tenant_id: Id<'tenant'>; org_id: Id<'organization'>; staff_id?: Id<'staff'> },
  serverToken?: string
) {
  if (serverToken !== undefined) {
    if (
      !verifyServerCapability(
        serverToken,
        'reservation:customer-create',
        reservationMutationResource(payload)
      )
    )
      denyNotificationAccess()
    await requireActiveOrganization(ctx, payload.tenant_id, payload.org_id)
  } else {
    await requireOrganizationAccess(ctx, payload.tenant_id, payload.org_id)
  }
  if (payload.staff_id) {
    const staff = await ctx.db.get(payload.staff_id)
    if (
      !staff ||
      staff.is_archive ||
      !staff.is_active ||
      staff.tenant_id !== payload.tenant_id ||
      staff.org_id !== payload.org_id
    )
      denyNotificationAccess()
  }
}
