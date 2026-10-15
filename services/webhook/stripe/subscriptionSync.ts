import type Stripe from 'stripe';
import type { BillingPeriod, SubscriptionPlanName, SubscriptionStatus } from '@/convex/types';
import type { Id } from '@/convex/_generated/dataModel';
import { resolvePlanNameFromStripePrice } from '@/lib/utils';

/**
 * upsertSubscription ミューテーションに渡す引数
 */
export interface SubscriptionUpsertArgs {
  tenant_id: Id<'tenant'>;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  price_id: string;
  plan_name: SubscriptionPlanName;
  billing_period: BillingPeriod;
  current_period_start: number;
  current_period_end: number;
}

/**
 * Invoice の明細行から「サブスクリプション本体（定期課金）」の行を探す。
 *
 * 再決済やプラン変更後の Invoice には日割り（proration）行や
 * 一時的な請求項目が含まれることがあり、`lines.data[0]` が必ずしも
 * プランの Price を持つとは限らない。定期課金 Price を持つ行を優先し、
 * 見つからなければ Price を持つ最初の行を返す。
 */
export function findSubscriptionInvoiceLine(
  invoice: Pick<Stripe.Invoice, 'lines'>
): Stripe.InvoiceLineItem | undefined {
  const lines = invoice.lines?.data ?? [];
  return (
    lines.find((line) => line.price?.type === 'recurring' && !line.proration) ??
    lines.find((line) => line.price?.type === 'recurring') ??
    lines.find((line) => !!line.price)
  );
}

/**
 * Stripe の Subscription オブジェクトを正として Convex 同期用の引数を組み立てる。
 *
 * Invoice の明細行ではなく Subscription オブジェクトを使う理由:
 *   - Subscription.items が「現在契約中の Price」を常に表す
 *   - current_period_start / end も Subscription 側が正
 *   - Invoice 行は proration や割引などで先頭行がプランでない場合がある
 *
 * Subscription 側で Price が解決できなかった場合のみ、フォールバックとして
 * Invoice の定期課金行の Price を用いる。
 */
export function buildSubscriptionUpsertArgs(params: {
  subscription: Stripe.Subscription;
  tenant_id: Id<'tenant'>;
  stripe_customer_id: string;
  fallbackPrice?: Stripe.Price | null;
}): SubscriptionUpsertArgs {
  const { subscription, tenant_id, stripe_customer_id, fallbackPrice } = params;

  const item = subscription.items?.data?.[0];
  const primaryPrice: Stripe.Price | null | undefined = item?.price;

  let plan_name = resolvePlanNameFromStripePrice(primaryPrice);
  let price: Stripe.Price | null | undefined = primaryPrice;

  if (plan_name === 'UNKNOWN' && fallbackPrice) {
    const fallbackPlan = resolvePlanNameFromStripePrice(fallbackPrice);
    if (fallbackPlan !== 'UNKNOWN') {
      console.warn(
        `[buildSubscriptionUpsertArgs] Resolved plan via invoice line fallback. subscriptionId=${subscription.id}, priceId=${fallbackPrice.id}, plan=${fallbackPlan}`
      );
      plan_name = fallbackPlan;
      price = fallbackPrice;
    }
  }

  const interval =
    price?.recurring?.interval ??
    item?.plan?.interval ??
    fallbackPrice?.recurring?.interval ??
    'month';

  return {
    tenant_id,
    stripe_subscription_id: subscription.id,
    stripe_customer_id,
    status: subscription.status as SubscriptionStatus,
    price_id: price?.id ?? fallbackPrice?.id ?? '',
    plan_name,
    billing_period: interval as BillingPeriod,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
  };
}

/**
 * Invoice が紐づく Subscription ID を取り出す（文字列 / 展開オブジェクト両対応）
 */
export function getInvoiceSubscriptionId(
  invoice: Pick<Stripe.Invoice, 'subscription'>
): string | null {
  const sub = invoice.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}
