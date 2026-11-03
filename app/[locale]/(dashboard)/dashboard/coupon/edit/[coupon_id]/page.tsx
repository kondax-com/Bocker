'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import React from 'react'
import { Controller } from 'react-hook-form'
import { withManagerAccess } from '@/components/common'
import { z } from 'zod'
import { api } from '@/convex/_generated/api'
import { useQuery, useMutation } from 'convex/react'
import { useZodForm } from '@/hooks/useZodForm'
import { motion } from 'framer-motion'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useTranslations, useLocale } from 'next-intl'
import { formatDate } from '@/lib/schedules'
import type { SupportedLocale } from '@/lib/dateLocale'
// コンポーネントのインポート
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExclusionMenu } from '@/components/common'
import { DashboardSection } from '@/components/common'
import { Label } from '@/components/ui/label'
import { Loading } from '@/components/common'
import { ConvexError } from 'convex/values'
import { ERROR_STATUS_CODE, ERROR_SEVERITY } from '@/lib/errors/constants'
import { ACTIVE_CUSTOMER_TYPE_VALUES } from '@/convex/types'
import {
  CalendarIcon,
  Percent,
  PiggyBank,
  Tag,
  Calendar as CalendarFull,
  Loader2,
  Hash,
  AlertCircle,
  Save,
  User,
  AlertTriangle,
} from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Switch } from '@/components/ui/switch'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

import type { Id } from '@/convex/_generated/dataModel'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { toast } from 'sonner'
import { ZodTextField } from '@/components/common'
import { MAX_COUPON_UID_LENGTH } from '@/convex/constants'

// アニメーション定義
const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
}

// 日付表示コンポーネント
function DateDisplay({ date, locale }: { date: Date; locale: SupportedLocale }) {
  const [formattedDate, setFormattedDate] = useState('')

  useEffect(() => {
    const format = async () => {
      const formatted = await formatDate(date, 'PPP', locale)
      setFormattedDate(formatted)
    }
    format()
  }, [date, locale])

  return <>{formattedDate}</>
}

interface CouponEditPageProps {
  params: Promise<{ coupon_id: Id<'coupon'> }>
}

// ページコンポーネント
function CouponEditPage({ params }: CouponEditPageProps) {
  const unwrappedParams = React.use(params)
  const { coupon_id } = unwrappedParams

  return <CouponEditWrapper couponId={coupon_id} />
}

// アラート表示機能付きラッパーコンポーネント
function CouponEditWrapper({ couponId }: { couponId: Id<'coupon'> }) {
  const t = useTranslations('coupon')

  return (
    <DashboardSection
      title={t('editCoupon')}
      backLink="/dashboard/coupon"
      backLinkTitle={t('backToList')}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('description.editIntro')}</p>
          <Separator className="my-2" />
        </div>

        <CouponForm couponId={couponId} />
      </div>
    </DashboardSection>
  )
}

// 型定義: クーポンプレビューデータ
interface CouponPreviewData {
  name?: string
  coupon_uid?: string
  discount_type: 'percentage' | 'fixed'
  percentage_discount_value?: number | null
  fixed_discount_value?: number | null
  is_active: boolean
  start_date?: Date
  end_date?: Date
  number_of_use?: number
  max_use_count?: number
}

