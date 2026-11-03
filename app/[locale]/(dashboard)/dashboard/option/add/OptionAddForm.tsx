'use client'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { z } from 'zod'
import { useTranslations } from 'next-intl'
import { Info } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useZodForm } from '@/hooks/useZodForm'
import { api } from '@/convex/_generated/api'
import { useMutation } from 'convex/react'
import { fetchQuery } from 'convex/nextjs'
import { TagInput, SingleImageDrop, Loading, ZodTextField } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useEffect, useState, memo } from 'react'
import { toast } from 'sonner'
import { SubscriptionPlanName } from '@/convex/types'
import { DollarSign, ShoppingBag, Clock, Save, Loader2, ImageIcon } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { zNumberFieldOptional } from '@/lib/validations/common'
import { getMinuteMultiples } from '@/lib/schedules'
import { useRouter } from 'next/navigation'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MAX_NUM, MAX_TEXT_LENGTH } from '@/convex/constants'
import Uploader from '@/components/common/Uploader'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'

// 施術時間：0〜360分の5分刻みをキャッシュ
// 0分を許容する事で物販にも対応する
const MINUTE_OPTIONS = getMinuteMultiples(0, 360)

const optionSchema = z
  .object({
    name: z
      .string({
        required_error: 'オプションメニュー名は必須です',
        invalid_type_error: 'オプションメニュー名は有効な文字列で入力してください',
      })
      .min(1, { message: 'オプションメニュー名は必須です' })
      .max(MAX_TEXT_LENGTH, {
        message: `オプションメニュー名は${MAX_TEXT_LENGTH}文字以内で入力してください`,
      }), // オプションメニュー名
    unit_price: z.preprocess(
      (val) => {
        // 空文字列、null、undefinedの場合はundefinedを返し、required_errorをトリガー
        if (val === '' || val === null || val === undefined) return undefined
        // 数値に変換できない場合は元の値を返し、invalid_type_errorをトリガー
        const num = Number(val)
        return isNaN(num) ? val : num
      },
      z
        .number({
          required_error: '価格は必須です',
          invalid_type_error: '価格は有効な数値で入力してください',
        })
        .min(1, { message: '価格は1円以上で入力してください' })
        .max(MAX_NUM, { message: `価格は${MAX_NUM}円以下で入力してください` })
    ), // 価格
    sale_price: zNumberFieldOptional(MAX_NUM, `セール価格は${MAX_NUM}円以下で入力してください`), // セール価格
    order_limit: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return undefined
        // 数値に変換できない場合は1を返す
        const num = Number(val)
        return isNaN(num) ? 1 : num
      },
      z
        .number({
          required_error: '注文制限は必須です',
          invalid_type_error: '注文制限は有効な数値で入力してください',
        })
        .min(0, { message: '注文制限は0以上で入力してください' })
        .max(5, { message: '注文制限は5以下で入力してください' })
        .optional()
    ), // 注文制限
    in_stock: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return undefined
        // 数値に変換できない場合は1を返す
        const num = Number(val)
        return isNaN(num) ? 1 : num
      },
      z.number().max(1000, { message: '在庫数は1000以下で入力してください' }).optional()
    ),
    duration_min: z
      .string({
        required_error: '時間は必須です',
        invalid_type_error: '時間は有効な数値で入力してください',
      })
      .min(1, { message: '時間は必須です' })
      .max(5, { message: '時間は5文字で入力してください' })
      .refine((val) => val !== '', { message: '時間は必須です' }), // 時間(分)
    tags: z.preprocess(
      (val) => (typeof val === 'string' ? val : Array.isArray(val) ? val.join(',') : ''),
      z
        .string()
        .max(100, { message: 'タグは合計100文字以内で入力してください' })
        .transform((val) =>
          val
            ? val
                .replace(/[,、]/g, ',')
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag !== '')
            : []
        )
        .refine((val) => val.length <= 5, { message: 'タグは最大5つまでです' })
    ), // タグ
    description: z
      .string({
        required_error: '説明は必須です',
        invalid_type_error: '説明は有効な文字列で入力してください',
      })
      .min(1, { message: '説明は必須です' })
      .max(1000, { message: '説明は1000文字以内で入力してください' }), // 説明
    is_archive: z.boolean({ message: '有効/無効フラグは必須です' }), // 有効/無効フラグ
    images: z.array(
      z.object({
        original_url: z.string(),
        thumbnail_url: z.string(),
      })
    ),
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
      message: 'セール価格は通常価格より低く設定してください',
      path: ['sale_price'], // エラーメッセージをsalePriceフィールドに表示
    }
  )

