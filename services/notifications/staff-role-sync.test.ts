import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { api } from '@/convex/_generated/api'
import schema from '@/convex/schema'
import { PATCH } from '@/app/api/clerk/staff/update-role/route'

const mocks = vi.hoisted(() => ({
  subject: 'admin-user' as string | null,
  query: vi.fn(),
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: mocks.subject, getToken: async () => 'convex-test-token' }),
  clerkClient: async () => ({
    users: { getUser: mocks.getUser, updateUserMetadata: mocks.updateUserMetadata },
  }),
}))
vi.mock('convex/browser', () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query = mocks.query
  },
}))
vi.mock('@/lib/env-config', () => ({ getEnv: () => 'https://test.convex.cloud' }))
vi.mock('@/lib/validations/api/staff', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/validations/api/staff')>()
  const { z } = await import('zod')
  // convex-test の短い合成IDにも、実際のルートの権限検証を実行する。
  return {
    ...original,
    updateStaffRoleSchema: original.updateStaffRoleSchema.extend({ staff_id: z.string() }),
  }
})

const modules = import.meta.glob('../../convex/**/*.*s')

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const tenant = await ctx.db.insert('tenant', {
      user_id: 'owner-user',
      user_email: 'owner@example.test',
      is_archive: false,
    })
    const org = await ctx.db.insert('organization', {
      tenant_id: tenant,
      org_name: 'Salon',
      is_active: true,
      is_archive: false,
    })
    const admin = await ctx.db.insert('staff', {
      tenant_id: tenant,
      org_id: org,
      clerk_user_id: 'admin-user',
      connect_clerk: true,
      name: 'Administrator',
      images: [],
      is_active: true,
      is_archive: false,
    })
    const adminConfig = await ctx.db.insert('staff_config', {
      tenant_id: tenant,
      org_id: org,
      staff_id: admin,
      role: 'admin',
      tags: [],
      is_archive: false,
    })
    const member = await ctx.db.insert('staff', {
      tenant_id: tenant,
      org_id: org,
      clerk_user_id: 'member-user',
      connect_clerk: true,
      name: 'Member',
      images: [],
      is_active: true,
      is_archive: false,
    })
    const memberConfig = await ctx.db.insert('staff_config', {
      tenant_id: tenant,
      org_id: org,
      staff_id: member,
      role: 'staff',
      tags: [],
      is_archive: false,
    })
    return { tenant, org, admin, adminConfig, member, memberConfig }
  })
  mocks.query.mockImplementation((reference, args) =>
    t.withIdentity({ subject: mocks.subject! }).query(reference, args)
  )
  return { t, ...ids }
}

function request(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest('https://example.test/api/clerk/staff/update-role', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.subject = 'admin-user'
  mocks.getUser.mockResolvedValue({ publicMetadata: { role: 'admin', retained: 'keep' } })
  mocks.updateUserMetadata.mockResolvedValue({})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('staff role synchronization authorization', () => {
  it('allows a non-owner admin to synchronize their own role after DB self-demotion', async () => {
    const f = await fixture()
    await f.t
      .withIdentity({ subject: 'admin-user' })
      .mutation(api.staff.config.mutation.updateRole, {
        staff_id: f.admin,
        staff_config_id: f.adminConfig,
        clerk_user_id: 'admin-user',
        role: 'staff',
      })

    const response = await request({
      staff_id: f.admin,
      clerk_user_id: 'admin-user',
      new_role: 'staff',
    })

    expect(response.status).toBe(200)
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith('admin-user', {
      publicMetadata: expect.objectContaining({ role: 'staff', retained: 'keep' }),
    })
  })

  it('rejects a requested self-promotion that disagrees with the saved role', async () => {
    const f = await fixture()
    mocks.subject = 'member-user'
    const response = await request({
      staff_id: f.member,
      clerk_user_id: 'member-user',
      new_role: 'admin',
    })
    expect(response.status).toBe(403)
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled()
  })

  it('requires current management authorization to synchronize another staff member', async () => {
    const f = await fixture()
    mocks.subject = 'member-user'
    const response = await request({
      staff_id: f.admin,
      clerk_user_id: 'admin-user',
      new_role: 'admin',
    })
    expect(response.status).toBe(403)
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled()
  })

  it.each(['owner-user', 'admin-user'])(
    'allows %s to synchronize a saved role',
    async (subject) => {
      const f = await fixture()
      mocks.subject = subject
      const response = await request({
        staff_id: f.member,
        clerk_user_id: 'member-user',
        new_role: 'staff',
      })
      expect(response.status).toBe(200)
      expect(mocks.updateUserMetadata).toHaveBeenCalledWith('member-user', {
        publicMetadata: expect.objectContaining({ role: 'staff' }),
      })
    }
  )

  it('rejects role values that disagree with DB even for an administrator', async () => {
    const f = await fixture()
    const response = await request({
      staff_id: f.member,
      clerk_user_id: 'member-user',
      new_role: 'admin',
    })
    expect(response.status).toBe(403)
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled()
  })

  it('uses the saved Clerk user ID even when the request omits it', async () => {
    const f = await fixture()
    const response = await request({ staff_id: f.member, new_role: 'staff' })
    expect(response.status).toBe(200)
    expect(mocks.updateUserMetadata).toHaveBeenCalledWith('member-user', expect.anything())
  })

  it('rejects an arbitrary Clerk user ID', async () => {
    const f = await fixture()
    const response = await request({
      staff_id: f.member,
      clerk_user_id: 'another-user',
      new_role: 'staff',
    })
    expect(response.status).toBe(400)
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled()
  })

  it('rejects self synchronization after the member is disabled', async () => {
    const f = await fixture()
    mocks.subject = 'member-user'
    await f.t.run((ctx) => ctx.db.patch(f.member, { is_active: false }))
    const response = await request({
      staff_id: f.member,
      clerk_user_id: 'member-user',
      new_role: 'staff',
    })
    expect(response.status).toBe(403)
    expect(mocks.updateUserMetadata).not.toHaveBeenCalled()
  })
})
