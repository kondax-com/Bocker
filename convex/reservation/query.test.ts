import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'

declare global {
  interface ImportMeta {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
}

const modules = {
  ...import.meta.glob('./../**/*.*s'),
  '../reservation/query.ts': () => import('./query'),
}

test('reservation - getById', async () => {
  const t = convexTest(schema, modules)
  const reservationId = await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'test-user',
      user_email: 'test@example.com',
    })
    const orgId = await ctx.db.insert('organization', {
      tenant_id: tenantId,
      is_active: true,
      org_name: 'Test Salon',
    })

    return await ctx.db.insert('reservation', {
      tenant_id: tenantId,
      org_id: orgId,
      customer_name: 'Test Customer',
      status: 'confirmed',
      payment_status: 'pending',
      date: '2026-08-22',
      start_time_unix: 1_777_000_000_000,
      end_time_unix: 1_777_003_600_000,
    })
  })

  const result = await t.query(api.reservation.query.getById, { id: reservationId })
  expect(reservationId).toBe(result?._id)
})

test('reservation - getWithDetailById returns null after the reservation is deleted', async () => {
  const t = convexTest(schema, modules)
  const reservationId = await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'test-user',
      user_email: 'test@example.com',
    })
    const orgId = await ctx.db.insert('organization', {
      tenant_id: tenantId,
      is_active: true,
      org_name: 'Test Salon',
    })
    const id = await ctx.db.insert('reservation', {
      tenant_id: tenantId,
      org_id: orgId,
      customer_name: 'Test Customer',
      status: 'confirmed',
      payment_status: 'pending',
      date: '2026-08-22',
      start_time_unix: 1_777_000_000_000,
      end_time_unix: 1_777_003_600_000,
    })
    await ctx.db.delete(id)
    return id
  })

  await expect(
    t.query(api.reservation.query.getWithDetailById, { id: reservationId })
  ).resolves.toBeNull()
})

test('reservation - getWithDetailById returns the reservation and its active detail', async () => {
  const t = convexTest(schema, modules)
  const { reservationId, detailId } = await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'test-user',
      user_email: 'test@example.com',
    })
    const orgId = await ctx.db.insert('organization', {
      tenant_id: tenantId,
      is_active: true,
      org_name: 'Test Salon',
    })
    const reservationId = await ctx.db.insert('reservation', {
      tenant_id: tenantId,
      org_id: orgId,
      customer_name: 'Test Customer',
      status: 'confirmed',
      payment_status: 'pending',
      date: '2026-08-22',
      start_time_unix: 1_777_000_000_000,
      end_time_unix: 1_777_003_600_000,
    })
    const detail = {
      tenant_id: tenantId,
      org_id: orgId,
      reservation_id: reservationId,
      payment_method: 'cash' as const,
      menus: [],
      options: [],
      featured_hair_images: [],
    }
    await ctx.db.insert('reservation_detail', { ...detail, is_archive: true })
    const detailId = await ctx.db.insert('reservation_detail', { ...detail, is_archive: false })
    return { reservationId, detailId }
  })

  const result = await t.query(api.reservation.query.getWithDetailById, { id: reservationId })
  expect(result?.reservation._id).toBe(reservationId)
  expect(result?.reservationDetail?._id).toBe(detailId)

  await t.run(async (ctx) => ctx.db.delete(detailId))
  const withoutDetail = await t.query(api.reservation.query.getWithDetailById, {
    id: reservationId,
  })
  expect(withoutDetail?.reservation._id).toBe(reservationId)
  expect(withoutDetail?.reservationDetail).toBeNull()
})
