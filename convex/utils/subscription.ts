import type { SubscriptionStatus } from '@/convex/types';

/**
 * Stripe 上で「もう復帰しない」ことが確定しているサブスクリプションステータス。
 * これらのステータスを持つイベントは、テナントが別のサブスクリプションに
 * 乗り換えた後に届いても、現在のサブスクリプション情報を上書きしてはならない。
 */
export const TERMINAL_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'canceled',
  'incomplete_expired',
  'unpaid',
]);

export interface StaleSubscriptionEventCheck {
  existing: {
    stripe_subscription_id: string;
    /** ミリ秒 UNIX */
    current_period_start: number;
  };
  incoming: {
    stripe_subscription_id: string;
    status: SubscriptionStatus;
    /** ミリ秒 UNIX */
    current_period_start: number;
  };
}

/**
 * 既存レコードが追跡している Stripe サブスクリプションとは別のサブスクリプションに
 * 関する Webhook イベントが「古い（stale）」ものかどうかを判定する。
 *
 * 想定シナリオ:
 *   1. サブスクリプション A の支払いが失敗し past_due になる
 *   2. テナントが再決済（Checkout）し、新しいサブスクリプション B が作成される
 *   3. Convex のレコードは B を追跡するように更新される
 *   4. その後 Stripe のリトライ／自動キャンセルにより A の
 *      invoice.payment_failed / customer.subscription.updated(canceled) が届く
 *
 * 4 のイベントを B のレコードに適用すると、stripe_subscription_id や status が
 * A のものに巻き戻り、最終的に customer.subscription.deleted で B のレコードまで
 * アーカイブされてしまう。その結果テナントの subscription が消え、フロントで
 * plan_name が UNKNOWN 扱いになりサービスが利用できなくなる。
 *
 * 判定ルール（stripe_subscription_id が異なる場合のみ適用）:
 *   - incoming が終端ステータス（canceled / incomplete_expired / unpaid）→ stale
 *   - incoming の課金期間開始が既存より前 → stale（A は必ず B より前に開始している）
 *
 * @returns true の場合、このイベントは無視するべき
 */
export function isStaleSubscriptionEvent({ existing, incoming }: StaleSubscriptionEventCheck): boolean {
  if (existing.stripe_subscription_id === incoming.stripe_subscription_id) {
    return false;
  }

  if (TERMINAL_SUBSCRIPTION_STATUSES.has(incoming.status)) {
    return true;
  }

  if (
    Number.isFinite(existing.current_period_start) &&
    Number.isFinite(incoming.current_period_start) &&
    incoming.current_period_start < existing.current_period_start
  ) {
    return true;
  }

  return false;
}
