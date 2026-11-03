'use client'

import { Link } from '@/i18n/navigation'
import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loading, ZodTextField } from '@/components/common'
import { Loader2 } from 'lucide-react'
import { MENU_CATEGORY_VALUES, SubscriptionPlanName } from '@/convex/types'
import { SortableImageGrid } from '@/components/common'
import { z } from 'zod'
import { useZodForm } from '@/hooks/useZodForm'
import { MultiImageDrop, TagInput } from '@/components/common'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { ImageIcon, DollarSign, Clock, Users, Wallet, AlertCircle, Save, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { getPlanLimits } from '@/convex/utils/helpers'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { motion } from 'framer-motion'
import { Id } from '@/convex/_generated/dataModel'
import { zNumberFieldOptional } from '@/lib/validations/common'
import {
  GENDER_VALUES,
  ACTIVE_CUSTOMER_TYPE_VALUES,
  MENU_PAYMENT_METHOD_VALUES,
  Gender,
  MenuPaymentMethod,
  ImageType,
  MenuCategory,
  ActiveCustomerType,
} from '@/convex/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import {
  Scissors,
  Check,
  ChevronDown,
  Component as ComponentIcon,
  PiggyBank,
  FileText,
  Crosshair,
  CreditCard,
  Info,
} from 'lucide-react'
import { getMinuteMultiples } from '@/lib/schedules'
import { MAX_NUM, MAX_NOTES_LENGTH, MAX_TAG_LENGTH } from '@/convex/constants'
import Uploader from '@/components/common/Uploader'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'

// 翻訳関数型定義
type TranslationValues = Record<string, string | number | Date>
type TranslationFunction = (key: string, params?: TranslationValues) => string

