import { convexTest } from 'convex-test'
import { beforeEach, expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import { createServerCapability, organizationResource } from '@/lib/auth/server-capability'

const modules = {
  ...import.meta.glob('../../**/*.*s'),
  '../../reservation/notification/query.ts': () => import('./query'),
  '../../reservation/notification/mutation.ts': () => import('./mutation'),
}

beforeEach(() => {
  process.env.INTERNAL_NOTIFICATION_SECRET = 'notification-access-test-secret'
})

async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const tenant = await ctx.db.insert('tenant', {
      user_id: 'owner',
      user_email: 'owner@example.test',
      is_archive: false,
    })
    const org = await ctx.db.insert('organization', {
      tenant_id: tenant,
      org_name: 'Salon',
      is_active: true,
      is_archive: false,
    })
    const otherTenant = await ctx.db.insert('tenant', {
      user_id: 'outsider',
      user_email: 'other@example.test',
      is_archive: false,
    })
    const otherOrg = await ctx.db.insert('organization', {
      tenant_id: otherTenant,
      org_name: 'Other',
      is_active: true,
      is_archive: false,
    })
    const config = await ctx.db.insert('api_config', {
      tenant_id: tenant,
      org_id: org,
      is_archive: false,
      line_access_token: 'private-access-token',
      line_channel_secret: 'private-channel-secret',
      liff_id: 'liff',
      line_channel_id: 'channel',
    })
    const reservation = await ctx.db.insert('reservation', {
      tenant_id: tenant,
      org_id: org,
      customer_name: 'Customer',
      status: 'confirmed',
      payment_status: 'pending',
      date: '2026-10-15',
      start_time_unix: 1_792_022_400_000,
      end_time_unix: 1_792_026_000_000,
      is_archive: false,
    })
    const staff = await ctx.db.insert('staff', {
      tenant_id: tenant,
      org_id: org,
      connect_clerk: true,
      clerk_user_id: 'admin-staff',
      name: 'Admin',
      images: [],
      is_active: true,
      is_archive: false,
    })
    const staffConfig = await ctx.db.insert('staff_config', {
      tenant_id: tenant,
      org_id: org,
      staff_id: staff,
      tags: [],
      role: 'admin',
      is_archive: false,
    })
    const member = await ctx.db.insert('staff', {
      tenant_id: tenant,
      org_id: org,
      connect_clerk: true,
      clerk_user_id: 'member',
      name: 'Member',
      images: [],
      is_active: true,
      is_archive: false,
    })
    const memberConfig = await ctx.db.insert('staff_config', {
      tenant_id: tenant,
      org_id: org,
      staff_id: member,
      tags: [],
      role: 'staff',
      is_archive: false,
    })
    return {
      tenant,
      org,
      otherTenant,
      otherOrg,
      config,
      reservation,
      staff,
      staffConfig,
      member,
      memberConfig,
    }
  })
  return { t, ...ids }
}

test('public config and organization relations never expose LINE credentials', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  const config = await f.t.query(api.organization.api_config.query.findByTenantAndOrg, args)
  const relations = await f.t.query(api.organization.query.getRelations, args)
  for (const value of [config, relations.apiConfig]) {
    expect(value?.line_access_token).toBe('')
    expect(value?.line_channel_secret).toBe('')
    expect(value).toHaveProperty('isLineConfigured', true)
  }
})

test('anonymous and other tenant cannot modify notification settings', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org, org_line_id: 'attacker' }
  await expect(f.t.mutation(api.organization.api_config.mutation.upsert, args)).rejects.toThrow()
  await expect(
    f.t
      .withIdentity({ subject: 'outsider' })
      .mutation(api.organization.api_config.mutation.upsert, args)
  ).rejects.toThrow()
})

test('anonymous and other tenant cannot read or delete notification inbox', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  await expect(f.t.query(api.reservation.notification.query.list, args)).rejects.toThrow()
  await expect(
    f.t
      .withIdentity({ subject: 'outsider' })
      .mutation(api.reservation.notification.mutation.killAll, args)
  ).rejects.toThrow()
})

