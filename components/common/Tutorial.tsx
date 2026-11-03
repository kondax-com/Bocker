'use client'

import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loading } from '@/components/common'
import { AlertTitle } from '@/components/ui/alert'

import {
  CheckCircle2,
  Clock,
  Store,
  Calendar,
  Menu,
  ArrowUpRight,
  Users,
  AlertCircle,
} from 'lucide-react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'

interface TutorialStep {
  id: number
  titleKey: string
  descriptionKey: string
  icon: React.ElementType
  required: boolean
  href: string
  checkLabelKey: string
}

export const Tutorial = () => {
  const { tenantId, orgId, ready, subscription } = useTenantAndOrganization()
  const t = useTranslations('common.tutorial')

  // 翻訳キーのみを保持するチュートリアル手順をメモ化して無限再レンダリングを防止
  const tutorialSteps: TutorialStep[] = useMemo(
    () => [
      {
        id: 1,
        titleKey: 'steps.storeInfo.title',
        descriptionKey: 'steps.storeInfo.description',
        icon: Store,
        required: true,
        href: '/dashboard/setting',
        checkLabelKey: 'steps.storeInfo.checkLabel',
      },
      {
        id: 2,
        titleKey: 'steps.businessHours.title',
        descriptionKey: 'steps.businessHours.description',
        icon: Calendar,
        required: true,
        href: '/dashboard/setting',
        checkLabelKey: 'steps.businessHours.checkLabel',
      },
      {
        id: 3,
        titleKey: 'steps.reservationSettings.title',
        descriptionKey: 'steps.reservationSettings.description',
        icon: Clock,
        required: true,
        href: '/dashboard/setting',
        checkLabelKey: 'steps.reservationSettings.checkLabel',
      },
      {
        id: 4,
        titleKey: 'steps.menuRegistration.title',
        descriptionKey: 'steps.menuRegistration.description',
        icon: Menu,
        required: true,
        href: '/dashboard/menu',
        checkLabelKey: 'steps.menuRegistration.checkLabel',
      },
      {
        id: 5,
        titleKey: 'steps.staffRegistration.title',
        descriptionKey: 'steps.staffRegistration.description',
        icon: Users,
        required: true,
        href: '/dashboard/staff/add',
        checkLabelKey: 'steps.staffRegistration.checkLabel',
      },
      {
        id: 6,
        titleKey: 'steps.staffSchedule.title',
        descriptionKey: 'steps.staffSchedule.description',
        icon: Calendar,
        required: true,
        href: '/dashboard/staff/schedule',
        checkLabelKey: 'steps.staffSchedule.checkLabel',
      },
    ],
    []
  )

  // 統合されたチュートリアル状態取得
  const tutorialStatus = useQuery(
    api.organization.tutorial.query.checkTutorialStatus,
    tenantId && orgId && ready
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip'
  )

  // チュートリアル完了ミューテーション
  const completeTutorial = useMutation(api.organization.tutorial.mutation.completeTutorial)

  // チュートリアル完了時の処理
  useEffect(() => {
    if (
      tutorialStatus &&
      !tutorialStatus.tutorialEnd &&
      tutorialStatus.completedSteps.length === tutorialSteps.length
    ) {
      // 全ステップ完了時にフラグを更新
      completeTutorial({
        tenant_id: tenantId!,
        org_id: orgId!,
      }).catch(console.error)
    }
  }, [tutorialStatus, tutorialSteps.length, completeTutorial, tenantId, orgId])

  const isStepCompleted = (stepId: number) =>
    tutorialStatus?.completedSteps.includes(stepId) || false
  const isAllRequiredStepsCompleted = () =>
    tutorialSteps.filter((s) => s.required).every((s) => isStepCompleted(s.id))

  const progress = tutorialStatus
    ? (tutorialStatus.completedSteps.length / tutorialSteps.length) * 100
    : 0

  // チュートリアル完了済みまたはデータ未ロードの場合
  if (!ready || !tutorialStatus) {
    return <Loading />
  }

  // チュートリアル完了済みの場合は何も表示しない
  if (tutorialStatus.tutorialEnd) {
    return null
  }
  return (
    <div
      className={`${subscription && (subscription.status === 'active' || subscription.status === 'trialing') ? 'min-w-0' : 'blur-sm pointer-events-none select-none'}`}
    >
      {!isAllRequiredStepsCompleted() && (
        <section
          aria-labelledby="setup-guide-title"
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
          <div className="flex flex-col gap-5 border-b border-border p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2">
              <h2 id="setup-guide-title" className="text-lg font-semibold text-foreground">
                {t('setupGuide.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('setupGuide.subtitle')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('setupGuide.subtitle2')}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 lg:w-48">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{t('completed')}</span>
                <span className="font-semibold tabular-nums text-primary">
                  {progress.toFixed(0)}%
                </span>
              </div>
              <Progress value={progress} aria-label={t('setupGuide.title')} className="h-1.5" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {tutorialSteps.map((step, index) => {
              const Icon = step.icon
              const completed = isStepCompleted(step.id)

              return (
                <Card key={step.id} className="flex flex-col rounded-xl border-border shadow-none">
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                        <Icon aria-hidden="true" className="size-5" />
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${completed ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}
                      >
                        {completed && <CheckCircle2 aria-hidden="true" className="size-3.5" />}
                        {completed
                          ? t('stepCompleted', { step: index + 1 })
                          : t('stepIncomplete', { step: index + 1 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-sm font-semibold text-foreground">{t(step.titleKey)}</h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t(step.descriptionKey)}
                      </p>
                    </div>
                  </div>
                  <CardContent className="px-4 pb-4 pt-0">
                    <Button
                      asChild
                      variant={completed ? 'outline' : 'secondary'}
                      className="min-h-11 w-full justify-between rounded-lg shadow-none"
                    >
                      <Link href={step.href}>
                        {completed ? t('checkSettings') : t('configure')}
                        <ArrowUpRight aria-hidden="true" className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {tutorialStatus.missingItems.length > 0 && tutorialStatus.missingItems.length < 3 && (
            <Card className="mx-4 mb-4 rounded-xl border-warning bg-warning text-warning-foreground shadow-none sm:mx-5 sm:mb-5">
              <CardHeader className="p-4 pb-2">
                <AlertTitle className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
                  {t('missingItems.title')}
                </AlertTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs">{t('missingItems.description')}</p>
                <ul className="mt-2 list-disc pl-5">
                  {tutorialStatus.missingItems.map((item, index) => (
                    <li key={index} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}
