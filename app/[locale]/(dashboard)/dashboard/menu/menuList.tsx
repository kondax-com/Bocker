'use client'

import { useState, useCallback, memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { usePaginatedQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, CreditCard } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronDown, X, Check } from 'lucide-react'
import { Doc, Id } from '@/convex/_generated/dataModel'
import type { MenuCategory } from '@/convex/types'
import { MENU_CATEGORY_VALUES } from '@/convex/types'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { getPlanLimits } from '@/convex/utils/helpers'
import { SubscriptionPlanName } from '@/convex/types'

// 性別とタイプの定義を追加
type TargetGender = 'male' | 'female' | 'unselected'
type TargetType = 'all' | 'first_time' | 'repeat'

export const MenuList = memo(() => {
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const limits = getPlanLimits(planName as SubscriptionPlanName)
  const t = useTranslations('menu')
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([])
  const [openCategoryPopover, setOpenCategoryPopover] = useState(false)
  // 性別とタイプの絞り込み状態を追加
  const [selectedGender, setSelectedGender] = useState<TargetGender | null>(null)
  const [selectedType, setSelectedType] = useState<TargetType | null>(null)
  const [openGenderPopover, setOpenGenderPopover] = useState(false)
  const [openTypePopover, setOpenTypePopover] = useState(false)

  // === 1. すべてのメニュー取得 ===
  const { results: allMenusResults, loadMore } = usePaginatedQuery(
    api.menu.query.listByTenantAndOrg,
    tenantId && orgId
      ? {
          tenant_id: tenantId as Id<'tenant'>,
          org_id: orgId as Id<'organization'>,
          sort: 'asc',
          activeOnly: true,
          includeArchive: false,
        }
      : 'skip',
    {
      initialNumItems: 10,
    }
  )

  // ページネーション関連（今回は先頭 100 件のみ）
  const allMenus: Doc<'menu'>[] = useMemo(() => allMenusResults || [], [allMenusResults]).slice(
    0,
    limits.maxMenuCount
  )
  const status: 'CanLoadMore' | 'Exhausted' =
    allMenusResults.length === 0 ? 'Exhausted' : 'CanLoadMore'

  const numberOfMenus = allMenus.length

  // 表示するメニューの決定 - 複数フィルターを考慮
  const menusToDisplay = useMemo(() => {
    // ベースは全メニュー（100件取得）
    const baseMenus: Doc<'menu'>[] = allMenus

    return baseMenus.filter((menu) => {
      // カテゴリフィルター
      const categoryMatch =
        selectedCategories.length === 0 ||
        selectedCategories.some((category) => menu.categories.includes(category))

      // 性別フィルター
      const genderMatch = !selectedGender || menu.target_gender === selectedGender

      // タイプフィルター
      const typeMatch = !selectedType || menu.target_type === selectedType

      return categoryMatch && genderMatch && typeMatch
    })
  }, [selectedCategories, selectedGender, selectedType, allMenus])

  const isLoadingData = !allMenusResults

  const allCategories = MENU_CATEGORY_VALUES

  // カテゴリの選択/解除
  const toggleCategory = useCallback((category: MenuCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }, [])

  // 特定のカテゴリを削除
  const removeCategory = useCallback((category: MenuCategory) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== category))
  }, [])

  // 性別とタイプのフィルター関数
  const toggleGender = useCallback((gender: TargetGender) => {
    setSelectedGender((prev) => (prev === gender ? null : gender))
  }, [])

  const toggleType = useCallback((type: TargetType) => {
    setSelectedType((prev) => (prev === type ? null : type))
  }, [])

  // すべてのフィルターをクリア
  const clearAllFilters = useCallback(() => {
    setSelectedCategories([])
    setSelectedGender(null)
    setSelectedType(null)
  }, [])

  // スケルトンの表示
  const renderSkeletons = useCallback(() => {
    return Array.from({ length: 6 }).map((_, index) => (
      <Skeleton key={index} className="h-40 w-full" />
    ))
  }, [])

  // メニューの表示
  const renderMenus = useCallback(() => {
    if (!menusToDisplay || menusToDisplay.length === 0) {
      return (
        <div className="admin-empty-state">
          <p className="text-muted-foreground">{t('messages.noMenus')}</p>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-3">
        {menusToDisplay.map((menu: Doc<'menu'>) => (
          <Link key={menu._id} href={`/dashboard/menu/${menu._id}`}>
            <div className="admin-panel cursor-pointer p-4 transition-colors hover:bg-muted sm:p-5">
              <div className="flex flex-col sm:flex-row items-start gap-4 w-full">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border">
                  {menu.images && menu.images.length > 0 && menu.images[0]?.thumbnail_url ? (
                    <Image
                      src={menu.images[0]?.thumbnail_url || ''}
                      alt={menu.name || ''}
                      fill
                      className="object-cover"
                      loading="lazy"
                      sizes="64px"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center">
                      <p className="text-muted-foreground text-lg font-bold uppercase">
                        {menu.name?.slice(0, 1)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 w-full flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="w-full">
                    <div className="flex flex-wrap gap-1">
                      {menu.categories?.map((category) => (
                        <Badge key={category} variant="outline" className="text-xs px-2 py-0.5">
                          {category}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="break-words text-base font-semibold text-foreground">
                      {menu.name}
                    </h3>
                  </div>
                  <div className="flex flex-col items-start md:items-end md:justify-end w-full gap-2">
                    <div className="flex flex-wrap justify-start md:justify-end w-full gap-x-6 gap-y-2 h-full text-sm">
                      <div className="flex items-center font-medium">
                        {menu.sale_price ? (
                          <div className="flex items-center gap-2">
                            <span className="line-through text-muted-foreground">
                              ¥{menu.unit_price}
                            </span>
                            <span className="font-bold text-primary text-base">
                              ¥{menu.sale_price}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-base">¥{menu.unit_price}</span>
                        )}
                      </div>
                      <div className="flex items-center text-muted-foreground">
                        <Clock className="h-4 w-4 mr-1.5" />
                        <span>{menu.duration_min}分</span>
                      </div>
                      {menu.payment_method && (
                        <div className="flex items-center text-muted-foreground">
                          <CreditCard className="h-4 w-4 mr-1.5" />
                          <span className="text-xs">
                            {menu.payment_method === 'all'
                              ? 'オンライン・店頭'
                              : menu.payment_method === 'credit_card'
                                ? 'オンライン決済'
                                : '店頭決済'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex max-w-full flex-wrap gap-2">
                      {menu.tags &&
                        menu.tags.length > 0 &&
                        menu.tags.map((tag: string, idx: number) => (
                          <div
                            key={idx}
                            className="rounded-md bg-secondary px-2 py-1 text-secondary-foreground"
                          >
                            <p className="text-xs font-semibold text-center text-nowrap">{tag}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    )
  }, [menusToDisplay, t])

  return (
    <div className="space-y-6">
      <Card className="admin-panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardContent className="flex-1 space-y-2 p-4">
          {/* カテゴリフィルター */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
            <div>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs font-medium">{t('messages.filterByCategory')}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={openCategoryPopover} onOpenChange={setOpenCategoryPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'secondary'}
                      size="sm"
                      className="border-dashed flex justify-between"
                    >
                      <span className="text-sm">{t('messages.selectCategory')}</span>
                      <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="relative p-0 w-56" align="start">
                    <div className="absolute top-0 right-0 flex items-center justify-end gap-2 p-2 z-10">
                      <Button
                        onClick={() => setOpenCategoryPopover(false)}
                        variant="outline"
                        size="icon"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Command>
                      <CommandList>
                        <CommandEmpty>{t('messages.categoryNotFound')}</CommandEmpty>
                        <CommandGroup>
                          {allCategories.map((category) => (
                            <CommandItem
                              key={category}
                              value={category}
                              onSelect={() => {
                                toggleCategory(category)
                                // 選択してもポップオーバーを閉じない
                              }}
                            >
                              {selectedCategories.includes(category) && (
                                <Check className="h-4 w-4 mr-2 text-primary" />
                              )}
                              <span>{category}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {/* 選択されたカテゴリの表示 */}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedCategories.map((category) => (
                    <Badge
                      key={category}
                      variant="default"
                      className="px-2 py-1 flex items-center gap-1"
                    >
                      {category}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive transition-colors"
                        onClick={() => removeCategory(category)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {/* 性別フィルター */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
              <div className="flex flex-col gap-2 items-start">
                <div className="flex items-start gap-1">
                  <span className="text-xs font-medium">性別で絞り込み</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={openGenderPopover} onOpenChange={setOpenGenderPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant={'secondary'}
                        size="sm"
                        className="border-dashed flex justify-between"
                      >
                        <span className="text-sm">
                          {selectedGender
                            ? selectedGender === 'male'
                              ? '男性'
                              : selectedGender === 'female'
                                ? '女性'
                                : '指定なし'
                            : '性別を選択'}
                        </span>
                        <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="relative p-0 w-40" align="start">
                      <div className="absolute top-0 right-0 flex items-center justify-end gap-2 p-2 z-10">
                        <Button
                          onClick={() => setOpenGenderPopover(false)}
                          variant="outline"
                          size="icon"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {(['male', 'female', 'unselected'] as TargetGender[]).map((gender) => (
                              <CommandItem
                                key={gender}
                                value={gender}
                                onSelect={() => {
                                  toggleGender(gender)
                                  setOpenGenderPopover(false)
                                }}
                              >
                                {selectedGender === gender && (
                                  <Check className="h-4 w-4 mr-2 text-primary" />
                                )}
                                <span>
                                  {gender === 'male'
                                    ? '男性'
                                    : gender === 'female'
                                      ? '女性'
                                      : '指定なし'}
                                </span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-2 items-start">
                  {/* タイプフィルター */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium">タイプで絞り込み</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover open={openTypePopover} onOpenChange={setOpenTypePopover}>
                      <PopoverTrigger asChild>
                        <Button
                          variant={'secondary'}
                          size="sm"
                          className="border-dashed flex justify-between"
                        >
                          <span className="text-sm">
                            {selectedType
                              ? selectedType === 'all'
                                ? '全て'
                                : selectedType === 'first_time'
                                  ? '初回'
                                  : 'リピーター'
                              : 'タイプを選択'}
                          </span>
                          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="relative p-0 w-40" align="start">
                        <div className="absolute top-0 right-0 flex items-center justify-end gap-2 p-2 z-10">
                          <Button
                            onClick={() => setOpenTypePopover(false)}
                            variant="outline"
                            size="icon"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <Command>
                          <CommandList>
                            <CommandGroup>
                              {(['all', 'first_time', 'repeat'] as TargetType[]).map((type) => (
                                <CommandItem
                                  key={type}
                                  value={type}
                                  onSelect={() => {
                                    toggleType(type)
                                    setOpenTypePopover(false)
                                  }}
                                >
                                  {selectedType === type && (
                                    <Check className="h-4 w-4 mr-2 text-primary" />
                                  )}
                                  <span>
                                    {type === 'all'
                                      ? '全て'
                                      : type === 'first_time'
                                        ? '初回'
                                        : 'リピーター'}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 全フィルタークリアボタン */}
          {(selectedCategories.length > 0 || selectedGender || selectedType) && (
            <div className="mt-4">
              <Button size="sm" variant="outline" onClick={clearAllFilters}>
                <X className="h-4 w-4 mr-1" />
                全てクリア
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        {isLoadingData ? <div className="space-y-2">{renderSkeletons()}</div> : renderMenus()}
        {allMenus &&
          !selectedCategories.length &&
          !selectedGender &&
          !selectedType &&
          allMenus.length >= numberOfMenus &&
          status === 'CanLoadMore' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 flex justify-center"
            >
              <Button onClick={() => loadMore(10)} variant="outline" className="w-full sm:w-auto">
                {t('messages.loadMore')}
              </Button>
            </motion.div>
          )}
      </div>
    </div>
  )
})

MenuList.displayName = 'MenuList'
