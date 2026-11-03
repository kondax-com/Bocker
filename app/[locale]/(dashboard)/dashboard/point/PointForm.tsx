'use client'

import { useState, useEffect } from 'react'
import { Separator } from '@/components/ui/separator'
import { Coins, Gift, Loader2 } from 'lucide-react'
import { Id } from '@/convex/_generated/dataModel'
import { useZodForm } from '@/hooks/useZodForm'
import { z } from 'zod'
import { POINT_EXPIRATION_DAYS } from '@/lib/constants'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/common'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import { Switch } from '@/components/ui/switch'
import { AlertCircle } from 'lucide-react'
import { DollarSign, Percent } from 'lucide-react'
import { ZodTextField } from '@/components/common'
import { Save } from 'lucide-react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useTranslations, useLocale } from 'next-intl'
import { getIntlLocaleCode } from '@/lib/dateLocale'

const createPointConfigSchema = (
  t: (key: string, values?: Record<string, string | number | Date>) => string
) =>
  z
    .object({
      id: z.string().optional(),
      is_active: z.boolean().default(true),
      is_fixed_point: z.boolean().default(false),
      point_rate: z.preprocess(
        (val) => {
          // 空文字列の場合はnullを返す
          if (val === '' || val === null || val === undefined) return null
          // 数値に変換できない場合もnullを返す
          const num = Number(val)
          return isNaN(num) ? null : num
        },
        z
          .number()
          .max(100, { message: t('validation.pointRateMax') })
          .nullable()
          .optional()
      ),
      fixed_point: z.preprocess(
        (val) => {
          // 空文字列の場合はnullを返す
          if (val === '' || val === null || val === undefined) return null
          // 数値に変換できない場合もnullを返す
          const num = Number(val)
          return isNaN(num) ? null : num
        },
        z
          .number()
          .max(99999, { message: t('validation.fixedPointMax') })
          .nullable()
          .optional()
      ),
      point_expiration_days: z.number().min(1).optional().default(POINT_EXPIRATION_DAYS[0].value),
      minimum_charge_point: z.number().min(0).max(10000).optional().nullable().default(null),
    })
    .superRefine((data, ctx) => {
      // ポイント機能が無効な場合は、バリデーションをスキップ
      if (!data.is_active) return

      // 固定ポイントタイプの場合
      if (data.is_fixed_point) {
        if (data.fixed_point === null || data.fixed_point === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('validation.fixedPointRequired'),
            path: ['fixed_point'],
          })
        }
      } else {
        // 率指定タイプの場合
        if (data.point_rate === null || data.point_rate === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('validation.pointRateRequired'),
            path: ['point_rate'],
          })
        }
      }
    })

