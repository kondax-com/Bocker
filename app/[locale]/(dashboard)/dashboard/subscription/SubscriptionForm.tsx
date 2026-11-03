'use client'

import { useState, useCallback } from 'react'
import { useAction, Preloaded, usePreloadedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { PlanCard, BillingPeriodToggle, PreviewDialog, CurrentPlanBanner } from './_components'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BillingPeriod } from '@/convex/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { SUBSCRIPTION_PLANS } from '@/lib/constants'
import { getPriceNameFromPlanName, getPlanNameFromPriceId } from '@/lib/utils'
import { Doc } from '@/convex/_generated/dataModel'
import { StripePreviewData } from '@/lib/types'
import { Id } from '@/convex/_generated/dataModel'
import { PLAN_TRIAL_DAYS } from '@/lib/constants'
import { BASE_URL } from '@/lib/constants'
import { SubscriptionPlanName } from '@/convex/types'
import { useTranslations } from 'next-intl'

interface SubscriptionFormProps {
  tenantId: Id<'tenant'>
  orgId: Id<'organization'>
  tenantPreloaded: Preloaded<typeof api.tenant.query.findByUserId>
  subscriptionPreloaded: Preloaded<typeof api.tenant.subscription.query.findByStripeCustomerId>
}

function SubscriptionForm({
  tenantId,
  orgId,
  tenantPreloaded,
  subscriptionPreloaded,
}: SubscriptionFormProps) {
  const t = useTranslations('subscription')
  const tenant = usePreloadedQuery(tenantPreloaded)
  const subscription = usePreloadedQuery(subscriptionPreloaded)

  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState<StripePreviewData | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('month')
  const [updatePlanId, setUpdatePlanId] = useState<SubscriptionPlanName | null>(null)

  const createSession = useAction(api.tenant.subscription.action.createSubscriptionSession)
  const createBillingPortal = useAction(api.tenant.subscription.action.createBillingPortalSession)
  const getSubscriptionUpdatePreview = useAction(
    api.tenant.subscription.action.getSubscriptionUpdatePreview
  )
  const confirmSubscriptionUpdate = useAction(
    api.tenant.subscription.action.confirmSubscriptionUpdate
  )

  // 実際のプラン名（サーバーデータのみ使用）
  const displayPlanName: SubscriptionPlanName | null = subscription?.price_id
    ? getPlanNameFromPriceId(subscription.price_id)
    : null

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing' || false

  // メモ化したbillingPeriod設定関数
  const setBillingPeriodAction = useCallback((period: BillingPeriod) => {
    setBillingPeriod(period)
  }, [])

  // プレビュー取得関数をメモ化
  const handleGetPreview = useCallback(
    async (
      planName: SubscriptionPlanName,
      billingPeriod: BillingPeriod,
      overrideSubscriptionId?: string
    ) => {
      try {
        setIsSubmitting(true)

        // より厳密なバリデーション - 引数で渡されたIDを優先
        const subscriptionId = overrideSubscriptionId || subscription?.stripe_subscription_id
        const customerId = tenant?.stripe_customer_id

        if (!subscriptionId || subscriptionId === '') {
          throw new Error(t('errors.subscriptionIdNotFound'))
        }

        if (!customerId || customerId === '') {
          throw new Error(t('errors.customerIdNotFound'))
        }

        // previewデータを取得し状態を更新
        const result = await getSubscriptionUpdatePreview({
          tenant_id: tenant?._id,
          subscription_id: subscriptionId,
          org_id: orgId,
          new_price_id: getPriceNameFromPlanName(planName, billingPeriod),
          stripe_customer_id: customerId,
        })

        console.log('result', result)

        // プレビューデータを設定
        setPreviewData(result as StripePreviewData)
        // ダイアログを表示
        setShowConfirmDialog(true)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? t('errors.previewFetch', { message: err.message })
            : t('errors.previewUnexpected')
        setError(errorMessage)
        toast.error(errorMessage)
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      getSubscriptionUpdatePreview,
      subscription?.stripe_subscription_id,
      tenant?.stripe_customer_id,
      tenant?._id,
      orgId,
      t,
    ]
  )

  // サブスクリプション更新確認関数をメモ化
  const handleConfirmUpdate = useCallback(
    async (subscriptionId: string, newPriceId: string) => {
      try {
        setIsSubmitting(true)

        const result = await confirmSubscriptionUpdate({
          tenant_id: tenantId,
          org_id: orgId,
          subscription_id: subscriptionId,
          new_price_id: newPriceId,
          items: previewData?.items || [],
          proration_date: previewData?.prorationDate || 0,
        })

        if (result.success) {
          // サブスクリプションクエリの更新を待機
          const newPlanName = getPlanNameFromPriceId(newPriceId)
          let attempts = 0
          const maxAttempts = 10

          while (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 500))
            attempts++

            // 最新のサブスクリプションデータを確認
            const currentSubscription = subscription
            if (currentSubscription?.plan_name === newPlanName) {
              break
            }
          }

          toast.success(t('success.planUpdated'))

          // ダイアログを閉じる
          setShowConfirmDialog(false)

          // プレビューデータをクリア
          setPreviewData(null)
          setUpdatePlanId(null)

          // プラン更新完了
        } else {
          const errorMessage = t('errors.updateFailed')
          setError(errorMessage)
          toast.error(errorMessage)
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? t('errors.updateError', { message: err.message })
            : t('errors.updateUnexpected')
        setError(errorMessage)
        toast.error(errorMessage)

        // エラー時の処理
      } finally {
        setIsSubmitting(false)
      }
    },
    [confirmSubscriptionUpdate, previewData, tenantId, orgId, t, subscription]
  )

  // サブスクリプション作成関数をメモ化
  const handleSubscribe = useCallback(
    async (planName: SubscriptionPlanName, billingPeriod: BillingPeriod) => {
      // subscriptionオブジェクトからサブスクリプションIDを取得
      const subscriptionId = subscription?.stripe_subscription_id

      if (
        subscriptionId &&
        (subscription?.status === 'active' || subscription?.status === 'trialing')
      ) {
        // 既契約あり → プレビュー
        await handleGetPreview(planName, billingPeriod, subscriptionId)
        setUpdatePlanId(planName)
      } else {
        // 新規 → Checkout
        try {
          setIsSubmitting(true)
          const priceId = getPriceNameFromPlanName(planName, billingPeriod)
          const isTrial = !subscription

          const result = await createSession({
            tenant_id: tenantId,
            org_id: orgId,
            stripe_customer_id: tenant?.stripe_customer_id ?? '',
            user_id: tenant?.user_id ?? '',
            price_id: priceId,
            trial_days: isTrial ? 30 : undefined,
          })

          if (result?.checkoutUrl) {
            window.location.href = result.checkoutUrl
          } else {
            const errorMessage = t('errors.checkoutUrlFailed')
            setError(errorMessage)
            toast.error(errorMessage)
          }
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error
              ? t('errors.subscriptionError', { message: err.message })
              : t('errors.subscriptionUnexpected')
          setError(errorMessage)
          toast.error(errorMessage)
        } finally {
          setIsSubmitting(false)
        }
      }
    },
    [tenant, subscription, createSession, handleGetPreview, tenantId, orgId, t]
  )

  // 請求ポータル表示関数をメモ化
  const handleBillingPortal = useCallback(async () => {
    try {
      setIsSubmitting(true)

      const result = await createBillingPortal({
        tenant_id: tenantId,
        org_id: orgId,
        stripe_customer_id: tenant?.stripe_customer_id ?? '',
        return_url: `${BASE_URL}/dashboard/subscription`,
      })

      if (result?.portalUrl) {
        window.location.href = result.portalUrl
      } else {
        const errorMessage = t('errors.portalUrlFailed')
        setError(errorMessage)
        toast.error(errorMessage)
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? t('errors.portalError', { message: err.message })
          : t('errors.portalUnexpected')
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }, [createBillingPortal, tenant?.stripe_customer_id, tenantId, orgId, t])

  const handleMicroSubscribe = useCallback(() => {
    handleSubscribe('MICRO', billingPeriod)
  }, [handleSubscribe, billingPeriod])

  // 各プラン用のサブスクリプションハンドラをメモ化
  const handleLiteSubscribe = useCallback(() => {
    handleSubscribe('LITE', billingPeriod)
  }, [handleSubscribe, billingPeriod])

  const handleProSubscribe = useCallback(() => {
    handleSubscribe('PRO', billingPeriod)
  }, [handleSubscribe, billingPeriod])

  // Dialog の open 変更時の処理
  const handlePreviewOpenChange = useCallback((open: boolean) => {
    setShowConfirmDialog(open)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6">
      {/* ヘッダー部分 */}
      <div className="w-full text-center">
        <h1 className="mb-3 text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t('title')}
        </h1>
        <p className="mx-auto mb-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t('subtitle')}
        </p>

        {/* 支払い期間切り替え */}
        <BillingPeriodToggle
          billingPeriod={billingPeriod}
          setBillingPeriodAction={setBillingPeriodAction}
        />
      </div>

      {/* 現在のプラン表示 */}
      {displayPlanName && (
        <CurrentPlanBanner
          currentPlanName={displayPlanName}
          isActive={isActive}
          onPortalAction={handleBillingPortal}
          isSubmitting={isSubmitting}
        />
      )}
      <Separator className="w-full" />

      {/* プレビューダイアログ */}
      <PreviewDialog
        open={showConfirmDialog}
        setOpenAction={handlePreviewOpenChange}
        previewData={previewData}
        billingPeriod={billingPeriod}
        currentPlanName={displayPlanName}
        updatePlanName={updatePlanId ?? 'UNKNOWN'}
        tenant={tenant as Doc<'tenant'> | null}
        subscriptionId={subscription?.stripe_subscription_id || null}
        isSubmitting={isSubmitting}
        onConfirmAction={handleConfirmUpdate}
      />

      {/* プラン一覧 */}
      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Micro プラン */}
        <PlanCard
          title={t('microPlan')}
          description={t('microPlanDescription')}
          price={
            billingPeriod === 'month'
              ? (SUBSCRIPTION_PLANS.MICRO.monthly.price ?? 0)
              : (SUBSCRIPTION_PLANS.MICRO.yearly.price ?? 0)
          }
          savingPercent={
            billingPeriod === 'year'
              ? (Number(SUBSCRIPTION_PLANS.MICRO.yearly.savingPercent) ?? 0)
              : undefined
          }
          features={SUBSCRIPTION_PLANS.MICRO.features}
          currentPlanName={displayPlanName}
          planName="MICRO"
          billingPeriod={billingPeriod}
          currentBillingPeriod={subscription?.billing_period as BillingPeriod | undefined}
          isActive={isActive}
          onSubscribeAction={handleMicroSubscribe}
          onPortalAction={handleBillingPortal}
          isSubmitting={isSubmitting}
          highlightColor="from-palette-1 to-palette-1"
        />

        {/* Lite プラン */}
        <PlanCard
          title={t('litePlan')}
          description={t('litePlanDescription')}
          price={
            billingPeriod === 'month'
              ? (SUBSCRIPTION_PLANS.LITE.monthly.price ?? 0)
              : (SUBSCRIPTION_PLANS.LITE.yearly.price ?? 0)
          }
          savingPercent={
            billingPeriod === 'year'
              ? (Number(SUBSCRIPTION_PLANS.LITE.yearly.savingPercent) ?? 0)
              : undefined
          }
          features={SUBSCRIPTION_PLANS.LITE.features}
          currentPlanName={displayPlanName}
          planName="LITE"
          billingPeriod={billingPeriod}
          currentBillingPeriod={subscription?.billing_period as BillingPeriod | undefined}
          isActive={isActive}
          onSubscribeAction={handleLiteSubscribe}
          onPortalAction={handleBillingPortal}
          isSubmitting={isSubmitting}
          highlightColor="bg-gradient-to-br from-palette-2 to-palette-2"
        />

        {/* Pro プラン */}
        <PlanCard
          title={t('proPlan')}
          description={t('proPlanDescription')}
          price={
            billingPeriod === 'month'
              ? (SUBSCRIPTION_PLANS.PRO.monthly.price ?? 0)
              : (SUBSCRIPTION_PLANS.PRO.yearly.price ?? 0)
          }
          savingPercent={
            billingPeriod === 'year'
              ? (Number(SUBSCRIPTION_PLANS.PRO.yearly.savingPercent) ?? 0)
              : undefined
          }
          features={SUBSCRIPTION_PLANS.PRO.features}
          currentPlanName={displayPlanName}
          planName="PRO"
          billingPeriod={billingPeriod}
          currentBillingPeriod={subscription?.billing_period as BillingPeriod | undefined}
          isActive={isActive}
          onSubscribeAction={handleProSubscribe}
          onPortalAction={handleBillingPortal}
          isSubmitting={isSubmitting}
          isPopular={false}
          highlightColor="bg-gradient-to-br from-palette-4 to-palette-4"
        />
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="mt-8 w-full max-w-5xl">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* フッター部分 */}
      <div className="max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
        <p>
          {t('trialInfo.allPlansIncludeTrial', { days: PLAN_TRIAL_DAYS })}
          <br />
          {t('trialInfo.cancelAnytime')}
        </p>
      </div>
    </div>
  )
}

export default SubscriptionForm
