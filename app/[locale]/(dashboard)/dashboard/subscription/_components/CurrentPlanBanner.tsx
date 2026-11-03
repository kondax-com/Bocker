'use client'

// CurrentPlanBanner Component
// ------------------------------------------------------

import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'

interface CurrentPlanBannerProps {
  currentPlanName: string // プラン名（'Lite', 'Pro'）
  isActive: boolean
  onPortalAction: () => void
  isSubmitting: boolean
}

export default function CurrentPlanBanner({
  currentPlanName,
  isActive,
  onPortalAction,
  isSubmitting,
}: CurrentPlanBannerProps) {
  const t = useTranslations('subscription')

  // 現在のプラン名をメモ化（currentPlanNameは既にプラン名）
  const planName = useMemo(() => {
    return currentPlanName
  }, [currentPlanName])

  // ボタンコンテンツをメモ化
  const buttonContent = useMemo(() => {
    if (isSubmitting) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('processing')}
        </>
      )
    }
    return t('planAction.managePlan')
  }, [isSubmitting, t])

  // ポータルボタンクリックハンドラをメモ化
  const handlePortalClick = useCallback(() => {
    onPortalAction()
  }, [onPortalAction])

  if (!isActive) return null

  return (
    <div className="admin-panel w-full p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-secondary">
            <Check className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-primary">
              {t('currentPlan')}{' '}
              <span className="ml-2 text-xl font-semibold text-primary">{planName}</span>
            </p>
          </div>
        </div>
        <Button
          onClick={handlePortalClick}
          variant="default"
          size="sm"
          className="min-h-11 rounded-lg shadow-none"
          disabled={isSubmitting}
        >
          {buttonContent}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mt-3">{t('subscriptionActive')}</p>
    </div>
  )
}
