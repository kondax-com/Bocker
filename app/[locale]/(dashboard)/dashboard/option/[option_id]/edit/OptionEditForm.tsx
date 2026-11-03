'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'convex/react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { api } from '@/convex/_generated/api'
import { Trash2 } from 'lucide-react'
import { Id } from '@/convex/_generated/dataModel'
import { useZodForm } from '@/hooks/useZodForm'
import { z } from 'zod'
import { Loading, ZodTextField, SingleImageDrop, TagInput } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import Image from 'next/image'
import { getMinuteMultiples } from '@/lib/schedules' // getMinuteMultiplesを追加
import { zNumberFieldOptional } from '@/lib/validations/common'
import {
  Tag,
  DollarSign,
  ShoppingBag,
  Boxes,
  Info,
  AlertCircle,
  Clock,
  Save,
  Loader2,
} from 'lucide-react' // Clockを追加
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select' // Select関連を追加
import { Card, CardContent } from '@/components/ui/card'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'
import { ImageType } from '@/convex/types'
import { MAX_NUM } from '@/convex/constants'
import Uploader from '@/components/common/Uploader'

// バリデーションスキーマ
const optionSchema = (t: ReturnType<typeof useTranslations>) =>
  z
    .object({
      name: z
        .string()
        .min(1, { message: t('validation.nameRequired') })
        .max(100, { message: t('validation.nameMaxLength') }),
      unit_price: z
        .number()
        .min(1, { message: t('validation.unitPriceRequired') })
        .max(MAX_NUM, { message: t('validation.unitPriceMax', { max: MAX_NUM }) })
        .nullable()
        .optional()
        .refine((val): val is number => val !== null && val !== undefined, {
          message: '単価は必須です',
        }), // refineを更新
      sale_price: zNumberFieldOptional(MAX_NUM, t('validation.salePriceMax', { max: MAX_NUM })), // セール価格
      images: z.array(
        z.object({
          original_url: z.string().optional(),
          thumbnail_url: z.string().optional(),
        })
      ),
      order_limit: z
        .number()
        .min(1, { message: t('validation.orderLimitMin') })
        .max(99, { message: t('validation.orderLimitMax') })
        .refine((val): val is number => val !== null && val !== undefined, {
          message: t('validation.targetMenusRequired'),
        }), // refineを更新
      in_stock: z.preprocess(
        (val) => {
          if (val === '' || val === null || val === undefined) return undefined
          const num = Number(val)
          return isNaN(num) ? undefined : num
        },
        z
          .number()
          .max(MAX_NUM, { message: t('validation.inStockMax', { max: MAX_NUM }) })
          .optional()
      ),
      duration_min: z // timeToMinのバリデーションを追加
        .string()
        .min(1, { message: t('validation.durationRequired') })
        .max(5, { message: t('validation.durationMax') })
        .refine((val) => val !== '', { message: t('validation.durationRequired') })
        .optional(),
      tags: z.preprocess(
        // tagsのバリデーションを追加
        (val) => (typeof val === 'string' ? val : Array.isArray(val) ? val.join(',') : ''),
        z
          .string()
          .max(100, { message: t('validation.tagMax') })
          .transform((val) =>
            val
              ? val
                  .replace(/[,、]/g, ',')
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter((tag) => tag !== '')
              : []
          )
          .refine((val) => val.length <= 5, { message: t('validation.tagMaxCount') })
          .optional()
      ),
      description: z
        .string()
        .max(2000, { message: t('validation.descriptionMax') })
        .optional(),
      is_active: z.boolean().optional(),
    })
    .refine(
      (data) => {
        // salePriceが存在し、unitPriceも存在する場合のみ比較
        if (
          data.sale_price !== null &&
          data.sale_price !== undefined &&
          data.unit_price !== null &&
          data.unit_price !== undefined &&
          data.sale_price >= data.unit_price
        ) {
          return false
        }
        return true
      },
      {
        message: t('validation.salePriceLower'),
        path: ['sale_price'],
      }
    )

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

