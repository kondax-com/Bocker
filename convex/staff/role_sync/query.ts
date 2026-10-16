import { query } from '@/convex/_generated/server'
import { v } from 'convex/values'
import { roleType } from '@/convex/types'
import {
  denyNotificationAccess,
  requireOrganizationAccess,
} from '@/convex/utils/notificationAccess'

export const getForSync = query({
  args: { staff_id: v.id('staff'), new_role: roleType },
  returns: v.object({
    staff_id: v.id('staff'),
    clerk_user_id: v.optional(v.string()),
    role: roleType,
  }),
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staff_id)
    if (!staff || staff.is_archive) denyNotificationAccess()

    const access = await requireOrganizationAccess(ctx, staff.tenant_id, staff.org_id)
    const isSelf = staff.clerk_user_id === access.identity.subject
    if (!isSelf && access.role !== 'owner' && access.role !== 'admin') denyNotificationAccess()

    const config = await ctx.db
      .query('staff_config')
      .withIndex('by_tenant_org_staff_archive', (q) =>
        q
          .eq('tenant_id', staff.tenant_id)
          .eq('org_id', staff.org_id)
          .eq('staff_id', staff._id)
          .eq('is_archive', false)
      )
      .first()
    if (!config || config.role !== args.new_role) denyNotificationAccess()

    return { staff_id: staff._id, clerk_user_id: staff.clerk_user_id, role: config.role }
  },
})
