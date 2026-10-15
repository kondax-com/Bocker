/**
 * サブスクリプションミューテーションAPI
 *
 * サブスクリプション関連のデータを更新するためのミューテーションエンドポイントを提供します。
 * サービス層を利用して、データアクセスとビジネスロジックを分離します。
 */

import { mutation } from '../../_generated/server';
import { v } from 'convex/values';
import {
  validateStringLength
} from '@/convex/utils/validations';
import { archiveRecord, updateRecord, killRecord, createRecord } from '@/convex/utils/helpers';
import { checkAuth } from "@/convex/utils/auth";
import { billingPeriodType, subscriptionPlanNameType, subscriptionStatusType } from '@/convex/types';
import { isStaleSubscriptionEvent } from '@/convex/utils/subscription';

export const upsertSubscription = mutation({
  args: {
    tenant_id: v.id('tenant'),
    stripe_subscription_id: v.string(),
    stripe_customer_id: v.string(),
    status: subscriptionStatusType,
    price_id: v.string(),
    plan_name: subscriptionPlanNameType,
    billing_period: billingPeriodType,
    current_period_start: v.number(),
    current_period_end: v.number(),
  },
  handler: async (ctx, args) => {
    
    validateStringLength(args.stripe_subscription_id, 'stripe_subscription_id');
    validateStringLength(args.stripe_customer_id, 'stripe_customer_id');
    validateStringLength(args.price_id, 'price_id');
    validateStringLength(args.plan_name, 'plan_name');

    // 既存レコード探索戦略（重複作成防止）
    // 1) subscription_id で一致（通常の更新シナリオ）
    // 2) tenant_id で一致（テナント:サブスクリプション = 1:1 の想定）
    // 3) stripe_customer_id で一致（顧客IDは変わらないため安全なフォールバック）
    let existingSubscription = await ctx.db
      .query('subscription')
      .withIndex('by_stripe_subscription_archive', q =>
        q.eq('stripe_subscription_id', args.stripe_subscription_id).eq('is_archive', false)
      )
      .first();

    if (!existingSubscription) {
      existingSubscription = await ctx.db
        .query('subscription')
        .withIndex('by_tenant_archive', q => q.eq('tenant_id', args.tenant_id).eq('is_archive', false))
        .first();
    }

    if (!existingSubscription) {
      existingSubscription = await ctx.db
        .query('subscription')
        .withIndex('by_stripe_customer_archive', q =>
          q.eq('stripe_customer_id', args.stripe_customer_id).eq('is_archive', false)
        )
        .first();
    }

    // 別のサブスクリプションIDを持つ既存レコードが見つかった場合（tenant_id / customer_id で
    // フォールバック一致した場合）、届いたイベントが「乗り換え前の古いサブスクリプション」の
    // ものであれば無視する。支払い失敗 → 再決済で新しいサブスクリプションに切り替わった後、
    // 古いサブスクリプションの past_due / canceled イベントが遅れて届き、新しいレコードを
    // 巻き戻してしまうのを防ぐ。
    if (
      existingSubscription &&
      isStaleSubscriptionEvent({
        existing: {
          stripe_subscription_id: existingSubscription.stripe_subscription_id,
          current_period_start: existingSubscription.current_period_start,
        },
        incoming: {
          stripe_subscription_id: args.stripe_subscription_id,
          status: args.status,
          current_period_start: args.current_period_start * 1000,
        },
      })
    ) {
      console.warn(
        `[upsertSubscription] Ignored stale event for stripe_subscription_id=${args.stripe_subscription_id} (status=${args.status}); tenant is now tracking stripe_subscription_id=${existingSubscription.stripe_subscription_id}`
      );
      return existingSubscription._id;
    }

    // plan_name が UNKNOWN の場合、既存レコードに有効な値があれば上書きしない。
    // Stripe Webhook の Price/Product 解決に失敗した時に、既存の正しいプラン名が
    // UNKNOWN で潰されるのを防ぎ、次に成功した Webhook で自動復旧できるようにする。
    const resolved_plan_name =
      args.plan_name === 'UNKNOWN' &&
      existingSubscription &&
      existingSubscription.plan_name &&
      existingSubscription.plan_name !== 'UNKNOWN'
        ? existingSubscription.plan_name
        : args.plan_name;

    if (
      args.plan_name === 'UNKNOWN' &&
      resolved_plan_name !== 'UNKNOWN'
    ) {
      console.warn(
        `[upsertSubscription] Incoming plan_name was UNKNOWN; preserved existing plan_name="${resolved_plan_name}" for stripe_subscription_id=${args.stripe_subscription_id}`
      );
    }

    const payload = {
      ...args,
      plan_name: resolved_plan_name,
      current_period_start: args.current_period_start * 1000,
      current_period_end: args.current_period_end * 1000,
    };

    if (existingSubscription) {
      // 既存レコードを更新（新しい subscription_id に置き換わるケースもここで吸収）
      return await updateRecord(ctx, existingSubscription._id, payload);
    }

    // 見つからなければ新規作成
    return await createRecord(ctx, 'subscription', payload);
  },
});


