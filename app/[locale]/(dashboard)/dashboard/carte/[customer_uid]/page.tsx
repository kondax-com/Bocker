'use client'
import { Link } from '@/i18n/navigation'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { DashboardSection, Loading } from '@/components/common'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useIntegratedReservations } from '@/hooks/useIntegratedReservations'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import { CarteRepository } from '@/services/supabase/repositories'
import type { RowType } from '@/services/supabase/SupabaseService'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calcAgeFromBirthday } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  HairWaveLevel,
  HairVolume,
  ScalpCondition,
  HairThickness,
  HairDamageTendency,
  HairDryness,
} from '@/services/supabase/repositories/carte/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReservationMenu, ReservationOption } from '@/convex/types'
import {
  CalendarDays,
  Pencil,
  User,
  Mail,
  Phone,
  CreditCard,
  ChevronDown,
  RefreshCw,
  CheckCircle,
  FileText,
  XCircle,
  AlertCircle,
  ChevronRight,
  UserCheck,
  Scissors,
  Info,
} from 'lucide-react'
import { format } from 'date-fns'
import { ja, enUS, th } from 'date-fns/locale'
import { toast } from 'sonner'
import type { SupportedLocale } from '@/lib/dateLocale'

type CartePageProps = {
  params: Promise<{
    customer_uid: string
  }>
}

