'use node';
import Stripe from 'stripe';
import { api } from '@/convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { Id } from '@/convex/_generated/dataModel';
import { StripeResult } from '@/services/stripe/types';
import { SystemError } from '@/lib/errors/custom_errors';
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants';
import { BASE_URL } from '@/lib/constants';
import { determineAccountStatus } from '../../webhook/stripe/handlers.connect';
import { getEnv } from '@/lib/env-config';
/**
 * Stripe Connect APIを扱うリポジトリクラス
 */
export class StripeConnectRepository {
  private static instance: StripeConnectRepository | null = null;
  private convex: ConvexHttpClient;
  private isDevelopment: boolean;

  private constructor(private stripe: Stripe) {
    // Convexクライアントの初期化
    this.convex = new ConvexHttpClient(getEnv('NEXT_PUBLIC_CONVEX_URL'));

    // 開発環境かどうか
    this.isDevelopment = getEnv('NODE_ENV') === 'development';
  }

  public static getInstance(stripe: Stripe): StripeConnectRepository {
    if (!StripeConnectRepository.instance) {
      StripeConnectRepository.instance = new StripeConnectRepository(stripe);
    }
    return StripeConnectRepository.instance;
  }

  /**
   * 手動でアカウントステータスを確認・更新
   */
  async checkAndUpdateConnectAccountStatus(
    stripe_account_id: string
  ): Promise<
    StripeResult<{
      status: string;
      details: {
        details_submitted: boolean;
        charges_enabled: boolean;
        payouts_enabled: boolean;
        requirements: {
          currently_due: NonNullable<Stripe.Account.Requirements['currently_due']>;
          errors: NonNullable<Stripe.Account.Requirements['errors']>;
        };
      };
    }>
  > {
    try {
      // Stripeからアカウント情報を取得
      const account = await this.stripe.accounts.retrieve(stripe_account_id);

      // ステータスを判定
      const status = determineAccountStatus(account);

      // Convexにステータスを保存
      await this.convex.mutation(api.organization.mutation.updateConnectStatus, {
        stripe_account_id,
        stripe_connect_status: status,
      });

      return {
        success: true,
        data: {
          status,
          details: {
            details_submitted: account.details_submitted,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
            requirements: {
              currently_due: account.requirements?.currently_due || [],
              errors: account.requirements?.errors || [],
            },
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
      }
    }
  }

  /**
   * StripeConnectアカウント連携用のアカウントリンクを生成
   */
  async createConnectAccountLink(
    tenant_id: Id<'tenant'>,
    org_id: Id<'organization'>,
  ): Promise<StripeResult<{ account: Stripe.Account; accountLink: Stripe.AccountLink }>> {
    try {
      // 既存のアカウントを検索
      const existingOrganization = await this.convex.query(
        api.organization.query.findByOrgId,
        {
          org_id,
        }
      );

      // 既存のアカウントがあれば削除
      if (existingOrganization && existingOrganization.stripe_account_id) {
        try {
          // Stripeアカウントを削除
          await this.stripe.accounts.del(existingOrganization.stripe_account_id);
        } catch (deleteError) {
          throw new SystemError(
            'Stripeアカウントの削除に失敗しました。既存のアカウントがある場合は削除してください。',
            {
            statusCode: ERROR_STATUS_CODE.INTERNAL_SERVER_ERROR,
            severity: ERROR_SEVERITY.ERROR,
            callFunc: 'StripeConnectRepository.createConnectAccountLink',
            message: 'Stripeアカウントの削除に失敗しました。既存のアカウントがある場合は削除してください。',
            code: 'INTERNAL_SERVER_ERROR',
            status: 500,
            details: {
              error: deleteError instanceof Error ? deleteError.message : '不明なエラー',
            },
          });
        }
      }

      // Stripe Connect アカウントを作成/
      const account = await this.stripe.accounts.create({
        type: 'express',
        country: 'JP',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          mcc: '7230', // Beauty salon & barber shops
          url: BASE_URL,
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'monthly',
              monthly_anchor: 25,
            },
            statement_descriptor: 'BOCKER PAYMENT',
          },
        },
        metadata: {
          tenant_id: tenant_id,
          org_id: org_id,
        },
      })

      // Convexに接続情報を保存
      await this.convex.mutation(api.organization.mutation.createConnectAccount, {
        tenant_id: tenant_id,
        org_id: org_id,
        stripe_account_id: account.id,
      });

      const accountLink = await this.stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${BASE_URL}/dashboard/setting?refresh=true`,
        return_url: `${BASE_URL}/dashboard/setting?success=true`,
        type: 'account_onboarding',
      });

      return { success: true, data: { account, accountLink } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
      };
    }
  }

  /**
   * Stripe Expressダッシュボードへのログインリンクを生成
   */
  async createConnectAccountDashboardLink(
    accountId: string
  ): Promise<StripeResult<{ url: string; isOnboarding?: boolean }>> {
    try {
      // アカウントの詳細情報を取得して状態を確認
      const account = await this.stripe.accounts.retrieve(accountId);

      // オンボーディングが完了しているかを確認
      const isOnboardingComplete = account.details_submitted;

      if (!isOnboardingComplete) {
        // オンボーディングが完了していない場合、アカウントリンク（オンボーディング用）を生成
        const accountLink = await this.stripe.accountLinks.create({
          account: accountId,
          refresh_url: `${BASE_URL}/dashboard/setting?refresh=true`,
          return_url: `${BASE_URL}/dashboard/setting?success=true`,
          type: 'account_onboarding',
        });

        return {
          success: true,
          data: {
            url: accountLink.url,
            isOnboarding: true,
          },
        };
      }

      // オンボーディングが完了している場合は、ダッシュボードログインリンクを生成
      const loginLink = await this.stripe.accounts.createLoginLink(accountId);
      return { success: true, data: { url: loginLink.url, isOnboarding: false } };
    } catch (error) {
      let errorMessage: string;

      if (error instanceof Stripe.errors.StripeError) {
        if (error.code === 'account_invalid') {
          errorMessage = 'このアカウントは現在利用できません。Stripeの設定を完了してください。';
        } else {
          errorMessage = error instanceof Error ? error.message : '不明なエラー';
        }
      } else {
        errorMessage = error instanceof Error ? error.message : '不明なエラー';
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Stripe Checkoutセッションを作成
   */
  async createCheckoutSession(params: {
    stripe_account_id: string; // 支払いを受け取るStripe ConnectアカウントID
    tenant_id: Id<'tenant'>;
    org_id: Id<'organization'>;
    reservation_id: Id<'reservation'>;
    line_items: Stripe.Checkout.SessionCreateParams.LineItem[];
    customer_email?: string;
    success_url: string;
    cancel_url: string;
    metadata?: Record<string, string>;
  }): Promise<StripeResult<{ sessionId: string; url: string | null }>> {
    const {
      stripe_account_id,
      tenant_id,
      org_id,
      reservation_id,
      line_items,
      customer_email,
      success_url,
      cancel_url,
      metadata,
    } = params;

    try {
      const default_fee_amount = 40;// 40円固定
      const percentage_fee = 0.04;// 4%
      const fee_amount = Math.floor(line_items.reduce((sum, item) => sum + (item.price_data?.unit_amount_decimal ? parseFloat(item.price_data.unit_amount_decimal) : item.price_data?.unit_amount || 0),0) * percentage_fee) + default_fee_amount;
      const reservationMetadata = {
        ...metadata,
        reservation_id,
        stripe_account_id,
        tenant_id,
        org_id,
      };
      const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        line_items: line_items,
        mode: 'payment',
        success_url: success_url,
        cancel_url: cancel_url,
        customer_email: customer_email,
        client_reference_id: reservation_id,
        payment_intent_data: {
          metadata: reservationMetadata,
          application_fee_amount: fee_amount,
          transfer_data: {
            destination: stripe_account_id,
          },
        },
        metadata: reservationMetadata,
      };
      
      const session = await this.stripe.checkout.sessions.create(sessionCreateParams);

      if (!session.url) {
        throw new Error('CheckoutセッションURLが取得できませんでした。');
      }

      return {
        success: true,
        data: { sessionId: session.id, url: session.url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
      };
    }
  }

  /**
   * 割引を適用
   */
  async applyDiscount(
    stripeSubscriptionId: string,
    couponId: string
  ): Promise<StripeResult<{ verificationResult: { before: number; after: number; discountApplied: boolean; couponId: string } }>> {
    try {
      // 1. 割引適用前のサブスクリプション情報を取得
      const subscriptionBefore = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);
      const amountBefore = subscriptionBefore.items.data.reduce((sum, item) => sum + (item.price.unit_amount || 0), 0);

      // 既に割引が適用されている場合はスキップ
      if (subscriptionBefore.discount) {
        console.log(
          `[applyDiscount] 既存クーポンが存在するためスキップ: sub=${stripeSubscriptionId}, coupon=${subscriptionBefore.discount.coupon.id}`
        );
        return {
          success: true,
          data: {
            verificationResult: {
              before: amountBefore / 100,
              after: amountBefore / 100,
              discountApplied: false,
              couponId: subscriptionBefore.discount.coupon.id,
            },
          },
        };
      }

      // 2. クーポンをサブスクリプションに適用
      await this.stripe.subscriptions.update(stripeSubscriptionId, {
        coupon: couponId,
      });

      // 3. 適用後のサブスクリプション情報を取得
      const subscriptionAfter = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

      // 4. 割引適用検証
      const verificationResult = this.verifyDiscountApplication(subscriptionBefore, subscriptionAfter, couponId);

      return {
        success: true,
        data: {
          verificationResult: {
            ...verificationResult,
            couponId,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー',
      };
    }
  }

  /**
   * 割引適用の検証を行う
   */
  private verifyDiscountApplication(
    subscriptionBefore: Stripe.Subscription,
    subscriptionAfter: Stripe.Subscription,
    couponId: string
  ): { before: number; after: number; discountApplied: boolean } {
    const amountBefore = subscriptionBefore.items.data.reduce((sum, item) => sum + (item.price.unit_amount || 0), 0);

    const discountInfo = subscriptionAfter.discount;
    const isDiscountApplied = !!discountInfo && discountInfo.coupon.id === couponId;

    // 割引後金額 = 適用前 – amount_off または percent_off
    let amountAfterYen = amountBefore;
    if (discountInfo?.coupon.amount_off) {
      amountAfterYen = amountBefore - discountInfo.coupon.amount_off;
    } else if (discountInfo?.coupon.percent_off) {
      amountAfterYen = Math.round(amountBefore * (1 - discountInfo.coupon.percent_off / 100));
    }
    const amountAfter = amountAfterYen;

    return {
      before: amountBefore / 100,
      after: amountAfter / 100,
      discountApplied: isDiscountApplied,
    };
  }
}
