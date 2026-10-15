import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE as deleteStaff } from '@/app/api/clerk/staff/delete/route'
import { DELETE as cancelInvitation } from '@/app/api/clerk/staff/invitations/[invitation_id]/route'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  setAuth: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  revoke: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
  clerkClient: async () => ({
    invitations: { revokeInvitation: mocks.revoke },
    users: { deleteUser: mocks.deleteUser },
  }),
}))
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    setAuth = mocks.setAuth
    query = mocks.query
    mutation = mocks.mutation
  },
}))
vi.mock('@/convex/_generated/api', () => ({
  api: {
    organization: { api_config: { query: { getForManagement: 'management' } } },
    staff: {
      invitation: {
        query: { getStaffWithInvitation: 'staff' },
        mutation: { cancelInvitation: 'cancel-invitation' },
      },
      mutation: { killRelatedTables: 'delete-staff' },
    },
  },
}))
vi.mock('@/lib/env-config', () => ({ getEnv: () => 'https://test.convex.cloud' }))
vi.mock('@/services/gcp/cloud_storage/GoogleStorageService', () => ({
  storageService: { deleteImageWithThumbnail: vi.fn() },
}))

const ids = {
  staff_id: 'staffaaaaaaaaaaaaaaaaaaa',
  tenant_id: 'tenantaaaaaaaaaaaaaaaaaa',
  org_id: 'orgaaaaaaaaaaaaaaaaaaaaa',
  staff_config_id: 'configaaaaaaaaaaaaaaaaaa',
}
const staff = {
  _id: ids.staff_id,
  tenant_id: ids.tenant_id,
  org_id: ids.org_id,
  clerk_user_id: 'clerk-target',
  config: { _id: ids.staff_config_id },
  invitationStatus: 'pending',
  invitation_id: 'invitation-a',
  images: [],
}
function deletion(overrides = {}) {
  return deleteStaff(
    new NextRequest('https://example.test/api/clerk/staff/delete', {
      method: 'DELETE',
      body: JSON.stringify({ ...ids, ...overrides }),
      headers: { 'content-type': 'application/json' },
    })
  )
}
function cancellation(invitationId = 'invitation-a') {
  return cancelInvitation(
    new NextRequest(`https://example.test/invitations/${invitationId}?staff_id=${ids.staff_id}`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ invitation_id: invitationId }) }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.auth.mockResolvedValue({
    userId: 'requesting-owner',
    getToken: vi.fn().mockResolvedValue('request-specific-token'),
  })
  mocks.currentUser.mockResolvedValue({ publicMetadata: { role: 'admin' } })
  mocks.query.mockImplementation(async (reference) =>
    reference === 'management' ? null : structuredClone(staff)
  )
  mocks.mutation.mockResolvedValue(null)
  mocks.revoke.mockResolvedValue({ status: 'revoked' })
  mocks.deleteUser.mockResolvedValue(null)
})
afterEach(() => vi.restoreAllMocks())

describe('staff deletion and invitation cancellation authorization', () => {
  it.each([
    ['staff deletion', () => deletion()],
    ['invitation cancellation', () => cancellation()],
  ])('authenticates the Convex client for %s before external changes', async (_name, run) => {
    expect((await run()).status).toBe(200)
    expect(mocks.setAuth).toHaveBeenCalledWith('request-specific-token')
    expect(mocks.query).toHaveBeenCalledWith('management', {
      tenant_id: ids.tenant_id,
      org_id: ids.org_id,
    })
    expect(mocks.query.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.revoke.mock.invocationCallOrder[0]
    )
    expect(mocks.mutation).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['staff deletion', () => deletion()],
    ['invitation cancellation', () => cancellation()],
  ])('rejects a different organization manager before %s', async (_name, run) => {
    mocks.query.mockImplementation(async (reference) => {
      if (reference === 'management') throw new Error('wrong organization')
      return structuredClone(staff)
    })
    expect((await run()).status).toBe(403)
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })

  it.each([
    { tenant_id: 'tenantbbbbbbbbbbbbbbbbbb' },
    { org_id: 'orgbbbbbbbbbbbbbbbbbbbbb' },
    { staff_config_id: 'configbbbbbbbbbbbbbbbbbb' },
  ])('rejects forged deletion scope before external changes: %o', async (scope) => {
    expect((await deletion(scope)).status).toBe(400)
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })

  it('rejects an invitation ID unrelated to the stored staff invitation', async () => {
    expect((await cancellation('invitation-other')).status).toBe(400)
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })

  it('uses the stored configuration when the optional client ID is omitted', async () => {
    expect((await deletion({ staff_config_id: undefined })).status).toBe(200)
    expect(mocks.mutation).toHaveBeenCalledWith('delete-staff', ids)
  })
})
