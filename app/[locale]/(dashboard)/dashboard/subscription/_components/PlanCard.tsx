'use client'

// PlanCard Component
// ------------------------------------------------------
import { PLAN_TRIAL_DAYS, PLAN_CHARGE_MONTHS_YEARLY } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { SubscriptionPlanName } from '@/convex/types'
import { Check, Star, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BillingPeriod } from '@/convex/types'
import { Separator } from '@/components/ui/separator'
import { useMemo, useCallback, memo } from 'react'
import { useTranslations } from 'next-intl'
interface PlanCardProps {
  title: string
  description: string
  price: number
  savingPercent?: number
  features: string[]
  currentPlanName: SubscriptionPlanName | null // 現在のプラン名（'Lite', 'Pro'）
  planName: SubscriptionPlanName // このカードのプラン名（'Lite', 'Pro'）
  billingPeriod: BillingPeriod
  currentBillingPeriod?: BillingPeriod
  isActive: boolean
  onSubscribeAction: () => void
  onPortalAction: () => void
  isSubmitting: boolean
  isPopular?: boolean
  highlightColor: string
}

const PlanCard = memo(function PlanCard({
  title,
  description,
  price,
  savingPercent,
  features,
  currentPlanName,
  planName,
  billingPeriod,
  currentBillingPeriod,
  isActive,
  onSubscribeAction,
  onPortalAction,
  isSubmitting,
  isPopular = false,
  highlightColor,
}: PlanCardProps) {
  const t = useTranslations('subscription')
  // 現在のプランかどうかのチェックをメモ化
  const isCurrentPlan = useMemo(() => {
    return currentPlanName === planName && currentBillingPeriod === billingPeriod
  }, [currentPlanName, planName, currentBillingPeriod, billingPeriod])

  // 支払い期間が変更されているかのチェックをメモ化
  const isBillingPeriodChange = useMemo(() => {
    return currentPlanName === planName && currentBillingPeriod !== billingPeriod
  }, [currentPlanName, planName, currentBillingPeriod, billingPeriod])

  // 月額換算価格をメモ化
  const monthlyEquivalent = useMemo(() => {
    if (billingPeriod === 'year') {
      return Math.floor(
        (((price + price * 0.2) / 12) * (12 - PLAN_CHARGE_MONTHS_YEARLY)) / 12
      ).toLocaleString()
    }
    return null
  }, [billingPeriod, price])

  // サブスクリプションアクションのハンドラーをメモ化
  const handleSubscribe = useCallback(() => {
    onSubscribeAction()
  }, [onSubscribeAction])

  // ポータルアクションのハンドラーをメモ化
  const handlePortal = useCallback(() => {
    onPortalAction()
  }, [onPortalAction])

  // カードのスタイリングをメモ化
  const cardStyle = useMemo(() => {
    return cn(
      'h-full shadow-xl border overflow-hidden bg-card relative',
      isPopular ? 'border-2 border-accent-2' : ''
    )
  }, [isPopular])

  return (
    <div className={cn('relative', isPopular ? 'md:-mt-4 md:mb-4' : '')}>
      {isPopular && (
        <div className="absolute -top-4 left-0 right-0 z-10 flex justify-center">
          <Badge className="bg-warning border-warning-foreground text-warning-foreground px-4 py-2 rounded-full text-sm font-semibold shadow-md">
            <Star className="w-4 h-4 mr-1" />
            {t('mostPopular')}
          </Badge>
        </div>
      )}

      <Card className={cn(cardStyle, 'flex flex-col rounded-2xl border-border shadow-sm')}>
        <div className={`absolute h-1.5 bg-gradient-to-r ${highlightColor} top-0 left-0 right-0`} />

        <CardHeader className="gap-3 pb-2 pt-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-xl font-semibold text-foreground">{title}</CardTitle>
            {isCurrentPlan && isActive && (
              <Badge
                variant="default"
                className="rounded-full border-0 bg-secondary px-3 py-1 text-secondary-foreground"
              >
                {t('currentPlan')}
              </Badge>
            )}
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-4">
          <div className="mb-4">
            <div className="flex items-baseline">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                ¥{price.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                {billingPeriod === 'month' ? t('perMonth') : t('perYear')}
              </span>
            </div>
            {billingPeriod === 'year' && savingPercent && (
              <div className="text-xs text-active font-medium mt-1">
                {t('yearlyBenefit', { percent: savingPercent })}
              </div>
            )}
            {billingPeriod === 'year' && (
              <div className="text-xs text-muted-foreground mt-1">
                {t('monthlyEquivalent', { amount: monthlyEquivalent ?? 0 })}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          <ul className="my-6 flex-1 space-y-3">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-active flex-shrink-0">
                  <Check className="h-4 w-4" />
                </span>
                <span>{t(feature)}</span>
              </li>
            ))}
          </ul>

          <PlanActionButton
            isActive={isActive}
            isCurrentPlan={isCurrentPlan}
            isBillingPeriodChange={isBillingPeriodChange ?? false}
            currentPlanName={currentPlanName}
            planName={planName}
            currentBillingPeriod={currentBillingPeriod}
            billingPeriod={billingPeriod}
            onSubscribeAction={handleSubscribe}
            onPortalAction={handlePortal}
            isSubmitting={isSubmitting}
            highlightColor={highlightColor}
          />
        </CardContent>

        <CardFooter className="justify-center px-6 pb-5 pt-2 text-center text-xs text-muted-foreground">
          <p>{t('trialInfo.daysFreeTrial', { days: PLAN_TRIAL_DAYS })}</p>
        </CardFooter>
      </Card>
    </div>
  )
})