export default function PointForm() {
  const { tenantId, orgId } = useTenantAndOrganization()

  const [isSaving, setIsSaving] = useState(false)
  const { showErrorToast } = useErrorHandler()
  const t = useTranslations('point')
  const locale = useLocale()

  const pointConfigSchema = createPointConfigSchema(t)

  const pointConfig = useQuery(
    api.point.query.findByTenantAndOrg,
    tenantId && orgId ? { tenant_id: tenantId, org_id: orgId } : 'skip'
  )

  const upsertPointConfig = useMutation(api.point.mutation.upsert)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting, errors, isDirty },
  } = useZodForm(pointConfigSchema)

  useEffect(() => {
    if (pointConfig) {
      reset({
        point_rate: pointConfig.point_rate,
        fixed_point: pointConfig.fixed_point,
        point_expiration_days: pointConfig.point_expiration_days ?? POINT_EXPIRATION_DAYS[0].value,
        is_fixed_point: pointConfig.is_fixed_point,
        is_active: pointConfig.is_active ?? false,
        minimum_charge_point: pointConfig.minimum_charge_point ?? 1000,
      })
    }
  }, [pointConfig, reset])

  const onSubmit = async (data: z.infer<typeof pointConfigSchema>) => {
    setIsSaving(true)
    try {
      if (!tenantId || !orgId) {
        toast.error(t('errors.tenantOrOrgNotFound'))
        setIsSaving(false)
        return
      }
      await upsertPointConfig({
        tenant_id: tenantId,
        org_id: orgId,
        point_config_id: pointConfig?._id as Id<'point_config'> | undefined,
        point_rate: data.point_rate ?? undefined,
        fixed_point: data.fixed_point ?? undefined,
        point_expiration_days: data.point_expiration_days ?? 0,
        is_fixed_point: data.is_fixed_point ?? undefined,
        is_active: data.is_active ?? undefined,
        minimum_charge_point: data.minimum_charge_point ?? 0,
      })

      toast.success(t('messages.settingsSaved'))
      setTimeout(() => setIsSaving(false), 300)
    } catch (error) {
      showErrorToast(error)
      setIsSaving(false)
    }
  }

  if (isSaving) return <Loading />
  if (!tenantId || !orgId) {
    return <Loading />
  }
  if (pointConfig === undefined) {
    return <Loading />
  }

  const watchedExpirationDays = watch('point_expiration_days')
  const watchedIsFixedPoint = watch('is_fixed_point')
  const watchedIsActive = watch('is_active')

  return (
    <form
      className="min-w-0"
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault()
        }
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <div className="admin-panel overflow-hidden">
            <div className="border-b border-border bg-muted p-5">
              <h5 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Coins className="h-5 w-5 text-muted-foreground" />
                {t('basicSettings.title')}
              </h5>
              <p className="text-sm text-muted-foreground py-2 mb-2">
                {t('basicSettings.description')}
                <br />
                <span className="font-bold">{t('basicSettings.pointValue')}</span>
              </p>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="flex flex-col items-start gap-2">
                <div
                  className={`px-2 py-1 rounded-md ${
                    watchedIsActive
                      ? 'text-success-foreground bg-success border border-success-foreground'
                      : 'text-destructive bg-destructive-foreground border border-destructive'
                  }`}
                >
                  <p className="text-sm font-bold">
                    {watchedIsActive
                      ? t('basicSettings.pointStatusActive')
                      : t('basicSettings.pointStatusInactive')}
                  </p>
                </div>
                <Switch
                  id="point-active"
                  checked={watchedIsActive}
                  onCheckedChange={(checked) => {
                    setValue('is_active', checked, { shouldDirty: true })
                  }}
                  className="mx-2"
                />
                <div>
                  <span className="block text-xs text-muted-foreground">
                    {t('basicSettings.enableDescription')}
                  </span>
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <Label htmlFor="point-type">{t('basicSettings.pointType')}</Label>
                <span className="text-xs text-muted-foreground">
                  {t('basicSettings.pointTypeDescription')}
                </span>
                <div
                  className={`flex items-center justify-between p-3 rounded-md ${
                    watchedIsFixedPoint
                      ? 'bg-success text-success-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="text-sm font-bold">
                    {watchedIsFixedPoint
                      ? t('basicSettings.fixedPoint')
                      : t('basicSettings.pointRate')}
                  </span>

                  <Switch
                    id="point-type"
                    checked={watchedIsFixedPoint}
                    className="data-[state=checked]:bg-muted data-[state=unchecked]:bg-link-foreground"
                    onCheckedChange={(checked) => {
                      setValue('is_fixed_point', checked, { shouldDirty: true })
                    }}
                  />
                </div>
              </div>
              {watchedIsFixedPoint ? (
                <ZodTextField
                  register={register}
                  errors={errors}
                  name="fixed_point"
                  label={t('basicSettings.fixedPoint')}
                  type="number"
                  icon={<DollarSign size={16} />}
                  placeholder={t('basicSettings.fixedPointPlaceholder')}
                />
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="point_rate" className="flex items-center gap-2">
                    <Percent size={16} />
                    {t('basicSettings.pointRate')} (%)
                  </Label>
                  <Input
                    id="point_rate"
                    type="number"
                    placeholder={t('basicSettings.pointRatePlaceholder')}
                    step="1"
                    min="0"
                    max="100"
                    value={watch('point_rate') !== undefined ? watch('point_rate') || 0 : ''}
                    onChange={(e) => {
                      const percentValue = parseFloat(e.target.value)
                      if (!isNaN(percentValue)) {
                        setValue('point_rate', percentValue, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      } else {
                        setValue('point_rate', undefined, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                    }}
                  />
                  {errors.point_rate && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle size={14} />
                      {errors.point_rate.message as string}
                    </p>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="minimum_charge_point">
                  {t('basicSettings.minimumChargePoint')}
                </Label>
                <Input
                  id="minimum_charge_point"
                  type="number"
                  placeholder={t('basicSettings.minimumChargePointPlaceholder')}
                  step="1"
                  min="0"
                  max="10000"
                  value={watch('minimum_charge_point') ?? ''}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : null
                    setValue('minimum_charge_point', value, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }}
                />
                {errors.minimum_charge_point && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle size={14} />
                    {errors.minimum_charge_point.message as string}
                  </p>
                )}
                <p className="text-xs mt-2 tracking-wide leading-relaxed bg-muted text-muted-foreground p-2 rounded-md">
                  {t('basicSettings.minimumChargePointDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div>
            <div className="admin-panel h-full overflow-hidden">
              <div className="border-b border-border bg-muted p-5">
                <h5 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Gift className="h-5 w-5 text-muted-foreground" />
                  {t('summary.title')}
                </h5>
                <p className="text-sm text-muted-foreground mt-2">{t('summary.description')}</p>
              </div>
              <div className="p-4">
                <div className="space-y-5">
                  <div className="space-y-3 text-sm">
                    {watchedIsFixedPoint ? (
                      <p className="flex justify-between items-end text-sm font-bold">
                        <span className="text-primary">{t('summary.fixedPointLabel')}</span>
                        <span className="font-medium">
                          {watch('fixed_point') || 0} {t('common.points')}
                        </span>
                      </p>
                    ) : (
                      <p className="flex justify-between items-end text-sm font-bold">
                        <span className="text-primary">{t('summary.pointRateLabel')}</span>
                        <span className="text-base font-bold tracking-wide">
                          {watch('point_rate') || 0}%
                        </span>
                      </p>
                    )}
                    <p className="flex justify-between items-end text-sm font-bold">
                      <span className="text-primary">{t('summary.expirationLabel')}</span>
                      <span className="text-base font-bold tracking-wide">
                        {POINT_EXPIRATION_DAYS.find((d) => d.value === watchedExpirationDays)
                          ?.label || POINT_EXPIRATION_DAYS[0].label}
                      </span>
                    </p>
                    <p className="text-sm pt-4 w-full text-primary text-end">
                      {t('basicSettings.todayGrantedExpiry')}{' '}
                      <span className="font-bold">
                        {watchedExpirationDays
                          ? new Date(
                              Date.now() + watchedExpirationDays * 24 * 60 * 60 * 1000
                            ).toLocaleDateString(getIntlLocaleCode(locale), {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          : new Date().toLocaleDateString(getIntlLocaleCode(locale), {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                      </span>
                    </p>
                  </div>
                  <Separator className="" />
                  <div className="space-y-4 py-4">
                    <div className="rounded-xl bg-muted p-4">
                      <p className="text-sm text-muted-foreground">
                        {t('summary.forPayment', { amount: '1,000' })}
                      </p>
                      <p className="text-lg font-bold">
                        {watchedIsFixedPoint
                          ? watch('fixed_point') || 0
                          : Math.floor((watch('point_rate') || 0) * 10)}{' '}
                        <span className="text-xs">
                          {t('summary.pointsGranted', { amount: '' })
                            .replace('{amount}', '')
                            .trim()}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted p-4">
                      <p className="text-sm text-muted-foreground">
                        {t('summary.forPayment', { amount: '5,000' })}
                      </p>
                      <p className="text-lg font-bold">
                        {watchedIsFixedPoint
                          ? watch('fixed_point') || 0
                          : Math.floor((watch('point_rate') || 0) * 50)}{' '}
                        <span className="text-xs">
                          {t('summary.pointsGranted', { amount: '' })
                            .replace('{amount}', '')
                            .trim()}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <Button
          type="submit"
          className="min-h-11 rounded-lg px-6 gap-2"
          disabled={isSubmitting || !isDirty}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('saveButton')}
            </>
          )}
        </Button>
      </div>
      <Accordion type="single" collapsible className="space-y-2">
        {/* ① 付与の仕組み */}
        <AccordionItem value="point-scheme">
          <AccordionTrigger>{t('accordion.grantMechanism')}</AccordionTrigger>
          <AccordionContent className="space-y-2 text-muted-foreground text-sm leading-relaxed bg-muted p-4 rounded-lg mb-4">
            <p>
              <strong>{t('accordion.grantDate')}</strong> {t('accordion.grantDateDesc')}
              <span className="font-bold">{t('accordion.nextMonth15')}</span>
              {t('accordion.autoGrant')}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('accordion.example')}</li>
            </ul>

            <p className="pt-2">
              <strong>{t('accordion.grantMethod')}</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('accordion.pointRateMethod')}</li>
              <li>{t('accordion.fixedPointMethod')}</li>
            </ul>

            <p className="pt-2">
              <strong>{t('accordion.exchangeRate')}</strong> {t('accordion.exchangeRateDesc')}
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* ② 失効タイミング */}
        <AccordionItem value="point-expiration">
          <AccordionTrigger>{t('accordion.expirationTiming')}</AccordionTrigger>
          <AccordionContent className="space-y-2 text-muted-foreground text-sm leading-relaxed bg-muted p-4 rounded-lg mb-4">
            <p>
              {t('accordion.expirationDesc')}
              <span className="font-bold">
                {POINT_EXPIRATION_DAYS.find((d) => d.value === watchedExpirationDays)?.label}
              </span>
              {t('accordion.expirationAfter')}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('accordion.expirationManagement')}</li>
              <li>{t('accordion.reminderEffect')}</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* ③ 注意点 */}
        <AccordionItem value="point-caution">
          <AccordionTrigger>{t('accordion.cautions')}</AccordionTrigger>
          <AccordionContent className="space-y-2 text-muted-foreground text-sm leading-relaxed bg-muted p-4 rounded-lg mb-4">
            <ul className="list-disc list-inside space-y-1">
              <li>{t('accordion.cautionNoDouble')}</li>
              <li>
                {t('accordion.cautionSameStore')}
                <span className="font-bold">{t('accordion.cautionSameStoreOnly')}</span>
                {t('accordion.cautionSameStoreEnd')}
              </li>

              {/* 利用フローを段階的に説明 */}
              <li>
                {t('accordion.usageFlow')}
                <ol className="list-decimal list-inside ml-5 space-y-0.5">
                  <li>{t('accordion.usageStep1')}</li>
                  <li>{t('accordion.usageStep2')}</li>
                </ol>
              </li>
              <li>{t('accordion.cautionStaffConfirm')}</li>
              <li>{t('accordion.cautionRounding')}</li>
              <li>{t('accordion.cautionAccounting')}</li>
              <li>{t('accordion.cautionNoCash')}</li>
              <li>
                {t('accordion.cautionCancellation')}
                <strong>{t('accordion.cautionInvalidate')}</strong>
                {t('accordion.cautionRefund')}
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  )
}
