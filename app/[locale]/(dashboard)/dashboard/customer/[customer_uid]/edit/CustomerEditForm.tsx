'use client'

import { withManagerAccess } from '@/components/common'
import { useParams } from 'next/navigation'
import { z } from 'zod'
import { Gender } from '@/convex/types'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ZodTextField, DatePicker } from '@/components/common'
import { TagInput } from '@/components/common'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useEffect, useState, useMemo } from 'react'
import { useZodForm } from '@/hooks/useZodForm'
import { Button } from '@/components/ui/button'
import { GENDER_VALUES } from '@/convex/types'
import { MAX_NOTES_LENGTH, MAX_TEXT_LENGTH, MAX_TAG_LENGTH } from '@/convex/constants'
import { Loader2, Pencil } from 'lucide-react'
import { Loading } from '@/components/common'
import { toast } from 'sonner'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import type { RowType } from '@/services/supabase/SupabaseService'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'

// 'YYYY-MM-DD'形式の誕生日文字列から年齢を計算するヘルパー関数
const calculateAge = (birthdayString: string | undefined | null): number | undefined => {
  if (!birthdayString) {
    return undefined
  }
  const birthDate = new Date(birthdayString)
  // 日付が有効かチェック
  if (isNaN(birthDate.getTime())) {
    return undefined
  }

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  // 今年の誕生日がまだ来ていない場合、年齢を調整
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  // 計算された年齢が負の場合（未来の日付が入力された場合など）、undefinedを返す
  if (age < 0) {
    return undefined
  }

  return age
}

const createCustomerEditFormSchema = (
  t: (key: string, values?: Record<string, string | number | Date>) => string
) =>
  z.object({
    last_name: z.preprocess(
      (val) => {
        if (val === '' || val === null || val === undefined) return undefined
        return val
      },
      z
        .string()
        .min(1, { message: t('validation.lastNameRequired') })
        .max(MAX_TEXT_LENGTH, {
          message: t('validation.lastNameMaxLength', { max: MAX_TEXT_LENGTH }),
        })
        .optional()
    ),
    first_name: z.preprocess(
      (val) => {
        if (val === '' || val === null || val === undefined) return undefined
        return val
      },
      z
        .string()
        .min(1, { message: t('validation.firstNameRequired') })
        .max(MAX_TEXT_LENGTH, {
          message: t('validation.firstNameMaxLength', { max: MAX_TEXT_LENGTH }),
        })
        .optional()
    ),
    phone: z
      .string()
      .min(1, { message: t('validation.phoneMinLength') })
      .max(MAX_TEXT_LENGTH, { message: t('validation.phoneMaxLength', { max: MAX_TEXT_LENGTH }) })
      .optional(),
    email: z
      .string()
      .max(MAX_TEXT_LENGTH, {
        message: t('validation.emailMaxLength'),
      })
      .refine((val) => !val || z.string().email().safeParse(val).success, {
        message: t('validation.emailInvalid'),
      })
      .optional(),
    gender: z.enum(GENDER_VALUES).default('unselected'),
    birthday: z.string().optional(),
    notes: z
      .string()
      .max(MAX_NOTES_LENGTH, { message: t('validation.notesMaxLength', { max: MAX_NOTES_LENGTH }) })
      .optional(),
    total_points: z.preprocess(
      (val) => {
        if (val === '' || val === null || val === undefined) return null
        const num = Number(val)
        return isNaN(num) || !isFinite(num) ? null : num
      },
      z
        .number()
        .min(0, { message: t('validation.pointsMinValue') })
        .max(99999999, { message: t('validation.pointsMax', { max: 99999999 }) })
        .nullable()
        .optional()
    ),
    tags: z
      .array(
        z
          .string()
          .max(MAX_TAG_LENGTH, { message: t('validation.tagMaxLength', { max: MAX_TAG_LENGTH }) })
      )
      .refine((tags) => tags.length <= 5, {
        message: t('validation.tagsMaxCount', { max: 5 }),
      })
      .default([]),
  })

