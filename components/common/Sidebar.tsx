'use client'

import { ModeToggle } from './'
import { useTranslations } from 'next-intl'
import { usePathname, Link } from '@/i18n/navigation'
import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { Separator } from '@/components/ui/separator'
import { Loading } from './'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  TransitionChild,
} from '@headlessui/react'
import { ChevronRight, MenuIcon, XIcon } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { useTheme } from 'next-themes'
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { hasAccess } from '@/lib/utils'
import type { SubscriptionPlanName } from '@/convex/types'
import { NAV_GROUPS, DASHBOARD_ITEM, type NavGroup } from '@/lib/constants'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { UserIcon } from 'lucide-react'
import { Id } from '@/convex/_generated/dataModel'
import { Role } from '@/convex/types'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

// プラン名を正規化する関数（データベースの値をTypeScript型に合わせる）
function normalizePlanName(planName: string | undefined | null): SubscriptionPlanName {
  console.log('[normalizePlanName] Input:', planName, 'Type:', typeof planName)

  if (!planName) {
    console.log('[normalizePlanName] planName is falsy, returning UNKNOWN')
    return 'UNKNOWN'
  }

  const normalizedName = planName.toUpperCase().trim()
  console.log('[normalizePlanName] Normalized:', normalizedName)

  switch (normalizedName) {
    case 'MICRO':
      console.log('[normalizePlanName] Matched MICRO')
      return 'MICRO'
    case 'LITE':
      console.log('[normalizePlanName] Matched LITE')
      return 'LITE'
    case 'PRO':
      console.log('[normalizePlanName] Matched PRO')
      return 'PRO'
    default:
      console.log('[normalizePlanName] No match found, returning UNKNOWN for:', normalizedName)
      return 'UNKNOWN'
  }
}

// 共通コンポーネント: サイドバーヘッダー（ロゴとタイトル）
const SidebarHeader = memo(
  ({
    mounted,
    resolvedTheme,
    isMobile = false,
    showModeToggle = false,
  }: {
    mounted: boolean
    resolvedTheme: string | undefined
    isMobile?: boolean
    showModeToggle?: boolean
  }) => {
    const t = useTranslations('sidebar')
    return (
      <div className="relative flex flex-col gap-3 px-2 pb-1 pt-6">
        <div className="flex items-center gap-2.5">
          <Image
            src={
              mounted && resolvedTheme === 'dark'
                ? '/assets/images/logo-white.png'
                : '/assets/images/logo-darkgreen.png'
            }
            alt=""
            width={34}
            height={34}
            priority
          />
          <p className="text-2xl font-semibold tracking-tight text-foreground" translate="no">
            Bocker
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('tagline')}</p>
        {isMobile && showModeToggle && (
          <div className="absolute right-0 top-6 lg:hidden">
            <ModeToggle />
          </div>
        )}
      </div>
    )
  }
)
SidebarHeader.displayName = 'SidebarHeader'

