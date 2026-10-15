import { requireOrganizationAccess } from '@/convex/utils/notificationAccess'

import { query } from '@/convex/_generated/server'
import { v } from 'convex/values'
import { Doc } from '@/convex/_generated/dataModel'

export const authorize = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
  },
  handler: async (ctx, args) => {
    const { role } = await requireOrganizationAccess(ctx, args.tenant_id, args.org_id)
    return { authorized: true as const, role }
  },
})

export const list = query({
  args: v.object({
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    take: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const { tenant_id, org_id, take } = args
    await requireOrganizationAccess(ctx, tenant_id, org_id)
    const notifications = await ctx.db
      .query('reservation_notification')
      .withIndex('by_tenant_org_archive', (q) =>
        q.eq('tenant_id', tenant_id).eq('org_id', org_id).eq('is_archive', false)
      )
      .take(Math.max(1, Math.min(100, Math.trunc(take || 30))))
    const reservationIds = notifications.map((notification) => notification.reservation_id)

    const result: Doc<'reservation_notification'>[] = []
    await Promise.all(
      reservationIds.map(async (reservationId) => {
        const reservation = await ctx.db.get(reservationId)
        if (
          reservation &&
          !reservation.is_archive &&
          reservation.tenant_id === tenant_id &&
          reservation.org_id === org_id
        ) {
          const notification = notifications.find(
            (notification) =>
              notification.reservation_id === reservationId &&
              notification.notification_sent === false
          )
          if (notification) {
            result.push({
              ...notification,
            })
          }
        }
      })
    )
    return result.sort((a, b) => (b.notification_sent_at || 0) - (a.notification_sent_at || 0))
  },
})
