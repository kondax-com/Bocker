import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { getEnv } from '@/lib/env-config'

class StaffManagementError extends Error {
  constructor(public status: number) {
    super(status === 401 ? '認証が必要です' : 'この店舗を管理する権限がありません')
  }
}

export async function getStaffManagementClient() {
  const { userId, getToken } = await auth()
  const token = userId ? await getToken({ template: 'convex' }) : null
  if (!userId || !token) throw new StaffManagementError(401)
  const convex = new ConvexHttpClient(getEnv('NEXT_PUBLIC_CONVEX_URL'))
  convex.setAuth(token)
  return { convex, userId }
}

export async function requireStaffManagement(
  convex: ConvexHttpClient,
  tenantId: Id<'tenant'>,
  orgId: Id<'organization'>
) {
  try {
    await convex.query(api.organization.api_config.query.getForManagement, {
      tenant_id: tenantId,
      org_id: orgId,
    })
  } catch {
    throw new StaffManagementError(403)
  }
}

export function staffManagementErrorResponse(error: unknown) {
  return error instanceof StaffManagementError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : null
}