test('notification creation refuses reservation tenant mismatch', async () => {
  const f = await fixture()
  await expect(
    f.t
      .withIdentity({ subject: 'outsider' })
      .mutation(api.reservation.notification.mutation.create, {
        tenant_id: f.otherTenant,
        org_id: f.otherOrg,
        reservation_id: f.reservation,
      })
  ).rejects.toThrow()
})

test('an outsider cannot bind themselves to another salons staff', async () => {
  const f = await fixture()
  await expect(
    f.t.withIdentity({ subject: 'outsider' }).mutation(api.staff.mutation.upsert, {
      tenant_id: f.tenant,
      org_id: f.org,
      staff_id: f.staff,
      connect_clerk: true,
      clerk_user_id: 'outsider',
      name: 'Forged',
      images: [],
      is_active: true,
    })
  ).rejects.toThrow()
})

test('a regular staff member cannot promote their own stored role', async () => {
  const f = await fixture()
  await expect(
    f.t.withIdentity({ subject: 'member' }).mutation(api.staff.config.mutation.updateRole, {
      staff_id: f.member,
      staff_config_id: f.memberConfig,
      clerk_user_id: 'member',
      role: 'admin',
    })
  ).rejects.toThrow()
})

test.each(['owner', 'admin-staff'])(
  '%s can manage their own config and notification inbox',
  async (subject) => {
    const f = await fixture()
    const user = f.t.withIdentity({ subject })
    const args = { tenant_id: f.tenant, org_id: f.org }
    expect(
      (await user.query(api.organization.api_config.query.getForManagement, args))
        ?.line_access_token
    ).toBe('private-access-token')
    await user.mutation(api.organization.api_config.mutation.upsert, {
      ...args,
      org_line_id: 'salon',
    })
    await user.mutation(api.organization.api_config.mutation.update, {
      api_config_id: f.config,
      org_line_id: 'salon-updated',
    })
    const created = await user.mutation(api.reservation.notification.mutation.create, {
      ...args,
      reservation_id: f.reservation,
    })
    const inbox = await user.query(api.reservation.notification.query.list, args)
    expect(inbox).toHaveLength(1)
    expect(inbox[0].customer_name).toBe('Customer')
    await user.mutation(api.reservation.notification.mutation.kill, {
      reservation_notification_id: created.reservation_notification_id,
    })
    expect(await user.query(api.reservation.notification.query.list, args)).toEqual([])
  }
)

test('regular staff can handle inbox but cannot read or modify secrets', async () => {
  const f = await fixture()
  const user = f.t.withIdentity({ subject: 'member' })
  const args = { tenant_id: f.tenant, org_id: f.org }
  await expect(
    user.query(api.organization.api_config.query.getForManagement, args)
  ).rejects.toThrow()
  await expect(user.mutation(api.organization.api_config.mutation.upsert, args)).rejects.toThrow()
  await user.mutation(api.reservation.notification.mutation.create, {
    ...args,
    reservation_id: f.reservation,
  })
  expect(await user.query(api.reservation.notification.query.list, args)).toHaveLength(1)
  await user.mutation(api.reservation.notification.mutation.killAll, args)
  expect(await user.query(api.reservation.notification.query.list, args)).toEqual([])
})

