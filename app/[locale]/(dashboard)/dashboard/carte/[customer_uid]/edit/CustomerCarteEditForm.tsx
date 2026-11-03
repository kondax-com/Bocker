'use client'

import { withManagerAccess } from '@/components/common'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useZodForm } from '@/hooks/useZodForm'
import { Loading } from '@/components/common'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import { CarteRepository } from '@/services/supabase/repositories'
import type { RowType } from '@/services/supabase/SupabaseService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { z } from 'zod'
import type {
  HairThickness,
  HairVolume,
  HairWaveLevel,
  ScalpCondition,
} from '@/services/supabase/repositories/carte/types'
import {
  User,
  Save,
  AlertTriangle,
  FileText,
  Loader2,
  UserCheck,
  Scissors,
  Phone,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { convertGender, Gender } from '@/convex/types'

// バリデーションスキーマを作成する関数
const createCarteEditSchema = (t: ReturnType<typeof useTranslations>) =>
  z.object({
    // 既存フィールド
    skin_type: z.string().nullable().optional(),
    hair_type: z.string().nullable().optional(),
    allergy_history: z.string().max(1000, t('edit.validation.maxLength')).nullable().optional(),
    medical_history: z.string().max(1000, t('edit.validation.maxLength')).nullable().optional(),

    // 🟢 顧客記入項目
    prefer_silence: z.boolean().nullable().optional(),
    avoid_chemicals: z.string().max(500, t('edit.validation.maxLength')).nullable().optional(),
    has_sensitive_skin: z.boolean().nullable().optional(),
    sensitive_skin_detail: z
      .string()
      .max(500, t('edit.validation.maxLength'))
      .nullable()
      .optional(),
    fragrance_sensitivity: z.boolean().nullable().optional(),
    use_contact_lenses: z.boolean().nullable().optional(),
    avoid_sales_talk: z.boolean().nullable().optional(),
    avoid_private_topics: z.boolean().nullable().optional(),
    daily_styling_time: z.number().min(0).max(120).nullable().optional(),
    allow_photo_sns: z.boolean().nullable().optional(),

    // 🔵 店舗記入項目
    hair_thickness: z.enum(['fine', 'medium', 'coarse']).nullable().optional(),
    hair_volume: z.enum(['low', 'medium', 'high']).nullable().optional(),
    hair_wave_level: z.enum(['straight', 'slight', 'moderate', 'strong']).nullable().optional(),
    hair_damage_tendency: z.boolean().nullable().optional(),
    poor_dye_perm_retention: z.boolean().nullable().optional(),
    quick_color_fade: z.boolean().nullable().optional(),
    hair_dryness: z.boolean().nullable().optional(),
    scalp_condition: z.enum(['normal', 'dry', 'oily', 'sensitive']).nullable().optional(),
    scalp_trouble_detail: z.string().max(500, t('edit.validation.maxLength')).nullable().optional(),

    // 🟡 共通編集項目
    prefer_hair_styling: z.boolean().nullable().optional(),
    use_styling_product: z.boolean().nullable().optional(),
  })

type CarteEditFormData = {
  // 既存フィールド
  skin_type?: string | null
  hair_type?: string | null // 廃止予定
  allergy_history?: string | null
  medical_history?: string | null

  // 🟢 顧客記入項目
  prefer_silence?: boolean | null
  avoid_chemicals?: string | null
  has_sensitive_skin?: boolean | null
  sensitive_skin_detail?: string | null
  fragrance_sensitivity?: boolean | null
  use_contact_lenses?: boolean | null
  avoid_sales_talk?: boolean | null
  avoid_private_topics?: boolean | null
  daily_styling_time?: number | null
  allow_photo_sns?: boolean | null

  // 🔵 店舗記入項目
  hair_thickness?: 'fine' | 'medium' | 'coarse' | null
  hair_volume?: 'low' | 'medium' | 'high' | null
  hair_wave_level?: 'straight' | 'slight' | 'moderate' | 'strong' | null
  hair_damage_tendency?: boolean | null
  poor_dye_perm_retention?: boolean | null
  quick_color_fade?: boolean | null
  hair_dryness?: boolean | null
  scalp_condition?: 'normal' | 'dry' | 'oily' | 'sensitive' | null
  scalp_trouble_detail?: string | null

  // 🟡 共通編集項目
  prefer_hair_styling?: boolean | null
  use_styling_product?: boolean | null
}

type CustomerWithDetails = {
  customer: RowType<'customer'> | null
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

// 選択肢を作成する関数
const getSkinTypeOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: 'normal', label: t('edit.skinTypes.normal') },
  { value: 'dry', label: t('edit.skinTypes.dry') },
  { value: 'oily', label: t('edit.skinTypes.oily') },
  { value: 'combination', label: t('edit.skinTypes.combination') },
  { value: 'sensitive', label: t('edit.skinTypes.sensitive') },
]

