import { mutation } from '@/convex/_generated/server'
import { v } from 'convex/values'
import { requireReservationMutation } from '@/convex/utils/reservationAccess'
import { assertSameOrganization, denyNotificationAccess } from '@/convex/utils/notificationAccess'

export const attachSession = mutation({
  args: {
    reservation_id: v.id('reservation'),
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    customer_uid: v.string(),
    stripe_checkout_session_id: v.string(),
    server_token: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const reservation = await requireReservationMutation(
      ctx,
      args.reservation_id,
      'checkout:attach-session',
      args,
      args.server_token
    )
    assertSameOrganization(reservation, args.tenant_id, args.org_id)
    if (
      !args.customer_uid ||
      reservation.customer_uid !== args.customer_uid ||
      reservation.status !== 'pending' ||
      reservation.payment_status !== 'pending' ||
      !args.stripe_checkout_session_id.startsWith('cs_')
    )
      denyNotificationAccess()
    await ctx.db.patch(reservation._id, {
      stripe_checkout_session_id: args.stripe_checkout_session_id,
      updated_at: Date.now(),
    })
    return true
  },
})