test('every settings and inbox endpoint refuses anonymous and other tenants', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  const { reservation_notification_id } = await f.t
    .withIdentity({ subject: 'owner' })
    .mutation(api.reservation.notification.mutation.create, {
      ...args,
      reservation_id: f.reservation,
    })
  for (const user of [f.t, f.t.withIdentity({ subject: 'outsider' })]) {
    await expect(
      user.query(api.organization.api_config.query.getForManagement, args)
    ).rejects.toThrow()
    await expect(user.mutation(api.organization.api_config.mutation.create, args)).rejects.toThrow()
    await expect(
      user.mutation(api.organization.api_config.mutation.update, {
        api_config_id: f.config,
        org_line_id: 'wrong',
      })
    ).rejects.toThrow()
    await expect(user.query(api.reservation.notification.query.list, args)).rejects.toThrow()
    await expect(
      user.mutation(api.reservation.notification.mutation.create, {
        ...args,
        reservation_id: f.reservation,
      })
    ).rejects.toThrow()
    await expect(
      user.mutation(api.reservation.notification.mutation.kill, { reservation_notification_id })
    ).rejects.toThrow()
    await expect(
      user.mutation(api.reservation.notification.mutation.killAll, args)
    ).rejects.toThrow()
  }
})

test('server config read is purpose, organization, and time scoped', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  const resource = organizationResource(f.tenant, f.org)
  const token = createServerCapability('api-config:read', resource)
  expect(
    (
      await f.t.query(api.organization.api_config.query.getForServer, {
        ...args,
        server_token: token,
      })
    )?.line_channel_secret
  ).toBe('private-channel-secret')
  for (const server_token of [
    'invalid',
    createServerCapability('api-config:write', resource),
    createServerCapability('api-config:read', organizationResource(f.otherTenant, f.otherOrg)),
    createServerCapability('api-config:read', resource, Date.now() - 61_000),
  ]) {
    await expect(
      f.t.query(api.organization.api_config.query.getForServer, { ...args, server_token })
    ).rejects.toThrow()
  }
  await expect(
    f.t.query(api.organization.api_config.query.getForServer, {
      tenant_id: f.otherTenant,
      org_id: f.org,
      server_token: createServerCapability(
        'api-config:read',
        organizationResource(f.otherTenant, f.org)
      ),
    })
  ).rejects.toThrow()
})

test('only a write capability allows anonymous initial config provisioning', async () => {
  const f = await fixture()
  const args = { tenant_id: f.otherTenant, org_id: f.otherOrg }
  const resource = organizationResource(f.otherTenant, f.otherOrg)
  await expect(
    f.t.mutation(api.organization.api_config.mutation.create, {
      ...args,
      server_token: createServerCapability('api-config:read', resource),
    })
  ).rejects.toThrow()
  const configId = await f.t.mutation(api.organization.api_config.mutation.create, {
    ...args,
    server_token: createServerCapability('api-config:write', resource),
  })
  const config = await f.t.run((ctx) => ctx.db.get(configId))
  expect(config?.tenant_id).toBe(f.otherTenant)
  expect(config).not.toHaveProperty('server_token')
})

test('historical notifications pointing outside their organization are never returned', async () => {
  const f = await fixture()
  await f.t.run((ctx) =>
    ctx.db.insert('reservation_notification', {
      tenant_id: f.otherTenant,
      org_id: f.otherOrg,
      reservation_id: f.reservation,
      notification_sent: false,
      notification_sent_at: Date.now(),
      date: '2026-10-15',
      start_time_unix: 1,
      end_time_unix: 2,
      customer_name: 'Leaked',
      status: 'confirmed',
      payment_status: 'pending',
      is_archive: false,
    })
  )
  expect(
    await f.t.withIdentity({ subject: 'outsider' }).query(api.reservation.notification.query.list, {
      tenant_id: f.otherTenant,
      org_id: f.otherOrg,
    })
  ).toEqual([])
})