export default PlanCard

interface PlanActionButtonProps {
  isActive: boolean
  isCurrentPlan: boolean
  isBillingPeriodChange: boolean
  currentPlanName: string | null
  planName: string
  currentBillingPeriod?: BillingPeriod
  billingPeriod: BillingPeriod
  onSubscribeAction: () => void
  onPortalAction: () => void
  isSubmitting: boolean
  highlightColor: string
}

function PlanActionButton({
  isActive,
  isCurrentPlan,
  isBillingPeriodChange,
  currentPlanName,
  planName,
  currentBillingPeriod,
  billingPeriod,
  onSubscribeAction,
  onPortalAction,
  isSubmitting,
  highlightColor,
}: PlanActionButtonProps) {
  const t = useTranslations('subscription')
  const highlightForeground =
    planName === 'MICRO'
      ? 'text-palette-1-foreground'
      : planName === 'LITE'
        ? 'text-palette-2-foreground'
        : 'text-palette-4-foreground'

  // サブスクリプションアクションハンドラをメモ化
  const handleSubscribe = useCallback(() => {
    onSubscribeAction()
  }, [onSubscribeAction])

  // ポータルアクションハンドラをメモ化
  const handlePortal = useCallback(() => {
    onPortalAction()
  }, [onPortalAction])

  // ボタンの表示テキストをメモ化
  const buttonText = useMemo(() => {
    if (isBillingPeriodChange) {
      return (
        <span className="flex items-center gap-1">
          {billingPeriod === 'year'
            ? t('changeBillingCycle.toYearly')
            : t('changeBillingCycle.toMonthly')}
        </span>
      )
    } else if (currentPlanName === planName) {
      return <span className="flex items-center gap-1">{t('planAction.currentPlan')}</span>
    } else {
      return <span className="flex items-center gap-1">{t('planAction.changePlan')}</span>
    }
  }, [isBillingPeriodChange, billingPeriod, currentPlanName, planName, t])

  // ボタンが無効かどうかをメモ化
  const isButtonDisabled = useMemo(() => {
    return currentPlanName === planName && currentBillingPeriod === billingPeriod
  }, [currentPlanName, planName, currentBillingPeriod, billingPeriod])

  if (isSubmitting)
    return (
      <Button disabled className="min-h-11 w-full rounded-lg">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('processing')}
      </Button>
    )

  if (isActive) {
    if (isCurrentPlan) {
      return (
        <Button
          onClick={handlePortal}
          className={`min-h-11 w-full whitespace-normal rounded-lg bg-gradient-to-r ${highlightColor} hover:brightness-110 ${highlightForeground}`}
        >
          {t('planAction.managePlan')}
        </Button>
      )
    } else if (isBillingPeriodChange) {
      return (
        <Button
          onClick={handleSubscribe}
          className={`min-h-11 w-full whitespace-normal rounded-lg bg-gradient-to-r ${highlightColor} hover:brightness-110 ${highlightForeground}`}
        >
          {buttonText}
        </Button>
      )
    } else {
      return (
        <Button
          onClick={handleSubscribe}
          className={`min-h-11 w-full whitespace-normal rounded-lg bg-gradient-to-r ${highlightColor} hover:brightness-110 ${highlightForeground}`}
          disabled={isButtonDisabled}
        >
          {buttonText}
        </Button>
      )
    }
  }

  return (
    <Button
      onClick={handleSubscribe}
      className={`min-h-11 w-full whitespace-normal rounded-lg bg-gradient-to-r ${highlightColor} hover:brightness-110 ${highlightForeground}`}
    >
      {t('planAction.startNow')}
      <ArrowRight className="ml-1.5 h-4 w-4" />
    </Button>
  )
}