function OptionAddForm() {
  const t = useTranslations('options')
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const router = useRouter()
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const { showErrorToast } = useErrorHandler()
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const addOption = useMutation(api.option.mutation.create)

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors, isDirty },
    setValue,
    watch,
    reset,
  } = useZodForm(optionSchema)

  const isArchive = watch('is_archive')

  const onSubmit = async (data: z.infer<typeof optionSchema>) => {
    // 画像がある場合はアップロード処理を行う
    let newUploadedImageUrls: { original_url: string; thumbnail_url: string }[] = []

    try {
      if (!tenantId || !orgId || !planName) {
        toast.error('サロン情報が必要です')
        return
      }

      await fetchQuery(api.tenant.plan.query.checkLimitByPlan, {
        tenant_id: tenantId,
        org_id: orgId,
        limit_type: 'option',
      })

      if (currentFile) {
        try {
          setIsUploading(true)
          const result = await uploadImage(currentFile!, orgId, 'option', 'square', 'medium')
          // 新方式のレスポンス形式に合わせて修正
          newUploadedImageUrls = [
            {
              original_url: result.originalUrl,
              thumbnail_url: result.thumbnailUrl,
            },
          ]
          setIsUploading(false)
        } catch (error) {
          showErrorToast(error)
          setIsUploading(false) // エラー時は uploading を解除
          return
        }
      }

      await addOption({
        tenant_id: tenantId,
        org_id: orgId,
        name: data.name,
        plan_name: planName as SubscriptionPlanName,
        unit_price: data.unit_price, // 価格
        sale_price: data.sale_price ? data.sale_price : undefined, // セール価格
        order_limit: data.order_limit as number, // 注文制限
        in_stock: data.in_stock as number, // 在庫数
        duration_min: Number(data.duration_min), // 時間(分)
        tags: data.tags, // タグ
        description: data.description, // 説明
        images: newUploadedImageUrls.length > 0 ? newUploadedImageUrls : [],
        is_active: data.is_archive, // 有効/無効フラグ
      })
      toast.success('オプションメニューを登録しました')
      router.push('/dashboard/option')
    } catch (error) {
      // メニュー作成に失敗した場合、新しくアップロードした画像を削除
      if (newUploadedImageUrls.length > 0 && currentFile) {
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
        } catch (deleteErr) {
          console.error('Failed to delete new original image after update failure:', deleteErr)
          showErrorToast(deleteErr)
        }
      }

      if (newUploadedImageUrls.length > 0 && currentFile) {
        try {
          await fetch('/api/storage', {
            method: 'DELETE',
            body: JSON.stringify({
              originalUrl: newUploadedImageUrls[0].original_url,
              withThumbnail: true,
            }),
          })
        } catch (deleteErr) {
          console.error('Failed to delete new thumbnail image after update failure:', deleteErr)
          showErrorToast(deleteErr)
        }
      }
      showErrorToast(error)
    }
  }

  useEffect(() => {
    if (tenantId && orgId) {
      reset({
        name: undefined as string | undefined,
        unit_price: undefined as number | undefined,
        sale_price: undefined as number | undefined,
        order_limit: 1,
        duration_min: undefined as string | undefined,
        in_stock: 1 as number,
        tags: [] as string[],
        description: undefined as string | undefined,
        is_archive: true,
        images: [] as { original_url: string; thumbnail_url: string }[],
      })
      setCurrentTags([])
      setCurrentFile(null)
    }
  }, [tenantId, orgId, reset])

  if (!tenantId || !orgId) {
    return <Loading />
  }

  if (isUploading) {
    return <Uploader />
  }

  return (
    <>
      <div className="mb-6">
        <div className="rounded-xl border border-border bg-secondary p-5 mb-4">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-secondary-foreground mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <h3 className="font-semibold text-secondary-foreground text-sm">
                オプション機能について
              </h3>
              <div className="text-sm text-secondary-foreground space-y-2 leading-relaxed">
                <p>
                  • <strong>物販対応：</strong>{' '}
                  在庫数を設定することで、シャンプーやトリートメントなどの商品販売が可能です
                </p>
                <p>
                  • <strong>施術メニュー：</strong>{' '}
                  施術時間を設定することで、ヘッドスパやトリートメントなどのオプション施術を提供できます。この場合は在庫数は最大値である
                  <strong>999</strong>と設定してください。
                </p>

                <p>
                  • <strong>時間管理：</strong>{' '}
                  施術時間を0分に設定すると物販、時間を設定すると施術メニューとしても使用できます。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <form
        className="admin-form p-5 sm:p-6"
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="md:col-span-1">
              <Card className="flex h-full flex-col rounded-xl border border-dashed border-input bg-muted shadow-none">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base flex items-center gap-2 mb-2">
                    <ImageIcon size={18} className="text-muted-foreground" />
                    {t('form.optionImage')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                  <div className="w-full">
                    <SingleImageDrop
                      currentFile={currentFile}
                      onFileSelect={(file) => {
                        setCurrentFile(file ?? null)
                      }}
                      className="rounded-md"
                      aspectType="square"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="w-full">
                  <ZodTextField
                    register={register}
                    name="name"
                    label={t('form.optionName')}
                    placeholder={t('form.optionNamePlaceholder')}
                    errors={errors}
                    required
                  />
                </div>
                <ZodTextField
                  name="order_limit"
                  label={t('form.maxOrder')}
                  type="number"
                  placeholder="例: 1"
                  register={register}
                  errors={errors}
                  required
                  className="border-border focus-within:border-accent-2 transition-colors"
                />
                <ZodTextField
                  name="in_stock"
                  label={t('form.stock')}
                  type="number"
                  placeholder="例: 1"
                  register={register}
                  errors={errors}
                  required
                  className="border-border focus-within:border-accent-2 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <ZodTextField
                  name="unit_price"
                  label={t('form.unitPrice')}
                  icon={<DollarSign className="text-primary" />}
                  type="number"
                  placeholder="例: 5000"
                  register={register}
                  errors={errors}
                  required
                  className="border-border focus-within:border-accent-2 transition-colors"
                />

                <ZodTextField
                  name="sale_price"
                  label={t('form.salePrice')}
                  type="number"
                  icon={<ShoppingBag className="text-primary" />}
                  placeholder="例: 4000"
                  register={register}
                  errors={errors}
                  className="border-border focus-within:border-accent-2 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                <div className="w-full">
                  <Label className="text-sm flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-primary" />
                    {t('form.durationTitle')} <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Select
                    onValueChange={(value) => {
                      setValue('duration_min', value, { shouldValidate: true })
                    }}
                  >
                    <SelectTrigger className="border-border transition-colors">
                      <SelectValue placeholder={t('form.durationPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTE_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time.toString()}>
                          {time}
                          {t('form.minutes')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">{t('form.timeHelp')}</span>
                  {errors.duration_min && (
                    <p className="text-destructive text-sm mt-1">{errors.duration_min.message}</p>
                  )}
                </div>
              </div>

              <TagInput
                tags={currentTags}
                setTagsAction={setCurrentTags}
                errors={errors.tags}
                title={t('form.tags')}
              />
            </div>
          </div>

          <Label className="flex items-center gap-2 text-sm mt-4">
            <Info size={16} className="text-primary" />
            {t('form.description')} <span className="text-destructive ml-1">*</span>
          </Label>
          <Textarea
            id="description"
            placeholder={t('form.descriptionPlaceholder')}
            {...register('description')}
            onChange={(e) => setValue('description', e.target.value, { shouldValidate: true })}
            rows={8}
            className="border-border focus-visible:ring-accent-2"
          />
          {errors.description && (
            <p className="text-destructive text-sm mt-1">{errors.description.message}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-muted p-4 mb-6 mt-4">
            <div>
              <p className="text-sm font-bold">{t('form.publishToggle')}</p>
              <p className="text-xs text-muted-foreground">{t('form.publishHelp')}</p>
            </div>
            <Switch
              id="is_archive"
              checked={isArchive}
              onCheckedChange={() => setValue('is_archive', !isArchive)}
              className="data-[state=checked]:bg-accent-2"
            />
          </div>

          <div className="flex justify-end border-t border-border pt-5">
            <Button
              variant="default"
              type="submit"
              disabled={isSubmitting || isUploading || !isDirty}
            >
              {isSubmitting || isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('form.adding')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('form.addButton')}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}

export default memo(OptionAddForm)
