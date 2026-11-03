'use client'

import { Link } from '@/i18n/navigation'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loading, ZodTextField } from '@/components/common'
import { z } from 'zod'
import { fetchQuery } from 'convex/nextjs'
import { useZodForm } from '@/hooks/useZodForm'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { MultiImageDrop } from '@/components/common'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/common'
import { getMinuteMultiples } from '@/lib/schedules'
import { ImageType } from '@/convex/types'
import { useTranslations } from 'next-intl'
import { getPlanLimits } from '@/convex/utils/helpers'
import { SubscriptionPlanName } from '@/convex/types'
import {
  ImageIcon,
  DollarSign,
  PiggyBank,
  Scissors,
  Component as ComponentIcon,
  CrosshairIcon,
  Wallet,
  AlertCircle,
  Info,
  Save,
  Loader2,
  X,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { motion } from 'framer-motion'
import {
  Gender,
  ActiveCustomerType,
  MenuPaymentMethod,
  GENDER_VALUES,
  MENU_CATEGORY_VALUES,
  MENU_PAYMENT_METHOD_VALUES,
  ACTIVE_CUSTOMER_TYPE_VALUES,
  MenuCategory,
} from '@/convex/types'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { Check, ChevronDown, Clock, Users, CreditCard } from 'lucide-react'
import { MAX_NOTES_LENGTH, MAX_NUM } from '@/convex/constants'
import Uploader from '@/components/common/Uploader'
import { zNumberFieldOptional } from '@/lib/validations/common'

// エラーメッセージコンポーネント
const ErrorMessage = ({ message }: { message: string | undefined }) => (
  <motion.p
    className="text-destructive text-sm mt-1 flex items-center gap-1"
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: 'auto' }}
    exit={{ opacity: 0, height: 0 }}
  >
    <AlertCircle size={14} /> {message ?? 'NULL'}
  </motion.p>
)