test('staff invitation binding requires its exact server capability', async () => {
  const f = await fixture()
  const staffId = await f.t.run((ctx) =>
    ctx.db.insert('staff', {
      tenant_id: f.tenant,
      org_id: f.org,
      connect_clerk: true,
      name: 'Invited',
      images: [],
      is_active: false,
      is_archive: true,
    })
  )
  const args = { staff_id: staffId, clerk_user_id: 'new-member' }
  await expect(
    f.t.mutation(api.staff.invitation.mutation.acceptInvitation, {
      ...args,
      server_token: 'invalid',
    })
  ).rejects.toThrow()
  const token = createServerCapability(
    'staff:accept-invitation',
    JSON.stringify(['staff-invitation', staffId, 'new-member'])
  )
  await expect(
    f.t.mutation(api.staff.invitation.mutation.acceptInvitation, {
      ...args,
      clerk_user_id: 'outsider',
      server_token: token,
    })
  ).rejects.toThrow()
  await f.t.mutation(api.staff.invitation.mutation.acceptInvitation, {
    ...args,
    server_token: token,
  })
  expect((await f.t.run((ctx) => ctx.db.get(staffId)))?.clerk_user_id).toBe('new-member')
})

test('staff records cannot be moved between organizations through config updates', async () => {
  const f = await fixture()
  await expect(
    f.t.withIdentity({ subject: 'owner' }).mutation(api.staff.config.mutation.update, {
      tenant_id: f.otherTenant,
      org_id: f.otherOrg,
      staff_id: f.staff,
      staff_config_id: f.staffConfig,
      gender: 'unselected',
      tags: [],
      role: 'admin',
    })
  ).rejects.toThrow()
  const config = await f.t.run((ctx) => ctx.db.get(f.staffConfig))
  expect(config?.org_id).toBe(f.org)
})

test('outsiders cannot manufacture staff membership or an administrative config', async () => {
  const f = await fixture()
  const user = f.t.withIdentity({ subject: 'outsider', role: 'admin', tenant_id: f.tenant })
  const scoped = { tenant_id: f.tenant, org_id: f.org }
  await expect(
    user.mutation(api.staff.mutation.create, {
      ...scoped,
      plan_name: 'LITE',
      connect_clerk: true,
      clerk_user_id: 'outsider',
      name: 'Forged',
      images: [],
      is_active: true,
    })
  ).rejects.toThrow(/アクセス権限/)
  await expect(
    user.mutation(api.staff.invitation.mutation.createWithInvitation, {
      ...scoped,
      email: 'outsider@example.test',
      name: 'Forged',
      images: [],
      tags: [],
      is_active: true,
      role: 'admin',
    })
  ).rejects.toThrow(/アクセス権限/)
  const config = {
    ...scoped,
    staff_id: f.staff,
    gender: 'unselected' as const,
    tags: [],
    role: 'admin' as const,
  }
  await expect(user.mutation(api.staff.config.mutation.create, config)).rejects.toThrow(
    /アクセス権限/
  )
  await expect(
    user.mutation(api.staff.config.mutation.update, { ...config, staff_config_id: f.staffConfig })
  ).rejects.toThrow(/アクセス権限/)
  await expect(
    user.mutation(api.staff.config.mutation.upsert, { ...config, staff_config_id: f.staffConfig })
  ).rejects.toThrow(/アクセス権限/)
  await expect(
    user.mutation(api.staff.mutation.updateInvitationInfo, {
      staff_id: f.staff,
      role: 'admin',
      invitation_id: 'forged',
      invitation_email: 'outsider@example.test',
      invitation_status: 'pending',
    })
  ).rejects.toThrow(/アクセス権限/)
})

test('owners can create and maintain their legitimate staff configuration', async () => {
  const f = await fixture()
  const owner = f.t.withIdentity({ subject: 'owner' })
  const args = { tenant_id: f.tenant, org_id: f.org }
  const staffId = await owner.mutation(api.staff.mutation.create, {
    ...args,
    plan_name: 'LITE',
    connect_clerk: false,
    name: 'New staff',
    images: [],
    is_active: true,
  })
  const staffConfigId = await owner.mutation(api.staff.config.mutation.create, {
    ...args,
    staff_id: staffId,
    tags: [],
    gender: 'unselected',
    role: 'staff',
  })
  await owner.mutation(api.staff.config.mutation.update, {
    ...args,
    staff_id: staffId,
    staff_config_id: staffConfigId,
    tags: ['updated'],
    gender: 'unselected',
    role: 'manager',
  })
  expect((await f.t.run((ctx) => ctx.db.get(staffConfigId)))?.role).toBe('manager')
  const invitation = await owner.mutation(api.staff.invitation.mutation.createWithInvitation, {
    ...args,
    email: 'new@example.test',
    name: 'Invited',
    images: [],
    tags: [],
    is_active: false,
    gender: 'unselected',
    role: 'staff',
  })
  await owner.mutation(api.staff.invitation.mutation.cancelInvitation, {
    staff_id: invitation.staffId,
  })
  expect(await f.t.run((ctx) => ctx.db.get(invitation.staffId))).toBeNull()
})