// 完全な顧客データの型定義
type CompleteCustomerData = {
  customer: RowType<'customer'> | null
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

function CustomerEditForm() {
  const params = useParams()
  const { tenantId, orgId, role, isLoaded } = useTenantAndOrganization()
  const router = useRouter()
  const customerUid = params.customer_uid as string
  const t = useTranslations('customers')

  // 状態管理
  const [completeCustomer, setCompleteCustomer] = useState<CompleteCustomerData | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  // customerRepo の初期化を useMemo でラップ
  const customerRepo = useMemo(() => new CustomerRepository(), [])

  const customerEditFormSchema = createCustomerEditFormSchema(t)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
    setValue,
    watch,
  } = useZodForm(customerEditFormSchema)

  // 顧客データを取得
  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!tenantId || !orgId || !customerUid || !isLoaded) {
        return
      }

      try {
        setIsLoadingData(true)
        const data = await customerRepo.getCompleteCustomerData(customerUid, tenantId, orgId)
        setCompleteCustomer(data)

        // フォームにデータを設定
        if (data.customer) {
          reset({
            last_name: data.customer.last_name || '',
            first_name: data.customer.first_name || '',
            phone: data.customer.phone || '',
            email: data.customer.email || '',
            birthday: data.customerDetail?.birthday || '',
            gender: (data.customerDetail?.gender as Gender) || 'unselected',
            notes: data.customerDetail?.notes || '',
            tags: data.customer.tags || [],
            total_points: data.customerPoints?.total_points || 0,
          })
        }
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error)
        toast.error(t('fetchError'))
      } finally {
        setIsLoadingData(false)
      }
    }

    fetchCustomerData()
  }, [tenantId, orgId, customerUid, isLoaded, reset, customerRepo, t]) // resetを依存配列に追加

  // フォーム送信処理
  const onSubmit = async (data: z.infer<typeof customerEditFormSchema>) => {
    console.log('フォームデータを送信中:', data)

    if (!completeCustomer || !completeCustomer.customer) {
      toast.error(t('dataNotLoaded'))
      return
    }

    if (!tenantId || !orgId) {
      toast.error(t('tenantOrOrgNotFound'))
      return
    }

    try {
      // 年齢を計算
      const calculatedAge = calculateAge(data.birthday)

      // 顧客基本情報の更新データを準備
      // line_idとline_user_nameは変更しないため、明示的にundefinedを渡す
      const customerData = {
        email: data.email || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
        line_id: undefined, // undefinedを渡すことで、SQL関数側で既存の値を保持
        line_user_name: undefined, // undefinedを渡すことで、SQL関数側で既存の値を保持
      }

      // 顧客詳細情報の更新データを準備
      const detailData = {
        email: data.email || '',
        gender: data.gender || 'unselected',
        birthday: data.birthday || '',
        age: calculatedAge || null,
        notes: data.notes || '',
      }

      // ポイントの変更を検出
      const currentPoints = completeCustomer.customerPoints?.total_points || 0
      const newPoints = data.total_points || 0
      const pointsDelta = newPoints - currentPoints

      // ポイントが変更された場合
      if (pointsDelta !== 0) {
        // ポイント履歴を作成しながらポイントを更新（アトミック操作）
        try {
          const pointUpdateResult = await customerRepo.updatePointsAtomic(
            customerUid,
            tenantId,
            orgId,
            pointsDelta,
            pointsDelta > 0 ? 'manual_add' : 'manual_subtract',
            `管理画面での手動${pointsDelta > 0 ? '追加' : '削減'}: ${Math.abs(pointsDelta)}ポイント`
          )
          console.log('ポイント履歴を作成しました:', pointUpdateResult)
        } catch (pointError) {
          console.error('ポイント履歴の作成に失敗しました:', pointError)
          toast.error(t('pointUpdateError'))
          return
        }
      }

      // 顧客情報を更新（ポイント以外）
      const result = await customerRepo.updateCustomerWithDetailsAndPoints(
        customerUid,
        tenantId,
        orgId,
        customerData,
        detailData,
        currentPoints + pointsDelta, // 更新後のポイント残高（アトミック更新の結果を反映）
        data.tags || []
      )

      if (result.customer) {
        toast.success(t('customerUpdated'))
        router.push(`/dashboard/customer/${customerUid}`)
      } else {
        toast.error(t('updateError'))
      }
    } catch (error) {
      console.error('Update process error:', error)
      const errorMessage = error instanceof Error ? error.message : t('updateError')
      toast.error(errorMessage)
    }
  }

  // ローディング状態の表示
  if (!isLoaded || isLoadingData || !completeCustomer) {
    return <Loading />
  }

  // 表示用の年齢を計算
  const displayAge = calculateAge(watch('birthday'))

  return (
    <div className="mx-auto w-full min-w-0">
      {completeCustomer.customer?.line_user_name && (
        <p className="mb-5 w-fit rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground">
          <span className="font-bold">{t('lineUserName')} </span>{' '}
          <span className="text-muted-foreground ml-2 tracking-wider font-bold">
            {completeCustomer.customer.line_user_name}
          </span>
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="admin-form p-5 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 col-span-1">
            <ZodTextField
              label={t('lastName')}
              register={register}
              errors={errors}
              name="last_name"
              placeholder={t('placeholder.lastName')}
            />
            <ZodTextField
              label={t('firstName')}
              register={register}
              errors={errors}
              name="first_name"
              placeholder={t('placeholder.firstName')}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ZodTextField
            label={t('phone')}
            register={register}
            errors={errors}
            name="phone"
            placeholder={t('placeholder.phone')}
          />
          <ZodTextField
            label={t('email')}
            register={register}
            errors={errors}
            name="email"
            placeholder={t('placeholder.email')}
            type="email"
          />
        </div>

        {/* 年齢と性別の表示 */}
        <div className="flex items-center gap-2">
          <p className="text-lg text-muted-foreground">
            {/* 年齢の表示 */}
            {displayAge !== undefined && displayAge !== null ? displayAge : '-'}
            <span className="text-base font-normal text-muted-foreground">
              {t('yearsOld')}
            </span>{' '}
            <span className="text-base font-normal text-muted-foreground">
              {watch('gender') === 'male'
                ? t('male')
                : watch('gender') === 'female'
                  ? t('female')
                  : t('unselected')}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {(role === 'admin' || role === 'owner') && (
            <div className="flex flex-col gap-4">
              {/* ポイントフィールド */}
              <div>
                <ZodTextField
                  label={t('totalPoints')}
                  register={register}
                  errors={errors}
                  name="total_points"
                  placeholder={t('placeholder.totalPoints')}
                  type="number"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  {t('pointsChangeWarning')}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gender"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                {t('gender')}
              </label>
              <Select
                onValueChange={(value) => {
                  setValue('gender', value as Gender, { shouldDirty: true })
                }}
                value={watch('gender') || 'unselected'}
              >
                <SelectTrigger id="gender" className={errors.gender ? 'border-destructive' : ''}>
                  <SelectValue placeholder={t('selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_VALUES.map((genderValue) => (
                    <SelectItem key={genderValue} value={genderValue}>
                      {genderValue === 'unselected'
                        ? t('unselected')
                        : genderValue === 'male'
                          ? t('male')
                          : t('female')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.gender && (
                <p className="text-sm font-medium text-destructive mt-1">{errors.gender.message}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="birthday"
                className="block text-sm font-medium text-muted-foreground mb-1"
              >
                {t('birthday')}
              </label>
              <DatePicker
                id="birthday"
                className="min-h-11 bg-background hover:bg-muted"
                value={watch('birthday') ? new Date(watch('birthday')!) : undefined}
                onChange={(date) => {
                  const dateString = date ? format(date, 'yyyy-MM-dd') : ''
                  setValue('birthday', dateString, { shouldDirty: true })
                  console.log('誕生日が変更されました:', dateString)
                }}
                placeholder={t('birthdayPlaceholder')}
                error={!!errors.birthday}
                toDate={new Date()} // 未来の日付は選択不可
              />
              {errors.birthday && (
                <p className="text-sm font-medium text-destructive mt-1">
                  {errors.birthday.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div>
          <TagInput
            tags={watch('tags') || []}
            setTagsAction={(tags) => {
              setValue('tags', tags, { shouldDirty: true })
            }}
            title={t('tags')}
            errors={errors.tags}
          />
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-muted-foreground mb-1">
            {t('notes')}
          </label>
          <Textarea
            id="notes"
            {...register('notes')}
            rows={8}
            placeholder={t('memoPlaceholder')}
            disabled={isSubmitting}
            className={errors.notes ? 'border-destructive' : ''}
          />
          {errors.notes && (
            <p className="text-sm font-medium text-destructive mt-1">{errors.notes.message}</p>
          )}
        </div>

        <div className="flex justify-end border-t border-border pt-5">
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('updating')}
              </>
            ) : (
              <>
                <Pencil className="w-4 h-4 mr-2" />
                {t('updateButton')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default withManagerAccess(CustomerEditForm)
