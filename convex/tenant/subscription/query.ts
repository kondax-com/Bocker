/**
 * サブスクリプションクエリAPI
 *
 * サブスクリプション関連の情報を取得するためのクエリエンドポイントを提供します。
 * サービス層を利用して、データアクセスとビジネスロジックを分離します。
 */

import { v } from 'convex/values';
import { validateStringLength } from '@/convex/utils/validations';
import { query } from '../../_generated/server';
import { ConvexError } from 'convex/values';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';


export const getSubscription = query({
  args: {
    tenant_id: v.id('tenant')
  },
  handler: async (ctx, args) => {
    return await ctx.db.query('subscription').withIndex('by_tenant_archive', (q) => q.eq('tenant_id', args.tenant_id).eq('is_archive', false)).first();
  },
});

/**
 * Stripe サブスクリプションIDでサブスクリプションを検索
 *
 * Webhook (customer.subscription.deleted など) が「どのサブスクリプションに関する
 * イベントか」を厳密に照合するために使用する。顧客IDでの検索は、テナントが
 * 再決済で別のサブスクリプションに乗り換えた後に古いサブスクリプションの
 * イベントが届いた場合、新しいレコードを誤って操作してしまうため使わない。
 */
export const findByStripeSubscriptionId = query({
  args: {
    stripe_subscription_id: v.string(),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.stripe_subscription_id, 'stripe_subscription_id');
    return await ctx.db
      .query('subscription')
      .withIndex('by_stripe_subscription_archive', (q) =>
        q.eq('stripe_subscription_id', args.stripe_subscription_id).eq('is_archive', false)
      )
      .first();
  },
});

/**
 * Stripe顧客IDでサブスクリプションを検索
 */
export const findByStripeCustomerId = query({
  args: {
    stripe_customer_id: v.string(),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.stripe_customer_id, 'stripe_customer_id');
    return await ctx.db
      .query('subscription')
      .withIndex('by_stripe_customer_archive', (q) => q.eq('stripe_customer_id', args.stripe_customer_id).eq('is_archive', false))
      .first();
  },
});

/**
 * ClerkユーザーEmailでサブスクリプションを検索
 */
export const getByUserEmail = query({
  args: {
    user_email: v.string(),
  },
  handler: async (ctx, args) => {
    validateStringLength(args.user_email, 'user_email');
    const tenant = await ctx.db
      .query('tenant')
      .withIndex('by_user_email_archive', (q) => q.eq('user_email', args.user_email).eq('is_archive', false))
      .first();

    if (!tenant) {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'tenant.subscription.query.getByUserEmail',
        message: 'テナントが見つかりません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      });
    }

    if (!tenant.stripe_customer_id || tenant.stripe_customer_id === '') {
      throw new ConvexError({
        statusCode: ERROR_STATUS_CODE.NOT_FOUND,
        severity: ERROR_SEVERITY.ERROR,
        callFunc: 'tenant.subscription.query.getByUserEmail',
        message: 'Stripe顧客IDが見つかりません',
        code: 'NOT_FOUND',
        status: 404,
        details: {
          ...args,
        },
      });
    }
    const subscription = await ctx.db
      .query('subscription')
      .withIndex('by_stripe_customer_archive', (q) => q.eq('stripe_customer_id', tenant.stripe_customer_id!).eq('is_archive', false))
      .first();
    return subscription;
  },
});