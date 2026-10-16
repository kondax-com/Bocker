import { ConvexError } from 'convex/values'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import type { MutationCtx, QueryCtx } from '@/convex/_generated/server'

type AccessCtx = MutationCtx | QueryCtx

export function denyNotificationAccess(): never {
  throw new ConvexError({ code: 'FORBIDDEN', status: 403, message: 'アクセス権限がありません' })
}

export async function requireActiveOrganization(
  ctx: AccessCtx,
  tenantId: Id<'tenant'>,
  orgId: Id<'organization'>
) {
  const [tenant, organization] = await Promise.all([ctx.db.get(tenantId), ctx.db.get(orgId)])
  if (
    !tenant ||
    tenant.is_archive ||
    !organization ||
    organization.is_archive ||
    !organization.is_active ||
    organization.tenant_id !== tenantId
  ) {
    denyNotificationAccess()
  }
  return { tenant, organization }
}

export async function requireOrganizationAccess(
  ctx: AccessCtx,
  tenantId: Id<'tenant'>,
  orgId: Id<'organization'>,
  management = false
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new ConvexError({ code: 'UNAUTHORIZED', status: 401, message: '認証が必要です' })
  }
  const { tenant, organization } = await requireActiveOrganization(ctx, tenantId, orgId)
  if (tenant.user_id === identity.subject) return { identity, organization, role: 'owner' as const }

  const staff = await ctx.db
    .query('staff')
    .withIndex('by_tenant_org_clerk_user_archive', (q) =>
      q
        .eq('tenant_id', tenantId)
        .eq('org_id', orgId)
        .eq('clerk_user_id', identity.subject)
        .eq('is_archive', false)
    )
    .first()
  if (!staff || !staff.is_active || !staff.connect_clerk) denyNotificationAccess()
  const config = await ctx.db
    .query('staff_config')
    .withIndex('by_tenant_org_staff_archive', (q) =>
      q
        .eq('tenant_id', tenantId)
        .eq('org_id', orgId)
        .eq('staff_id', staff._id)
        .eq('is_archive', false)
    )
    .first()
  if (!config || (management && config.role !== 'admin' && config.role !== 'owner')) {
    denyNotificationAccess()
  }
  return { identity, organization, role: config.role }
}

export async function requireStaffManagement(ctx: AccessCtx, staffId: Id<'staff'>) {
  const staff = await ctx.db.get(staffId)
  if (!staff) denyNotificationAccess()
  await requireOrganizationAccess(ctx, staff.tenant_id, staff.org_id, true)
  return staff
}

export async function requireStaffConfigManagement(ctx: AccessCtx, configId: Id<'staff_config'>) {
  const config = await ctx.db.get(configId)
  if (!config) denyNotificationAccess()
  const staff = await requireStaffManagement(ctx, config.staff_id)
  if (config.tenant_id !== staff.tenant_id || config.org_id !== staff.org_id)
    denyNotificationAccess()
  return { config, staff }
}

export function assertSameOrganization(
  record: { tenant_id: Id<'tenant'>; org_id: Id<'organization'> },
  tenantId: Id<'tenant'>,
  orgId: Id<'organization'>
) {
  if (record.tenant_id !== tenantId || record.org_id !== orgId) denyNotificationAccess()
}

export function publicApiConfig(config: Doc<'api_config'> | null) {
  if (!config) return null
  return {
    ...config,
    line_access_token: '',
    line_channel_secret: '',
    isLineConfigured: Boolean(
      config.line_access_token &&
        config.line_channel_secret &&
        config.liff_id &&
        config.line_channel_id
    ),
  }
}