// 共通コンポーネント: ナビゲーション部分
const SidebarNavigation = memo(
  ({
    filteredGroups,
    staffId,
    role,
    pathname,
    isSubscriptionActive,
    currentPlan,
    isMobile = false,
  }: {
    filteredGroups: NavGroup[]
    staffId: Id<'staff'> | null
    role: Role | null
    pathname: string
    isSubscriptionActive: boolean
    currentPlan: SubscriptionPlanName
    isMobile?: boolean
  }) => {
    const t = useTranslations('sidebar')
    const tNav = useTranslations('navigation')
    const tGroups = useTranslations('navigationGroups')

    // 現在のパスに基づいてアクティブなグループを決定
    const getActiveGroup = useCallback(() => {
      return filteredGroups.find((group) => group.items.some((item) => pathname === item.href))
    }, [filteredGroups, pathname])

    // 現在のパスに基づいて開くグループを決定
    const getOpenGroups = useCallback(() => {
      const activeGroup = getActiveGroup()
      return activeGroup ? [activeGroup.id] : []
    }, [getActiveGroup])

    // アコーディオンの開閉状態を管理
    const [openGroups, setOpenGroups] = useState<string[]>(getOpenGroups())

    // パスが変更されたらアクティブなグループを開く
    useEffect(() => {
      const newOpenGroups = getOpenGroups()
      setOpenGroups(newOpenGroups)
    }, [getOpenGroups])

    return (
      <nav className="flex flex-1 flex-col" aria-label={tNav('dashboard')}>
        {!isSubscriptionActive ? (
          <>
            <div className="my-2 flex flex-col rounded-xl bg-muted p-4">
              <p className="text-xs text-muted-foreground">
                <span className="inline-block font-bold mb-2">{t('subscriptionRequired')}</span>
                <br />
                {t('subscriptionRequiredDetail')}
              </p>
            </div>
            <Button asChild className="mt-2 min-h-11 w-full whitespace-normal text-xs">
              <Link href="/dashboard/subscription">{t('goToSubscription')}</Link>
            </Button>
          </>
        ) : (
          <div className="flex flex-1 flex-col">
            {/* マイページ */}
            {staffId && (
              <div className="mb-3">
                <Link
                  href={`/dashboard/staff/${staffId}/my-page`}
                  aria-current={
                    pathname === `/dashboard/staff/${staffId}/my-page` ? 'page' : undefined
                  }
                  className={classNames(
                    pathname === `/dashboard/staff/${staffId}/my-page`
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'bg-muted/60 text-foreground hover:bg-muted',
                    'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                  )}
                >
                  <UserIcon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span className="min-w-0 break-words">{tNav('myPage')}</span>
                </Link>
              </div>
            )}

            {/* ダッシュボード（常に表示） */}
            {hasAccess(
              role as Role,
              currentPlan,
              DASHBOARD_ITEM.minRole,
              DASHBOARD_ITEM.minPlan
            ) && (
              <div className="mb-2">
                <Link
                  href={DASHBOARD_ITEM.href}
                  aria-current={pathname === DASHBOARD_ITEM.href ? 'page' : undefined}
                  className={classNames(
                    pathname === DASHBOARD_ITEM.href
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'text-foreground hover:bg-muted',
                    'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                  )}
                >
                  <DASHBOARD_ITEM.icon aria-hidden="true" className="size-[18px] shrink-0" />
                  <span className="min-w-0 break-words">{tNav(DASHBOARD_ITEM.name)}</span>
                </Link>
              </div>
            )}

            {/* アコーディオンナビゲーション */}
            <Accordion
              type="multiple"
              value={openGroups}
              onValueChange={setOpenGroups}
              className="flex w-full flex-col gap-2"
            >
              {filteredGroups.map((group) => {
                return (
                  <AccordionItem key={group.id} value={group.id} className="border-b-0">
                    <AccordionTrigger
                      className={classNames(
                        'min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isMobile ? 'text-sm' : ''
                      )}
                    >
                      <div className="flex items-center gap-2">{tGroups(group.name)}</div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-1">
                      <ul className="flex flex-col gap-1">
                        {group.items.map((item) => {
                          const isCurrent = pathname === item.href
                          return (
                            <li key={item.name}>
                              <Link
                                href={item.href}
                                aria-current={isCurrent ? 'page' : undefined}
                                className={classNames(
                                  isCurrent
                                    ? 'bg-primary font-semibold text-primary-foreground'
                                    : 'text-foreground hover:bg-muted',
                                  'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card'
                                )}
                              >
                                <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                                <span className="min-w-0 break-words">{tNav(item.name)}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>
        )}
      </nav>
    )
  }
)
SidebarNavigation.displayName = 'SidebarNavigation'

interface SidebarProps {
  children: React.ReactNode
}

export default function Sidebar({ children }: SidebarProps) {
  const t = useTranslations('sidebar')
  const tNav = useTranslations('navigation')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { role, isLoaded, ready, staffId, subscription } = useTenantAndOrganization()
  const pathname = usePathname() // 現在のパスを取得

  console.log('[Sidebar] Component render:', {
    pathname,
    isLoaded,
    ready,
    hasRole: !!role,
    hasSubscription: !!subscription,
    timestamp: new Date().toISOString(),
  })
  const { resolvedTheme } = useTheme()

  // デバッグログ: サブスクリプション情報を確認
  console.log('=== Sidebar Debug ===')
  console.log('subscription object:', subscription)
  console.log('subscription?.plan_name:', subscription?.plan_name)
  console.log('subscription?.status:', subscription?.status)
  console.log('role:', role)
  console.log('isLoaded:', isLoaded)
  console.log('ready:', ready)

  const currentPlan: SubscriptionPlanName = normalizePlanName(subscription?.plan_name)
  console.log('currentPlan after normalization:', currentPlan)

  const filteredGroups = useMemo(() => {
    console.log('[filteredGroups] Calculating with:', { isLoaded, role, currentPlan })

    if (!isLoaded || !role) {
      console.log('[filteredGroups] Not loaded or no role, returning empty array')
      return []
    }

    const groups = NAV_GROUPS.map((group) => {
      const filteredItems = group.items.filter((item) => {
        const access = hasAccess(role, currentPlan, item.minRole, item.minPlan)
        console.log(
          `[filteredGroups] Item ${item.name}: hasAccess(${role}, ${currentPlan}, ${item.minRole}, ${item.minPlan}) = ${access}`
        )
        return access
      })

      return {
        ...group,
        items: filteredItems,
      }
    }).filter((group) => group.items.length > 0)

    console.log('[filteredGroups] Final groups:', groups)
    return groups
  }, [isLoaded, role, currentPlan])
  useEffect(() => {
    // パスが変更されたときにサイドバーを閉じる
    setSidebarOpen(false)
  }, [pathname])
  useEffect(() => setMounted(true), [])

  // テナント情報とサブスクリプション情報が読み込まれるまでローディングを表示
  if (!ready || !isLoaded) {
    return <Loading />
  }

  // アクティブとトライアル中のみ有効と判断する
  const isSubscriptionActive =
    subscription?.status === 'active' || subscription?.status === 'trialing'

  const currentNavItem = filteredGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
  const currentPageTitle =
    staffId && pathname === `/dashboard/staff/${staffId}/my-page`
      ? tNav('myPage')
      : pathname.startsWith('/dashboard/subscription')
        ? tNav('subscription')
        : tNav(currentNavItem?.name ?? DASHBOARD_ITEM.name)

  return (
    <div className="admin-shell min-h-dvh bg-background text-foreground">
      <a
        href="#dashboard-main"
        className="fixed -top-24 left-4 z-[60] rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:top-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('skipToContent')}
      </a>
      {/* モバイル用ダイアログ */}
      <Dialog
        open={sidebarOpen}
        onClose={setSidebarOpen}
        className="admin-shell relative z-50 lg:hidden"
      >
        <DialogTitle className="sr-only">{t('openSidebar')}</DialogTitle>
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-overlay transition-opacity duration-200 ease-out data-[closed]:opacity-0 motion-reduce:transition-none"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition-transform duration-200 ease-out data-[closed]:-translate-x-full motion-reduce:transition-none"
          >
            <TransitionChild>
              <div className="absolute left-full top-0 flex w-16 justify-center pt-4 transition-opacity duration-200 data-[closed]:opacity-0 motion-reduce:transition-none">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="flex size-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <span className="sr-only">{t('closeSidebar')}</span>
                  <XIcon aria-hidden="true" className="size-5" />
                </button>
              </div>
            </TransitionChild>
            {/* Sidebar for mobile */}
            <div className="flex grow flex-col gap-5 overflow-y-auto overscroll-contain bg-card px-5 pb-6">
              <SidebarHeader
                mounted={mounted}
                resolvedTheme={resolvedTheme}
                isMobile={true}
                showModeToggle={true}
              />
              <Separator />
              <SidebarNavigation
                staffId={staffId}
                role={role}
                pathname={pathname}
                filteredGroups={filteredGroups}
                isSubscriptionActive={isSubscriptionActive}
                currentPlan={currentPlan}
                isMobile={true}
              />
              <LanguageSwitcher />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* デスクトップ用固定サイドバー */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-5 overflow-y-auto border-r border-border bg-card px-4 pb-6">
          <SidebarHeader
            mounted={mounted}
            resolvedTheme={resolvedTheme}
            isMobile={false}
            showModeToggle={false}
          />
          <Separator />
          <SidebarNavigation
            staffId={staffId}
            role={role}
            pathname={pathname}
            filteredGroups={filteredGroups}
            isSubscriptionActive={isSubscriptionActive}
            currentPlan={currentPlan}
            isMobile={false}
          />
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="relative min-w-0 lg:pl-64">
        <div className="sticky top-0 z-30 border-b border-border bg-card">
          <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <span className="sr-only">{t('openSidebar')}</span>
              <MenuIcon aria-hidden="true" className="size-5" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline" translate="no">
                Bocker
              </span>
              <ChevronRight
                aria-hidden="true"
                className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
              />
              <span className="truncate font-medium" title={currentPageTitle}>
                {currentPageTitle}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                {subscription?.plan_name && (
                  <div className="flex items-center">
                    {isSubscriptionActive ? (
                      <p
                        className="max-w-[112px] truncate rounded-full bg-muted px-3 py-1.5 text-center text-xs font-semibold text-primary"
                        title={subscription.plan_name}
                      >
                        {subscription.plan_name}
                      </p>
                    ) : (
                      <p
                        className="max-w-[112px] truncate rounded-full border border-destructive px-3 py-1.5 text-center text-xs font-semibold text-destructive"
                        title={t('subscriptionExpired')}
                      >
                        {t('subscriptionExpired')}
                      </p>
                    )}
                  </div>
                )}

                <div aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />

                <UserButton
                  appearance={{
                    baseTheme: resolvedTheme === 'dark' ? dark : undefined,
                  }}
                />

                <div className="relative hidden lg:block">
                  <ModeToggle />
                </div>
                <div className="relative hidden lg:block">
                  <LanguageSwitcher />
                </div>
              </div>
            </div>
          </div>
        </div>
        <main id="dashboard-main" tabIndex={-1} className="min-w-0 scroll-mt-24 py-6 lg:py-8">
          <div className="mx-auto mb-12 max-w-[1600px] px-4 sm:px-6 lg:px-8 md:mb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
