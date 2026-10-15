import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from '../../_generated/api'
import schema from '../../schema'
import type { Id } from '../../_generated/dataModel'

declare global {
  interface ImportMeta {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>
  }
}

const modules = {
  ...import.meta.glob('../../**/*.*s'),
  '../../tenant/subscription/mutation.ts': () => import('./mutation'),
  '../../tenant/subscription/query.ts': () => import('./query'),
}

// 秒単位 UNIX（Stripe Webhook が渡す形式）
const OLD_PERIOD_START = 1_750_000_000
const OLD_PERIOD_END = OLD_PERIOD_START + 30 * 24 * 60 * 60
const NEW_PERIOD_START = OLD_PERIOD_END + 3 * 24 * 60 * 60 // 支払い失敗から数日後に再決済
const NEW_PERIOD_END = NEW_PERIOD_START + 30 * 24 * 60 * 60

async function setupTenantWithSubscription(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<{
    stripe_subscription_id: string
    status: 'active' | 'past_due' | 'canceled' | 'trialing'
    plan_name: 'MICRO' | 'LITE' | 'PRO' | 'UNKNOWN'
    current_period_start: number
    current_period_end: number
  }> = {}
) {
  return await t.run(async (ctx) => {
    const tenantId = await ctx.db.insert('tenant', {
      user_id: 'test-user',
      user_email: 'test@example.com',
      stripe_customer_id: 'cus_test',
    })
    const subscriptionId = await ctx.db.insert('subscription', {
      tenant_id: tenantId,
      stripe_subscription_id: overrides.stripe_subscription_id ?? 'sub_old',
      stripe_customer_id: 'cus_test',
      status: overrides.status ?? 'past_due',
      price_id: 'price_test_mock_lite_monthly',
      plan_name: overrides.plan_name ?? 'LITE',
      billing_period: 'month',
      current_period_start: (overrides.current_period_start ?? OLD_PERIOD_START) * 1000,
      current_period_end: (overrides.current_period_end ?? OLD_PERIOD_END) * 1000,
      is_archive: false,
    })
    return { tenantId, subscriptionId }
  })
}