/**
 * 支払い失敗（冪等性対応版）
 */
export const paymentFailed = mutation({
  args: {
    tenant_id: v.id('tenant'),
    stripe_customer_id: v.string(),
    status: subscriptionStatusType,
    transaction_id: v.optional(v.string()),
    price_id: v.string(),
    plan_name: subscriptionPlanNameType,
    billing_period: billingPeriodType,
    current_period_start: v.number(),
    current_period_end: v.number(),
    cancel_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.stripe_customer_id, 'stripe_customer_id');
    
    // サブスクリプションを検索
    const subscription = await ctx.db.query('subscription').withIndex('by_stripe_customer_archive', q => 
      q.eq('stripe_customer_id', args.stripe_customer_id)
      .eq('is_archive', false)
    ).first();

    // 冪等性対応: サブスクリプションが見つからない場合もエラーではなく成功として扱う
    if (!subscription) {
      console.log(`支払い失敗処理: サブスクリプションが見つかりません（冪等性により成功扱い）: ${args.stripe_customer_id}`);
      return { 
        success: true, 
        alreadyProcessed: true,
        message: 'サブスクリプションが既に削除済みまたは存在しません' 
      };
    }

    // 既に支払い失敗状態の場合は冪等性により何もしない
    if (subscription.status !== 'active') {
      console.log(`支払い失敗処理: 既に支払い失敗状態です（冪等性により成功扱い）: ${subscription.stripe_subscription_id}`);
      return { 
        success: true, 
        alreadyProcessed: true,
        message: '既に支払い失敗状態です' 
      };
    }

    // ステータスを更新
    const subscriptionResult = await ctx.db.patch(subscription._id, args);

    return { 
      success: true, 
      alreadyProcessed: false,
      result: subscriptionResult 
    };
  },
});

export const archive = mutation({
  args: {
    id: v.id('subscription'),
  },
  handler: async (ctx, args) => {
    return await archiveRecord(ctx, args.id);
  },
});

/**
 * サブスクリプション削除（冪等性対応版）
 */
export const kill = mutation({
  args: {
    stripe_subscription_id: v.string(),
  },
  handler: async (ctx, args) => {
    checkAuth(ctx, true);
    
    const subscription = await ctx.db.query('subscription')
      .filter((q) => q.eq(q.field('stripe_subscription_id'), args.stripe_subscription_id))
      .first();

    // 冪等性対応: サブスクリプションが見つからない場合もエラーではなく成功として扱う
    if (!subscription) {
      console.log(`kill処理: サブスクリプションが見つかりません（冪等性により成功扱い）: ${args.stripe_subscription_id}`);
      return { 
        success: true, 
        alreadyProcessed: true,
        message: 'サブスクリプションが既に削除済みまたは存在しません' 
      };
    }

    // サブスクリプションを削除
    await killRecord(ctx, subscription._id);

    return { 
      success: true, 
      alreadyProcessed: false,
      message: 'サブスクリプション削除が完了しました' 
    };
  },
});