type CustomerWithDetails = {
  customer: RowType<'customer'> | null
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

export type CustomerCarteData = {
  skin_type: string | null
  hair_type: string | null
  allergy_history: string | null
  medical_history: string | null
  ltv_price: number | null
  // 🟢 顧客記入項目
  prefer_silence: boolean | null
  avoid_chemicals: string | null
  has_sensitive_skin: boolean | null
  sensitive_skin_detail: string | null
  fragrance_sensitivity: boolean | null
  use_contact_lenses: boolean | null
  avoid_sales_talk: boolean | null
  avoid_private_topics: boolean | null
  daily_styling_time: number | null
  allow_photo_sns: boolean | null
  // 🔵 店舗記入項目
  hair_thickness: HairThickness | null
  hair_volume: HairVolume | null
  hair_wave_level: HairWaveLevel | null
  hair_damage_tendency: HairDamageTendency | null
  poor_dye_perm_retention: boolean | null
  quick_color_fade: boolean | null
  hair_dryness: HairDryness | null
  scalp_condition: ScalpCondition | null
  scalp_trouble_detail: string | null
  // 🟡 共通記入項目
  prefer_hair_styling: boolean | null
  use_styling_product: boolean | null
}

export default function CartePage({ params: paramsPromise }: CartePageProps) {
  const tCommon = useTranslations('common')
  const tCarte = useTranslations('dashboard.carte')
  const locale = useLocale() as SupportedLocale
  const { tenantId, orgId, role, isLoaded } = useTenantAndOrganization()

  const [customerUid, setCustomerUid] = useState<string | null>(null)
  const [customerData, setCustomerData] = useState<CustomerWithDetails | null>(null)
  const [customerCarteData, setCustomerCarteData] = useState<CustomerCarteData | null>(null)
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true)

  const customerRepo = useMemo(() => new CustomerRepository(), [])
  const carteRepo = useMemo(() => new CarteRepository(), [])

  // paramsの解決
  useEffect(() => {
    paramsPromise.then((params) => {
      setCustomerUid(params.customer_uid)
    })
  }, [paramsPromise])

  // 顧客情報の取得
  const fetchCustomerData = useCallback(async () => {
    if (!tenantId || !orgId || !customerUid || !isLoaded) return

    console.log('fetchCustomerData')
    setIsLoadingCustomer(true)
    try {
      const completeData = await customerRepo.getCompleteCustomerData(customerUid, tenantId, orgId)

      if (completeData.customer) {
        setCustomerData(completeData)

        // カルテ情報の取得
        const carte = await carteRepo.findByCustomer(tenantId, orgId, customerUid)

        // カルテが存在しない場合でもデフォルト値を設定して表示
        const defaultCarteData: CustomerCarteData = {
          skin_type: null,
          hair_type: null,
          allergy_history: null,
          medical_history: null,
          ltv_price: null,
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
          // 🟡 共通記入項目 - デフォルトは false
          prefer_hair_styling: false,
          use_styling_product: false,
        }

        if (carte) {
          setCustomerCarteData({
            skin_type: carte.skin_type,
            hair_type: carte.hair_type,
            allergy_history: carte.allergy_history,
            medical_history: carte.medical_history,
            ltv_price: carte.ltv_price,
            // 🟢 顧客記入項目
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
            hair_thickness: carte.hair_thickness,
            hair_volume: carte.hair_volume,
            hair_wave_level: carte.hair_wave_level as HairWaveLevel,
            hair_damage_tendency: carte.hair_damage_tendency as HairDamageTendency,
            poor_dye_perm_retention: carte.poor_dye_perm_retention ?? false,
            quick_color_fade: carte.quick_color_fade ?? false,
            hair_dryness: carte.hair_dryness as HairDryness,
            scalp_condition: carte.scalp_condition,
            scalp_trouble_detail: carte.scalp_trouble_detail,
            // 🟡 共通記入項目
            prefer_hair_styling: carte.prefer_hair_styling ?? false,
            use_styling_product: carte.use_styling_product ?? false,
          })
        } else {
          // カルテが存在しない場合はデフォルト値を設定
          setCustomerCarteData(defaultCarteData)
        }
      } else {
        toast.error(tCarte('detail.customerNotFound'))
      }
    } catch (error) {
      console.error('Failed to fetch customer data:', error)
      toast.error(tCarte('fetchError'))
    } finally {
      setIsLoadingCustomer(false)
    }
  }, [tenantId, orgId, customerUid, isLoaded, customerRepo, carteRepo, tCarte])

  // 統合予約データの取得
  const { reservations, loadMore, hasMore } = useIntegratedReservations({
    tenantId: tenantId || '',
    orgId: orgId || '',
    customerUid: customerUid || '',
    status: 'all',
    pageSize: 10,
  })

  console.log('[CartePage] Reservations:', reservations)

  // 初回データ取得
  useEffect(() => {
    if (customerUid && tenantId && orgId && isLoaded) {
      console.log('fetchCustomerData')
      fetchCustomerData()
    }
  }, [customerUid, tenantId, orgId, isLoaded, fetchCustomerData])

  // 年齢計算
  const calculateAge = (birthday: string) => {
    const age = calcAgeFromBirthday(birthday)
    return age
  }

  // 金額フォーマット
  const formatPrice = (price: number | null) => {
    if (!price) return '¥0'
    return `¥${price.toLocaleString()}`
  }

  // ステータスバッジの取得
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <Badge className="bg-link text-link-foreground">
            <CheckCircle className="w-3 h-3 mr-1" />
            {tCarte('detail.status.confirmed')}
          </Badge>
        )
      case 'completed':
        return (
          <Badge className="bg-accent-2 text-accent-2-foreground">
            <CheckCircle className="w-3 h-3 mr-1" />
            {tCarte('detail.status.completed')}
          </Badge>
        )
      case 'cancelled':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            {tCarte('detail.status.cancelled')}
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            {tCarte('detail.status.pending')}
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (!isLoaded || isLoadingCustomer) {
    return <Loading />
  }

  if (!customerData) {
    return (
      <DashboardSection
        title={tCarte('detail.title')}
        backLink="/dashboard/carte"
        backLinkTitle={tCarte('detail.backToSearch')}
      >
        <div className="text-center py-8 text-muted-foreground">
          {tCarte('detail.customerNotFound')}
        </div>
      </DashboardSection>
    )
  }

  const customerName =
    customerData.customer?.last_name && customerData.customer?.first_name
      ? `${customerData.customer?.last_name} ${customerData.customer?.first_name}`
      : tCarte('detail.notSet')

  return (
    <DashboardSection
      title={tCarte('detail.title')}
      backLink="/dashboard/carte"
      backLinkTitle={tCarte('detail.backToSearch')}
    >
      <div className="min-h-screen pb-8">
        <div className="space-y-6">
          {/* 顧客基本情報 - Uber風デザイン */}
          <div className="admin-panel overflow-hidden">
            <div className="bg-muted p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary rounded-full">
                    <User className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold ">{customerName}</h2>
                    <p className=" text-sm">
                      {customerData.customer?.line_user_name
                        ? `LINE ${customerData.customer?.line_user_name}`
                        : `LINE ${tCarte('detail.notSet')}`}
                    </p>
                  </div>
                </div>
                {(role === 'admin' || role === 'owner' || role === 'manager') && (
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/customer/${customerUid}/edit`}>
                        <UserCheck className="w-4 h-4 mr-2" />
                        {tCarte('detail.customerEdit')}
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/dashboard/carte/${customerUid}/edit`}>
                        <Pencil className="w-4 h-4 mr-2" />
                        {tCarte('detail.edit')}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger className="px-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-palette-4">
                      <Info className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h5 className="text-base md:text-lg font-semibold text-foreground">
                      {tCarte('detail.customerInfo')}
                    </h5>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-3 md:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* 連絡先情報 */}
                      {customerData.customer?.email && (
                        <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-secondary border border-border">
                          <div className="p-2 rounded-lg bg-muted">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                              {tCarte('detail.email')}
                            </p>
                            <p className="text-sm font-semibold text-primary truncate">
                              {customerData.customer?.email}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-secondary border border-border">
                        <div className="p-2 rounded-lg bg-muted">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                            {tCarte('detail.phone')}
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            {customerData.customer?.phone || tCarte('detail.notSet')}
                          </p>
                        </div>
                      </div>

                      {/* 誕生日・年齢 */}
                      {customerData.customerDetail?.birthday ? (
                        <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-secondary border border-border">
                          <div className="p-2 rounded-lg bg-muted">
                            <CalendarDays className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                              {tCarte('detail.birthday')}
                            </p>
                            <p className="text-sm font-semibold text-primary">
                              {format(
                                new Date(customerData.customerDetail.birthday),
                                'yyyy年MM月dd日'
                              )}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({calculateAge(customerData.customerDetail.birthday)}歳)
                              </span>
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {/* ポイント */}
                      {customerData.customerPoints && (
                        <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-muted border border-border">
                          <div className="p-2 text-muted-foreground">
                            <CreditCard className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                              {tCarte('detail.totalPoints')}
                            </p>
                            <p className="text-lg font-bold text-muted-foreground">
                              {customerData.customerPoints.total_points || 0}P
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 来店回数 */}
                      <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-muted border border-border">
                        <div className="p-2 rounded-lg text-muted-foreground">
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                            {tCarte('detail.totalReservationCount')}
                          </p>
                          <p className="text-lg font-bold text-muted-foreground">
                            {customerData?.customer?.total_reservation_count ?? 0}回
                          </p>
                        </div>
                      </div>

                      {/* LTV */}
                      {customerCarteData?.ltv_price ? (
                        <div className="flex items-center gap-3 p-2 md:p-4 rounded-xl bg-gradient-to-r from-palette-1 to-palette-1 border border-palette-1">
                          <div className="p-2 rounded-lg bg-palette-1">
                            <CreditCard className="w-4 h-4 text-palette-1-foreground" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-palette-1-foreground leading-relaxed">
                              {tCarte('detail.ltv')}
                            </p>
                            <p className="text-lg font-bold text-palette-1-foreground">
                              {formatPrice(customerCarteData.ltv_price)}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {/* タグ */}
                    {customerData.customer?.tags && customerData.customer.tags.length > 0 && (
                      <div className="mt-6">
                        <p className="text-sm font-medium text-muted-foreground mb-3 leading-relaxed">
                          {tCarte('table.tags')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {customerData.customer.tags.map((tag, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="px-3 py-1 text-xs font-medium bg-accent-2 text-accent-2-foreground border-accent-2"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* カルテ情報 - モダンタブデザイン */}
          <div className="admin-panel overflow-hidden">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-2">
                <AccordionTrigger className="px-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-palette-4">
                      <FileText className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h2 className="text-base md:text-lg font-semibold text-foreground">
                      {tCarte('detail.carteInfo')}
                    </h2>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="p-3 md:p-6">
                    {customerCarteData ? (
                      <Tabs defaultValue="customer" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-12 bg-secondary border border-border rounded-xl">
                          <TabsTrigger
                            value="customer"
                            className="min-h-11 rounded-lg px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                          >
                            <UserCheck className="w-4 h-4 mr-2" />
                            {tCarte('edit.tabs.customer')}
                          </TabsTrigger>
                          <TabsTrigger
                            value="store"
                            className="min-h-11 rounded-lg px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                          >
                            <Scissors className="w-4 h-4 mr-2" />
                            {tCarte('edit.tabs.store')}
                          </TabsTrigger>
                          <TabsTrigger
                            value="medical"
                            className="min-h-11 rounded-lg px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            {tCarte('edit.tabs.medical')}
                          </TabsTrigger>
                        </TabsList>

                        {/* 🟢 顧客記入項目タブ */}
                        <TabsContent value="customer">
                          <div className="space-y-6">
                            {/* 基本的な顧客設定 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {[
                                {
                                  key: 'prefer_silence',
                                  label: tCarte('edit.customerPrefs.preferSilence'),
                                  value: customerCarteData.prefer_silence,
                                },
                                {
                                  key: 'avoid_sales_talk',
                                  label: tCarte('edit.customerPrefs.avoidSalesTalk'),
                                  value: customerCarteData.avoid_sales_talk,
                                },
                                {
                                  key: 'avoid_private_topics',
                                  label: tCarte('edit.customerPrefs.avoidPrivateTopics'),
                                  value: customerCarteData.avoid_private_topics,
                                },
                                {
                                  key: 'allow_photo_sns',
                                  label: tCarte('edit.customerPrefs.allowPhotoSns'),
                                  value: customerCarteData.allow_photo_sns,
                                },
                                {
                                  key: 'prefer_hair_styling',
                                  label: tCarte('edit.sharedPrefs.preferHairStyling'),
                                  value: customerCarteData.prefer_hair_styling,
                                },
                                {
                                  key: 'use_styling_product',
                                  label: tCarte('edit.sharedPrefs.useStylingProduct'),
                                  value: customerCarteData.use_styling_product,
                                },
                              ].map((item) => (
                                <div key={item.key} className="group relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-r from-secondary to-secondary rounded-xl" />
                                  <div className="relative p-4 rounded-xl border border-border bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-primary">
                                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 font-medium">
                                      {item.label}
                                    </p>
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`w-4 h-4 rounded-full ${item.value === true ? 'bg-success shadow-lg' : 'bg-muted'} transition-all duration-300`}
                                      />
                                      <p
                                        className={`text-sm font-semibold ${item.value === true ? 'text-success' : 'text-muted-foreground'}`}
                                      >
                                        {item.value === true ? 'はい' : 'いいえ'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {customerCarteData.daily_styling_time && (
                              <div className="relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-2 to-palette-2 rounded-xl" />
                                <div className="relative p-6 rounded-xl border border-palette-2 bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-palette-2/40">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-palette-2">
                                      <CalendarDays className="w-4 h-4 text-palette-2-foreground" />
                                    </div>
                                    <p className="text-xs text-palette-2-foreground leading-relaxed font-medium">
                                      {tCarte('edit.customerPrefs.dailyStylingTime')}
                                    </p>
                                  </div>
                                  <p className="text-lg font-bold text-palette-2-foreground">
                                    {customerCarteData.daily_styling_time}分
                                  </p>
                                </div>
                              </div>
                            )}

                            {customerCarteData.avoid_chemicals && (
                              <div className="relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                                <div className="relative p-6 rounded-xl border border-warning bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-warning">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-warning">
                                      <AlertCircle className="w-4 h-4 text-warning-foreground" />
                                    </div>
                                    <p className="text-xs text-warning-foreground leading-relaxed font-medium">
                                      {tCarte('edit.customerPrefs.avoidChemicals')}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-warning-foreground whitespace-pre-wrap leading-relaxed">
                                    {customerCarteData.avoid_chemicals}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* 敏感肌・アレルギー関連 */}
                            <div className="space-y-6">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-warning">
                                  <AlertCircle className="w-5 h-5 text-warning-foreground" />
                                </div>
                                <h3 className="text-lg font-bold text-primary">
                                  {tCarte('edit.sharedPrefs.sensitivitySection')}
                                </h3>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                  {
                                    key: 'has_sensitive_skin',
                                    label: tCarte('edit.sharedPrefs.hasSensitiveSkin'),
                                    value: customerCarteData.has_sensitive_skin,
                                  },
                                  {
                                    key: 'fragrance_sensitivity',
                                    label: tCarte('edit.sharedPrefs.fragranceSensitivity'),
                                    value: customerCarteData.fragrance_sensitivity,
                                  },
                                  {
                                    key: 'use_contact_lenses',
                                    label: tCarte('edit.sharedPrefs.useContactLenses'),
                                    value: customerCarteData.use_contact_lenses,
                                  },
                                ].map((item) => (
                                  <div key={item.key} className="group relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                                    <div className="relative p-4 rounded-xl border border-warning bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-warning">
                                      <p className="text-xs text-warning-foreground leading-relaxed mb-3 font-medium">
                                        {item.label}
                                      </p>
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`w-4 h-4 rounded-full ${item.value === true ? 'bg-warning shadow-lg' : 'bg-muted'} transition-all duration-300`}
                                        />
                                        <p
                                          className={`text-sm font-semibold ${item.value === true ? 'text-warning-foreground' : 'text-muted-foreground'}`}
                                        >
                                          {item.value === true ? 'はい' : 'いいえ'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {customerCarteData.sensitive_skin_detail && (
                                <div className="relative overflow-hidden group">
                                  <div className="absolute inset-0 bg-gradient-to-r from-destructive to-destructive rounded-xl" />
                                  <div className="relative p-6 rounded-xl border border-destructive bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-destructive">
                                    <div className="flex items-center gap-3 mb-3">
                                      <div className="p-2 rounded-lg bg-destructive">
                                        <AlertCircle className="w-4 h-4 text-destructive-foreground" />
                                      </div>
                                      <p className="text-xs text-destructive-foreground leading-relaxed font-medium">
                                        {tCarte('edit.sharedPrefs.sensitiveSkinDetail')}
                                      </p>
                                    </div>
                                    <p className="text-sm font-medium text-destructive-foreground whitespace-pre-wrap leading-relaxed">
                                      {customerCarteData.sensitive_skin_detail}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </TabsContent>

                        {/* 🔵 店舗記入項目タブ */}
                        <TabsContent value="store" className="mt-6">
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-palette-5">
                                <Scissors className="w-5 h-5 text-palette-5-foreground" />
                              </div>
                              <h3 className="text-lg font-bold text-primary">
                                {tCarte('edit.storeAssessment.title')}
                              </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-5/20 to-palette-5/30 rounded-xl" />
                                <div className="relative p-4 rounded-xl border border-palette-5/20 bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-palette-5/40">
                                  <p className="text-xs text-palette-5-foreground/80 leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.hairThickness')}
                                  </p>
                                  <p className="text-sm font-semibold text-palette-5-foreground">
                                    {customerCarteData.hair_thickness === 'fine'
                                      ? tCarte('edit.hairThickness.fine')
                                      : customerCarteData.hair_thickness === 'medium'
                                        ? tCarte('edit.hairThickness.medium')
                                        : customerCarteData.hair_thickness === 'coarse'
                                          ? tCarte('edit.hairThickness.coarse')
                                          : tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-1 to-palette-1 rounded-xl" />
                                <div className="relative rounded-xl border border-border bg-card p-4">
                                  <p className="text-xs text-palette-1-foreground leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.hairVolume')}
                                  </p>
                                  <p className="text-sm font-semibold text-palette-1-foreground">
                                    {customerCarteData.hair_volume === 'low'
                                      ? tCarte('edit.hairVolume.low')
                                      : customerCarteData.hair_volume === 'medium'
                                        ? tCarte('edit.hairVolume.medium')
                                        : customerCarteData.hair_volume === 'high'
                                          ? tCarte('edit.hairVolume.high')
                                          : tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-2 to-palette-2 rounded-xl" />
                                <div className="relative rounded-xl border border-border bg-card p-4">
                                  <p className="text-xs text-palette-2-foreground leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.hairWaveLevel')}
                                  </p>
                                  <p className="text-sm font-semibold text-palette-2-foreground">
                                    {customerCarteData.hair_wave_level === 'straight'
                                      ? tCarte('edit.hairWaveLevel.straight')
                                      : customerCarteData.hair_wave_level === 'slight'
                                        ? tCarte('edit.hairWaveLevel.slight')
                                        : customerCarteData.hair_wave_level === 'moderate'
                                          ? tCarte('edit.hairWaveLevel.moderate')
                                          : customerCarteData.hair_wave_level === 'strong'
                                            ? tCarte('edit.hairWaveLevel.strong')
                                            : tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent my-6" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-3 to-palette-3 rounded-xl" />
                                <div className="relative rounded-xl border border-border bg-card p-4">
                                  <p className="text-xs text-palette-3-foreground leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.hairDamageTendency')}
                                  </p>
                                  <p className="text-sm font-semibold text-palette-3-foreground">
                                    {customerCarteData.hair_damage_tendency === 'strong'
                                      ? '強い'
                                      : customerCarteData.hair_damage_tendency === 'medium'
                                        ? '中程度'
                                        : customerCarteData.hair_damage_tendency === 'weak'
                                          ? '弱い'
                                          : tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-4/20 to-palette-4/30 rounded-xl" />
                                <div className="relative p-4 rounded-xl border border-palette-4/20 bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-palette-4/40">
                                  <p className="text-xs text-palette-4-foreground/80 leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.poorDyePerm')}
                                  </p>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-4 h-4 rounded-full ${customerCarteData.poor_dye_perm_retention === true ? 'bg-palette-4-foreground shadow-lg' : 'bg-muted'} transition-all duration-300`}
                                    />
                                    <p className="text-sm font-semibold text-palette-4-foreground">
                                      {customerCarteData.poor_dye_perm_retention === true
                                        ? 'はい'
                                        : 'いいえ'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-1 to-palette-1 rounded-xl" />
                                <div className="relative rounded-xl border border-border bg-card p-4">
                                  <p className="text-xs text-palette-1-foreground leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.quickColorFade')}
                                  </p>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-4 h-4 rounded-full ${customerCarteData.quick_color_fade === true ? 'bg-palette-1-foreground shadow-lg' : 'bg-muted'} transition-all duration-300`}
                                    />
                                    <p className="text-sm font-semibold text-palette-1-foreground">
                                      {customerCarteData.quick_color_fade === true
                                        ? 'はい'
                                        : 'いいえ'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="group relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-palette-2 to-palette-2 rounded-xl" />
                                <div className="relative rounded-xl border border-border bg-card p-4">
                                  <p className="text-xs text-palette-2-foreground leading-relaxed mb-3 font-medium">
                                    {tCarte('edit.storeAssessment.hairDryness')}
                                  </p>
                                  <p className="text-sm font-semibold text-palette-2-foreground">
                                    {customerCarteData.hair_dryness === 'high'
                                      ? '高い'
                                      : customerCarteData.hair_dryness === 'medium'
                                        ? '中程度'
                                        : customerCarteData.hair_dryness === 'low'
                                          ? '低い'
                                          : tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent my-6" />

                            <div className="group relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-r from-palette-5/20 to-palette-5/30 rounded-xl" />
                              <div className="relative p-4 rounded-xl border border-palette-5/20 bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-palette-5/40">
                                <p className="text-xs text-palette-5-foreground/80 leading-relaxed mb-3 font-medium">
                                  {tCarte('edit.storeAssessment.scalpCondition')}
                                </p>
                                <p className="text-sm font-semibold text-palette-5-foreground">
                                  {customerCarteData.scalp_condition === 'normal'
                                    ? tCarte('edit.scalpCondition.normal')
                                    : customerCarteData.scalp_condition === 'dry'
                                      ? tCarte('edit.scalpCondition.dry')
                                      : customerCarteData.scalp_condition === 'oily'
                                        ? tCarte('edit.scalpCondition.oily')
                                        : customerCarteData.scalp_condition === 'sensitive'
                                          ? tCarte('edit.scalpCondition.sensitive')
                                          : tCarte('detail.notSet')}
                                </p>
                              </div>
                            </div>

                            {customerCarteData.scalp_trouble_detail && (
                              <div className="relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                                <div className="relative p-6 rounded-xl border border-warning bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-warning">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg bg-warning">
                                      <AlertCircle className="w-4 h-4 text-warning-foreground" />
                                    </div>
                                    <p className="text-xs text-warning-foreground leading-relaxed font-medium">
                                      {tCarte('edit.storeAssessment.scalpTroubleDetail')}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-warning-foreground leading-relaxed">
                                    {customerCarteData.scalp_trouble_detail}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        {/* 医療情報タブ */}
                        <TabsContent value="medical" className="mt-6">
                          <div className="space-y-6">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-destructive">
                                <FileText className="w-5 h-5 text-primary-foreground" />
                              </div>
                              <h3 className="text-lg font-bold text-primary">
                                {tCarte('edit.medicalInfo.title')}
                              </h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-destructive to-destructive rounded-xl" />
                                <div className="relative p-6 rounded-xl border border-destructive bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-destructive">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-destructive-foreground">
                                      <AlertCircle className="w-4 h-4 text-destructive" />
                                    </div>
                                    <p className="text-xs text-destructive leading-relaxed font-medium">
                                      {tCarte('edit.medicalInfo.allergyHistory')}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-destructive whitespace-pre-wrap leading-relaxed">
                                    {customerCarteData.allergy_history || tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>

                              <div className="relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                                <div className="relative p-6 rounded-xl border border-warning-foreground bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-warning">
                                  <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 rounded-lg bg-warning">
                                      <FileText className="w-4 h-4 text-warning-foreground" />
                                    </div>
                                    <p className="text-xs text-warning-foreground leading-relaxed font-medium">
                                      {tCarte('edit.medicalInfo.medicalHistory')}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-warning-foreground whitespace-pre-wrap leading-relaxed">
                                    {customerCarteData.medical_history || tCarte('detail.notSet')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {tCarte('detail.loadingCarteInfo')}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* 施術履歴 - モダンデザイン */}
          <div className="admin-panel overflow-hidden">
            <div className="p-3 md:p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-palette-3">
                  <CalendarDays className="w-5 h-5 text-primary-foreground" />
                </div>
                <h2 className="text-base md:text-lg font-semibold text-foreground">
                  {tCarte('detail.reservationHistory')}
                </h2>
              </div>
            </div>

            <div className="p-3 md:p-6">
              <div className="grid grid-cols-1 gap-4">
                {reservations.length > 0 ? (
                  reservations
                    .filter(
                      (item) =>
                        item.status !== 'cancelled' &&
                        item.status !== 'pending' &&
                        item.status !== 'refunded'
                    )
                    .map((item) => (
                      <Link
                        href={`/dashboard/carte/${customerUid}/reservation/${item.source === 'convex' ? item.id : item._convex_id}`}
                        key={item.id}
                      >
                        <Card
                          key={item.id}
                          className="border-l-4 border-neon relative shadow-md hover:shadow-lg"
                          style={{
                            borderLeftColor:
                              item.status === 'completed'
                                ? 'neon'
                                : item.status === 'cancelled'
                                  ? 'destructive'
                                  : item.status === 'confirmed'
                                    ? 'neon'
                                    : 'secondary',
                          }}
                        >
                          <CardContent className="pt-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">
                                    {format(
                                      new Date(item.startTimeUnix),
                                      locale === 'ja' ? 'yyyy年MM月dd日' : 'PPP',
                                      {
                                        locale: locale === 'ja' ? ja : locale === 'th' ? th : enUS,
                                      }
                                    )}
                                  </span>
                                </div>
                                <div className="text-sm text-link-foreground font-semibold">
                                  {format(new Date(item.startTimeUnix), 'HH:mm', {
                                    locale: locale === 'ja' ? ja : locale === 'th' ? th : enUS,
                                  })}{' '}
                                  ~{' '}
                                  {format(new Date(item.endTimeUnix), 'HH:mm', {
                                    locale: locale === 'ja' ? ja : locale === 'th' ? th : enUS,
                                  })}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm">
                                    {tCarte('detail.assignedStaff', {
                                      staffName: item.staffName || tCarte('detail.staffFree'),
                                    })}
                                  </span>
                                </div>
                              </div>
                              {getStatusBadge(item.status)}
                            </div>
                            {item.detail && (
                              <div className="mt-3 space-y-2">
                                {/* メニュー情報 */}
                                {item.detail.menus &&
                                  Array.isArray(item.detail.menus) &&
                                  item.detail.menus.length > 0 && (
                                    <div>
                                      <span className="text-sm text-muted-foreground">
                                        {tCarte('detail.menu')}
                                      </span>
                                      <div className="mt-1">
                                        {(item.detail.menus as ReservationMenu[]).map(
                                          (menu: ReservationMenu, index: number) => (
                                            <Badge key={index} variant="outline" className="mr-1">
                                              {menu.name}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )}

                                {/* オプション情報 */}
                                {item.detail.options &&
                                  Array.isArray(item.detail.options) &&
                                  item.detail.options.length > 0 && (
                                    <div>
                                      <span className="text-sm text-muted-foreground">
                                        {tCarte('detail.option')}
                                      </span>
                                      <div className="mt-1">
                                        {(item.detail.options as ReservationOption[]).map(
                                          (option: ReservationOption, index: number) => (
                                            <Badge
                                              key={index}
                                              variant="secondary"
                                              className="mr-1 text-xs"
                                            >
                                              {option.name}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )}

                                {/* 料金情報 */}
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <span className="font-semibold">
                                    {formatPrice(item.detail.totalPrice || 0)}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-link-foreground">
                                      {tCarte('detail.more')}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                </div>

                                {/* 備考 */}
                                {item.detail.notes && (
                                  <div className="text-sm text-muted-foreground">
                                    {tCarte('detail.notes', { notes: item.detail.notes })}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {tCarte('detail.noReservationHistory')}
                  </div>
                )}

                {hasMore && (
                  <div className="flex justify-center mt-6">
                    <Button
                      onClick={loadMore}
                      variant="outline"
                      className="gap-2 hover:bg-primary/10 transition-all duration-200"
                      disabled={!hasMore}
                    >
                      <span>{tCommon('loadMore')}</span>
                      {hasMore ? (
                        <ChevronDown size={16} />
                      ) : (
                        <RefreshCw size={16} className="animate-spin" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardSection>
  )
}
