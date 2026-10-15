import type Stripe from 'stripe';
import type { WebhookDependencies, EventProcessingResult, LogContext } from '../types';
import type { WebhookMetricsCollector } from '../metrics';
import * as Sentry from '@sentry/nextjs';
import { fetchAction, fetchMutation, fetchQuery } from 'convex/nextjs';
import { Id } from '@/convex/_generated/dataModel'
import {
  buildSubscriptionUpsertArgs,
  findSubscriptionInvoiceLine,
  getInvoiceSubscriptionId,
} from './subscriptionSync'

export async function handleSubscriptionUpdated(
  /**
   * Stripe の Subscription 更新の Webhook イベントを処理
   * (customer.subscription.updated)
   *
   * @param evt - Stripe イベントオブジェクト
   * @param eventId - イベントID
   * @param deps - Webhook の依存関係 (Stripe インスタンスなど)
   * @param metrics - メトリクスコレクター
   * @returns イベント処理結果 ('success', 'skipped', 'error')
   */
  evt: Stripe.CustomerSubscriptionUpdatedEvent,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  // ------------------------------------------------------------
  // 以下、実装の主な流れ
  // 1. Stripe から必要な ID / ステータスを取得
  // 2. Convex に同期 (retry & await で冪等・確実に書き込み)
  //    ※ 乗り換え前の古いサブスクリプションのイベントは upsertSubscription 側で無視される
  // 3. メトリクス収集で監視基盤に反映
  // ------------------------------------------------------------

  const context: LogContext = {
    eventId,
    eventType: 'customer.subscription.updated',
    stripeCustomerId: evt.data.object.customer as string,
    stripeSubscriptionId: evt.data.object.id as string,
  }
  console.log(
    `👤 [${eventId}] CustomerSubscriptionUpdated処理開始: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${evt.data.object.id}`,
    context
  )

  try {
    const customer = (await deps.stripe.customers.retrieve(
      evt.data.object.customer as string
    )) as Stripe.Customer
    metrics.incrementApiCall('stripe')
    const tenant_id = customer.metadata?.tenant_id as Id<'tenant'> | undefined
    if (!tenant_id) {
      console.error(`[${eventId}] Webhook (customer.subscription.updated) のメタデータにtenant_idが含まれていません。subscriptionId: ${evt.data.object.id}`)
      Sentry.captureMessage('Webhook (customer.subscription.updated) のメタデータにtenant_idが含まれていません', {
        level: 'error',
        tags: { ...context, operation: 'handleCustomerSubscriptionUpdated_tenant_id_missing' },
        extra: { customer_metadata: customer.metadata, subscription_metadata: evt.data.object.metadata },
      })
      return {
        result: 'error',
        errorMessage: '必要なtenant_idがメタデータに存在しません。',
        metadata: {
          action: 'customer_subscription_updated',
          stripeCustomerId: evt.data.object.customer as string,
          stripeSubscriptionId: evt.data.object.id as string,
        },
      }
    }

    await deps.retry(() =>
      fetchMutation(
        deps.convex.tenant.subscription.mutation.upsertSubscription,
        buildSubscriptionUpsertArgs({
          subscription: evt.data.object,
          tenant_id,
          stripe_customer_id: evt.data.object.customer as string,
        })
      )
    )
    metrics.incrementApiCall('convex')

    return {
      result: 'success',
      metadata: {
        action: 'customer_subscription_updated',
        stripeCustomerId: evt.data.object.customer as string,
        stripeSubscriptionId: evt.data.object.id as string,
      },
    }
  } catch (error) {
    console.error(
      `❌ [${eventId}] CustomerSubscriptionUpdated処理中に致命的なエラーが発生: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${evt.data.object.id}`,
      { ...context, error }
    )
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleCustomerSubscriptionUpdated_main_catch' },
    })
    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー',
    }
  }
}