export default function MenuAddForm() {
  const router = useRouter()
  const t = useTranslations('menu')
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false)
  const [currentFiles, setCurrentFiles] = useState<File[]>([])
  const { showErrorToast } = useErrorHandler()
  const [isUploading, setIsUploading] = useState(false)
  const [targetType, setTargetType] = useState<ActiveCustomerType>('all')
  const [targetGender, setTargetGender] = useState<Gender>('unselected')
  const [paymentMethod, setPaymentMethod] = useState<MenuPaymentMethod>('cash')
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createMenu = useMutation(api.menu.mutation.create)
  const org = useQuery(api.organization.query.findByOrgId, orgId ? { org_id: orgId } : 'skip')

  const limits = getPlanLimits(planName as SubscriptionPlanName)

  console.log('limits', limits)
  // バリデーションスキーマ
  const schemaMenu = z
    .object({
      name: z
        .string({
          required_error: t('validation.nameRequired'),
          invalid_type_error: t('validation.nameInvalid'),
        })
        .min(1, { message: t('validation.nameRequired') })
        .max(100, { message: t('validation.nameMaxLength') }),
      categories: z
        .array(z.enum(MENU_CATEGORY_VALUES))
        .min(1, { message: t('validation.categoryRequired') }),
      unit_price: z
        .number({
          required_error: t('validation.priceRequired'),
          invalid_type_error: t('validation.priceInvalid'),
        })
        .min(1, { message: t('validation.priceRequired') })
        .max(MAX_NUM, { message: t('validation.priceMax', { max: MAX_NUM }) })
        .nullable()
        .optional()
        .refine((val) => val !== null, { message: t('validation.priceRequired') }),
      sale_price: zNumberFieldOptional(MAX_NUM, t('validation.salePriceMax', { max: MAX_NUM })),
      duration_min: z
        .number({
          required_error: t('validation.durationRequired'),
        })
        .refine((val) => val !== 0 && val !== null && val !== undefined, {
          message: t('validation.durationRequired'),
        }),
      warning_message: z.string().optional(),
      description: z
        .string({
          required_error: t('validation.descriptionRequired'),
          invalid_type_error: t('validation.descriptionInvalid'),
        })
        .min(1, { message: t('validation.descriptionRequired') })
        .max(MAX_NOTES_LENGTH, {
          message: t('validation.descriptionMaxLength', { max: MAX_NOTES_LENGTH }),
        }),
      target_gender: z.enum(GENDER_VALUES, { message: t('validation.genderRequired') }),
      target_type: z.enum(ACTIVE_CUSTOMER_TYPE_VALUES, {
        message: t('validation.targetTypeRequired'),
      }),
      tags: z.preprocess(
        (val) => (typeof val === 'string' ? val : Array.isArray(val) ? val.join(',') : ''),
        z
          .string()
          .transform((val) =>
            val
              ? val
                  .replace(/[,、]/g, ',')
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag !== '')
              : []
          )
          .refine((val) => val.length <= 5, { message: t('validation.tagsMaxCount') })
          .refine((val) => val.every((tag) => tag.length <= 20), {
            message: t('validation.tagMaxLength', { max: 20 }),
          })
      ),
      payment_method: z.enum(MENU_PAYMENT_METHOD_VALUES, {
        message: t('validation.paymentMethodRequired'),
      }),
      is_active: z.boolean({ message: t('validation.isActiveRequired') }),
    })
    .refine(
      (data) => {
        // salePriceが存在する場合のみ、unitPriceとの比較を行う
        if (data.sale_price && data.unit_price && data.sale_price >= data.unit_price) {
          return false
        }
        return true
      },
      {
        message: t('validation.salePriceLower'),
        path: ['sale_price'], // エラーメッセージをsalePriceフィールドに表示
      }
    )

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useZodForm(schemaMenu)

  // 支払い方法の選択ロジック
  const handlePaymentMethod = (method: MenuPaymentMethod) => {
    setPaymentMethod(method)
    setValue('payment_method', method, { shouldValidate: true })
  }

  // フォーム送信処理
  const onSubmit = async (data: z.infer<typeof schemaMenu>) => {
    try {
      if (!tenantId || !orgId || !planName) {
        toast.error(t('errors.tenantOrOrgRequired'))
        return
      }

      await fetchQuery(api.tenant.plan.query.checkLimitByPlan, {
        tenant_id: tenantId,
        org_id: orgId,
        limit_type: 'menu',
      })

      setIsSubmitting(true)
      let newUploadedImageUrls: ImageType[] = []

      if (currentFiles.length > 0) {
        setIsUploading(true)
        try {
          // Promise.allを使って複数の画像を並列アップロード
          const uploadPromises = currentFiles.map(async (file) => {
            return uploadImage(file, orgId, 'menu', 'mobile', 'medium')
          })

          const uploadResults = await Promise.all(uploadPromises)
          newUploadedImageUrls = uploadResults.map((result) => ({
            original_url: result.originalUrl,
            thumbnail_url: result.thumbnailUrl,
          }))

          setIsUploading(false)
        } catch (err) {
          // APIへのリクエスト失敗時や、API側でロールバックが発生した場合
          // newUploadedImageUrls には何も入っていないか、APIがロールバックしているのでここでは削除処理は不要

          setIsUploading(false)
          setIsSubmitting(false)
          showErrorToast(err)
          return
        }
      }

      try {
        const menuId = await createMenu({
          tenant_id: tenantId,
          org_id: orgId,
          plan_name: planName as SubscriptionPlanName,
          name: data.name,
          categories: data.categories,
          unit_price: data.unit_price ?? 0,
          sale_price: data.sale_price ?? undefined,
          duration_min: data.duration_min,
          images: newUploadedImageUrls,
          warning_message: data.warning_message,
          description: data.description,
          target_gender: data.target_gender,
          target_type: data.target_type,
          tags: data.tags,
          payment_method: data.payment_method,
          is_active: data.is_active,
        })

        toast.success(t('menuCreated'))
        router.push(`/dashboard/menu/${menuId}`)
      } catch (err) {
        // メニュー作成に失敗した場合、アップロードした画像を削除
        // newUploadedImageUrlsを使って削除処理を行う (API側でロールバックされていなければ)
        // ただし、API側でロールバックが行われているはずなので、ここでの削除は二重処理になる可能性がある
        // そのため、エラー発生時の画像削除ロジックを再検討するか、API側でのロールバックに依存する。
        // 現状は、API側のロールバックに任せ、クライアント側ではStateのクリアのみ行う。

        setIsSubmitting(false)
        console.log(err)
        showErrorToast(err)
      }
    } catch (err) {
      setIsSubmitting(false)
      showErrorToast(err)
    }
  }

  // 初期化
  useEffect(() => {
    if (tenantId && orgId) {
      reset({
        name: undefined as unknown as string,
        categories: [] as MenuCategory[],
        unit_price: undefined as unknown as number,
        sale_price: undefined as unknown as number,
        duration_min: undefined as unknown as number,
        warning_message: undefined as unknown as string,
        description: undefined as unknown as string,
        target_gender: 'unselected',
        target_type: 'all',
        tags: [] as string[],
        payment_method: 'cash',
        is_active: true,
      })
      setCurrentTags([])
      setCurrentFiles([]) // currentFilesも初期化
    }
  }, [tenantId, orgId, reset])

  if (!tenantId || !orgId) {
    return <Loading />
  }

  if (isUploading) {
    return <Uploader />
  }

  return (
    <div>
      <form
        className="admin-form p-5 sm:p-6"
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-1">
            <div className="text-base flex items-center gap-2 mb-2">
              <ImageIcon size={18} className="text-muted-foreground" />
              {t('images')} {t('imagesLimit')}
            </div>
            <MultiImageDrop
              currentFiles={currentFiles}
              onFilesSelect={(newFiles) => {
                setCurrentFiles(newFiles as File[])
              }}
              maxSizeMB={6}
              limitFiles={limits.maxMenuImageCount}
              hasSelected={currentFiles.length}
            />
          </div>

          <div className="md:col-span-2 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <ZodTextField
                name="name"
                label={t('menuName')}
                icon={<Scissors className="text-muted-foreground" />}
                placeholder={t('placeholder.menuName')}
                register={register}
                errors={errors}
                required
                className="border-link-foreground focus-within:border-link-foreground transition-colors"
              />
              <div>
                <div className="text-sm flex items-start gap-2 mb-2">
                  <ComponentIcon size={16} className="text-muted-foreground" />
                  <Label className="text-sm flex items-center gap-2">{t('categories')}</Label>
                  <span className="text-destructive">*</span>
                </div>
                <Popover open={isCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      onClick={() => setIsCategoryPopoverOpen(true)}
                      className="w-full h-fit justify-between border border-border"
                    >
                      <p className="text-wrap w-full">
                        {watch('categories') && watch('categories').length > 0
                          ? watch('categories')
                              .map((cat: string) => cat)
                              .join(', ')
                          : t('placeholder.selectCategory')}
                      </p>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onInteractOutside={() => setIsCategoryPopoverOpen(false)}
                    className="w-[300px] p-0 relative"
                  >
                    <Command>
                      <div className="absolute top-0 right-0 flex items-center justify-end gap-2 p-2 z-10">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setIsCategoryPopoverOpen(false)
                          }}
                        >
                          <X size={16} />
                        </Button>
                      </div>
                      <CommandEmpty>{t('validation.categoryNotFound')}</CommandEmpty>
                      <CommandGroup>
                        {MENU_CATEGORY_VALUES.map((category) => (
                          <CommandItem
                            key={category}
                            onSelect={() => {
                              const current = watch('categories') || []
                              if (current.includes(category)) {
                                // If the category exists, remove it
                                setValue(
                                  'categories',
                                  current.filter((c: string) => c !== category),
                                  { shouldValidate: true }
                                )
                              } else {
                                // If the category doesn't exist, check if we can add it
                                if (current.length >= 5) {
                                  toast.error(t('validation.categoryMaxCount'))
                                  return
                                } else {
                                  setValue('categories', [...current, category], {
                                    shouldValidate: true,
                                  })
                                }
                              }
                            }}
                          >
                            <Check
                              className={
                                (watch('categories') || []).includes(category)
                                  ? 'mr-2 h-4 w-4 opacity-100'
                                  : 'mr-2 h-4 w-4 opacity-0'
                              }
                            />
                            {category}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground mt-1">{t('help.multipleCategories')}</p>

                {errors.categories && <ErrorMessage message={errors.categories.message} />}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ZodTextField
                name="unit_price"
                label={t('unitPrice')}
                icon={<PiggyBank className="text-muted-foreground" />}
                type="number"
                placeholder={t('placeholder.unitPrice')}
                register={register}
                errors={errors}
                required
                className="border-link-foreground focus-within:border-link-foreground transition-colors"
              />

              <ZodTextField
                name="sale_price"
                label={t('salePrice')}
                type="number"
                icon={<DollarSign className="text-muted-foreground" />}
                placeholder={t('placeholder.salePrice')}
                register={register}
                errors={errors}
                className="border-link-foreground focus-within:border-link-foreground transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="max-w-full">
                <Label className="text-sm flex items-center gap-2">
                  <Clock size={16} className="text-muted-foreground" />
                  {t('durationMinutes')} <span className="text-destructive ml-1">*</span>
                </Label>
                <Select
                  onValueChange={(value) => {
                    setValue('duration_min', parseInt(value), { shouldValidate: true })
                  }}
                >
                  <SelectTrigger className="transition-colors">
                    <SelectValue placeholder={t('placeholder.selectDuration')} />
                  </SelectTrigger>
                  <SelectContent>
                    {getMinuteMultiples(5, 360).map((time) => (
                      <SelectItem key={time} value={time.toString()}>
                        {time}
                        {t('minutes')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.duration_min && <ErrorMessage message={errors.duration_min.message} />}
                <span className="text-xs text-muted-foreground">{t('help.durationTotal')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <CrosshairIcon size={16} className="text-muted-foreground" />
                  {t('target')}
                </Label>

                <Select
                  value={targetType}
                  onValueChange={(value) => {
                    setTargetType(value as ActiveCustomerType)
                    setValue('target_type', value as ActiveCustomerType, { shouldValidate: true })
                  }}
                >
                  <SelectTrigger className="transition-colors">
                    <SelectValue defaultValue={'all'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allCustomers')}</SelectItem>
                    <SelectItem value="first_time">{t('firstTime')}</SelectItem>
                    <SelectItem value="repeat">{t('repeat')}</SelectItem>
                  </SelectContent>
                </Select>
                {errors.target_type && <ErrorMessage message={errors.target_type.message} />}
                <span className="text-xs text-muted-foreground">{t('help.targetCustomer')}</span>
              </div>
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Users size={16} className="text-muted-foreground" />
                  {t('gender')}
                </Label>

                <Select
                  value={targetGender}
                  onValueChange={(value) => {
                    setTargetGender(value as Gender)
                    setValue('target_gender', value as Gender, { shouldValidate: true })
                  }}
                >
                  <SelectTrigger className="transition-colors">
                    <SelectValue defaultValue={'unselected'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unselected" className="flex items-center gap-2">
                      {t('allGenders')}
                    </SelectItem>
                    <SelectItem value="male" className="flex items-center gap-2">
                      {t('male')}
                    </SelectItem>
                    <SelectItem value="female" className="flex items-center gap-2">
                      {t('female')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.target_gender && <ErrorMessage message={errors.target_gender.message} />}
                <span className="text-xs text-muted-foreground">{t('help.targetGender')}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-12 w-1/2 mx-auto" />

        <TagInput
          tags={currentTags}
          setTagsAction={(tags) => {
            setCurrentTags(tags)
            setValue('tags', tags.join('、') as unknown as string[], { shouldValidate: true })
          }}
          errors={errors.tags}
        />

        <Label className="flex items-center gap-2 text-sm mb-3 mt-8">
          <CreditCard size={16} className="text-muted-foreground" />
          {t('paymentMethod')}
        </Label>

        {org?.stripe_connect_status === 'active' ? (
          <ToggleGroup
            type="single"
            className="w-full flex flex-wrap justify-start items-center gap-4"
            value={paymentMethod}
            onValueChange={(value) => handlePaymentMethod(value as MenuPaymentMethod)}
          >
            <ToggleGroupItem value="cash">{t('storePaymentOnly')}</ToggleGroupItem>
            <ToggleGroupItem value="credit_card">{t('onlinePaymentOnly')}</ToggleGroupItem>
            <ToggleGroupItem value="all">{t('bothPayments')}</ToggleGroupItem>
          </ToggleGroup>
        ) : (
          <div className="bg-warning border border-warning-foreground rounded-md p-4">
            <p className="text-base font-medium text-warning-foreground mb-2 flex items-center gap-2">
              <Wallet size={18} />
              {t('onlinePaymentNotAvailable')}
            </p>
            <p className="text-sm text-warning-foreground">
              {t('onlinePaymentSetupRequired')}
              <Link
                href="/dashboard/setting"
                className="text-link-foreground underline font-medium"
              >
                {t('paymentSettings')}
              </Link>
              {t('completeSetup')}
            </p>
          </div>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs  mt-2 flex items-center gap-1 cursor-help w-fit">
                <AlertCircle size={14} />
                {t('onlinePaymentFee')}
              </p>
            </TooltipTrigger>
            <TooltipContent className=" p-3 shadow-lg border  text-xs ">
              <p>{t('onlinePaymentFeeDetails')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Label className="flex items-center gap-2 text-sm mb-2 mt-6">
          <Info size={16} className="text-muted-foreground" />
          {t('menuDescription')} <span className="text-destructive ml-1">*</span>
        </Label>
        <Textarea
          id="description"
          placeholder={t('placeholder.menuDescription')}
          {...register('description')}
          onChange={(e) => setValue('description', e.target.value, { shouldValidate: true })}
          rows={8}
          className="border-border focus-visible:ring-border resize-none"
        />
        {errors.description && <ErrorMessage message={errors.description?.message} />}

        <Label className="flex items-center gap-2 text-sm mb-2 mt-6">
          <Info size={16} className="text-muted-foreground" />
          {t('warningMessage')} <span className="text-destructive ml-1">*</span>
        </Label>
        <Textarea
          id="warning_message"
          placeholder={t('placeholder.warningMessage')}
          {...register('warning_message')}
          onChange={(e) => setValue('warning_message', e.target.value, { shouldValidate: true })}
          rows={4}
          className="border-border focus-visible:ring-border resize-none"
        />
        {errors.warning_message && <ErrorMessage message={errors.warning_message?.message} />}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4 mb-6 mt-4">
          <div>
            <p className="text-sm font-bold">{t('publishMenu')}</p>
            <p className="text-xs text-muted-foreground mt-2">{t('publishMenuDescription')}</p>
          </div>
          <Switch
            id="is_active"
            checked={watch('is_active')}
            onCheckedChange={(checked) => setValue('is_active', checked)}
          />
        </div>

        <div className="flex justify-end border-t border-border pt-5 mt-6">
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/menu')}
              className="min-w-28 border-border"
            >
              {t('backButton')}
            </Button>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button type="submit" disabled={isSubmitting || isUploading}>
                {isSubmitting || isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('adding')}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {t('addMenuButton')}
                  </>
                )}
              </Button>
            </motion.div>
          </div>
        </div>
      </form>
    </div>
  )
}
