import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { createServerCapability, organizationResource } from '@/lib/auth/server-capability'

export async function getServerApiConfig(tenantId: Id<'tenant'>, orgId: Id<'organization'>) {
  return fetchQuery(api.organization.api_config.query.getForServer, {
    tenant_id: tenantId,
    org_id: orgId,
    server_token: createServerCapability('api-config:read', organizationResource(tenantId, orgId)),
  })
}
