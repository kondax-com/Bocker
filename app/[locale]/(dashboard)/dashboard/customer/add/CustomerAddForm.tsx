'use client'

import { z } from 'zod'
import { useZodForm } from '@/hooks/useZodForm'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loader2 } from 'lucide-react'
import { Loading, TagInput, DatePicker } from '@/components/common'
import { ZodTextField } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { GENDER_VALUES, Gender } from '@/convex/types'
import { calcAgeFromBirthday } from '@/lib/helpers'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  MAX_NUM,
  MAX_TEXT_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_TAG_LENGTH,
  MAX_NOTES_LENGTH,
} from '@/convex/constants'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'

const createSchemaCustomer = (
  t: (key: string, values?: Record<string, string | number | Date>) => string
) =>
  z.object({
    line_id: z
      .string()
      .max(MAX_TEXT_LENGTH, {
        message: t('validation.lineIdMaxLength', { max: MAX_TEXT_LENGTH }),
      })
      .optional(), // LINE ID
    line_user_name: z
      .string()
      .max(MAX_TEXT_LENGTH, {
        message: t('validation.lineUserNameMaxLength', { max: MAX_TEXT_LENGTH }),
      })
      .optional(), // LINEユーザー名
    phone: z
      .string()
      .min(6, {
        message: t('validation.phoneMinLength'),
      })
      .max(MAX_PHONE_LENGTH, {
        message: t('validation.phoneMaxLength', { max: MAX_PHONE_LENGTH }),
      })
      .refine((value) => value === undefined || /^[0-9]+$/.test(value), {
        message: t('validation.phoneFormat'),
      }), // 電話番号
    email: z.preprocess(
      (val) => {
        if (typeof val === 'string' && val.trim() === '') {
          return undefined
        }
        return val
      },
      z
        .string()
        .max(100, { message: t('validation.emailMaxLength') })
        .optional()
        .refine(
          (value) =>
            value === undefined || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value),
          { message: t('validation.emailInvalid') }
        ) // メールアドレス
    ),
    first_name: z
      .string()
      .min(1, { message: t('validation.firstNameRequired') })
      .max(MAX_TEXT_LENGTH, {
        message: t('validation.firstNameMaxLength', { max: MAX_TEXT_LENGTH }),
      }), // 名前
    last_name: z
      .string()
      .min(1, { message: t('validation.lastNameRequired') })
      .max(MAX_TEXT_LENGTH, {
        message: t('validation.lastNameMaxLength', { max: MAX_TEXT_LENGTH }),
      }), // 苗字
    total_reservation_count: z
      .number()
      .max(MAX_NUM, { message: t('validation.visitCountMax', { max: MAX_NUM }) })
      .optional(), // 利用回数
    last_reservation_date_unix: z
      .number()
      .max(MAX_NUM, { message: t('validation.lastVisitMax', { max: MAX_NUM }) })
      .optional(), // 最終予約日
    tags: z
      .array(z.string())
      .max(MAX_TAG_LENGTH, { message: t('validation.tagsMaxCount', { max: MAX_TAG_LENGTH }) })
      .optional(), // タグ
    age: z.preprocess(
      (val) => {
        // 空文字列、null、または NaN の場合に undefined に変換する
        if (
          (typeof val === 'string' && val.trim() === '') ||
          val === null ||
          (typeof val === 'number' && isNaN(val))
        ) {
          return undefined
        }
        // それ以外の値（数値、空でない文字列など）はそのまま通過
        return val
      },
      z
        .number()
        .min(0)
        .max(MAX_NUM, { message: t('validation.ageMax', { max: MAX_NUM }) })
        .nullable() // null を許容する (preprocessでundefinedに変換しているので必須ではないが残しておく)
        .optional() // undefined を許容する
    ), // 年齢
    birthday: z
      .string()
      .max(100, { message: t('validation.birthdayMaxLength') })
      .optional(), // 誕生日
    gender: z.enum(GENDER_VALUES).optional(), // 性別
    notes: z
      .string()
      .max(MAX_NOTES_LENGTH, { message: t('validation.notesMaxLength', { max: MAX_NOTES_LENGTH }) })
      .optional(), // メモ
    total_points: z.preprocess(
      (val) => {
        // 空文字列、null、または NaN の場合に undefined に変換する
        if (
          (typeof val === 'string' && val.trim() === '') ||
          val === null ||
          (typeof val === 'number' && isNaN(val))
        ) {
          return undefined
        }
        // それ以外の値（数値、空でない文字列など）はそのまま通過
        return val
      },
      z
        .number()
        .max(MAX_NUM, { message: t('validation.pointsMax', { max: MAX_NUM }) })
        .optional() // ポイント
    ),
  })