test('inactive or archived memberships and organizations cannot access private notifications', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  await f.t.run((ctx) => ctx.db.patch(f.staff, { is_active: false }))
  await expect(
    f.t
      .withIdentity({ subject: 'admin-staff' })
      .query(api.organization.api_config.query.getForManagement, args)
  ).rejects.toThrow(/アクセス権限/)
  await f.t.run((ctx) => ctx.db.patch(f.memberConfig, { is_archive: true }))
  await expect(
    f.t.withIdentity({ subject: 'member' }).query(api.reservation.notification.query.list, args)
  ).rejects.toThrow(/アクセス権限/)
  await f.t.run((ctx) => ctx.db.patch(f.org, { is_active: false }))
  await expect(
    f.t
      .withIdentity({ subject: 'owner' })
      .query(api.organization.api_config.query.getForManagement, args)
  ).rejects.toThrow(/アクセス権限/)
})

test.each(['owner', 'admin-staff', 'member'])(
  'notification sender authorization accepts current DB access for %s',
  async (subject) => {
    const f = await fixture()
    const result = await f.t
      .withIdentity({ subject })
      .query(api.reservation.notification.query.authorize, { tenant_id: f.tenant, org_id: f.org })
    expect(result).toEqual({
      authorized: true,
      role: subject === 'owner' ? 'owner' : subject === 'admin-staff' ? 'admin' : 'staff',
    })
  }
)

test.each([{ is_active: false }, { is_archive: true }, { connect_clerk: false }])(
  'notification sender authorization immediately rejects revoked membership %j',
  async (patch) => {
    const f = await fixture()
    const member = f.t.withIdentity({ subject: 'member', role: 'admin' })
    const args = { tenant_id: f.tenant, org_id: f.org }
    expect(await member.query(api.reservation.notification.query.authorize, args)).toEqual({
      authorized: true,
      role: 'staff',
    })
    await f.t.run((ctx) => ctx.db.patch(f.member, patch))
    await expect(member.query(api.reservation.notification.query.authorize, args)).rejects.toThrow(
      /アクセス権限/
    )
  }
)

test('notification sender authorization uses current DB role and active config', async () => {
  const f = await fixture()
  const member = f.t.withIdentity({ subject: 'member', role: 'admin' })
  const args = { tenant_id: f.tenant, org_id: f.org }
  await f.t.run((ctx) => ctx.db.patch(f.memberConfig, { role: 'manager' }))
  expect(await member.query(api.reservation.notification.query.authorize, args)).toEqual({
    authorized: true,
    role: 'manager',
  })
  await f.t.run((ctx) => ctx.db.patch(f.memberConfig, { is_archive: true }))
  await expect(member.query(api.reservation.notification.query.authorize, args)).rejects.toThrow(
    /アクセス権限/
  )
})

test('anonymous and another tenant cannot authorize notification sending', async () => {
  const f = await fixture()
  const args = { tenant_id: f.tenant, org_id: f.org }
  await expect(f.t.query(api.reservation.notification.query.authorize, args)).rejects.toThrow()
  await expect(
    f.t
      .withIdentity({ subject: 'outsider' })
      .query(api.reservation.notification.query.authorize, args)
  ).rejects.toThrow(/アクセス権限/)
})
