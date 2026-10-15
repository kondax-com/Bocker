import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import type { Id } from '@/convex/_generated/dataModel'
import {
  buildSubscriptionUpsertArgs,
  findSubscriptionInvoiceLine,
  getInvoiceSubscriptionId,
} from './subscriptionSync'

const TENANT_ID = 'tenant_1' as Id<'tenant'>

function makePrice(overrides: Partial<Stripe.Price> = {}): Stripe.Price {
  return {
    id: 'price_test_mock_pro_monthly',
    object: 'price',
    type: 'recurring',
    product: 'prod_test_mock_pro',
    recurring: { interval: 'month', interval_count: 1 } as Stripe.Price.Recurring,
    ...overrides,
  } as Stripe.Price
}

function makeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_new',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test',
    current_period_start: 1_750_000_000,
    current_period_end: 1_752_592_000,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          price: makePrice(),
          plan: { interval: 'month' } as Stripe.Plan,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: '',
    },
    ...overrides,
  } as Stripe.Subscription
}

describe('buildSubscriptionUpsertArgs', () => {
  it('Subscription オブジェクトの Price からプラン名・課金期間・期間を組み立てる', () => {
    const args = buildSubscriptionUpsertArgs({
      subscription: makeSubscription(),
      tenant_id: TENANT_ID,
      stripe_customer_id: 'cus_test',
    })

    expect(args).toEqual({
      tenant_id: TENANT_ID,
      stripe_subscription_id: 'sub_new',
      stripe_customer_id: 'cus_test',
      status: 'active',
      price_id: 'price_test_mock_pro_monthly',
      plan_name: 'PRO',
      billing_period: 'month',
      current_period_start: 1_750_000_000,
      current_period_end: 1_752_592_000,
    })
  })

  it('Price ID が未知でも Product ID からプラン名を復元する', () => {
    const args = buildSubscriptionUpsertArgs({
      subscription: makeSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              object: 'subscription_item',
              price: makePrice({ id: 'price_recreated', product: 'prod_test_mock_lite' }),
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        },
      }),
      tenant_id: TENANT_ID,
      stripe_customer_id: 'cus_test',
    })

    expect(args.plan_name).toBe('LITE')
    expect(args.price_id).toBe('price_recreated')
  })

  it('Subscription 側で解決できない場合は Invoice 行の Price にフォールバックする', () => {
    const args = buildSubscriptionUpsertArgs({
      subscription: makeSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              object: 'subscription_item',
              price: makePrice({ id: 'price_unmapped', product: 'prod_unmapped' }),
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        },
      }),
      tenant_id: TENANT_ID,
      stripe_customer_id: 'cus_test',
      fallbackPrice: makePrice({ id: 'price_test_mock_micro_yearly', recurring: { interval: 'year' } as Stripe.Price.Recurring }),
    })

    expect(args.plan_name).toBe('MICRO')
    expect(args.price_id).toBe('price_test_mock_micro_yearly')
    expect(args.billing_period).toBe('year')
  })

  it('どちらでも解決できない場合は UNKNOWN を返す（既存値の保持は Convex 側で行う）', () => {
    const args = buildSubscriptionUpsertArgs({
      subscription: makeSubscription({
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              object: 'subscription_item',
              price: makePrice({ id: 'price_unmapped', product: 'prod_unmapped' }),
            } as Stripe.SubscriptionItem,
          ],
          has_more: false,
          url: '',
        },
      }),
      tenant_id: TENANT_ID,
      stripe_customer_id: 'cus_test',
      fallbackPrice: makePrice({ id: 'price_unmapped_2', product: 'prod_unmapped_2' }),
    })

    expect(args.plan_name).toBe('UNKNOWN')
    expect(args.price_id).toBe('price_unmapped')
  })
})

describe('findSubscriptionInvoiceLine', () => {
  const recurringLine = {
    id: 'il_plan',
    price: makePrice(),
    proration: false,
  } as unknown as Stripe.InvoiceLineItem
  const prorationLine = {
    id: 'il_proration',
    price: makePrice({ id: 'price_test_mock_lite_monthly' }),
    proration: true,
  } as unknown as Stripe.InvoiceLineItem
  const oneOffLine = {
    id: 'il_one_off',
    price: makePrice({ id: 'price_one_off', type: 'one_time', recurring: null }),
    proration: false,
  } as unknown as Stripe.InvoiceLineItem

  it('先頭行が日割り・単発項目でも定期課金の行を返す', () => {
    const line = findSubscriptionInvoiceLine({
      lines: { object: 'list', data: [oneOffLine, prorationLine, recurringLine], has_more: false, url: '' },
    })
    expect(line?.id).toBe('il_plan')
  })

  it('定期課金行が日割りしかない場合はそれを返す', () => {
    const line = findSubscriptionInvoiceLine({
      lines: { object: 'list', data: [oneOffLine, prorationLine], has_more: false, url: '' },
    })
    expect(line?.id).toBe('il_proration')
  })

  it('行が無い場合は undefined', () => {
    const line = findSubscriptionInvoiceLine({
      lines: { object: 'list', data: [], has_more: false, url: '' },
    })
    expect(line).toBeUndefined()
  })
})

describe('getInvoiceSubscriptionId', () => {
  it('文字列 / 展開オブジェクト / null を扱える', () => {
    expect(getInvoiceSubscriptionId({ subscription: 'sub_1' })).toBe('sub_1')
    expect(getInvoiceSubscriptionId({ subscription: { id: 'sub_2' } as Stripe.Subscription })).toBe('sub_2')
    expect(getInvoiceSubscriptionId({ subscription: null })).toBeNull()
  })
})
