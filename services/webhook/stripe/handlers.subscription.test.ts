import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

const { fetchMutation, fetchQuery, fetchAction } = vi.hoisted(() => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
  fetchAction: vi.fn(),
}))

vi.mock('convex/nextjs', () => ({ fetchMutation, fetchQuery, fetchAction }))
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

import { api } from '@/convex/_generated/api'
import {
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
} from './handlers.subscription'
import type { WebhookDependencies } from '../types'
import type { WebhookMetricsCollector } from '../metrics'

const metrics = { incrementApiCall: vi.fn() } as unknown as WebhookMetricsCollector

function makeDeps(overrides: {
  subscription?: Partial<Stripe.Subscription>
  customerMetadata?: Record<string, string>
} = {}): WebhookDependencies {
  const subscription = {
    id: 'sub_new',
    object: 'subscription',
    status: 'active',
    customer: 'cus_test',
    current_period_start: 1_760_000_000,
    current_period_end: 1_762_592_000,
    metadata: {},
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          price: {
            id: 'price_test_mock_pro_monthly',
            object: 'price',
            type: 'recurring',
            product: 'prod_test_mock_pro',
            recurring: { interval: 'month', interval_count: 1 },
          },
          plan: { interval: 'month' },
        },
      ],
      has_more: false,
      url: '',
    },
    ...overrides.subscription,
  } as unknown as Stripe.Subscription

  const customer = {
    id: 'cus_test',
    object: 'customer',
    metadata: overrides.customerMetadata ?? { tenant_id: 'tenant_1' },
  } as unknown as Stripe.Customer

  return {
    stripe: {
      subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription) },
      customers: { retrieve: vi.fn().mockResolvedValue(customer) },
    } as unknown as Stripe,
    convex: api,
    retry: (fn) => fn(),
  }
}

function makeInvoiceEvent(overrides: Partial<Stripe.Invoice> = {}): Stripe.InvoicePaymentSucceededEvent {
  return {
    id: 'evt_1',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_1',
        object: 'invoice',
        customer: 'cus_test',
        subscription: 'sub_new',
        billing_reason: 'subscription_cycle',
        metadata: {},
        lines: {
          object: 'list',
          data: [
            // 再決済時の Invoice: 先頭行が日割り（proration）で Price がプランと異なるケース
            {
              id: 'il_proration',
              proration: true,
              price: {
                id: 'price_test_mock_lite_monthly',
                object: 'price',
                type: 'recurring',
                product: 'prod_test_mock_lite',
                recurring: { interval: 'month' },
              },
              period: { start: 1_700_000_000, end: 1_700_000_001 },
            },
          ],
          has_more: false,
          url: '',
        },
        ...overrides,
      },
    },
  } as unknown as Stripe.InvoicePaymentSucceededEvent
}

function makeDeletedEvent(subscriptionId: string): Stripe.CustomerSubscriptionDeletedEvent {
  return {
    id: 'evt_del',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: 'cus_test',
        status: 'canceled',
      },
    },
  } as unknown as Stripe.CustomerSubscriptionDeletedEvent
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleInvoicePaymentSucceeded', () => {
  it('Subscription オブジェクトを正としてプラン名・課金期間・期間を同期する', async () => {
    const deps = makeDeps()
    fetchMutation.mockResolvedValue('subscription_id')

    const result = await handleInvoicePaymentSucceeded(makeInvoiceEvent(), 'evt_1', deps, metrics)

    expect(result.result).toBe('success')
    expect(fetchMutation).toHaveBeenCalledTimes(1)
    expect(fetchMutation).toHaveBeenCalledWith(
      api.tenant.subscription.mutation.upsertSubscription,
      expect.objectContaining({
        tenant_id: 'tenant_1',
        stripe_subscription_id: 'sub_new',
        stripe_customer_id: 'cus_test',
        status: 'active',
        // Invoice 先頭行（LITE の日割り）ではなく Subscription の契約中 Price（PRO）が使われる
        price_id: 'price_test_mock_pro_monthly',
        plan_name: 'PRO',
        billing_period: 'month',
        current_period_start: 1_760_000_000,
        current_period_end: 1_762_592_000,
      })
    )
  })

  it('Subscription 側で Price を解決できない場合は Invoice の定期課金行にフォールバックする', async () => {
    const deps = makeDeps({
      subscription: {
        items: {
          object: 'list',
          data: [
            {
              id: 'si_1',
              object: 'subscription_item',
              price: { id: 'price_recreated', object: 'price', type: 'recurring', product: 'prod_unmapped' },
            },
          ],
          has_more: false,
          url: '',
        } as unknown as Stripe.Subscription['items'],
      },
    })
    fetchMutation.mockResolvedValue('subscription_id')

    const result = await handleInvoicePaymentSucceeded(makeInvoiceEvent(), 'evt_1', deps, metrics)

    expect(result.result).toBe('success')
    expect(fetchMutation).toHaveBeenCalledWith(
      api.tenant.subscription.mutation.upsertSubscription,
      expect.objectContaining({ plan_name: 'LITE', price_id: 'price_test_mock_lite_monthly' })
    )
  })

  it('サブスクリプションに紐づかない請求書はスキップする', async () => {
    const deps = makeDeps()

    const result = await handleInvoicePaymentSucceeded(
      makeInvoiceEvent({ subscription: null }),
      'evt_1',
      deps,
      metrics
    )

    expect(result.result).toBe('skipped')
    expect(fetchMutation).not.toHaveBeenCalled()
    expect((deps.stripe.subscriptions.retrieve as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('tenant_id が無い場合は error を返す', async () => {
    const deps = makeDeps({ customerMetadata: {} })

    const result = await handleInvoicePaymentSucceeded(makeInvoiceEvent(), 'evt_1', deps, metrics)

    expect(result.result).toBe('error')
    expect(fetchMutation).not.toHaveBeenCalled()
  })
})

describe('handleSubscriptionDeleted', () => {
  it('削除されたサブスクリプションIDを追跡しているレコードのみアーカイブする', async () => {
    const deps = makeDeps()
    fetchQuery.mockResolvedValue({ _id: 'record_1', stripe_subscription_id: 'sub_old' })
    fetchMutation.mockResolvedValue('record_1')

    const result = await handleSubscriptionDeleted(makeDeletedEvent('sub_old'), 'evt_del', deps, metrics)

    expect(result.result).toBe('success')
    expect(fetchQuery).toHaveBeenCalledWith(api.tenant.subscription.query.findByStripeSubscriptionId, {
      stripe_subscription_id: 'sub_old',
    })
    expect(fetchMutation).toHaveBeenCalledWith(api.tenant.subscription.mutation.archive, { id: 'record_1' })
  })

  it('再決済で別サブスクリプションに乗り換え済みの場合、古いIDの削除イベントでは何もしない', async () => {
    const deps = makeDeps()
    // sub_old を追跡しているレコードは存在しない（レコードは sub_new を追跡中）
    fetchQuery.mockResolvedValue(null)

    const result = await handleSubscriptionDeleted(makeDeletedEvent('sub_old'), 'evt_del', deps, metrics)

    expect(result.result).toBe('skipped')
    expect(fetchMutation).not.toHaveBeenCalled()
  })
})
