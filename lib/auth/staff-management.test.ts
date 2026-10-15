import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConvexHttpClient } from 'convex/browser'
import type { Id } from '@/convex/_generated/dataModel'
import {
  getStaffManagementClient,
  requireStaffManagement,
  staffManagementErrorResponse,
} from './staff-management'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clients: [] as Array<{ setAuth: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> }>,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/env-config', () => ({ getEnv: () => 'https://test.convex.cloud' }))
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    setAuth = vi.fn()
    query = vi.fn()
    constructor() {
      mocks.clients.push(this)
    }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clients.length = 0
})

describe('staff management request authorization', () => {
  it('rejects unauthenticated requests before constructing a client', async () => {
    mocks.auth.mockResolvedValue({ userId: null, getToken: vi.fn() })
    const error = await getStaffManagementClient().catch((value: unknown) => value)
    expect(staffManagementErrorResponse(error)?.status).toBe(401)
    expect(mocks.clients).toHaveLength(0)
  })

  it('isolates authenticated clients between requests', async () => {
    mocks.auth
      .mockResolvedValueOnce({ userId: 'user-a', getToken: vi.fn().mockResolvedValue('token-a') })
      .mockResolvedValueOnce({ userId: 'user-b', getToken: vi.fn().mockResolvedValue('token-b') })
    await Promise.all([getStaffManagementClient(), getStaffManagementClient()])
    expect(mocks.clients).toHaveLength(2)
    expect(mocks.clients[0].setAuth).toHaveBeenCalledWith('token-a')
    expect(mocks.clients[1].setAuth).toHaveBeenCalledWith('token-b')
  })

  it('requires DB management authorization for the target organization', async () => {
    const query = vi.fn().mockRejectedValue(new Error('wrong tenant'))
    const error = await requireStaffManagement(
      { query } as unknown as ConvexHttpClient,
      'tenant-b' as Id<'tenant'>,
      'org-b' as Id<'organization'>
    ).catch((value: unknown) => value)
    expect(staffManagementErrorResponse(error)?.status).toBe(403)
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      tenant_id: 'tenant-b',
      org_id: 'org-b',
    })
  })

  it('allows an authorized owner even before an API configuration exists', async () => {
    const query = vi.fn().mockResolvedValue(null)
    await expect(
      requireStaffManagement(
        { query } as unknown as ConvexHttpClient,
        'tenant-a' as Id<'tenant'>,
        'org-a' as Id<'organization'>
      )
    ).resolves.toBeUndefined()
  })
})