export default function CustomerAddForm() {
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()
  const router = useRouter()
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const customerRepo = new CustomerRepository()
  const t = useTranslations('customers')

  const schemaCustomer = createSchemaCustomer(t)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
    watch,
  } = useZodForm(schemaCustomer)

  const onSubmit = async (data: z.infer<typeof schemaCustomer>) => {
    console.log('フォームデータ:', data)

    if (!tenantId || !orgId) {
      toast.error(t('tenantOrOrgNotFound'))
      return
    }

    setIsSubmitting(true)

    try {
      // 顧客のコア情報を準備
      const customerCoreData = {
        uid: crypto.randomUUID(), // UIDを自動生成
        tenant_id: tenantId,
        org_id: orgId,
        email: data.email || null,
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        phone: data.phone || null,
        line_id: data.line_id || null,
        line_user_name: data.line_user_name || null,
        tags: currentTags,
        total_reservation_count: data.total_reservation_count || null,
        last_reservation_date_unix: data.last_reservation_date_unix || null,
        // その他のフィールドはオプショナルなのでundefinedでも問題なし
      }

      // FIXME: ageをbirthdayから算出するようにする
      // 顧客詳細情報を準備
      const detailData = {
        email: data.email || null,
        age: data.birthday ? calcAgeFromBirthday(data.birthday) : null,
        birthday: data.birthday || null,
        gender: data.gender || null,
        notes: data.notes || null,
        tenant_id: tenantId,
        org_id: orgId,
      }

      // 初期ポイント数を設定
      const initialPoints = data.total_points || 0

      // 顧客、詳細、ポイントを一度に作成
      const result = await customerRepo.createCustomerWithDetailsAndPoints(
        customerCoreData,
        detailData,
        initialPoints
      )

      if (result.customer) {
        toast.success(t('addSuccess'))
        router.push('/dashboard/customer')
      } else {
        toast.error(t('addError'))
      }
    } catch (error) {
      console.error('顧客作成エラー:', error)
      const errorMessage = error instanceof Error ? error.message : t('addError')
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ローディング状態の確認
  if (!isLoaded) {
    return <Loading />
  }

  console.log('フォームエラー:', errors)

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="admin-form p-5 sm:p-6 space-y-7">
        <div>
          <h4 className="text-base font-semibold text-foreground mb-1">{t('customerInfo')}</h4>
          <p className="text-xs text-muted-foreground mb-4">{t('customerInfoDesc')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ZodTextField
              label={t('lastName')}
              name="last_name"
              register={register}
              errors={errors}
            />
            <ZodTextField
              label={t('firstName')}
              name="first_name"
              register={register}
              errors={errors}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4">
            <ZodTextField label={t('phone')} name="phone" register={register} errors={errors} />
          </div>
        </div>

        <div>
          <h4 className="text-base font-semibold text-foreground mb-1">{t('marketingInfo')}</h4>
          <p className="text-xs text-muted-foreground mb-4">{t('marketingInfoDesc')}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ZodTextField label={t('email')} name="email" register={register} errors={errors} />
            <div>
              <Label htmlFor="gender">{t('gender')}</Label>
              <Select
                value={watch('gender') ?? 'unselect'}
                onValueChange={(value) => {
                  setValue('gender', value as Gender)
                }}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder={t('selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">{t('male')}</SelectItem>
                  <SelectItem value="female">{t('female')}</SelectItem>
                  <SelectItem value="unselect">{t('unselected')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birthday" className="text-sm font-medium text-primary">
              {t('birthday')}
            </Label>
            <DatePicker
              id="birthday"
              className="min-h-11 bg-background hover:bg-muted"
              value={watch('birthday') ? new Date(watch('birthday')!) : undefined}
              onChange={(date) => setValue('birthday', date ? format(date, 'yyyy-MM-dd') : '')}
              placeholder={t('birthdayPlaceholder')}
              error={!!errors.birthday}
              toDate={new Date()} // 未来の日付は選択不可
            />
            {errors.birthday && (
              <p className="text-sm text-destructive">{errors.birthday.message}</p>
            )}
          </div>
        </div>

        <TagInput
          tags={currentTags}
          setTagsAction={setCurrentTags}
          errors={errors.tags}
          title={t('tags')}
        />

        <div>
          <Label htmlFor="notes">{t('notes')}</Label>
          <Textarea
            id="notes"
            placeholder={t('memoPlaceholder')}
            {...register('notes')}
            className="resize-none"
            rows={5}
          />
          {errors.notes && <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>}
        </div>

        <div>
          <h4 className="text-base font-semibold text-foreground mb-1">{t('points')}</h4>
          <p className="text-xs text-muted-foreground mb-4">{t('pointNote')}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ZodTextField
              label={t('points')}
              type="number"
              name="total_points"
              register={register}
              errors={errors}
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-5">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t('addCustomerButton')}
          </Button>
        </div>
      </form>
    </div>
  )
}