export default function OptionEditForm() {
  const router = useRouter()
  const t = useTranslations('options')
  const params = useParams()
  const optionId = params.option_id as Id<'option'>
  console.log('optionId', optionId)
  const { orgId } = useTenantAndOrganization()
  const optionData = useQuery(api.option.query.findById, { option_id: optionId })
  const updateOption = useMutation(api.option.mutation.update)
  const { showErrorToast } = useErrorHandler()

  const [isInitialized, setIsInitialized] = useState(false)
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [existingImageUrls, setExistingImageUrls] = useState<ImageType[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteImageModalOpen, setIsDeleteImageModalOpen] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting: formIsSubmitting, errors, isDirty },
  } = useZodForm(optionSchema(t))
  const isActive = watch('is_active')
  const durationMin = watch('duration_min')

  // データ取得後にフォームを初期化
  useEffect(() => {
    if (optionData && !isInitialized) {
      const durationMinValueString = optionData.duration_min?.toString() || undefined

      const initialTags = optionData.tags || []

      console.log('optionData', optionData)

      // 画像関連の状態を設定
      setExistingImageUrls(optionData.images)

      // Stateの更新
      setCurrentTags(initialTags)

      // setValueで各フィールドの初期値を設定
      setValue('name', optionData.name || '')
      setValue('unit_price', optionData.unit_price ?? 1)
      setValue('sale_price', optionData.sale_price ?? undefined)
      setValue('order_limit', optionData.order_limit ?? 1)
      setValue('in_stock', optionData.in_stock ?? 1)
      setValue('duration_min', durationMinValueString)
      setValue('tags', initialTags)
      setValue('description', optionData.description || '')
      setValue('is_active', optionData.is_active ?? true)
      setValue('images', optionData.images)

      setIsInitialized(true)
    }
  }, [optionData, setValue, isInitialized])

  // フォーム送信処理
  const onSubmit = async (data: z.infer<ReturnType<typeof optionSchema>>) => {
    try {
      if (!orgId || !optionId) {
        toast.error(t('error.notFound'))
        return
      }

      setIsSubmitting(true)
      let newUploadedImageUrls: { original_url: string; thumbnail_url: string }[] = []
      let hasDeletedOldImages = false

      // 新しい画像がアップロードされた場合
      if (currentFile) {
        try {
          setIsUploading(true)
          const result = await uploadImage(currentFile, orgId, 'option', 'square', 'medium')

          newUploadedImageUrls = [
            {
              original_url: result.originalUrl,
              thumbnail_url: result.thumbnailUrl,
            },
          ]
          setIsUploading(false)
        } catch (error) {
          console.error('Failed to upload image:', error)
          showErrorToast(error)
          setIsSubmitting(false) // エラー時は submitting を解除
          setIsUploading(false) // エラー時は uploading を解除
          return
        } finally {
          setIsUploading(false)
        }
      }

      try {
        // APIに送信するデータを作成
        // zod schemaで型変換後のデータを使用
        const updateData = {
          name: data.name,
          unit_price: data.unit_price,
          sale_price: data.sale_price ? Number(data.sale_price) : 0,
          order_limit: data.order_limit,
          duration_min: data.duration_min ? Number(data.duration_min) : undefined, // 文字列を数値 or undefined に変換
          in_stock: data.in_stock ? Number(data.in_stock) : undefined,
          tags: data.tags, // zodで変換された配列 or undefined
          description: data.description,
          is_active: data.is_active,
          // 新しい画像がある場合は新しいパス、ない場合は既存画像を維持
          images: newUploadedImageUrls.length > 0 ? newUploadedImageUrls : existingImageUrls || [],
          option_id: optionId, // idは必須
        }

        // 新しい画像に置き換える場合のみ古い画像を削除
        // 画像を選択せずに更新する場合は既存画像を保持
        if (
          newUploadedImageUrls.length > 0 &&
          existingImageUrls.length > 0 &&
          existingImageUrls[0]?.original_url // 新しい画像に置き換えるケース
        ) {
          try {
            await fetch('/api/storage', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                originalUrl: existingImageUrls[0].original_url,
                withThumbnail: true,
              }),
            })
            hasDeletedOldImages = true
          } catch (deleteError) {
            console.error('Failed to delete old image:', deleteError)
            showErrorToast(deleteError)
            // 古い画像の削除に失敗しても、オプション更新は試みる
            // 必要に応じてエラーハンドリングを追加
          }
        }

        await updateOption({
          ...updateData,
          option_id: optionId,
        })

        toast.success(t('messages.updateSuccess'))
        router.push('/dashboard/option')
      } catch (updateErr) {
        // メニュー更新に失敗した場合、新しくアップロードした画像を削除
        if (newUploadedImageUrls.length > 0) {
          try {
            await fetch('/api/storage', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                originalUrl: newUploadedImageUrls[0].original_url,
                withThumbnail: true,
              }),
            })
            // DBの更新
            updateOption({
              images: [],
              option_id: optionId,
            })
          } catch (deleteErr) {
            console.error('Failed to delete new original image after update failure:', deleteErr)
            showErrorToast(deleteErr)
          }
        }

        // 既存の画像を削除していた場合はエラーメッセージを変更
        if (hasDeletedOldImages) {
          toast.error(t('error.updateFailed'))
        } else {
          showErrorToast(updateErr)
        }

        setIsSubmitting(false)
        // throw updateErr // エラーを再スローしない場合、ここで処理を終える
        return // エラー発生時はここで処理を中断
      }
    } catch (error) {
      setIsSubmitting(false)
      showErrorToast(error)
    }
  }

  const handleDeleteImage = async (originalUrl: string) => {
    try {
      setIsUploading(true)
      // APIに削除リクエストを送信
      const response = await fetch('/api/storage', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ originalUrl: originalUrl, withThumbnail: true }),
      })

      if (!response.ok) {
        // エラーレスポンスを処理
        const errorData = await response.json().catch(() => ({})) // JSONパースエラーも考慮
        toast.error(errorData?.error || '画像の削除に失敗しました')
        return // エラー時はここで処理を終了
      }

      // データベースの画像パスをクリア
      await updateOption({
        images: [],
        option_id: optionId,
      })

      toast.success('画像を削除しました')
      setExistingImageUrls([]) // 既存画像のURLをクリア
      setCurrentFile(null) // 選択中のファイルをクリア
      setValue('images', [], { shouldDirty: true, shouldValidate: true }) // フォームの画像パスをクリア
      setIsDeleteImageModalOpen(false)
      router.push('/dashboard/option')
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsUploading(false)
    }
  }

  if (!orgId || !optionId || !optionData?._id) {
    return <Loading />
  }

  if (isUploading) {
    return <Uploader />
  }

  console.log('isDirty', isDirty)
  console.log('currentFile', currentFile)
  console.log('errors', errors)

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
        <div className="mb-8 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <Card className="mx-auto flex w-full max-w-md flex-col rounded-xl border border-dashed border-input bg-muted shadow-none xl:max-w-none">
              <CardContent className="flex items-center justify-center p-4 sm:p-6">
                <div className="flex w-full max-w-sm flex-col gap-4 py-2">
                  {existingImageUrls[0]?.original_url && (
                    <div className="relative mx-auto w-full max-w-xs shrink-0">
                      <Image
                        src={existingImageUrls[0].original_url}
                        alt="option image"
                        width={1280}
                        height={1280}
                        className="w-full h-auto object-cover rounded-md border border-border aspect-[1/1]"
                      />
                      <Button
                        className="absolute top-2 right-2 z-10"
                        variant="destructive"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault()
                          setIsDeleteImageModalOpen(true)
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                  <div className="flex w-full items-center justify-center">
                    <SingleImageDrop
                      onFileSelect={(file) => {
                        setCurrentFile(file)
                        setValue(
                          'images',
                          file
                            ? [{ original_url: '', thumbnail_url: '' }] // 仮の値
                            : [],
                          { shouldDirty: true }
                        )
                      }}
                      className="rounded-md"
                      aspectType="square"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="min-w-0">
            <div className="space-y-6">
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                <ZodTextField
                  name="name"
                  label={t('form.optionName')}
                  icon={<Tag className="text-primary" />}
                  placeholder={t('form.optionNamePlaceholder')}
                  register={register}
                  errors={errors}
                  required
                  className="min-w-0 w-full border-border sm:col-span-2"
                />

                <ZodTextField
                  name="order_limit"
                  label={t('form.orderLimit')}
                  icon={<Boxes className="text-primary" />}
                  type="number"
                  placeholder={t('form.orderLimitPlaceholder')}
                  register={register}
                  errors={errors}
                  required
                  className="min-w-0 w-full border-border"
                />
                <ZodTextField
                  name="in_stock"
                  label={t('form.stock')}
                  icon={<Boxes className="text-primary" />}
                  type="number"
                  placeholder={t('form.stockPlaceholder')}
                  register={register}
                  errors={errors}
                  required
                  className="min-w-0 w-full border-border"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ZodTextField
                  name="unit_price"
                  label={t('form.unitPrice')}
                  icon={<DollarSign className="text-primary" />}
                  type="number"
                  placeholder="1000"
                  register={register}
                  errors={errors}
                  required
                  className="border-border w-full"
                />

                <ZodTextField
                  name="sale_price"
                  label={t('form.salePrice')}
                  type="number"
                  icon={<ShoppingBag className="text-primary" />}
                  placeholder="800"
                  register={register}
                  errors={errors}
                  className="border-border w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="w-full">
                  <Label className="text-sm flex items-center gap-2">
                    <Clock size={16} className="text-primary" />
                    {t('form.durationTitle')}
                  </Label>

                  <Select
                    value={durationMin?.toString() ?? ''}
                    onValueChange={(value) => {
                      if (!value.trim()) return
                      const numValue = Number(value)
                      setValue('duration_min', value, { shouldValidate: true, shouldDirty: true })
                      console.log('スタッフが稼働する施術時間を選択:', { value, numValue }) // デバッグ用
                    }}
                  >
                    <SelectTrigger className="border-border transition-colors">
                      <SelectValue placeholder={t('form.durationPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {getMinuteMultiples(5, 360).map((time) => (
                        <SelectItem key={time} value={time.toString()}>
                          {time} {t('form.minutes')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{t('form.timeHelp')}</span>
                  {errors.duration_min && <ErrorMessage message={errors.duration_min.message} />}
                </div>
              </div>
              <TagInput
                tags={currentTags}
                setTagsAction={(tags) => {
                  setCurrentTags(tags)
                  setValue('tags', tags, { shouldValidate: true, shouldDirty: true })
                }}
                errors={errors.tags}
              />
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        {/* 説明セクション */}
        <Label className="flex items-center gap-2 text-sm mb-2 mt-4">
          <Info size={16} className="text-primary" />
          {t('form.description')}
        </Label>
        <Textarea
          id="description"
          placeholder={t('form.descriptionPlaceholder')}
          {...register('description')}
          onChange={(e) =>
            setValue('description', e.target.value, { shouldValidate: true, shouldDirty: true })
          }
          rows={10}
          className="border-border"
        />
        {errors.description && <ErrorMessage message={errors.description?.message} />}

        {/* 公開/非公開スイッチ */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4 mb-6 mt-6">
          <div>
            <p className="text-sm font-medium">{t('form.publishToggle')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('form.publishHelp')}</p>
          </div>
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={(checked) =>
              setValue('is_active', checked, { shouldValidate: true, shouldDirty: true })
            }
            className="data-[state=checked]:bg-accent-2"
          />
        </div>

        <div className="flex w-full justify-end border-t border-border pt-5 mt-6">
          <div className="flex justify-between gap-3 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/option')}
              className="min-w-28 border-border"
            >
              {t('form.back')}
            </Button>

            <Button
              type="submit"
              disabled={isSubmitting || isUploading || (!isDirty && !currentFile)}
            >
              {isSubmitting || isUploading || formIsSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('form.updating')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('form.updateButton')}
                </>
              )}
            </Button>
          </div>
        </div>
        {errors.root && <ErrorMessage message={errors.root.message} />}
      </form>

      <Dialog open={isDeleteImageModalOpen} onOpenChange={setIsDeleteImageModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('form.deleteImageTitle')}</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-muted-foreground">
            {t('form.deleteImageDescription')}
          </DialogDescription>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setIsDeleteImageModalOpen(false)}>
              {t('form.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                existingImageUrls.length > 0 &&
                existingImageUrls[0]?.original_url &&
                handleDeleteImage(existingImageUrls[0].original_url)
              }
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('form.deleting')}
                </>
              ) : (
                t('form.deleteImageButton')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