// バリデーションスキーマを生成する関数
const createMenuSchema = (t: TranslationFunction) =>
  z
    .object({
      name: z
        .string({
          required_error: t('validation.nameRequired'),
        })
        .min(1, { message: t('validation.nameRequired') })
        .max(100, { message: t('validation.nameMaxLength') })
        .optional(),
      categories: z
        .array(z.enum(MENU_CATEGORY_VALUES))
        .min(1, { message: t('validation.categoryRequired') })
        .optional(),
      unit_price: z
        .number({
          required_error: t('validation.priceRequired'),
        })
        .min(1, { message: t('validation.priceMin') })
        .max(MAX_NUM, { message: t('validation.priceMax', { max: MAX_NUM }) })
        .nullable()
        .optional()
        .refine((val) => val !== null, { message: t('validation.priceRequired') })
        .optional(),
      sale_price: zNumberFieldOptional(MAX_NUM, t('validation.salePriceMax', { max: MAX_NUM })),
      duration_min: z
        .number({
          required_error: t('validation.durationRequired'),
        })
        .refine((val) => val !== null || val !== undefined || val !== 0, {
          message: t('validation.durationRequired'),
        })
        .optional(),
      images: z
        .array(
          z.object({
            original_url: z.string(),
            thumbnail_url: z.string(),
          })
        )
        .optional(),
      remove_images: z
        .array(
          z.object({
            original_url: z.string(),
            thumbnail_url: z.string(),
          })
        )
        .optional(),
      warning_message: z
        .string()
        .max(MAX_NOTES_LENGTH, {
          message: t('validation.descriptionMax', { max: MAX_NOTES_LENGTH }),
        })
        .optional(),
      description: z
        .string()
        .min(1, { message: t('validation.descriptionRequired') })
        .max(MAX_NOTES_LENGTH, {
          message: t('validation.descriptionMax', { max: MAX_NOTES_LENGTH }),
        })
        .optional(),
      target_gender: z.enum(GENDER_VALUES, { message: t('validation.genderRequired') }).optional(),
      target_type: z
        .enum(ACTIVE_CUSTOMER_TYPE_VALUES, { message: t('validation.targetTypeRequired') })
        .optional(),
      tags: z
        .any()
        .optional()
        .transform((val) => {
          if (!val) return []
          if (Array.isArray(val)) return val
          if (typeof val === 'string') {
            return val
              .replace(/[,、]/g, ',')
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag !== '')
          }
          return []
        })
        .refine((tags) => tags.length <= 5, {
          message: t('validation.tagsMax'),
        })
        .refine((tags) => tags.every((tag: string) => tag.length <= MAX_TAG_LENGTH), {
          message: t('validation.tagsLengthMax', { max: MAX_TAG_LENGTH }),
        }),
      payment_method: z
        .enum(MENU_PAYMENT_METHOD_VALUES, { message: t('validation.paymentMethodRequired') })
        .optional(),
      is_active: z.boolean({ message: t('validation.isActiveRequired') }).optional(),
    })
    .refine(
      (data) => {
        // salePriceが存在する場合のみ、priceとの比較を行う
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

// Error message component
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

export default function MenuEditForm() {
  const router = useRouter()
  const params = useParams()
  const menuId = params.menu_id as Id<'menu'>
  const t = useTranslations('menus')
  const { orgId, tenantId, stripeConnectStatus, planName } = useTenantAndOrganization()
  const menuData = useQuery(api.menu.query.findById, { menu_id: menuId })
  const limits = getPlanLimits(planName as SubscriptionPlanName)

  const [isCategoryPopoverOpen, setIsCategoryPopoverOpen] = useState(false)
  const { showErrorToast } = useErrorHandler()
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<ImageType[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [targetType, setTargetType] = useState<ActiveCustomerType>('all')
  const [targetGender, setTargetGender] = useState<Gender>('unselected')
  const [paymentMethod, setPaymentMethod] = useState<MenuPaymentMethod>('cash')
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateMenu = useMutation(api.menu.mutation.update)

  // メニュー用バリデーションスキーマをメモ化
  const schemaMenu = useMemo(() => createMenuSchema(t), [t])

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useZodForm(schemaMenu)
  // データ取得後にフォームを初期化
  useEffect(() => {
    if (menuData && !isInitialized) {
      const categoriesValue = menuData.categories || []
      const durationMinValue = menuData.duration_min || undefined
      const targetGenderValue = menuData.target_gender || 'unselected'
      const targetTypeValue = menuData.target_type || 'all'
      const paymentMethodValue = menuData.payment_method || 'cash'
      const warningMessageValue = menuData.warning_message || ''

      // ステート変数を設定
      setExistingImages(
        menuData.images?.map((image) => ({
          original_url: image.original_url || '',
          thumbnail_url: image.thumbnail_url || '',
        })) || []
      )
      setCurrentTags(menuData.tags || [])

      setTargetGender(targetGenderValue)
      setTargetType(targetTypeValue)
      setValue('images', menuData.images ?? [])
      setPaymentMethod(paymentMethodValue)
      setValue('warning_message', warningMessageValue)

      // フォームを初期化
      reset({
        name: menuData.name,
        categories: categoriesValue,
        unit_price: menuData.unit_price ?? undefined,
        sale_price: menuData.sale_price ?? undefined,
        duration_min: durationMinValue ?? undefined,
        warning_message: menuData.warning_message,
        description: menuData.description,
        target_gender: targetGenderValue,
        target_type: targetTypeValue,
        tags: menuData.tags ?? undefined,
        payment_method: paymentMethodValue,
        is_active: menuData.is_active ?? true,
        images: menuData.images,
      })

      // 初期化完了フラグを設定
      setIsInitialized(true)
    }
  }, [menuData, reset, setValue, isInitialized])

  // フォーム送信処理
  const onSubmit = async (data: z.infer<typeof schemaMenu>) => {
    console.log('onSubmit: ', data)
    try {
      console.log('data: ', data)
      if (!orgId || !tenantId || !menuData) {
        toast.error(t('messages.salonNotFound'))
        return
      }
      setIsSubmitting(true)
      // 既存画像を初期値として設定（SortableImageGridで変更された可能性があるため）
      let imagesToSave: ImageType[] = [...existingImages]

      if (newFiles.length > 0 && newFiles[0] !== undefined) {
        setIsUploading(true)
        try {
          // Promise.allを使って複数の画像を並列アップロード
          const uploadPromises = newFiles.map(async (file) => {
            return uploadImage(file, orgId, 'menu', 'mobile', 'medium')
          })
          console.log('アップロード開始 - ファイル数:', newFiles.length)

          const uploadResults = await Promise.all(uploadPromises)
          console.log('uploadResults: ', uploadResults)
          setIsUploading(false)

          const uploadedImages = uploadResults.map((result) => ({
            original_url: result.originalUrl,
            thumbnail_url: result.thumbnailUrl,
          }))
          console.log('--------------------------------')
          console.log('uploadImages: ', uploadedImages)
          console.log('既存画像(existingImages):', existingImages)
          console.log('新規画像(newFiles):', newFiles)
          console.log('アップロード結果(uploadResults):', uploadResults)
          console.log('アップロードされた画像(uploadedImages):', uploadedImages)
          console.log('保存対象画像(imagesToSave)　前:', imagesToSave)
          imagesToSave = [...existingImages, ...uploadedImages]
          console.log('マージ後 imagesToSave:', imagesToSave)
        } catch (err) {
          setIsUploading(false)
          setIsSubmitting(false)
          showErrorToast(err)
          return
        }
      }
      const finalImagesToDelete: { original_url: string; thumbnail_url: string }[] = []

      // FIXME: ここでmenuData.imagesに含まれていて、imagesToSaveに含まれていない画像をfinalImagesToDeleteに追加する
      menuData.images?.forEach((initialImage) => {
        // original_urlが存在し、imagesToSave（編集後の画像群）に含まれていなければ削除対象
        if (
          initialImage.original_url &&
          !imagesToSave.some((img) => img.original_url === initialImage.original_url)
        ) {
          finalImagesToDelete.push({
            original_url: initialImage.original_url,
            thumbnail_url: initialImage.thumbnail_url ?? '',
          })
        }
      })

      if (finalImagesToDelete.length > 0) {
        try {
          const removeImages = watch('remove_images') || []
          // APIが期待する形式に合わせてペイロードを構築
          const deleteApiPayload = {
            originalUrls: [
              ...finalImagesToDelete.map((img) => img.original_url),
              ...removeImages.map((img) => img.original_url),
            ], // imgPath の配列を imgUrls に設定
            withThumbnail: true, // すべての画像に対してサムネイルも削除すると仮定
          }
          const deleteResponse = await fetch('/api/storage', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deleteApiPayload), // 単一のオブジェクトを送信
          })

          if (!deleteResponse.ok) {
            const errorData = {
              message: `ストレージからの画像削除リクエスト失敗 (ステータス: ${deleteResponse.status})`,
              details: {},
            }
            try {
              // レスポンスボディが存在し、JSON形式であればパース試行
              if (deleteResponse.body) {
                const textBody = await deleteResponse.text() // まずテキストとして読み込む
                if (textBody) {
                  // ボディが空でないことを確認
                  errorData.details = JSON.parse(textBody) // その後JSONとしてパース
                } else {
                  errorData.details = { originalResponse: 'empty body' }
                }
              }
            } catch (e) {
              // JSONパースに失敗した場合 (レスポンスがJSONでない、または不正なJSON)
              console.warn('画像削除APIのエラーレスポンスのJSONパースに失敗:', e)
              errorData.details = { originalResponse: 'not a valid JSON or failed to parse' }
            }
            console.error('ストレージからの画像削除に失敗:', errorData)
            toast.error(errorData.message)
          } else {
            // 成功時でもレスポンスボディがあるか確認
            const successData = await deleteResponse.json().catch(() => null)
            if (successData) {
              console.log('画像削除成功レスポンス:', successData)
              toast.info(
                successData.message ||
                  t('messages.deletingImages', { count: finalImagesToDelete.length })
              )
            } else {
              toast.info(
                t('messages.deletingImages', { count: finalImagesToDelete.length }) +
                  ' (レスポンスボディなし)'
              )
            }
          }
        } catch (err: unknown) {
          // catchの型をanyに
          console.error('ストレージからの画像削除中にクライアントサイドエラー:', err)
          toast.error(
            t('messages.deleteImageError', {
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          )
        }
      }

      console.log('updateMenu直前 imagesToSave:', imagesToSave)
      await updateMenu({
        menu_id: menuId,
        name: data.name,
        categories: data.categories,
        unit_price: data.unit_price,
        sale_price: data.sale_price ?? undefined,
        duration_min: data.duration_min,
        images: imagesToSave,
        warning_message: data.warning_message,
        description: data.description,
        target_gender: data.target_gender,
        target_type: data.target_type,
        tags: data.tags,
        payment_method: data.payment_method,
        is_active: data.is_active,
      })
      toast.success(t('messages.updateSuccess'))
      router.push(`/dashboard/menu/${menuId}`)
    } catch (err) {
      setIsSubmitting(false)
      showErrorToast(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 確実に初期値がレンダリングされることを確認
  const renderTargetType = targetType || menuData?.target_type || 'all'
  const renderTargetGender = targetGender || menuData?.target_gender || 'unselected'
  const renderCategories = watch('categories') || menuData?.categories || []
  const renderDurationMin = watch('duration_min') || menuData?.duration_min || undefined

  if (!orgId || !tenantId || !menuData || !isInitialized) {
    return <Loading />
  }

  if (isUploading) {
    return <Uploader />
  }

  return (
    <div>
      <form
        className="admin-form p-5 sm:p-6"
        onSubmit={(e) => {
          handleSubmit(onSubmit, (validationErrors) => {
            console.error('❌ Zod validation errors:', validationErrors)
          })(e)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
        onError={(e) => {
          console.log('onError: ', e)
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8">
          <div className="md:col-span-2">
            <div className="h-full flex flex-col">
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon size={18} className="text-muted-foreground" />
                  {t('form.menuImage')}
                </CardTitle>
              </CardHeader>
              <SortableImageGrid
                images={existingImages}
                onChange={(images) => {
                  setExistingImages(images)
                  setValue('images', images, { shouldValidate: true, shouldDirty: true })
                }}
              />
              <MultiImageDrop
                currentFiles={newFiles}
                maxSizeMB={6}
                onFilesSelect={(files: File[]) => {
                  setNewFiles(files)
                  // この値は使用しないので、空配列を設定して変更のみをトリガーする
                  setValue('images', [], { shouldValidate: true, shouldDirty: true })
                }}
                limitFiles={limits.maxMenuImageCount}
                hasSelected={existingImages.length}
              />
            </div>
          </div>

          <div className="md:col-span-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <ZodTextField
                name="name"
                label={t('form.menuName')}
                icon={<Scissors className="text-muted-foreground" />}
                placeholder={t('form.menuNamePlaceholder')}
                register={register}
                errors={errors}
                required
                className="border-border focus-within:border-border transition-colors"
              />
              <div>
                <div className="text-sm flex items-start gap-2 mb-2">
                  <ComponentIcon size={16} className="text-muted-foreground" />
                  <Label className="text-sm flex items-center gap-2">{t('form.category')}</Label>
                  <span className="text-destructive">*</span>
                </div>
                <Popover open={isCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                      onClick={() => setIsCategoryPopoverOpen(true)}
                    >
                      {renderCategories && renderCategories.length > 0
                        ? renderCategories.map((cat: string) => cat).join(', ')
                        : t('form.categoryPlaceholder')}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 relative">
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
                      <CommandEmpty>{t('form.categoryNotFound')}</CommandEmpty>
                      <CommandGroup>
                        {MENU_CATEGORY_VALUES.map((category) => (
                          <CommandItem
                            key={category}
                            onSelect={() => {
                              const current = renderCategories || []
                              if (current.includes(category)) {
                                setValue(
                                  'categories',
                                  current.filter((c: MenuCategory) => c !== category),
                                  { shouldValidate: true, shouldDirty: true }
                                )
                              } else {
                                setValue('categories', [...current, category], {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                })
                              }
                            }}
                          >
                            <Check
                              className={
                                (renderCategories || []).includes(category)
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
                <span className="text-xs text-muted-foreground">
                  {t('form.categoryRequest')}
                  <a href="mailto:bocker.help@gmail.com" className="text-link-foreground underline">
                    {t('form.categoryRequestLink')}
                  </a>
                  {t('form.categoryRequestSuffix')}
                </span>
                {errors.categories && <ErrorMessage message={errors.categories.message} />}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ZodTextField
                name="unit_price"
                label={t('form.price')}
                icon={<PiggyBank className="text-muted-foreground" />}
                type="number"
                placeholder={t('form.pricePlaceholder')}
                register={register}
                errors={errors}
                required
                className="border-border focus-within:border-border transition-colors"
              />

              <ZodTextField
                name="sale_price"
                label={t('form.salePrice')}
                type="number"
                icon={<DollarSign className="text-muted-foreground" />}
                placeholder={t('form.salePricePlaceholder')}
                register={register}
                errors={errors}
                className="border-border focus-within:border-border transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="max-w-full">
                <Label className="text-sm flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-muted-foreground" />
                  {t('form.duration')} <span className="text-destructive ml-1">*</span>
                </Label>
                <Select
                  value={watch('duration_min')?.toString() ?? renderDurationMin?.toString()}
                  onValueChange={(value) => {
                    if (!value) {
                      setValue('duration_min', undefined, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                      return
                    }
                    const n = parseInt(value, 10)
                    if (!Number.isNaN(n)) {
                      setValue('duration_min', n, { shouldValidate: true, shouldDirty: true })
                    }
                  }}
                >
                  <SelectTrigger className="border-border focus:border-border transition-colors">
                    <SelectValue placeholder={t('form.durationPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {getMinuteMultiples(5, 360).map((time) => (
                      <SelectItem key={time} value={time.toString()}>
                        {time}
                        {t('form.minutes')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{t('form.durationHelp')}</span>
                {errors.duration_min && <ErrorMessage message={errors.duration_min.message} />}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Crosshair size={16} className="text-muted-foreground" />
                  {t('form.target')}
                </Label>
                <span className="text-xs text-muted-foreground">{t('form.targetHelp')}</span>
                <Select
                  value={renderTargetType}
                  onValueChange={(value: ActiveCustomerType) => {
                    if (!value.trim()) return
                    const typedValue = value
                    setTargetType(typedValue)
                    setValue('target_type', typedValue, { shouldValidate: true, shouldDirty: true })
                  }}
                >
                  <SelectTrigger className="border-border focus:border-border transition-colors">
                    <SelectValue placeholder={t('form.targetPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('form.targetAll')}</SelectItem>
                    <SelectItem value="first_time">{t('form.targetFirst')}</SelectItem>
                    <SelectItem value="repeat">{t('form.targetRepeat')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="flex items-center gap-2 text-sm">
                  <Users size={16} className="text-muted-foreground" />
                  {t('form.gender')}
                </Label>
                <span className="text-xs text-muted-foreground">{t('form.genderHelp')}</span>
                <Select
                  value={renderTargetGender}
                  onValueChange={(value: Gender) => {
                    if (!value.trim()) return
                    const typedValue = value
                    setTargetGender(typedValue)
                    setValue('target_gender', typedValue, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }}
                >
                  <SelectTrigger className="border-border focus:border-border transition-colors">
                    <SelectValue placeholder={t('form.genderPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unselected" className="flex items-center gap-2">
                      {t('form.genderAll')}
                    </SelectItem>
                    <SelectItem value="male" className="flex items-center gap-2">
                      {t('form.genderMale')}
                    </SelectItem>
                    <SelectItem value="female" className="flex items-center gap-2">
                      {t('form.genderFemale')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TagInput
              tags={currentTags}
              setTagsAction={(tags: string[]) => {
                setCurrentTags(tags)
                setValue('tags', tags, { shouldValidate: true, shouldDirty: true })
              }}
              errors={errors.tags}
            />
            <div className="flex flex-col w-full gap-2">
              <Label className="flex items-center gap-2 text-sm mb-3 mt-4">
                <CreditCard size={16} className="text-muted-foreground" />
                {t('form.paymentMethod')}
              </Label>
              {stripeConnectStatus === 'active' ? (
                <ToggleGroup
                  type="single"
                  className="w-full flex flex-wrap justify-start items-center gap-3"
                  value={paymentMethod || 'cash'}
                  onValueChange={(value) => {
                    if (value) {
                      const typedValue = value as MenuPaymentMethod
                      setPaymentMethod(typedValue)
                      setValue('payment_method', typedValue, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                  }}
                >
                  <ToggleGroupItem value="cash">{t('form.paymentCash')}</ToggleGroupItem>
                  <ToggleGroupItem value="credit_card">{t('form.paymentOnline')}</ToggleGroupItem>
                  <ToggleGroupItem value="all">{t('form.paymentBoth')}</ToggleGroupItem>
                </ToggleGroup>
              ) : (
                <div className="bg-warning border border-warning-foreground rounded-md p-4">
                  <p className="text-base font-medium text-warning-foreground mb-2 flex items-center gap-2">
                    <Wallet size={18} />
                    {t('form.paymentOfflineOnly')}
                  </p>
                  <p className="text-sm text-warning-foreground">
                    {t('form.paymentSetupRequired')}
                    <Link
                      href="/dashboard/setting"
                      className="text-link-foreground underline font-medium"
                    >
                      {t('form.paymentSetupLink')}
                    </Link>
                    {t('form.paymentSetupSuffix')}
                  </p>
                </div>
              )}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 cursor-help">
                    <AlertCircle size={14} />
                    {t('form.paymentFeeNotice')}
                  </p>
                </TooltipTrigger>
                <TooltipContent className="bg-background p-3 shadow-lg border border-border text-muted-foreground text-xs">
                  <p>{t('form.paymentFeeDetail')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <Separator className="my-8" />

        <Label className="flex items-center gap-2 text-sm mb-2 mt-4">
          <FileText size={16} className="text-muted-foreground" />
          {t('form.description')} <span className="text-destructive ml-1">*</span>
        </Label>
        <Textarea
          id="description"
          placeholder={t('form.descriptionPlaceholder')}
          {...register('description')}
          onChange={(e) =>
            setValue('description', e.target.value, { shouldValidate: true, shouldDirty: true })
          }
          rows={8}
          className="border-border focus-visible:ring-border resize-none"
        />
        {errors.description && <ErrorMessage message={errors.description?.message} />}

        <Label className="flex items-center gap-2 text-sm mb-2 mt-6">
          <Info size={16} className="text-muted-foreground" />
          {t('form.warningMessage')} <span className="text-destructive ml-1">*</span>
        </Label>
        <Textarea
          id="warning_message"
          placeholder={t('form.warningMessagePlaceholder')}
          {...register('warning_message')}
          onChange={(e) =>
            setValue('warning_message', e.target.value, { shouldValidate: true, shouldDirty: true })
          }
          rows={4}
          className="border-border focus-visible:ring-border resize-none"
        />
        {errors.warning_message && <ErrorMessage message={errors.warning_message?.message} />}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4 mb-6 mt-4">
          <div>
            <p className="text-sm font-bold">{t('form.publish')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('form.publishHelp')}</p>
          </div>
          <Switch
            id="isActive"
            checked={watch('is_active') || false}
            onCheckedChange={(checked) =>
              setValue('is_active', checked, { shouldValidate: true, shouldDirty: true })
            }
          />
        </div>

        <div className="flex w-full mt-6">
          <div className="flex justify-between w-full gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/menu')}
              className="min-w-28 border-border"
            >
              {t('form.back')}
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || isUploading}
              onClick={() => {
                console.log('Button clicked - Debug info:', {
                  isSubmitting,
                  isUploading,
                  isDirty,
                  newFilesLength: newFiles.length,
                  formErrors: errors,
                  formValues: watch(),
                })
              }}
            >
              {isSubmitting || isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('edit.updating')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('form.update')}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
