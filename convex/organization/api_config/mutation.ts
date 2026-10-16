import { mutation } from '../../_generated/server';
import { v } from 'convex/values';
import { denyNotificationAccess, requireActiveOrganization, requireOrganizationAccess } from '@/convex/utils/notificationAccess'
import { organizationResource, verifyServerCapability } from '@/lib/auth/server-capability'
import { validateRequired, validateStringLength } from '@/convex/utils/validations';
import { ConvexError } from 'convex/values';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';
import { createRecord, updateRecord } from '@/convex/utils/helpers';

export const create = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    server_token: v.optional(v.string()),
    line_access_token: v.optional(v.string()),
    line_channel_secret: v.optional(v.string()),
    liff_id: v.optional(v.string()),
    line_channel_id: v.optional(v.string()),
    destination_id: v.optional(v.string()),
    org_line_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.server_token !== undefined) {
      if (!verifyServerCapability(args.server_token, 'api-config:write', organizationResource(args.tenant_id, args.org_id))) denyNotificationAccess()
      await requireActiveOrganization(ctx, args.tenant_id, args.org_id)
    } else {
      await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    }
    validateRequired(args.org_id, 'org_id');
    validateStringLength(args.line_access_token, 'line_access_token', 512);
    validateStringLength(args.line_channel_secret, 'line_channel_secret', 512);
    validateStringLength(args.liff_id, 'liff_id', 512);
    validateStringLength(args.line_channel_id, 'line_channel_id', 512);
    validateStringLength(args.destination_id, 'destination_id', 512);
    validateStringLength(args.org_line_id, 'org_line_id', 512);
    const { server_token: _serverToken, ...config } = args
    return await createRecord(ctx, 'api_config', config);
  },
})

export const update = mutation({
  args: {
    api_config_id: v.id('api_config'),
    line_access_token: v.optional(v.string()),
    line_channel_secret: v.optional(v.string()),
    liff_id: v.optional(v.string()),
    line_channel_id: v.optional(v.string()),
    destination_id: v.optional(v.string()),
    org_line_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.line_access_token, 'line_access_token', 512);
    validateStringLength(args.line_channel_secret, 'line_channel_secret', 512);
    validateStringLength(args.liff_id, 'liff_id', 512);
    validateStringLength(args.line_channel_id, 'line_channel_id', 512);
    validateStringLength(args.destination_id, 'destination_id', 512);
    validateStringLength(args.org_line_id, 'org_line_id', 512);
    const apiConfig = await ctx.db.get(args.api_config_id);
    if (!apiConfig || apiConfig.is_archive) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'api_config.update',
        message: 'API設定が見つかりません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      });
    }
    await requireOrganizationAccess(ctx, apiConfig.tenant_id, apiConfig.org_id, true)
    const { api_config_id: _configId, ...patch } = args
    return await updateRecord(ctx, apiConfig._id, patch);
  },
})

export const upsert = mutation({
  args: {
    tenant_id: v.id('tenant'),
    org_id: v.id('organization'),
    line_access_token: v.optional(v.string()),
    line_channel_secret: v.optional(v.string()),
    liff_id: v.optional(v.string()),
    line_channel_id: v.optional(v.string()),
    destination_id: v.optional(v.string()),
    org_line_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrganizationAccess(ctx, args.tenant_id, args.org_id, true)
    validateRequired(args.org_id, 'org_id');
    validateStringLength(args.line_access_token, 'line_access_token', 512);
    validateStringLength(args.line_channel_secret, 'line_channel_secret', 512);
    validateStringLength(args.liff_id, 'liff_id', 512);
    validateStringLength(args.line_channel_id, 'line_channel_id', 512);
    validateStringLength(args.destination_id, 'destination_id', 512);
    validateStringLength(args.org_line_id, 'org_line_id', 512);
  
    const existing = await ctx.db.query('api_config')
      .withIndex('by_tenant_org_archive', q =>
        q.eq('tenant_id', args.tenant_id)
        .eq('org_id', args.org_id)
        .eq('is_archive', false)
      )
      .first();

    if (existing) {
      return await updateRecord(ctx, existing._id, args);
    } else {
      return await createRecord(ctx, 'api_config', args);
    }
  },
})