describe('tenant.subscription.mutation.upsertSubscription', () => {
  test('支払い失敗後の再決済で新しいサブスクリプションIDに切り替わる', async () => {
    const t = convexTest(schema, modules)
    const { tenantId, subscriptionId } = await setupTenantWithSubscription(t, {
      stripe_subscription_id: 'sub_old',
      status: 'past_due',
    })

    await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_new',
      stripe_customer_id: 'cus_test',
      status: 'active',
      price_id: 'price_test_mock_pro_monthly',
      plan_name: 'PRO',
      billing_period: 'month',
      current_period_start: NEW_PERIOD_START,
      current_period_end: NEW_PERIOD_END,
    })

    const record = await t.run((ctx) => ctx.db.get(subscriptionId))
    expect(record?.stripe_subscription_id).toBe('sub_new')
    expect(record?.status).toBe('active')
    expect(record?.plan_name).toBe('PRO')
    expect(record?.current_period_start).toBe(NEW_PERIOD_START * 1000)

    // 重複レコードは作られない
    const all = await t.run((ctx) =>
      ctx.db
        .query('subscription')
        .withIndex('by_tenant_archive', (q) => q.eq('tenant_id', tenantId).eq('is_archive', false))
        .collect()
    )
    expect(all).toHaveLength(1)
  })

  test('乗り換え後に届いた古いサブスクリプションの canceled イベントを無視する', async () => {
    const t = convexTest(schema, modules)
    const { tenantId, subscriptionId } = await setupTenantWithSubscription(t, {
      stripe_subscription_id: 'sub_new',
      status: 'active',
      plan_name: 'PRO',
      current_period_start: NEW_PERIOD_START,
      current_period_end: NEW_PERIOD_END,
    })

    const returnedId = await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_old',
      stripe_customer_id: 'cus_test',
      status: 'canceled',
      price_id: 'price_test_mock_lite_monthly',
      plan_name: 'LITE',
      billing_period: 'month',
      current_period_start: OLD_PERIOD_START,
      current_period_end: OLD_PERIOD_END,
    })

    expect(returnedId).toBe(subscriptionId)
    const record = await t.run((ctx) => ctx.db.get(subscriptionId))
    expect(record?.stripe_subscription_id).toBe('sub_new')
    expect(record?.status).toBe('active')
    expect(record?.plan_name).toBe('PRO')
  })

  test('乗り換え後に届いた古いサブスクリプションの past_due（課金期間が古い）イベントを無視する', async () => {
    const t = convexTest(schema, modules)
    const { tenantId, subscriptionId } = await setupTenantWithSubscription(t, {
      stripe_subscription_id: 'sub_new',
      status: 'active',
      plan_name: 'PRO',
      current_period_start: NEW_PERIOD_START,
      current_period_end: NEW_PERIOD_END,
    })

    await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_old',
      stripe_customer_id: 'cus_test',
      status: 'past_due',
      price_id: 'price_test_mock_lite_monthly',
      plan_name: 'LITE',
      billing_period: 'month',
      current_period_start: OLD_PERIOD_START,
      current_period_end: OLD_PERIOD_END,
    })

    const record = await t.run((ctx) => ctx.db.get(subscriptionId))
    expect(record?.stripe_subscription_id).toBe('sub_new')
    expect(record?.status).toBe('active')
    expect(record?.plan_name).toBe('PRO')
  })

  test('同じサブスクリプションIDの更新は通常どおり反映される（再決済で past_due → active）', async () => {
    const t = convexTest(schema, modules)
    const { tenantId, subscriptionId } = await setupTenantWithSubscription(t, {
      stripe_subscription_id: 'sub_same',
      status: 'past_due',
    })

    await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_same',
      stripe_customer_id: 'cus_test',
      status: 'active',
      price_id: 'price_test_mock_lite_monthly',
      plan_name: 'LITE',
      billing_period: 'month',
      current_period_start: OLD_PERIOD_START,
      current_period_end: OLD_PERIOD_END,
    })

    const record = await t.run((ctx) => ctx.db.get(subscriptionId))
    expect(record?.status).toBe('active')
    expect(record?.plan_name).toBe('LITE')
  })

  test('plan_name が UNKNOWN で届いても既存の有効なプラン名を維持する', async () => {
    const t = convexTest(schema, modules)
    const { tenantId, subscriptionId } = await setupTenantWithSubscription(t, {
      stripe_subscription_id: 'sub_same',
      status: 'past_due',
      plan_name: 'LITE',
    })

    await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_same',
      stripe_customer_id: 'cus_test',
      status: 'active',
      price_id: 'price_unmapped',
      plan_name: 'UNKNOWN',
      billing_period: 'month',
      current_period_start: OLD_PERIOD_START,
      current_period_end: OLD_PERIOD_END,
    })

    const record = await t.run((ctx) => ctx.db.get(subscriptionId))
    expect(record?.status).toBe('active')
    expect(record?.plan_name).toBe('LITE')
  })

  test('レコードが無い場合は新規作成される', async () => {
    const t = convexTest(schema, modules)
    const tenantId = await t.run(async (ctx) =>
      ctx.db.insert('tenant', {
        user_id: 'test-user',
        user_email: 'test@example.com',
        stripe_customer_id: 'cus_test',
      })
    )

    const id = (await t.mutation(api.tenant.subscription.mutation.upsertSubscription, {
      tenant_id: tenantId,
      stripe_subscription_id: 'sub_new',
      stripe_customer_id: 'cus_test',
      status: 'active',
      price_id: 'price_test_mock_micro_monthly',
      plan_name: 'MICRO',
      billing_period: 'month',
      current_period_start: NEW_PERIOD_START,
      current_period_end: NEW_PERIOD_END,
    })) as Id<'subscription'>

    const record = await t.run((ctx) => ctx.db.get(id))
    expect(record?.stripe_subscription_id).toBe('sub_new')
    expect(record?.plan_name).toBe('MICRO')
  })
})

describe('tenant.subscription.query.findByStripeSubscriptionId', () => {
  test('乗り換え済みの古いサブスクリプションIDでは何も返さない', async () => {
    const t = convexTest(schema, modules)
    await setupTenantWithSubscription(t, { stripe_subscription_id: 'sub_new', status: 'active' })

    const byOld = await t.query(api.tenant.subscription.query.findByStripeSubscriptionId, {
      stripe_subscription_id: 'sub_old',
    })
    expect(byOld).toBeNull()

    const byNew = await t.query(api.tenant.subscription.query.findByStripeSubscriptionId, {
      stripe_subscription_id: 'sub_new',
    })
    expect(byNew?.stripe_subscription_id).toBe('sub_new')
  })
})