export async function handleSubscriptionDeleted(
  /**
   * Stripe の Subscription 削除の Webhook イベントを処理
   * (customer.subscription.deleted)
   *
   * @param evt - Stripe イベントオブジェクト
   * @param eventId - イベントID
   * @param deps - Webhook の依存関係 (Stripe インスタンスなど)
   * @param metrics - メトリクスコレクター
   * @returns イベント処理結果 ('success', 'skipped', 'error')
   */
  evt: Stripe.CustomerSubscriptionDeletedEvent,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
  // ------------------------------------------------------------
  // 以下、実装の主な流れ
  // 1. 削除された Subscription ID に「厳密に一致する」Convex レコードを取得
  //    ※ 顧客IDで検索すると、再決済で新しいサブスクリプションに乗り換えた後に
  //      古いサブスクリプションの削除イベントが届いた際、新しいレコードまで
  //      アーカイブしてしまう（→ plan_name が UNKNOWN 扱いになり利用不能）
  // 2. 一致するレコードのみアーカイブ (retry & await で冪等・確実に書き込み)
  // 3. メトリクス収集で監視基盤に反映
  // ------------------------------------------------------------

  const context: LogContext = {
    eventId,
    eventType: 'customer.subscription.deleted',
    stripeCustomerId: evt.data.object.customer as string,
    stripeSubscriptionId: evt.data.object.id as string,
  }
  console.log(
    `👤 [${eventId}] CustomerSubscriptionDeleted処理開始: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${evt.data.object.id}`,
    context
  )

  try {
    const subscription = await deps.retry(() =>
      fetchQuery(deps.convex.tenant.subscription.query.findByStripeSubscriptionId, {
        stripe_subscription_id: evt.data.object.id as string,
      })
    )
    metrics.incrementApiCall('convex')
    if (!subscription) {
      console.log(
        `[${eventId}] CustomerSubscriptionDeleted: 削除対象のサブスクリプション ${evt.data.object.id} を追跡しているレコードは存在しません（既にアーカイブ済み、または別のサブスクリプションに乗り換え済み）`
      )
      return {
        result: 'skipped',
        metadata: {
          action: 'customer_subscription_deleted',
          stripeCustomerId: evt.data.object.customer as string,
          stripeSubscriptionId: evt.data.object.id as string,
          errorMessage: 'サブスクリプションはすでに削除・アーカイブ済みか、別のサブスクリプションに置き換えられています',
        },
      }
    }
    await deps.retry(() =>
      fetchMutation(deps.convex.tenant.subscription.mutation.archive, {
        id: subscription._id,
      })
    )
    metrics.incrementApiCall('convex')

    return {
      result: 'success',
      metadata: {
        action: 'customer_subscription_deleted',
        stripeCustomerId: evt.data.object.customer as string,
        stripeSubscriptionId: evt.data.object.id as string,
      },
    }
  } catch (error) {
    console.error(
      `❌ [${eventId}] CustomerSubscriptionDeleted処理中に致命的なエラーが発生: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${evt.data.object.id}`,
      { ...context, error }
    )
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleCustomerSubscriptionDeleted_main_catch' },
    })
    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー',
    }
  }
}

