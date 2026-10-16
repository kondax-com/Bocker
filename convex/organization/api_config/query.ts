import { query } from '../../_generated/server';
import { v } from 'convex/values';
import { validateStringLength } from '@/convex/utils/validations';
import { denyNotificationAccess, publicApiConfig, requireActiveOrganization, requireOrganizationAccess } from '@/convex/utils/notificationAccess'
import { organizationResource, verifyServerCapability } from '@/lib/auth/server-capability'


export const getLiffId = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization')
  },
  handler: async (ctx, args) => {

    validateStringLength(args.org_id, 'org_id');
    
    const apiConfig = await ctx.db.query('api_config')
    .withIndex('by_tenant_org_archive', q => 
      q.eq('tenant_id', args.tenant_id)
       .eq('org_id', args.org_id)
       .eq('is_archive', false)
    )
    .first();
    if (!apiConfig) {
      return null
    }

    return apiConfig.liff_id
  },
})

export const findByTenantAndOrg = query({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization')
  },
  handler: async (ctx, args) => {
    await requireActiveOrganization(ctx, args.tenant_id, args.org_id)
    const config = await ctx.db.query('api_config')
    .withIndex('by_tenant_org_archive', q => 
      q.eq('tenant_id', args.tenant_id)
       .eq('org_id', args.org_id)
       .eq('is_archive', false)
    )
    .first();
    return publicApiConfig(config)
  },
});


export const getForManagement = query({
  args: { tenant_id: v.id('tenant'), org_id: v.id('organization') },
  handler: async (ctx, args) => {
    await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    return await ctx.db.query('api_config')
      .withIndex('by_tenant_org_archive', q => q.eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id).eq('is_archive', false)).first()
  },
})

export const getForServer = query({
  args: { tenant_id: v.id('tenant'), org_id: v.id('organization'), server_token: v.string() },
  handler: async (ctx, args) => {
    if (!verifyServerCapability(args.server_token, 'api-config:read',
      organizationResource(args.tenant_id, args.org_id))) denyNotificationAccess()
    await requireActiveOrganization(ctx, args.tenant_id, args.org_id)
    return await ctx.db.query('api_config')
      .withIndex('by_tenant_org_archive', q => q.eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id).eq('is_archive', false)).first()
  },
})