// クーポンプレビューコンポーネント
function CouponPreview({
  data,
  selectedMenuIds,
  locale,
}: {
  data: CouponPreviewData
  selectedMenuIds: Id<'menu'>[]
  locale: SupportedLocale
}) {
  // 適用外メニューの詳細情報を取得
  const exclusionMenusDetails = useQuery(
    api.menu.query.getDisplayByIds,
    selectedMenuIds.length > 0 ? { menu_ids: selectedMenuIds, option_ids: [] } : 'skip'
  )
  const t = useTranslations('coupon')
  const tCommon = useTranslations('common')
  const [formattedStartDate, setFormattedStartDate] = useState('')
  const [formattedEndDate, setFormattedEndDate] = useState('')

  useEffect(() => {
    const formatDates = async () => {
      if (data.start_date) {
        const start = await formatDate(data.start_date, 'PPP', locale)
        setFormattedStartDate(start)
      } else {
        setFormattedStartDate(t('notSet'))
      }

      if (data.end_date) {
        const end = await formatDate(data.end_date, 'PPP', locale)
        setFormattedEndDate(end)
      } else {
        setFormattedEndDate(t('notSet'))
      }
    }
    formatDates()
  }, [data.start_date, data.end_date, locale, t])

  return (
    <div className="w-full">
      <Card className="admin-panel overflow-hidden">
        <CardHeader className="border-b border-border bg-muted pb-3 text-foreground">
          <CardTitle className="flex items-center gap-2">
            <Tag size={18} />
            {data.name || t('couponName')}
          </CardTitle>
          <span className="text-sm tracking-wide text-muted-foreground">{data.coupon_uid}</span>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col justify-start items-start gap-3">
            <div className="text-center">
              <Badge
                variant="outline"
                className={`px-3 py-1 text-lg font-bold  ${
                  data.discount_type === 'percentage'
                    ? 'bg-link text-link-foreground'
                    : 'bg-accent-2-foreground text-accent-2'
                }`}
              >
                {data.discount_type === 'percentage'
                  ? `${data.percentage_discount_value || 0}% OFF`
                  : `¥${data.fixed_discount_value || 0} OFF`}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm mt-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <CalendarFull size={14} />
                <span>{t('startDate')}:</span>
              </div>
              <div className="text-right">{formattedStartDate}</div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <CalendarFull size={14} />
                <span>{t('endDate')}:</span>
              </div>
              <div className="text-right">{formattedEndDate}</div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <Hash size={14} />
                <span>{t('usageCount')}:</span>
              </div>
              <div className="text-right ">
                <span className="text-sm">
                  {isNaN(data.number_of_use ?? 0) ? 0 : data.number_of_use || 0}
                </span>
                <span className="text-xs text-muted-foreground">
                  /{' '}
                  {data.max_use_count === undefined || isNaN(data.max_use_count)
                    ? t('unlimited')
                    : data.max_use_count}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
        {/* 適用外メニューリスト */}
        {selectedMenuIds.length > 0 && (
          <CardContent className="pt-0 pb-2 border-t">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <AlertTriangle size={14} />
                {t('excludedMenus')} ({selectedMenuIds.length})
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {exclusionMenusDetails?.menus?.map((menu) => (
                  <div
                    key={menu._id}
                    className="flex justify-between items-center text-xs bg-muted/50 p-2 rounded"
                  >
                    <span className="font-medium truncate flex-1">{menu.name}</span>
                    <span className="text-muted-foreground ml-2">
                      ¥
                      {(menu.sale_price && menu.sale_price > 0
                        ? menu.sale_price
                        : menu.unit_price
                      )?.toLocaleString()}
                    </span>
                  </div>
                )) ||
                  // データ読み込み中の表示
                  selectedMenuIds.map((id) => (
                    <div
                      key={id}
                      className="flex justify-between items-center text-xs bg-muted/50 p-2 rounded animate-pulse"
                    >
                      <div className="h-3 bg-muted rounded flex-1"></div>
                      <div className="h-3 bg-muted rounded w-16 ml-2"></div>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        )}

        <CardFooter className="bg-muted pt-2 pb-2 flex justify-between">
          <div className="text-xs text-muted-foreground">
            {selectedMenuIds.length === 0
              ? `${t('excludedMenus')}: ${tCommon('none')}`
              : `${t('excludedMenus')}: ${selectedMenuIds.length}`}
          </div>
          <div className="flex items-center gap-2">
            {/* 期限切れの場合は警告アイコンを表示 */}
            {data.end_date && new Date(data.end_date) <= new Date() && (
              <AlertTriangle size={16} className="text-destructive" />
            )}
            <Badge
              variant={data.is_active ? 'default' : 'destructive'}
              className={`h-6 ${
                data.end_date && new Date(data.end_date) <= new Date()
                  ? 'bg-destructive text-destructive-foreground' // 期限切れの場合は赤色
                  : data.is_active
                    ? 'bg-accent-2-foreground text-accent-2'
                    : 'bg-destructive text-destructive-foreground'
              }`}
            >
              {data.end_date && new Date(data.end_date) <= new Date()
                ? t('expired')
                : data.is_active
                  ? t('active')
                  : t('inactive')}
            </Badge>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

// メインのフォームコンポーネント
function CouponForm({ couponId }: { couponId: Id<'coupon'> }) {
  const router = useRouter()
  const t = useTranslations('coupon')
  const tCommon = useTranslations('common')
  const locale = useLocale() as SupportedLocale
  const { tenantId, orgId } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  // 状態管理
  const [selectedMenuIds, setSelectedMenuIds] = useState<Id<'menu'>[]>([])
  const [initialSelectedMenuIds, setInitialSelectedMenuIds] = useState<Id<'menu'>[]>([])
  const [isSaving, setIsSaving] = useState(false)
  // Convex
  const upsertCouponExclusionMenu = useMutation(
    api.coupon.exclusion_menu.mutation.upsertExclusionMenu
  )
  const updateCouponRelatedTables = useMutation(api.coupon.mutation.updateCouponRelatedTables)
  const couponCompleteData = useQuery(
    api.coupon.query.getCouponRelatedTablesAndExclusionMenus,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          coupon_id: couponId,
        }
      : 'skip'
  )

  const { coupon, couponConfig, exclusionMenus } = couponCompleteData ?? {}

  const couponSchema = z
    .object({
      name: z.string().min(1, t('validation.nameMinLength')),
      coupon_uid: z
        .string()
        .min(1, t('validation.codeMinLength'))
        .max(MAX_COUPON_UID_LENGTH, t('validation.codeMaxLength', { max: MAX_COUPON_UID_LENGTH })),
      discount_type: z.enum(['percentage', 'fixed']),
      percentage_discount_value: z.preprocess(
        (val) => {
          if (val === '' || val === null || val === undefined) return null
          const num = Number(val)
          return isNaN(num) ? null : num
        },
        z.number().nullable() // min/maxバリデーションを削除し、superRefineで処理
      ),
      fixed_discount_value: z.preprocess(
        (val) => {
          if (val === '' || val === null || val === undefined) return null
          const num = Number(val)
          return isNaN(num) ? null : num
        },
        z.number().nullable() // min/maxバリデーションを削除し、superRefineで処理
      ),
      is_active: z.boolean(),
      start_date: z.date(),
      end_date: z.date().refine((date) => date > new Date(), {
        message: t('validation.endDateFutureEdit'),
      }),
      max_use_count: z.number().min(0, t('validation.maxUseCountMin')),
      number_of_use: z.number().min(0, t('validation.maxUseCountMin')),
      selected_menu_ids: z.array(z.string()).optional(),
      active_customer_type: z.enum(ACTIVE_CUSTOMER_TYPE_VALUES),
    })
    .superRefine((data, ctx) => {
      if (data.discount_type === 'percentage') {
        if (data.percentage_discount_value === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('validation.percentageRequired'),
            path: ['percentage_discount_value'],
          })
        } else {
          if (data.percentage_discount_value <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('validation.percentageMin'),
              path: ['percentage_discount_value'],
            })
          }
          if (data.percentage_discount_value > 100) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('validation.percentageMax'),
              path: ['percentage_discount_value'],
            })
          }
        }
      } else if (data.discount_type === 'fixed') {
        if (data.fixed_discount_value === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('validation.fixedRequired'),
            path: ['fixed_discount_value'],
          })
        } else {
          if (data.fixed_discount_value <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('validation.fixedMin'),
              path: ['fixed_discount_value'],
            })
          }
          if (data.fixed_discount_value > 99999) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('validation.fixedMax'),
              path: ['fixed_discount_value'],
            })
          }
        }
      }
    })

  // フォーム管理
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    trigger,
    formState: { isSubmitting, errors, isDirty },
  } = useZodForm(couponSchema, { shouldUnregister: false })

  // フォームの値を監視
  const formValues = watch()
  const discountType = watch('discount_type')
  const endDate = watch('end_date')

  // 有効期限切れかどうかをチェック
  const isExpired = endDate && endDate <= new Date()
  const isExpiringSoon =
    endDate && endDate > new Date() && endDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7日以内

  // フォーム送信ハンドラー
  const onSubmit = async (data: z.infer<typeof couponSchema>) => {
    setIsSaving(true)
    try {
      if (!tenantId || !orgId) {
        toast.error(t('error.tenantOrOrgNotFound'))
        setIsSaving(false)
        return
      }
      if (!couponConfig) {
        throw new ConvexError({
          statusCode: ERROR_STATUS_CODE.NOT_FOUND,
          severity: ERROR_SEVERITY.ERROR,
          callFunc: 'coupon.query.getCouponRelatedTablesAndExclusionMenus',
          message: t('error.couponConfigNotFound'),
          title: tCommon('error'),
          status: 500,
          details: {
            couponId: couponId,
            tenantId: tenantId,
            orgId: orgId,
          },
        })
      }
      await updateCouponRelatedTables({
        tenant_id: tenantId,
        org_id: orgId,
        coupon_id: couponId,
        coupon_uid: data.coupon_uid,
        name: data.name,
        discount_type: data.discount_type,
        percentage_discount_value:
          data.percentage_discount_value === null ? undefined : data.percentage_discount_value,
        fixed_discount_value:
          data.fixed_discount_value === null ? undefined : data.fixed_discount_value,
        is_active: data.is_active,
        start_date_unix: data.start_date.getTime(),
        end_date_unix: data.end_date.getTime(),
        max_use_count: data.max_use_count,
        number_of_use: data.number_of_use,
        active_customer_type: data.active_customer_type,
      })
      await upsertCouponExclusionMenu({
        tenant_id: tenantId,
        org_id: orgId,
        coupon_id: couponId,
        selected_menu_ids: selectedMenuIds,
      })
      toast.success(t('couponUpdated'))
      setTimeout(() => {
        router.push(`/dashboard/coupon`)
      }, 300)
    } catch (e) {
      showErrorToast(e)
      setIsSaving(false)
    }
  }

  // 初期データの設定
  useEffect(() => {
    if (coupon && couponConfig) {
      reset({
        name: coupon.name,
        coupon_uid: coupon.coupon_uid,
        discount_type: (coupon.discount_type as 'percentage' | 'fixed') ?? 'percentage',
        percentage_discount_value: coupon.percentage_discount_value ?? 1,
        fixed_discount_value: coupon.fixed_discount_value ?? 1,
        is_active: coupon.is_active ?? true,
        start_date: new Date(couponConfig.start_date_unix ?? Date.now()),
        end_date: new Date(couponConfig.end_date_unix ?? Date.now()),
        max_use_count: couponConfig.max_use_count ?? 0,
        number_of_use: couponConfig.number_of_use ?? 0,
        active_customer_type: couponConfig.active_customer_type ?? 'all',
      })
    }
    const initialIds = exclusionMenus?.map((menu) => menu.menu_id) ?? []
    setSelectedMenuIds(initialIds)
    setInitialSelectedMenuIds(initialIds)
  }, [reset, coupon, couponConfig, exclusionMenus])

  // 表示用のプレビューデータ
  const previewData = {
    ...formValues,
    selectedMenus: selectedMenuIds,
  }

  // 配列の内容が変更されたか比較（非破壊的な方法）
  const menuIdsChanged = (() => {
    // 空配列や undefined の場合の安全な処理
    const current = selectedMenuIds || []
    const initial = initialSelectedMenuIds || []
    // 長さが異なる場合は確実に変更されている
    if (current.length !== initial.length) return true

    // ソート済みのコピーを作成して比較（元の配列は変更しない）
    const sortedCurrent = [...current].sort()
    const sortedInitial = [...initial].sort()
    return JSON.stringify(sortedCurrent) !== JSON.stringify(sortedInitial)
  })()

  if (isSaving) return <Loading />
  if (!tenantId || !orgId || coupon === undefined || couponConfig === undefined) {
    return <Loading />
  }

  // デバッグ用：更新ボタンの状態を監視
  console.log('=== 更新ボタン状態デバッグ ===', {
    isDirty,
    menuIdsChanged,
    isSubmitting,
    buttonEnabled: !(isSubmitting || !(isDirty || menuIdsChanged)),
    selectedMenuIds: selectedMenuIds.length,
    initialMenuIds: initialSelectedMenuIds.length,
  })
  console.log('errors', errors)
  return (
    <div className="space-y-6">
      {/* 有効期限アラート */}
      {isExpired && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive font-medium">
            {t('alerts.expired')}
          </AlertDescription>
        </Alert>
      )}
      {isExpiringSoon && !isExpired && (
        <Alert className="border-warning-foreground/40 bg-warning">
          <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          <AlertDescription className="text-warning-foreground font-medium">
            {t('alerts.expiringSoon')}
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-8">
        <form
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault()
            }
          }}
          className="space-y-8"
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Tabs defaultValue="preview" className="xl:col-span-2">
              <TabsList>
                <TabsTrigger value="preview">{t('basicSettings')}</TabsTrigger>
                <TabsTrigger value="detail">{t('excludedMenus')}</TabsTrigger>
              </TabsList>
              <TabsContent value="preview">
                {/* フォーム入力部分 */}
                <div className="md:col-span-3 space-y-6">
                  <div className="admin-panel flex flex-col gap-6 p-5 sm:p-6">
                    <div className="space-y-4">
                      <ZodTextField
                        register={register}
                        errors={errors}
                        name="name"
                        label={t('couponName')}
                        icon={<Tag size={16} />}
                        placeholder={t('placeholder.couponName')}
                      />
                      <ZodTextField
                        register={register}
                        errors={errors}
                        name="coupon_uid"
                        label={t('couponCode')}
                        icon={<Hash size={16} />}
                        placeholder={t('placeholder.editCouponCode')}
                      />
                      <span className="text-xs text-muted-foreground">
                        {t('description.editCouponCode')}
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-end items-end">
                        <div className="flex flex-col gap-2 ">
                          <Label className="flex items-center gap-2 text-primary">
                            <Percent size={16} />
                            {t('discountType')}
                          </Label>
                          <span className="text-xs text-muted-foreground">
                            {t('description.editDiscountType')}
                          </span>
                          <div className="flex items-center gap-3 bg-muted p-2 rounded-md">
                            <div
                              className={`flex-1 text-center text-sm p-2 rounded-md ${discountType === 'percentage' ? 'bg-link text-link-foreground font-medium' : 'text-muted-foreground'}`}
                            >
                              {t('percentageDiscount')}
                            </div>
                            <Controller
                              control={control}
                              name="discount_type"
                              render={({ field }) => (
                                <Switch
                                  checked={field.value === 'fixed'}
                                  onCheckedChange={(checked) => {
                                    field.onChange(checked ? 'fixed' : 'percentage')
                                  }}
                                  className="data-[state=checked]:bg-accent-2 data-[state=unchecked]:bg-link-foreground"
                                />
                              )}
                            />
                            <div
                              className={`flex-1 text-center text-sm  p-2 rounded-md ${discountType === 'fixed' ? 'bg-accent-2-foreground text-accent-2 font-medium' : 'text-muted-foreground'}`}
                            >
                              {t('fixedDiscount')}
                            </div>
                          </div>
                        </div>

                        {/* 割引額入力（常にマウントして値を保持し、表示だけ切り替える） */}
                        <div className={discountType === 'percentage' ? '' : 'hidden'}>
                          <ZodTextField
                            register={register}
                            errors={errors}
                            name="percentage_discount_value"
                            label={t('percentageDiscount')}
                            type="number"
                            icon={<Percent size={16} />}
                            placeholder={t('placeholder.percentage')}
                          />
                        </div>
                        <div className={discountType === 'fixed' ? '' : 'hidden'}>
                          <ZodTextField
                            register={register}
                            errors={errors}
                            name="fixed_discount_value"
                            label={t('fixedDiscount')}
                            type="number"
                            icon={<PiggyBank size={16} />}
                            placeholder={t('placeholder.fixed')}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 py-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <Label className="flex items-center gap-2 text-primary">
                            <CalendarIcon size={16} />
                            {t('startDate')}
                          </Label>
                          <Controller
                            control={control}
                            name="start_date"
                            render={({ field }) => (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={`w-full border-border justify-start text-left font-normal bg-input ${
                                      errors.start_date ? 'border-destructive' : ''
                                    }`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? (
                                      <DateDisplay date={field.value} locale={locale} />
                                    ) : (
                                      <span>{t('selectDate')}</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                          />
                          {errors.start_date && (
                            <motion.p
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              variants={fadeIn}
                              className="mt-1 text-sm text-destructive flex items-center gap-1"
                            >
                              <AlertCircle size={14} />
                              {errors.start_date?.message}
                            </motion.p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label className="flex items-center gap-2 text-primary">
                            <CalendarIcon size={16} />
                            {t('endDate')}
                          </Label>
                          <Controller
                            control={control}
                            name="end_date"
                            render={({ field }) => (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className={`w-full border-border justify-start text-left font-normal bg-input ${
                                      errors.end_date ? 'border-destructive' : ''
                                    }`}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? (
                                      <DateDisplay date={field.value} locale={locale} />
                                    ) : (
                                      <span>{t('selectDate')}</span>
                                    )}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <CalendarComponent
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            )}
                          />
                          {errors.end_date && (
                            <motion.div
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              variants={fadeIn}
                              className="mt-2"
                            >
                              <Alert className="border-destructive bg-destructive/10">
                                <AlertCircle className="h-4 w-4 text-destructive" />
                                <AlertDescription className="text-destructive font-medium">
                                  {errors.end_date?.message}
                                </AlertDescription>
                              </Alert>
                            </motion.div>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('description.validPeriod')}
                        <br />
                        {t('description.validPeriodSecondary')}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                        <div className="flex flex-col gap-2">
                          <Label className="flex items-center gap-2 text-primary">
                            {t('currentUseCount')}
                          </Label>
                          <p className="text-sm">
                            <span className="text-sm">
                              {isNaN(formValues.number_of_use) ? 0 : formValues.number_of_use || 0}
                            </span>{' '}
                            /
                            <span className="text-sm ml-1 text-muted-foreground">
                              {isNaN(formValues.max_use_count)
                                ? t('unlimited')
                                : formValues.max_use_count || t('unlimited')}
                            </span>
                          </p>
                        </div>
                        <ZodTextField
                          register={register}
                          errors={errors}
                          name="max_use_count"
                          label={t('maxUseCount')}
                          type="number"
                          icon={<Hash size={16} />}
                          placeholder={t('placeholder.maxUseCount')}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 py-2">
                      <div className="flex flex-col gap-2 pt-2">
                        <Controller
                          control={control}
                          name="is_active"
                          render={({ field }) => (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-col gap-2">
                                <Label
                                  htmlFor="is_active"
                                  className="flex items-center gap-2 text-primary cursor-pointer"
                                >
                                  {t('isActive')}
                                </Label>
                                <span className="text-xs text-muted-foreground">
                                  {t('description.editActiveStatus')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-md font-bold ${field.value ? 'bg-accent-2-foreground text-accent-2' : 'bg-destructive text-destructive-foreground'}`}
                                >
                                  {field.value ? t('active') : t('inactive')}
                                </span>
                                <Switch
                                  id="is_active"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="data-[state=checked]:bg-accent-2 data-[state=unchecked]:bg-destructive-foreground"
                                />
                              </div>
                            </div>
                          )}
                        />
                      </div>
                    </div>
                    <div className="space-y-4 py-2">
                      <div className="flex flex-col gap-2 pt-2">
                        <Controller
                          control={control}
                          name="active_customer_type"
                          render={({ field }) => (
                            <>
                              <Label className="flex items-center gap-2 text-primary">
                                <User size={14} />
                                <span>{t('targetCustomer')}:</span>
                              </Label>
                              <ToggleGroup
                                type="single"
                                value={field.value}
                                onValueChange={field.onChange}
                                className="flex w-full flex-wrap items-center justify-start gap-2 rounded-xl bg-muted p-2"
                              >
                                <ToggleGroupItem value="all">{t('allCustomers')}</ToggleGroupItem>
                                <ToggleGroupItem value="first_time">
                                  {t('firstTimeCustomers')}
                                </ToggleGroupItem>
                                <ToggleGroupItem value="repeat">
                                  {t('repeatCustomers')}
                                </ToggleGroupItem>
                              </ToggleGroup>
                            </>
                          )}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t('description.targetCustomer')}
                      </span>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="detail">
                <ExclusionMenu
                  title={t('excludedMenuDescription')}
                  selectedMenuIds={selectedMenuIds}
                  setSelectedMenuIdsAction={async (menuIds: Id<'menu'>[]) => {
                    setSelectedMenuIds(menuIds)
                    // フォーム状態を強制的に dirty にするため、名前フィールドを一時的に触る
                    const currentName = watch('name')
                    setValue('name', currentName + ' ', { shouldDirty: true })
                    setValue('name', currentName, { shouldDirty: true })
                    // バリデーションをトリガー
                    await trigger()
                  }}
                />
              </TabsContent>
            </Tabs>
            {/* プレビュー部分 */}
            <div className="xl:col-span-1">
              <div className="space-y-4 xl:sticky xl:top-24">
                <CouponPreview
                  data={previewData}
                  selectedMenuIds={selectedMenuIds}
                  locale={locale}
                />

                <div className="mt-6">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !(isDirty || menuIdsChanged)}
                    className="w-full"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('adding')}
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {t('updateCoupon')}
                      </>
                    )}
                  </Button>

                  {isDirty && (
                    <p className="text-xs text-center mt-2 text-muted-foreground">
                      {t('hasChanges')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default withManagerAccess(CouponEditPage)