export async function handleInvoicePaymentSucceeded(
  evt: Stripe.InvoicePaymentSucceededEvent,
  /**
   * Stripe の Invoice 支払い成功の Webhook イベントを処理
   * (invoice.payment_succeeded)
   *
   * @param evt - Stripe イベントオブジェクト
   * @param eventId - イベントID
   * @param deps - Webhook の依存関係 (Stripe インスタンスなど)
   * @param metrics - メトリクスコレクター
   * @returns イベント処理結果 ('success', 'skipped', 'error')
   */
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
// ------------------------------------------------------------
// 以下、実装の主な流れ
// 1. Stripe から必要な ID / ステータスを取得
// 2. Convex に同期 (retry & await で冪等・確実に書き込み)
//    ※ プラン名・課金期間は Invoice の明細行ではなく Subscription オブジェクトを正とする
//      （再決済時の Invoice は先頭行がプランの Price とは限らないため）
// 3. メトリクス収集で監視基盤に反映
// ------------------------------------------------------------
  
  const subscriptionId = getInvoiceSubscriptionId(evt.data.object);
  const context: LogContext = {
    eventId,
    eventType: 'invoice.payment_succeeded',
    stripeCustomerId: evt.data.object.customer as string,
    stripeSubscriptionId: subscriptionId ?? undefined,
  };
  console.log(`👤 [${eventId}] InvoicePaymentSucceeded処理開始: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}`, context);

  try {
    if (!subscriptionId) {
      // サブスクリプションに紐づかない請求書（単発請求など）は同期対象外
      console.log(`[${eventId}] InvoicePaymentSucceeded: サブスクリプションに紐づかない請求書のためスキップします。invoiceId=${evt.data.object.id}`);
      return {
        result: 'skipped',
        metadata: {
          action: 'invoice_payment_succeeded',
          stripeCustomerId: evt.data.object.customer as string,
          errorMessage: 'サブスクリプションに紐づかない請求書です',
        },
      };
    }

    // 最新のサブスクリプション（契約中の Price / 課金期間 / ステータス）を取得
    const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId);
    metrics.incrementApiCall("stripe");

    const customer = await deps.stripe.customers.retrieve(
      evt.data.object.customer as string
    ) as Stripe.Customer;
    metrics.incrementApiCall("stripe");


    // --- リファラルボーナス処理 (初回請求のみ) -------------------------
    // NOTE: 初回の invoice （billing_reason === 'subscription_create'）のみを対象とします。
    // Convex 側では invoice_id をユニークキーとして冪等性を担保してください。
    const isFirstInvoice = evt.data.object.billing_reason === 'subscription_create';
    // tenant_id をメタデータから取得。存在しない場合はエラー処理。
    const tenant_id = customer.metadata?.tenant_id as Id<'tenant'> | null;
    if (isFirstInvoice) {
      // Stripe Customer から referral_code を取得
      const referralCode = customer.metadata?.referral_code as string | null;

      // 未入力の場合は null になる想定
      if (referralCode && tenant_id) {
        try {
          await deps.retry(() =>
            fetchAction(
              deps.convex.tenant.referral.action.applyReferralBonus,
              {
                referral_code: referralCode,
                subscriber_tenant_id: tenant_id,
                invoice_id: evt.data.object.id,
              }
            )
          );
          metrics.incrementApiCall("convex");
        } catch (bonusErr) {
          // ボーナス処理失敗 → ログのみ、Subscription 更新は継続
          console.error(`[${eventId}] applyReferralBonus failed`, bonusErr);
          Sentry.captureException(bonusErr, {
            level: 'warning',
            tags: { ...context, operation: 'applyReferralBonus' },
          });
        }
      }
    }
    // --------------------------------------------------------------

    if (!tenant_id) {
        console.error(`[${eventId}] Webhook (invoice.payment_succeeded) のメタデータにtenant_idが含まれていません。subscriptionId: ${subscriptionId}`);
        Sentry.captureMessage('Webhook (invoice.payment_succeeded) のメタデータにtenant_idが含まれていません', {
            level: 'error',
            tags: { ...context, operation: 'handleInvoicePaymentSucceeded_tenant_id_missing' },
            extra: { metadata: evt.data.object.metadata, subscription_metadata: subscription.metadata }
        });
        return {
            result: 'error',
            errorMessage: '必要なtenant_idがメタデータに存在しません。',
            metadata: {
                action: 'invoice_payment_succeeded',
                stripeCustomerId: evt.data.object.customer as string,
                stripeSubscriptionId: subscriptionId,
            }
        };
    }
    try {
      // Subscription オブジェクトを正として同期。Subscription 側で Price が解決できない場合のみ
      // Invoice の定期課金行の Price にフォールバックする。
      const invoiceLine = findSubscriptionInvoiceLine(evt.data.object);
      const upsertArgs = buildSubscriptionUpsertArgs({
        subscription,
        tenant_id,
        stripe_customer_id: evt.data.object.customer as string,
        fallbackPrice: invoiceLine?.price,
      });

      if (upsertArgs.plan_name === 'UNKNOWN') {
        console.warn(
          `[${eventId}] InvoicePaymentSucceeded: プラン名を解決できませんでした。priceId=${upsertArgs.price_id}, subscriptionId=${subscriptionId}`
        );
        Sentry.captureMessage('Webhook (invoice.payment_succeeded) でプラン名を解決できませんでした', {
          level: 'warning',
          tags: { ...context, operation: 'handleInvoicePaymentSucceeded_plan_unknown' },
          extra: { price_id: upsertArgs.price_id, invoice_id: evt.data.object.id },
        });
      }

      await deps.retry(() =>
        fetchMutation(deps.convex.tenant.subscription.mutation.upsertSubscription, upsertArgs)
      );
      metrics.incrementApiCall("convex");
      console.log(`👤 [${eventId}] InvoicePaymentSucceeded処理完了: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}, plan_name=${upsertArgs.plan_name}, status=${upsertArgs.status}`, context);
    
    } catch (error) {
      console.error(`請求書 ${evt.data.object.id} のサブスクリプション同期に失敗しました:`, error);
      Sentry.captureException(error, {
        level: 'error',
        tags: {
          function: 'handleWebhookEvent_invoice_payment_succeeded',
        },
      });
      throw error;
    }
    return {
      result: 'success',
      metadata: {
        action: 'invoice_payment_succeeded',
        stripeCustomerId: evt.data.object.customer as string,
        stripeSubscriptionId: subscriptionId,
      }
    };
  } catch (error) {
    console.error(`❌ [${eventId}] InvoicePaymentSucceeded処理中に致命的なエラーが発生: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}`, { ...context, error });
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleInvoicePaymentSucceeded_main_catch' },
    });
    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}

