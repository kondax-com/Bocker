'use client'

// BillingPeriodToggle Component
// ------------------------------------------------------

import { cn } from '@/lib/utils'
import { BillingPeriod } from '@/convex/types'
import { useMemo, useCallback } from 'react'
import { SUBSCRIPTION_PLANS } from '@/lib/constants'
import { useTranslations } from 'next-intl'
interface BillingPeriodToggleProps {
  billingPeriod: BillingPeriod
  setBillingPeriodAction: (period: BillingPeriod) => void
}

export default function BillingPeriodToggle({
  billingPeriod,
  setBillingPeriodAction,
}: BillingPeriodToggleProps) {
  const t = useTranslations('subscription')
  const monthlyClickHandler = useCallback(
    () => setBillingPeriodAction('month'),
    [setBillingPeriodAction]
  )

  const yearlyClickHandler = useCallback(
    () => setBillingPeriodAction('year'),
    [setBillingPeriodAction]
  )

  const monthlyButtonClasses = useMemo(
    () =>
      cn(
        'px-4 py-2 rounded-full text-sm font-bold',
        billingPeriod === 'month'
          ? 'bg-primary shadow-sm text-primary-foreground'
          : 'text-secondary-foreground hover:text-secondary-foreground'
      ),
    [billingPeriod]
  )

  const yearlyButtonClasses = useMemo(
    () =>
      cn(
        'px-4 py-2 rounded-full text-sm font-bold',
        billingPeriod === 'year'
          ? 'bg-primary shadow-sm text-primary-foreground'
          : 'text-secondary-foreground hover:text-secondary-foreground'
      ),
    [billingPeriod]
  )

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5">
      <button
        onClick={monthlyClickHandler}
        aria-pressed={billingPeriod === 'month'}
        className={cn(monthlyButtonClasses, 'min-h-11 rounded-lg')}
      >
        {t('monthlyPayment')}
      </button>
      <button
        onClick={yearlyClickHandler}
        aria-pressed={billingPeriod === 'year'}
        className={cn(yearlyButtonClasses, 'min-h-11 rounded-lg')}
      >
        {t('yearlyPayment')}{' '}
        <span
          className={cn(
            'text-xs font-bold',
            billingPeriod === 'year' ? 'text-muted' : 'text-accent-2'
          )}
        >
          {t('yearlyDiscount', { percent: SUBSCRIPTION_PLANS.PRO.yearly.savingPercent })}
        </span>
      </button>
    </div>
  )
}
