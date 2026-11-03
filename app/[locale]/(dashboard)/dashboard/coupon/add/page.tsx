'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Controller } from 'react-hook-form'
import { useZodForm } from '@/hooks/useZodForm'
import { fetchQuery } from 'convex/nextjs'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Loading } from '@/components/common'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { SubscriptionPlanName } from '@/convex/types'
// コンポーネントのインポート
import { DashboardSection } from '@/components/common'
import { Label } from '@/components/ui/label'
import {
  CalendarIcon,
  Percent,
  PiggyBank,
  Tag,
  Calendar as CalendarFull,
  Hash,
  AlertCircle,
  Gift,
  Ticket,
  Save,
  Loader2,
  User,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { DatePicker } from '@/components/common'
import { Button } from '@/components/ui/button'
import { ZodTextField } from '@/components/common'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MAX_COUPON_UID_LENGTH } from '@/convex/constants'
import { ExclusionMenu } from '@/components/common'
import { Id } from '@/convex/_generated/dataModel'
import { ACTIVE_CUSTOMER_TYPE_VALUES } from '@/convex/types'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// アニメーション定義
const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
}

// プレビューデータ型定義
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
  selected_menu_ids?: string[]
}

// クーポンプレビューコンポーネント
function CouponPreview({ data }: { data: CouponPreviewData }) {
  const t = useTranslations('coupon')

  return (
    <div className="w-full">
      <Card className="admin-panel overflow-hidden">
        <CardHeader className="pb-2 bg-muted">
          <CardTitle className="text-primary flex items-center gap-2 text-xl">
            <Gift size={18} />
            {data.name || t('couponName')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{data.coupon_uid}</span>
          <CardDescription className="text-muted-foreground">
            {data.is_active ? t('validCoupon') : t('invalidCoupon')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col justify-start items-start gap-3">
            <div className="text-center">
              <Badge
                variant="outline"
                className={`flex-1 text-center p-2 rounded-md text-sm ${data.discount_type === 'percentage' ? 'bg-link text-link-foreground font-medium' : 'bg-accent-2-foreground text-accent-2 font-medium'}`}
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
              <div className="text-right">{data.start_date?.toLocaleDateString()}</div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <CalendarFull size={14} />
                <span>{t('endDate')}:</span>
              </div>
              <div className="text-right">{data.end_date?.toLocaleDateString()}</div>

              <div className="flex items-center gap-1 text-muted-foreground">
                <Hash size={14} />
                <span>{t('usageCount')}:</span>
              </div>
              <div className="text-right">
                {data.number_of_use || 0} / {data.max_use_count || t('unlimited')}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted pt-2 pb-2 flex justify-between">
          <div className="text-xs text-muted-foreground">
            {t('excludedMenus')}: {data.selected_menu_ids?.length || 0}
          </div>
          <Badge
            variant={data.is_active ? 'default' : 'destructive'}
            className={`h-6 ${data.is_active ? 'bg-accent-2-foreground text-accent-2' : 'bg-destructive-foreground text-destructive'}`}
          >
            {data.is_active ? t('active') : t('inactive')}
          </Badge>
        </CardFooter>
      </Card>
    </div>
  )
}

// メインのフォームコンポーネント
function CouponForm() {
  const router = useRouter()
  const t = useTranslations('coupon')

  // 状態管理
  const [selectedMenuIds, setSelectedMenuIds] = useState<Id<'menu'>[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { tenantId, orgId, planName } = useTenantAndOrganization()

  const { showErrorToast } = useErrorHandler()
  const createCouponRelatedTables = useMutation(api.coupon.mutation.createCouponRelatedTables)
  const upsertCouponExclusionMenu = useMutation(
    api.coupon.exclusion_menu.mutation.upsertExclusionMenu
  )

  const couponSchema = z.object({
    name: z
      .string({
        required_error: t('validation.nameRequired'),
      })
      .min(1, t('validation.nameMinLength')),
    coupon_uid: z
      .string({
        required_error: t('validation.codeRequired'),
      })
      .min(1, t('validation.codeMinLength'))
      .max(MAX_COUPON_UID_LENGTH, t('validation.codeMaxLength', { max: MAX_COUPON_UID_LENGTH })),
    discount_type: z.enum(['percentage', 'fixed']),
    percentage_discount_value: z.preprocess(
      (val) => {
        // 空文字列・NaN は null 扱い
        if (val === '' || val === null || val === undefined) return null
        if (typeof val === 'number' && isNaN(val)) return null // 空の場合はnull扱い
        const num = Number(val)
        return isNaN(num) ? null : num
      },
      z
        .number()
        .min(1, { message: t('validation.percentageMin') })
        .max(100, { message: t('validation.percentageMax') })
        .nullable()
        .optional()
    ),
    fixed_discount_value: z.preprocess(
      (val) => {
        // 空文字列・NaN は null 扱い
        if (val === '' || val === null || val === undefined) return null
        if (typeof val === 'number' && isNaN(val)) return null // 空の場合はnull扱い
        const num = Number(val)
        return isNaN(num) ? null : num
      },
      z
        .number()
        .min(1, { message: t('validation.fixedMin') })
        .max(99999, { message: t('validation.fixedMax') })
        .nullable()
        .optional()
    ),
    is_active: z.boolean(),
    start_date: z.date(),
    end_date: z.date().refine(
      (date) => {
        // 日付の比較時に時刻部分を無視して日付のみで比較
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const compareDate = new Date(date)
        compareDate.setHours(0, 0, 0, 0)

        return compareDate >= today
      },
      { message: t('validation.endDateFuture') }
    ),
    max_use_count: z
      .number({ required_error: t('validation.maxUseCountRequired') })
      .min(0, { message: t('validation.maxUseCountMin') })
      .max(99999, { message: t('validation.maxUseCountMax') })
      .optional(),
    number_of_use: z
      .number()
      .min(0, t('validation.maxUseCountMin'))
      .max(99999, t('validation.maxUseCountMax'))
      .optional(),
    active_customer_type: z.enum(ACTIVE_CUSTOMER_TYPE_VALUES),
    selected_menu_ids: z.array(z.string()).optional(),
  })

  // フォーム管理
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useZodForm(couponSchema)

  // フォームの値を監視
  const formValues = watch()
  const discountType = watch('discount_type')

  // フォーム送信ハンドラー
  const onSubmit = async (data: z.infer<typeof couponSchema>) => {
    setIsSubmitting(true)

    try {
      if (!tenantId || !orgId) {
        toast.error(t('error.tenantNotFound'))
        return
      }
      // 日付をUNIXタイムスタンプに変換（ミリ秒）
      const startDateUnix = data.start_date.getTime()
      const endDateUnix = data.end_date.getTime()

      await fetchQuery(api.tenant.plan.query.checkLimitByPlan, {
        tenant_id: tenantId,
        org_id: orgId,
        limit_type: 'coupon',
      })

      // FIXME: active_customer_typeは仮でallを設定　設定できるように修正
      const couponId = await createCouponRelatedTables({
        tenant_id: tenantId,
        org_id: orgId,
        coupon_uid: data.coupon_uid,
        name: data.name,
        plan_name: planName as SubscriptionPlanName,
        discount_type: data.discount_type,
        percentage_discount_value: data.percentage_discount_value ?? 0,
        fixed_discount_value: data.fixed_discount_value ?? 0,
        is_active: data.is_active,
        start_date_unix: startDateUnix,
        end_date_unix: endDateUnix,
        max_use_count: data.max_use_count ?? 0,
        number_of_use: 0,
        active_customer_type: data.active_customer_type,
      })

      if (couponId) {
        await upsertCouponExclusionMenu({
          tenant_id: tenantId,
          org_id: orgId,
          coupon_id: couponId,
          selected_menu_ids: selectedMenuIds,
        })
      } else {
        throw new Error(t('error.createFailed'))
      }

      toast.success(t('couponCreated'))
      router.push(`/dashboard/coupon`)
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // フォームのエラーをデバッグ用に監視
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log('フォームエラー:', errors)
      toast.error(t('validation.formError'))
    }
  }, [errors, t])

  // 初期データの設定
  useEffect(() => {
    // 新規作成用の初期値設定
    const today = new Date()
    const oneMonthLater = new Date()
    oneMonthLater.setMonth(today.getMonth() + 1)

    reset({
      name: '',
      coupon_uid: '',
      discount_type: 'percentage',
      percentage_discount_value: undefined,
      fixed_discount_value: undefined,
      is_active: true,
      start_date: today,
      end_date: oneMonthLater,
      max_use_count: 100,
      number_of_use: 0,
      selected_menu_ids: [],
      active_customer_type: 'all',
    })
  }, [reset])

  // 表示用のプレビューデータ
  const previewData = useMemo(
    () => ({
      ...formValues,
      selectedMenus: selectedMenuIds,
    }),
    [formValues, selectedMenuIds]
  )

  if (!tenantId || !orgId) {
    return <Loading />
  }

  console.log('formValues', formValues)

  return (
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
        <Tabs defaultValue="setting" className="xl:col-span-2">
          <TabsList>
            <TabsTrigger value="setting">{t('basicSettings')}</TabsTrigger>
            <TabsTrigger value="exclusion">{t('excludedMenus')}</TabsTrigger>
          </TabsList>
          <TabsContent value="setting">
            <div className=" space-y-8">
              <div className="admin-panel p-5 sm:p-6">
                <div className="flex items-center gap-3 text-lg font-semibold text-foreground">
                  <div className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full font-bold">
                    1
                  </div>
                  {t('basicInfo')}
                </div>

                <div className="space-y-4 py-3 mt-4">
                  <div>
                    <ZodTextField
                      register={register}
                      errors={errors}
                      name="name"
                      label={t('couponName')}
                      icon={<Tag size={16} />}
                      placeholder={t('placeholder.couponName')}
                    />
                  </div>
                  <div>
                    <ZodTextField
                      register={register}
                      errors={errors}
                      name="coupon_uid"
                      label={t('couponCode')}
                      icon={<Ticket size={16} />}
                      placeholder={t('placeholder.couponCode')}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('description.couponCode')}
                    </span>
                  </div>
                  <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 justify-end items-end">
                    <div className="flex flex-col gap-2">
                      <Label className="flex items-center gap-2 text-muted-foreground">
                        <Percent size={16} />
                        {t('discountType')}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {t('description.discountType')}
                      </span>
                      <div className="flex items-center gap-3 bg-muted p-3 rounded-md">
                        <div
                          className={`flex-1 text-center p-2 rounded-md text-sm ${discountType === 'percentage' ? 'bg-link text-link-foreground font-medium' : 'text-muted-foreground'}`}
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
                              className="data-[state=checked]:bg-accent-2 data-[state=unchecked]:bg-link"
                            />
                          )}
                        />
                        <div
                          className={`flex-1 text-center p-2 rounded-md text-sm ${discountType === 'fixed' ? 'bg-accent-2-foreground text-accent-2 font-medium' : 'text-muted-foreground'}`}
                        >
                          {t('fixedDiscount')}
                        </div>
                      </div>
                    </div>

                    {discountType === 'percentage' ? (
                      <ZodTextField
                        register={register}
                        errors={errors}
                        name="percentage_discount_value"
                        label={t('percentageDiscount')}
                        type="number"
                        icon={<Percent size={16} />}
                        placeholder={t('placeholder.percentage')}
                      />
                    ) : (
                      <ZodTextField
                        register={register}
                        errors={errors}
                        name="fixed_discount_value"
                        label={t('fixedDiscount')}
                        type="number"
                        icon={<PiggyBank size={16} />}
                        placeholder={t('placeholder.fixed')}
                      />
                    )}
                  </div>
                </div>

                <Separator className="my-10 w-2/3 mx-auto" />

                <div className="flex items-center gap-3 text-lg font-semibold text-foreground mt-6">
                  <div className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full font-bold">
                    2
                  </div>
                  {t('periodAndUsage')}
                </div>

                <div className="space-y-4 py-2 mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-end items-end">
                    <div className="flex flex-col gap-2">
                      <Label className="flex items-center gap-2 text-primary">
                        <CalendarIcon size={16} />
                        {t('startDate')}
                      </Label>

                      <Controller
                        control={control}
                        name="start_date"
                        render={({ field }) => (
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('selectDate')}
                            error={!!errors.start_date}
                            isBirthday={false}
                          />
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
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('selectDate')}
                            error={!!errors.end_date}
                            fromDate={new Date()}
                            isBirthday={false}
                          />
                        )}
                      />
                      {errors.end_date && (
                        <motion.p
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          variants={fadeIn}
                          className="mt-1 text-sm text-destructive flex items-center gap-1"
                        >
                          <AlertCircle size={14} />
                          {errors.end_date?.message}
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('description.validPeriod')}
                    {t('description.validPeriodSecondary')}
                  </span>

                  <ZodTextField
                    register={register}
                    errors={errors}
                    name="max_use_count"
                    label={t('maxUseCount')}
                    type="number"
                    icon={<Hash size={16} />}
                    placeholder={t('placeholder.maxUseCount')}
                  />
                  <span className="text-xs text-muted-foreground">
                    {t('description.maxUseCount')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-lg font-semibold text-foreground mt-4">
                  <div className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full font-bold">
                    3
                  </div>
                  {t('menuAndStatus')}
                </div>

                <div className="space-y-4 py-2">
                  <div className="flex flex-col gap-2 pt-2">
                    <Controller
                      control={control}
                      name="is_active"
                      render={({ field }) => (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Label
                            htmlFor="is_active"
                            className="flex items-center gap-2 text-primary cursor-pointer"
                          >
                            {t('isActive')}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={field.value ? 'default' : 'destructive'}
                              className={`px-2 py-0.5 ${field.value ? 'bg-accent-2-foreground text-accent-2' : 'bg-destructive text-destructive-foreground'}`}
                            >
                              {field.value ? t('active') : t('inactive')}
                            </Badge>
                            <Switch
                              id="is_active"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </div>
                        </div>
                      )}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('description.activeStatus')}
                  </span>
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
                            <ToggleGroupItem value="repeat">{t('repeatCustomers')}</ToggleGroupItem>
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
          <TabsContent value="exclusion">
            <ExclusionMenu
              title={t('excludedMenuDescription')}
              selectedMenuIds={selectedMenuIds}
              setSelectedMenuIdsAction={(menuIds: Id<'menu'>[]) => {
                setSelectedMenuIds(menuIds)
                setValue('selected_menu_ids', menuIds, { shouldValidate: true, shouldDirty: true })
              }}
            />
          </TabsContent>
        </Tabs>

        {/* プレビュー部分 */}
        <div className="xl:col-span-1">
          <div className="space-y-4 xl:sticky xl:top-24">
            <CouponPreview data={previewData} />

            <div className="mt-6">
              <Button type="submit" disabled={isSubmitting} className="w-full " size="lg">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('adding')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {t('createCoupon')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

// インポートに追加
import { withManagerAccess } from '@/components/common'

// ページコンポーネント
function AddCouponPage() {
  const t = useTranslations('coupon')

  return (
    <DashboardSection
      title={t('createCoupon')}
      backLink="/dashboard/coupon"
      backLinkTitle={t('backToList')}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('description.intro')}</p>
          <Separator className="my-2" />
        </div>

        <CouponForm />
      </div>
    </DashboardSection>
  )
}

export default withManagerAccess(AddCouponPage)