export async function handleInvoicePaymentFailed(
/**
 * Stripe の Invoice 支払い失敗の Webhook イベントを処理
 * (invoice.payment_failed)
 *
 * @param evt - Stripe イベントオブジェクト
 * @param eventId - イベントID
 * @param deps - Webhook の依存関係 (Stripe インスタンスなど)
 * @param metrics - メトリクスコレクター
 * @returns イベント処理結果 ('success', 'skipped', 'error')
 */
  evt: Stripe.InvoicePaymentFailedEvent,
  eventId: string,
  deps: WebhookDependencies,
  metrics: WebhookMetricsCollector
): Promise<EventProcessingResult> {
// ------------------------------------------------------------
// 以下、実装の主な流れ
// 1. Stripe から必要な ID / ステータスを取得
// 2. Convex に同期 (retry & await で冪等・確実に書き込み)
//    ※ 乗り換え前の古いサブスクリプションのイベントは upsertSubscription 側で無視される
// 3. メトリクス収集で監視基盤に反映
// ------------------------------------------------------------
  
  const subscriptionId = getInvoiceSubscriptionId(evt.data.object);
  const context: LogContext = {
    eventId,
    eventType: 'invoice.payment_failed',
    stripeCustomerId: evt.data.object.customer as string,
    stripeSubscriptionId: subscriptionId ?? undefined,
  };
  console.log(`👤 [${eventId}] InvoicePaymentFailed処理開始: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}`, context);

  try {
    if (!subscriptionId) {
      // サブスクリプションに紐づかない請求書（単発請求など）は同期対象外
      console.log(`[${eventId}] InvoicePaymentFailed: サブスクリプションに紐づかない請求書のためスキップします。invoiceId=${evt.data.object.id}`);
      return {
        result: 'skipped',
        metadata: {
          action: 'invoice_payment_failed',
          stripeCustomerId: evt.data.object.customer as string,
          errorMessage: 'サブスクリプションに紐づかない請求書です',
        },
      };
    }

    // 失敗時も最新ステータスを確認して Convex に反映
    const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId);
    metrics.incrementApiCall("stripe");

    // tenant_id をメタデータから取得。存在しない場合はエラー処理。
    const customer = await deps.stripe.customers.retrieve(
      evt.data.object.customer as string
    ) as Stripe.Customer;
    metrics.incrementApiCall("stripe");
    const tenant_id = customer.metadata?.tenant_id as Id<'tenant'> | undefined;
    if (!tenant_id) {
      console.error(`[${eventId}] Webhook (invoice.payment_failed) のメタデータにtenant_idが含まれていません。subscriptionId: ${subscriptionId}`);
      Sentry.captureMessage('Webhook (invoice.payment_failed) のメタデータにtenant_idが含まれていません', {
          level: 'error',
          tags: { ...context, operation: 'handleInvoicePaymentFailed_tenant_id_missing' },
          extra: { metadata: evt.data.object.metadata, subscription_metadata: subscription.metadata }
      });
      return {
          result: 'error',
          errorMessage: '必要なtenant_idがメタデータに存在しません。',
          metadata: {
              action: 'invoice_payment_failed',
              stripeCustomerId: evt.data.object.customer as string,
              stripeSubscriptionId: subscriptionId,
          }
      };
    }
    try{
      const invoiceLine = findSubscriptionInvoiceLine(evt.data.object);
      await deps.retry(() =>
        fetchMutation(
          deps.convex.tenant.subscription.mutation.upsertSubscription,
          buildSubscriptionUpsertArgs({
            subscription,
            tenant_id,
            stripe_customer_id: evt.data.object.customer as string,
            fallbackPrice: invoiceLine?.price,
          })
        )
      );
      metrics.incrementApiCall("convex");
      
    } catch (error) {
      console.error(`❌ [${eventId}] InvoicePaymentFailed処理中に致命的なエラーが発生: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}`, { ...context, error });
      Sentry.captureException(error, {
        level: 'error',
        tags: { ...context, operation: 'handleInvoicePaymentFailed_main_catch' },
      });
      return {
        result: 'error',
        errorMessage: error instanceof Error ? `InvoicePaymentFailed処理中に致命的なエラーが発生、サブスクリプション状態が同期されてませんでした。: ${error.message}` : '不明なエラー'
      };
    }
    return {
      result: 'success',
      metadata: {
        action: 'invoice_payment_failed',
        stripeCustomerId: evt.data.object.customer as string,
        stripeSubscriptionId: subscriptionId,
      }
    };
  } catch (error) {
    console.error(`❌ [${eventId}] InvoicePaymentFailed処理中に致命的なエラーが発生: stripeCustomerId=${evt.data.object.customer}, stripeSubscriptionId=${subscriptionId}`, { ...context, error });
    Sentry.captureException(error, {
      level: 'error',
      tags: { ...context, operation: 'handleInvoicePaymentFailed_main_catch' },
    });
    return {
      result: 'error',
      errorMessage: error instanceof Error ? error.message : '不明なエラー'
    };
  }
}