// 🔵 店舗記入項目用の選択肢
const getHairThicknessOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: 'fine', label: t('edit.hairThickness.fine') },
  { value: 'medium', label: t('edit.hairThickness.medium') },
  { value: 'coarse', label: t('edit.hairThickness.coarse') },
]

const getHairVolumeOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: 'low', label: t('edit.hairVolume.low') },
  { value: 'medium', label: t('edit.hairVolume.medium') },
  { value: 'high', label: t('edit.hairVolume.high') },
]

const getHairWaveLevelOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: 'straight', label: t('edit.hairWaveLevel.straight') },
  { value: 'slight', label: t('edit.hairWaveLevel.slight') },
  { value: 'moderate', label: t('edit.hairWaveLevel.moderate') },
  { value: 'strong', label: t('edit.hairWaveLevel.strong') },
]

const getScalpConditionOptions = (t: ReturnType<typeof useTranslations>) => [
  { value: 'normal', label: t('edit.scalpCondition.normal') },
  { value: 'dry', label: t('edit.scalpCondition.dry') },
  { value: 'oily', label: t('edit.scalpCondition.oily') },
  { value: 'sensitive', label: t('edit.scalpCondition.sensitive') },
]

function CustomerCarteEditForm() {
  const router = useRouter()
  const { customer_uid } = useParams()
  const tCarte = useTranslations('dashboard.carte')
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()

  // 翻訳を使ったスキーマと選択肢を作成
  const carteEditSchema = useMemo(() => createCarteEditSchema(tCarte), [tCarte])
  const SKIN_TYPE_OPTIONS = useMemo(() => getSkinTypeOptions(tCarte), [tCarte])
  const HAIR_THICKNESS_OPTIONS = useMemo(() => getHairThicknessOptions(tCarte), [tCarte])
  const HAIR_VOLUME_OPTIONS = useMemo(() => getHairVolumeOptions(tCarte), [tCarte])
  const HAIR_WAVE_LEVEL_OPTIONS = useMemo(() => getHairWaveLevelOptions(tCarte), [tCarte])
  const SCALP_CONDITION_OPTIONS = useMemo(() => getScalpConditionOptions(tCarte), [tCarte])

  const [customerData, setCustomerData] = useState<CustomerWithDetails | null>(null)
  const [carteData, setCarteData] = useState<RowType<'carte'> | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const customerRepo = useMemo(() => new CustomerRepository(), [])
  const carteRepo = useMemo(() => new CarteRepository(), [])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
    watch,
  } = useZodForm(carteEditSchema)

  // 顧客データとカルテデータの取得
  const fetchData = useCallback(async () => {
    console.log('fetchData called:', { tenantId, orgId, customer_uid })
    if (!tenantId || !orgId || !customer_uid) {
      console.log('fetchData early return - missing required data')
      return
    }

    setIsLoadingData(true)
    try {
      // 顧客情報の取得
      const completeData = await customerRepo.getCompleteCustomerData(
        customer_uid as string,
        tenantId,
        orgId
      )

      if (!completeData.customer) {
        toast.error(tCarte('edit.customerNotFound'))
        router.push('/dashboard/carte')
        return
      }

      setCustomerData(completeData)

      // カルテ情報の取得
      const carte = await carteRepo.findByCustomer(tenantId, orgId, customer_uid as string)

      if (carte) {
        // 既存のカルテがある場合
        setCarteData(carte)
        reset({
          // 既存フィールド
          skin_type: carte.skin_type,
          hair_type: carte.hair_type,
          allergy_history: carte.allergy_history,
          medical_history: carte.medical_history,
          // 🟢 顧客記入項目 - null値にはデフォルト値を適用
          prefer_silence: carte.prefer_silence ?? false,
          avoid_chemicals: carte.avoid_chemicals,
          has_sensitive_skin: carte.has_sensitive_skin ?? false,
          sensitive_skin_detail: carte.sensitive_skin_detail,
          fragrance_sensitivity: carte.fragrance_sensitivity ?? false,
          use_contact_lenses: carte.use_contact_lenses ?? false,
          avoid_sales_talk: carte.avoid_sales_talk ?? false,
          avoid_private_topics: carte.avoid_private_topics ?? false,
          daily_styling_time: carte.daily_styling_time,
          allow_photo_sns: carte.allow_photo_sns ?? false,
          // 🔵 店舗記入項目
          hair_thickness: carte.hair_thickness as HairThickness,
          hair_volume: carte.hair_volume as HairVolume,
          hair_wave_level: carte.hair_wave_level as HairWaveLevel,
          hair_damage_tendency: carte.hair_damage_tendency,
          poor_dye_perm_retention: carte.poor_dye_perm_retention ?? false,
          quick_color_fade: carte.quick_color_fade ?? false,
          hair_dryness: carte.hair_dryness,
          scalp_condition: carte.scalp_condition as ScalpCondition,
          scalp_trouble_detail: carte.scalp_trouble_detail,
          // 🟡 共通編集項目 - null値にはデフォルト値を適用
          prefer_hair_styling: carte.prefer_hair_styling ?? false,
          use_styling_product: carte.use_styling_product ?? false,
        })
      } else {
        // カルテが存在しない場合はデフォルト値を設定
        setCarteData(null)
        reset({
          // 既存フィールド
          skin_type: null,
          hair_type: null,
          allergy_history: null,
          medical_history: null,
          // 🟢 顧客記入項目 - デフォルトは false (「いいえ」として表示)
          prefer_silence: false,
          avoid_chemicals: null,
          has_sensitive_skin: false,
          sensitive_skin_detail: null,
          fragrance_sensitivity: false,
          use_contact_lenses: false,
          avoid_sales_talk: false,
          avoid_private_topics: false,
          daily_styling_time: null,
          allow_photo_sns: false,
          // 🔵 店舗記入項目 - デフォルトは null
          hair_thickness: null,
          hair_volume: null,
          hair_wave_level: null,
          hair_damage_tendency: null,
          poor_dye_perm_retention: false,
          quick_color_fade: false,
          hair_dryness: null,
          scalp_condition: null,
          scalp_trouble_detail: null,
          // 🟡 共通編集項目 - デフォルトは false
          prefer_hair_styling: false,
          use_styling_product: false,
        })
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error(tCarte('edit.fetchError'))
    } finally {
      setIsLoadingData(false)
    }
  }, [tenantId, orgId, customer_uid, customerRepo, carteRepo, reset, router, tCarte])

  const calculateAge = (birthday: string) => {
    const today = new Date()
    const birthDate = new Date(birthday)
    const age = today.getFullYear() - birthDate.getFullYear()
    return age
  }

  // 初回データ取得
  useEffect(() => {
    console.log('useEffect conditions:', { isLoaded, customer_uid, tenantId, orgId })
    if (isLoaded && customer_uid && tenantId && orgId) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, customer_uid, tenantId, orgId])

  // フォーム送信処理
  const onSubmit = async (data: CarteEditFormData) => {
    if (!tenantId || !orgId || !customer_uid) return

    setIsSubmitting(true)
    try {
      if (carteData) {
        // 既存のカルテを更新
        await carteRepo.updateCarte(carteData.id, {
          // 既存フィールド
          skin_type: data.skin_type || null,
          hair_type: data.hair_type || null,
          allergy_history: data.allergy_history || null,
          medical_history: data.medical_history || null,
          // 🟢 顧客記入項目
          prefer_silence: data.prefer_silence || null,
          avoid_chemicals: data.avoid_chemicals || null,
          has_sensitive_skin: data.has_sensitive_skin || null,
          sensitive_skin_detail: data.sensitive_skin_detail || null,
          fragrance_sensitivity: data.fragrance_sensitivity || null,
          use_contact_lenses: data.use_contact_lenses || null,
          avoid_sales_talk: data.avoid_sales_talk || null,
          avoid_private_topics: data.avoid_private_topics || null,
          daily_styling_time: data.daily_styling_time || null,
          allow_photo_sns: data.allow_photo_sns || null,
          // 🔵 店舗記入項目
          hair_thickness: data.hair_thickness || null,
          hair_volume: data.hair_volume || null,
          hair_wave_level: data.hair_wave_level || null,
          hair_damage_tendency: data.hair_damage_tendency || null,
          poor_dye_perm_retention: data.poor_dye_perm_retention || null,
          quick_color_fade: data.quick_color_fade || null,
          hair_dryness: data.hair_dryness || null,
          scalp_condition: data.scalp_condition || null,
          scalp_trouble_detail: data.scalp_trouble_detail || null,
          // 🟡 共通編集項目
          prefer_hair_styling: data.prefer_hair_styling || null,
          use_styling_product: data.use_styling_product || null,
        })
        toast.success(tCarte('edit.updateSuccess'))
      } else {
        // 新規カルテを作成
        await carteRepo.createCarte({
          tenant_id: tenantId,
          org_id: orgId,
          customer_uid: customer_uid as string,
          // 既存フィールド
          skin_type: data.skin_type || null,
          hair_type: data.hair_type || null,
          allergy_history: data.allergy_history || null,
          medical_history: data.medical_history || null,
          ltv_price: 0, // デフォルト値
          // 🟢 顧客記入項目
          prefer_silence: data.prefer_silence || null,
          avoid_chemicals: data.avoid_chemicals || null,
          has_sensitive_skin: data.has_sensitive_skin || null,
          sensitive_skin_detail: data.sensitive_skin_detail || null,
          fragrance_sensitivity: data.fragrance_sensitivity || null,
          use_contact_lenses: data.use_contact_lenses || null,
          avoid_sales_talk: data.avoid_sales_talk || null,
          avoid_private_topics: data.avoid_private_topics || null,
          daily_styling_time: data.daily_styling_time || null,
          allow_photo_sns: data.allow_photo_sns || null,
          // 🔵 店舗記入項目
          hair_thickness: data.hair_thickness || null,
          hair_volume: data.hair_volume || null,
          hair_wave_level: data.hair_wave_level || null,
          hair_damage_tendency: data.hair_damage_tendency || null,
          poor_dye_perm_retention: data.poor_dye_perm_retention || null,
          quick_color_fade: data.quick_color_fade || null,
          hair_dryness: data.hair_dryness || null,
          scalp_condition: data.scalp_condition || null,
          scalp_trouble_detail: data.scalp_trouble_detail || null,
          // 🟡 共通編集項目
          prefer_hair_styling: data.prefer_hair_styling || null,
          use_styling_product: data.use_styling_product || null,
        })
        toast.success(tCarte('edit.createSuccess'))
      }

      router.push(`/dashboard/carte/${customer_uid}`)
    } catch (error) {
      console.error('Failed to save carte:', error)
      toast.error(tCarte('edit.saveError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isLoaded || isLoadingData) {
    return <Loading />
  }

  if (!customerData) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {tCarte('edit.customerNotFound')}
      </div>
    )
  }

  console.log(customerData)

  const customerName = `${customerData.customer?.last_name} ${customerData.customer?.first_name}`
  const finalCustomerName =
    customerName.trim().length > 0
      ? customerName
      : customerData.customer?.line_id
        ? customerData.customer.line_user_name
        : '顧客名未設定'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="min-w-0">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="basic" className="min-h-11 px-3 text-sm">
            {tCarte('edit.tabs.basic')}
          </TabsTrigger>
          <TabsTrigger value="customer" className="min-h-11 px-3 text-sm">
            {tCarte('edit.tabs.customer')}
          </TabsTrigger>
          <TabsTrigger value="store" className="min-h-11 px-3 text-sm">
            {tCarte('edit.tabs.store')}
          </TabsTrigger>
          <TabsTrigger value="medical" className="min-h-11 px-3 text-sm">
            {tCarte('edit.tabs.medical')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card className="admin-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {tCarte('edit.basicInfo.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 顧客名表示（編集不可） */}
              <div className="flex flex-col gap-4 max-w-md w-full">
                <div className="border-b pb-3">
                  <Label className="text-muted-foreground text-sm mb-1">
                    {tCarte('edit.basicInfo.customerName')}
                  </Label>
                  <p className="text-xl font-semibold text-foreground">{finalCustomerName} 様</p>
                  {customerData.customer?.email && (
                    <p className="text-muted-foreground text-sm mt-1">
                      {customerData.customer.email}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">
                    {customerData.customer?.phone || tCarte('edit.basicInfo.notSet')}
                  </p>
                </div>

                <div className="border-b pb-3">
                  <Label className="text-muted-foreground text-sm mb-1">誕生日</Label>
                  <p className="text-muted-foreground text-sm">
                    {customerData.customerDetail?.birthday ? (
                      <>
                        {customerData.customerDetail.birthday} /{' '}
                        {calculateAge(customerData.customerDetail.birthday)}歳
                      </>
                    ) : (
                      tCarte('edit.basicInfo.notSet')
                    )}
                  </p>
                </div>

                <div className="border-b pb-3">
                  <Label className="text-muted-foreground text-sm mb-1">
                    {tCarte('edit.basicInfo.gender')}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {customerData.customerDetail?.gender &&
                    (customerData.customerDetail?.gender as Gender) !== 'unselected'
                      ? convertGender(customerData.customerDetail?.gender as Gender)
                      : tCarte('edit.basicInfo.notSet')}
                  </p>
                </div>

                <div className="pb-3">
                  <Label className="text-muted-foreground text-sm mb-1">
                    {tCarte('edit.basicInfo.totalReservationCount')}
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    {customerData.customer?.total_reservation_count ?? 0} 回
                  </p>
                </div>

                {customerData.customer?.tags && customerData.customer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {customerData.customer.tags.map((tag) => (
                      <Badge key={tag} className="bg-accent-2 text-accent-2-foreground">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 🟢 顧客記入項目タブ */}
        <TabsContent value="customer">
          <Card className="admin-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="w-5 h-5" />
                {tCarte('edit.customerPrefs.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 mt-4">
              {/* 基本的な顧客設定を2列レイアウトでコンパクトに */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="prefer_silence"
                    checked={watch('prefer_silence') || false}
                    onCheckedChange={(checked) =>
                      setValue('prefer_silence', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="prefer_silence">
                    {tCarte('edit.customerPrefs.preferSilence')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="avoid_sales_talk"
                    checked={watch('avoid_sales_talk') || false}
                    onCheckedChange={(checked) =>
                      setValue('avoid_sales_talk', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="avoid_sales_talk">
                    {tCarte('edit.customerPrefs.avoidSalesTalk')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="avoid_private_topics"
                    checked={watch('avoid_private_topics') || false}
                    onCheckedChange={(checked) =>
                      setValue('avoid_private_topics', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="avoid_private_topics">
                    {tCarte('edit.customerPrefs.avoidPrivateTopics')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="allow_photo_sns"
                    checked={watch('allow_photo_sns') || false}
                    onCheckedChange={(checked) =>
                      setValue('allow_photo_sns', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="allow_photo_sns">
                    {tCarte('edit.customerPrefs.allowPhotoSns')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="prefer_hair_styling"
                    checked={watch('prefer_hair_styling') || false}
                    onCheckedChange={(checked) =>
                      setValue('prefer_hair_styling', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="prefer_hair_styling">
                    {tCarte('edit.sharedPrefs.preferHairStyling')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use_styling_product"
                    checked={watch('use_styling_product') || false}
                    onCheckedChange={(checked) =>
                      setValue('use_styling_product', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="use_styling_product">
                    {tCarte('edit.sharedPrefs.useStylingProduct')}
                  </Label>
                </div>
              </div>

              {/* スタイリング時間 */}
              <div>
                <Label className="mb-2 block">
                  {tCarte('edit.customerPrefs.dailyStylingTime')}
                </Label>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    {...register('daily_styling_time', {
                      setValueAs: (value) => (value === '' ? null : parseInt(value, 10)),
                    })}
                    placeholder="30"
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">
                    {tCarte('edit.customerPrefs.minutes')}
                  </span>
                </div>
              </div>

              {/* 避けたい薬剤・成分 */}
              <div>
                <Label className="mb-2 block">{tCarte('edit.customerPrefs.avoidChemicals')}</Label>
                <Textarea
                  {...register('avoid_chemicals')}
                  placeholder={tCarte('edit.customerPrefs.avoidChemicalsPlaceholder')}
                  rows={2}
                />
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent my-6" />

              {/* 敏感肌・アレルギー関連 */}
              <div>
                <h3 className="text-lg font-medium mb-3">
                  {tCarte('edit.sharedPrefs.sensitivitySection')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="has_sensitive_skin"
                      checked={watch('has_sensitive_skin') || false}
                      onCheckedChange={(checked) =>
                        setValue('has_sensitive_skin', checked === true ? true : null, {
                          shouldDirty: true,
                        })
                      }
                    />
                    <Label htmlFor="has_sensitive_skin">
                      {tCarte('edit.sharedPrefs.hasSensitiveSkin')}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fragrance_sensitivity"
                      checked={watch('fragrance_sensitivity') || false}
                      onCheckedChange={(checked) =>
                        setValue('fragrance_sensitivity', checked === true ? true : null, {
                          shouldDirty: true,
                        })
                      }
                    />
                    <Label htmlFor="fragrance_sensitivity">
                      {tCarte('edit.sharedPrefs.fragranceSensitivity')}
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="use_contact_lenses"
                      checked={watch('use_contact_lenses') || false}
                      onCheckedChange={(checked) =>
                        setValue('use_contact_lenses', checked === true ? true : null, {
                          shouldDirty: true,
                        })
                      }
                    />
                    <Label htmlFor="use_contact_lenses">
                      {tCarte('edit.sharedPrefs.useContactLenses')}
                    </Label>
                  </div>
                </div>

                {/* 敏感肌詳細 */}
                {watch('has_sensitive_skin') && (
                  <div className="mt-4">
                    <Label className="mb-2 block">
                      {tCarte('edit.sharedPrefs.sensitiveSkinDetail')}
                    </Label>
                    <Textarea
                      {...register('sensitive_skin_detail')}
                      placeholder={tCarte('edit.sharedPrefs.sensitiveSkinPlaceholder')}
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 🔵 店舗記入項目タブ */}
        <TabsContent value="store">
          <Card className="admin-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="w-5 h-5" />
                {tCarte('edit.storeAssessment.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 mt-4">
              {/* 髪の太さ・量・くせ */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="mb-2 block">
                    {tCarte('edit.storeAssessment.hairThickness')}
                  </Label>
                  <Select
                    value={watch('hair_thickness') || 'none'}
                    onValueChange={(value) =>
                      setValue(
                        'hair_thickness',
                        value === 'none' ? null : (value as 'fine' | 'medium' | 'coarse'),
                        { shouldDirty: true }
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tCarte('edit.basicInfo.notSet')}</SelectItem>
                      {HAIR_THICKNESS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">{tCarte('edit.storeAssessment.hairVolume')}</Label>
                  <Select
                    value={watch('hair_volume') || 'none'}
                    onValueChange={(value) =>
                      setValue(
                        'hair_volume',
                        value === 'none' ? null : (value as 'low' | 'medium' | 'high'),
                        { shouldDirty: true }
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tCarte('edit.basicInfo.notSet')}</SelectItem>
                      {HAIR_VOLUME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">
                    {tCarte('edit.storeAssessment.hairWaveLevel')}
                  </Label>
                  <Select
                    value={watch('hair_wave_level') || 'none'}
                    onValueChange={(value) =>
                      setValue(
                        'hair_wave_level',
                        value === 'none'
                          ? null
                          : (value as 'straight' | 'slight' | 'moderate' | 'strong'),
                        { shouldDirty: true }
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tCarte('edit.basicInfo.notSet')}</SelectItem>
                      {HAIR_WAVE_LEVEL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      {tCarte('edit.basicInfo.skinType')}
                    </Label>
                    <Select
                      value={watch('skin_type') || 'none'}
                      onValueChange={(value) =>
                        setValue('skin_type', value === 'none' ? null : value, {
                          shouldDirty: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={tCarte('edit.basicInfo.skinTypePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tCarte('edit.basicInfo.notSet')}</SelectItem>
                        {SKIN_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 髪の特徴チェックボックス */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hair_damage_tendency"
                    checked={watch('hair_damage_tendency') || false}
                    onCheckedChange={(checked) =>
                      setValue('hair_damage_tendency', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="hair_damage_tendency">
                    {tCarte('edit.storeAssessment.hairDamageTendency')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="poor_dye_perm_retention"
                    checked={watch('poor_dye_perm_retention') || false}
                    onCheckedChange={(checked) =>
                      setValue('poor_dye_perm_retention', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="poor_dye_perm_retention">
                    {tCarte('edit.storeAssessment.poorDyePerm')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="quick_color_fade"
                    checked={watch('quick_color_fade') || false}
                    onCheckedChange={(checked) =>
                      setValue('quick_color_fade', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="quick_color_fade">
                    {tCarte('edit.storeAssessment.quickColorFade')}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hair_dryness"
                    checked={watch('hair_dryness') || false}
                    onCheckedChange={(checked) =>
                      setValue('hair_dryness', checked === true ? true : null, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <Label htmlFor="hair_dryness">{tCarte('edit.storeAssessment.hairDryness')}</Label>
                </div>
              </div>

              <Separator />

              {/* 頭皮の状態 */}
              <div>
                <Label className="mb-2 block">
                  {tCarte('edit.storeAssessment.scalpCondition')}
                </Label>
                <Select
                  value={watch('scalp_condition') || 'none'}
                  onValueChange={(value) =>
                    setValue(
                      'scalp_condition',
                      value === 'none' ? null : (value as 'normal' | 'dry' | 'oily' | 'sensitive'),
                      { shouldDirty: true }
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tCarte('edit.basicInfo.notSet')}</SelectItem>
                    {SCALP_CONDITION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 頭皮トラブル詳細 */}
              <div>
                <Label className="mb-2 block">
                  {tCarte('edit.storeAssessment.scalpTroubleDetail')}
                </Label>
                <Textarea
                  {...register('scalp_trouble_detail')}
                  placeholder={tCarte('edit.storeAssessment.scalpTroublePlaceholder')}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medical" className="mt-6">
          <div className="admin-panel overflow-hidden">
            <div className="p-3 md:p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive">
                  <FileText className="w-5 h-5 text-primary-foreground" />
                </div>
                <h2 className="text-base md:text-xl font-bold text-primary">
                  {tCarte('edit.medicalInfo.title')}
                </h2>
              </div>
            </div>
            <div className="p-3 md:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* アレルギー履歴 */}
                <div className="relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-destructive to-destructive rounded-xl" />
                  <div className="relative p-3 md:p-6 rounded-xl border border-destructive bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-destructive">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-destructive-foreground">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                      </div>
                      <p className="text-xs text-destructive uppercase tracking-wide font-medium">
                        {tCarte('edit.medicalInfo.allergyHistory')}
                      </p>
                    </div>
                    <Textarea
                      {...register('allergy_history')}
                      placeholder={tCarte('edit.medicalInfo.allergyPlaceholder')}
                      rows={4}
                      className="bg-background border-destructive/20 focus:border-destructive transition-all duration-200"
                    />
                    {errors.allergy_history && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-destructive mt-2"
                      >
                        {errors.allergy_history.message}
                      </motion.p>
                    )}
                  </div>
                </div>

                {/* 病歴 */}
                <div className="relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                  <div className="relative p-3 md:p-6 rounded-xl border border-warning bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-warning">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-warning">
                        <FileText className="w-4 h-4 text-warning-foreground" />
                      </div>
                      <p className="text-xs text-warning-foreground uppercase tracking-wide font-medium">
                        {tCarte('edit.medicalInfo.medicalHistory')}
                      </p>
                    </div>
                    <Textarea
                      {...register('medical_history')}
                      placeholder={tCarte('edit.medicalInfo.medicalPlaceholder')}
                      rows={4}
                      className="bg-background border-warning/20 focus:border-warning transition-all duration-200"
                    />
                    {errors.medical_history && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-warning-foreground mt-2"
                      >
                        {errors.medical_history.message}
                      </motion.p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* フォームボタン */}

      <div className="flex flex-wrap justify-end gap-3 border-t border-border pr-20 pt-5 mt-6">
        <Button
          type="submit"
          disabled={isSubmitting || (!carteData && !isDirty)}
          className="flex items-center gap-2 px-8"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {carteData ? tCarte('edit.buttons.updating') : tCarte('edit.buttons.creating')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {carteData ? tCarte('edit.buttons.update') : tCarte('edit.buttons.create')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

export default withManagerAccess(CustomerCarteEditForm)
