// 予約作成画面
// /app/(salon)/dashboard/reservation/add/ReservationForm.tsx

'use client'

import { useMutation } from 'convex/react'

import { convertHourToTimestamp } from '@/lib/schedules'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { useDebounce } from 'use-debounce'
import Image from 'next/image'
import { ja } from 'date-fns/locale'
import { DatePicker } from '@/components/common'
import { Textarea } from '@/components/ui/textarea'
import { getDayOfWeek, formatTimestamp } from '@/lib/schedules'
import {
  convertGender,
  ReservationMenu,
  ReservationOption,
  SubscriptionPlanName,
} from '@/convex/types'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import type { RowType } from '@/services/supabase/SupabaseService'
import { useTranslations } from 'next-intl'
import { Doc } from '@/convex/_generated/dataModel'

// 入力値を数値または undefined に変換するプリプロセス関数
const preprocessNumber = (val: unknown) => {
  if (typeof val === 'string' && val.trim() === '') return undefined
  if (typeof val === 'string') return Number(val)
  return val
}
// 空文字を undefined に変換するプリプロセス関数（enum 用）
const preprocessEmptyString = (val: unknown) => {
  if (typeof val === 'string' && val.trim() === '') return undefined
  return val
}
// カンマ区切り文字列を文字列配列に変換するプリプロセス関数（optionIds 用）
const preprocessStringArray = (val: unknown) => {
  if (typeof val === 'string' && val.trim() === '') return undefined
  if (typeof val === 'string')
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return val
}

import type { TimeRange } from '@/lib/types'

import * as React from 'react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { CommandItem } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  Plus,
  Minus,
  ChevronRight,
  Check,
  User,
  Clock,
  ShoppingBag,
  CreditCard,
  Filter,
} from 'lucide-react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useZodForm } from '@/hooks/useZodForm'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { usePriceCalculation } from '@/hooks/usePriceCalculation'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import {
  RESERVATION_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  GENDER_VALUES,
  MENU_CATEGORY_VALUES,
  MenuCategory,
} from '@/convex/types'
const schemaReservation = z
  .object({
    customer_uid: z.string().optional(), // 顧客ID
    staff_id: z.string().optional(), // スタッフID
    staff_name: z.string().optional(), // スタッフ名
    customer_last_name: z.string().optional(), // 顧客名（姓）
    customer_first_name: z.string().optional(), // 顧客名（名）
    customer_phone: z.string().optional(), // 顧客電話番号
    customer_gender: z.preprocess(preprocessEmptyString, z.enum(GENDER_VALUES)).optional(), // 顧客性別
    customer_birthday: z.string().optional(), // 顧客生年月日
    customer_tags: z.array(z.string()).optional(), // タグ
    customer_notes: z.string().optional(), // 備考
    menus: z
      .preprocess(
        preprocessStringArray,
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            price: z.number(),
            quantity: z.number(),
          })
        )
      )
      .optional(), // メニューID（複数選択可能に変更）
    tenant_id: z.string().optional(), // サロンID
    org_id: z.string().optional(), // サロンID
    options: z
      .preprocess(
        preprocessStringArray,
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            price: z.number(),
            quantity: z.number(),
          })
        )
      )
      .optional(), // オプションID（カンマ区切り → 配列）
    unit_price: z.preprocess(preprocessNumber, z.number()).optional(), // 単価
    total_price: z.preprocess(preprocessNumber, z.number()).optional(), // 合計金額
    status: z.preprocess(preprocessEmptyString, z.enum(RESERVATION_STATUS_VALUES)).optional(), // 予約ステータス
    start_time_unix: z.preprocess(preprocessNumber, z.number()).optional(), // 開始時間 UNIXタイム
    end_time_unix: z.preprocess(preprocessNumber, z.number()).optional(), // 終了時間 UNIXタイム
    use_points: z.preprocess(preprocessNumber, z.number()).optional(), // 使用ポイント数
    coupon_id: z.string().optional(), // クーポンID
    featured_hairimg_path: z.string().optional(), // 顧客が希望する髪型の画像ファイルパス
    notes: z.string().optional(), // 備考
    payment_method: z.preprocess(preprocessEmptyString, z.enum(PAYMENT_METHOD_VALUES)).optional(), // 支払い方法
    is_existing_customer: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (!data.is_existing_customer) {
        return !!data.customer_first_name && !!data.customer_last_name && !!data.customer_phone
      }
      return true
    },
    {
      message: 'newCustomerValidation', // 新規顧客の場合、姓・名・電話番号は必須です
      path: ['customer_first_name'], // エラー表示位置（必要に応じて他も追加可）
    }
  )
  .refine(
    (data) => {
      // 既存顧客の場合、顧客IDまたは選択された顧客が必要
      // 新規顧客の場合、必要な情報が入力されている必要
      if (data.is_existing_customer) {
        return !!data.customer_uid
      } else {
        return !!data.customer_first_name && !!data.customer_last_name && !!data.customer_phone
      }
    },
    {
      message: 'customerRequired', // 顧客の選択または新規顧客情報の入力が必要です
      path: ['customer_uid'],
    }
  )

import { Input } from '@/components/ui/input'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { InsertType } from '@/services/supabase/SupabaseService'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchQuery } from 'convex/nextjs'
import { Id } from '@/convex/_generated/dataModel'
import { Gender } from '@/convex/types'
import { useErrorHandler } from '@/hooks/useErrorHandler'

// メモ化されたメニュー選択アイテムコンポーネント
const MenuSelectionItem = React.memo(
  ({
    menu,
    count,
    onAdd,
    onRemove,
    disabled,
  }: {
    menu: Doc<'menu'>
    count: number
    onAdd: () => void
    onRemove: () => void
    disabled: boolean
  }) => (
    <CommandItem className="flex items-center justify-between w-full">
      {menu.images && menu.images[0]?.original_url && (
        <Image
          src={menu.images[0].original_url}
          alt={menu.name ?? ''}
          className="w-10 h-10 rounded-full max-w-[40px] max-h-[40px] min-w-[40px] min-h-[40px]"
          width={40}
          height={40}
        />
      )}
      <div className="flex flex-col justify-start w-full items-start gap-1 text-xs">
        <p className="text-sm">{menu.name}</p>
        <div>
          {menu.sale_price && menu.sale_price > 0 ? (
            <>
              <span className="line-through text-muted-foreground">
                ￥{menu.unit_price?.toLocaleString()}
              </span>
              <span className="font-semibold text-success-foreground">
                ￥{menu.sale_price.toLocaleString()}
              </span>
            </>
          ) : (
            <span className="">￥{menu.unit_price?.toLocaleString()}</span>
          )}
          <div className="flex items-center gap-1">
            <p>{menu.duration_min}分</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          onClick={onRemove}
          disabled={count === 0}
          className="p-1 disabled:opacity-30 border border-destructive hover:bg-destructive-foreground"
        >
          <Minus className="w-4 h-4 text-destructive" />
        </Button>
        <span className="w-5 text-center text-sm">{count}</span>
        <Button
          size="icon"
          variant="outline"
          onClick={onAdd}
          disabled={disabled}
          className="border border-success hover:bg-success"
        >
          <Plus className="w-4 h-4 text-success-foreground" />
        </Button>
      </div>
    </CommandItem>
  )
)
MenuSelectionItem.displayName = 'MenuSelectionItem'

// ─────────────────────────────────────────────
// 顧客情報を表示用にフォーマットするユーティリティ関数
// ─────────────────────────────────────────────
const formatCustomerDisplay = (customer: RowType<'customer'>): string => {
  const parts: string[] = []
  // 姓・名（"未登録" は除外）
  if (customer.last_name && customer.last_name !== '未登録') {
    parts.push(customer.last_name)
  }
  if (customer.first_name && customer.first_name !== '未登録') {
    parts.push(customer.first_name)
  }

  // 名前が取得できない場合は LINE 名またはメールアドレスを使用
  if (parts.length === 0) {
    if (customer.line_user_name && customer.line_user_name !== '未登録') {
      parts.push(customer.line_user_name)
    } else if (customer.email) {
      parts.push(customer.email)
    }
  }

  // 電話番号を追加
  if (customer.phone) {
    parts.push(`tel:${customer.phone}`)
  }

  // 半角スペース区切りで連結
  return parts.join(' ')
}

// ステップの定義
const STEPS = {
  MENU: 1,
  STAFF: 2,
  DATETIME: 3,
  CUSTOMER: 4,
} as const

type StepType = (typeof STEPS)[keyof typeof STEPS]

const stepConfig = [
  { id: STEPS.MENU, title: 'メニュー選択', icon: ShoppingBag },
  { id: STEPS.STAFF, title: 'スタッフ選択', icon: User },
  { id: STEPS.DATETIME, title: '日時選択', icon: Clock },
  { id: STEPS.CUSTOMER, title: 'お客様情報', icon: CreditCard },
]

export default function ReservationForm() {
  const manageReservation = useMutation(api.reservation.manage.handleReservationManage)
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const router = useRouter()
  const t = useTranslations('reservations')
  const tCommon = useTranslations('common')
  const [currentStep, setCurrentStep] = useState<StepType>(STEPS.MENU)
  const [isExistingCustomer, setIsExistingCustomer] = useState<boolean>(true)
  // 複数選択に対応するためにstateを配列に変更
  const [selectedMenus, setSelectedMenus] = useState<ReservationMenu[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<Id<'staff'> | 'free' | null>(null)
  const [selectdate, setSelectDate] = useState<Date | null>(null)
  const [selectTime, setSelectTime] = useState<{
    startTimeUnix: number | undefined
    endTimeUnix: number | undefined
  } | null>(null)
  const [searchName, setSearchName] = useState<string>('')
  const [debouncedSearchName] = useDebounce(searchName, 1000)
  const [selectedOptions, setSelectedOptions] = useState<ReservationOption[]>([])
  // カテゴリーフィルター用のstate
  const [selectedCategories, setSelectedCategories] = useState<MenuCategory[]>([])
  // 性別とタイプの絞り込み用state
  const [selectedGender, setSelectedGender] = useState<'male' | 'female' | 'unselected' | null>(
    null
  )
  const [selectedType, setSelectedType] = useState<'all' | 'first_time' | 'repeat' | null>(null)
  // メニュー選択の上限（数量合計）
  const MAX_MENU_ITEMS = 10
  // オプション選択の上限（ユニーク件数）
  const MAX_OPTION_ITEMS = 10

  // Supabase用の顧客データ管理
  const [customers, setCustomers] = useState<RowType<'customer'>[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false)
  const [selectedCustomer, setSelectedCustomer] = useState<RowType<'customer'> | null>(null)
  const customerRepository = useMemo(() => new CustomerRepository(), [])

  // 初期データ取得（メニュー・オプション・設定など）
  const initialFormData = useQuery(
    api.reservation.query.getReservationFormData,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          planName: planName as SubscriptionPlanName,
          menu_ids: [],
        }
      : 'skip'
  )

  // フィルタリングされたメニューを計算
  const filteredMenus = useMemo(() => {
    if (!initialFormData?.menus) return []

    return initialFormData.menus.filter((menu) => {
      // カテゴリフィルター
      const categoryMatch =
        selectedCategories.length === 0 ||
        (menu.categories &&
          menu.categories.some((category) => selectedCategories.includes(category as MenuCategory)))

      // 性別フィルター
      const genderMatch = !selectedGender || menu.target_gender === selectedGender

      // タイプフィルター
      const typeMatch = !selectedType || menu.target_type === selectedType

      return categoryMatch && genderMatch && typeMatch
    })
  }, [initialFormData?.menus, selectedCategories, selectedGender, selectedType])

  // スタッフデータ取得（メニュー選択後）
  const staffFormData = useQuery(
    api.reservation.query.getReservationFormData,
    tenantId && orgId && selectedMenus.length > 0
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          menu_ids: selectedMenus.map((m) => m.id),
          planName: planName as SubscriptionPlanName,
        }
      : 'skip'
  )

  console.log('staffFormData', staffFormData)

  // データの統合（メニュー・オプションは初期データから、スタッフは選択後のデータから）
  const reservationConfig = initialFormData?.reservationConfig
  const menus = useMemo(() => initialFormData?.menus || [], [initialFormData?.menus])
  const options = initialFormData?.options || []
  const orgWeekSchedules = initialFormData?.weekSchedules || []
  const availableStaff = useMemo(
    () => staffFormData?.availableStaff || [],
    [staffFormData?.availableStaff]
  )

  // スタッフの週間スケジュール（個別取得が必要）
  // useQuery が 'skip' を返すケースに備えて配列でラップし、予期せぬ型エラーを防ぐ
  const staffWeekSchedulesRaw = useQuery(
    api.staff.week_schedule.query.getByTenantOrgStaff,
    tenantId && orgId && selectedStaffId && selectedStaffId !== 'free'
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: selectedStaffId,
        }
      : 'skip'
  )

  // 配列でない場合（undefined や 'skip' 文字列など）は空配列に変換
  const staffWeekSchedules: Doc<'staff_week_schedule'>[] = Array.isArray(staffWeekSchedulesRaw)
    ? (staffWeekSchedulesRaw as Doc<'staff_week_schedule'>[])
    : []

  // 休業日情報（TODO: 統合データ取得に含める）
  const orgExceptionSchedules = useQuery(
    api.organization.exception_schedule.query.getByOrgAndDate,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          type: 'holiday',
        }
      : 'skip'
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useZodForm(schemaReservation)

  // 選択中のスタッフが利用可能なスタッフリストに含まれているかチェック
  useEffect(() => {
    if (selectedStaffId && selectedStaffId !== 'free' && availableStaff.length > 0) {
      const isStaffAvailable = availableStaff.some((staff) => staff._id === selectedStaffId)
      if (!isStaffAvailable) {
        // 選択中のスタッフが新しいメニューセットに対応できない場合のみリセット
        setSelectedStaffId(null)
        setValue('staff_id', '')
        toast.warning(t('staffUnavailableWarning'))
      }
    }
  }, [availableStaff, selectedStaffId, setValue, t])

  // 時間スロットの状態を追加
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeRange[]>([])
  // 選択した日付を "yyyy-MM-dd" 形式で保持
  const formattedDate = selectdate ? format(selectdate!, 'yyyy-MM-dd') : ''

  // 顧客検索の最適化されたコールバック
  const searchCustomers = useCallback(async () => {
    console.log(`[ReservationForm] searchCustomers called with:`, {
      tenantId,
      orgId,
      debouncedSearchName,
      searchNameLength: debouncedSearchName.length,
    })

    if (!tenantId || !orgId || debouncedSearchName === '') {
      console.log(`[ReservationForm] Early return: missing params or empty search`)
      setCustomers([])
      return
    }

    setIsLoadingCustomers(true)
    try {
      console.log(`[ReservationForm] Calling customerRepository.findBySearchableText...`)
      const result = await customerRepository.findBySearchableText(
        tenantId,
        orgId,
        debouncedSearchName,
        { page: 1, pageSize: 30 }
      )
      console.log(`[ReservationForm] Search result:`, {
        dataLength: result.data.length,
        count: result.count,
        hasMore: result.hasMore,
        firstCustomer: result.data[0]
          ? {
              uid: result.data[0].uid,
              firstName: result.data[0].first_name,
              lastName: result.data[0].last_name,
              searchableText: result.data[0].searchable_text,
            }
          : null,
      })
      setCustomers(result.data)
    } catch (error) {
      console.error('[ReservationForm] Error searching customers:', error)
      showErrorToast(error)
      setCustomers([])
    } finally {
      setIsLoadingCustomers(false)
    }
  }, [tenantId, orgId, debouncedSearchName, customerRepository, showErrorToast])

  // 顧客検索の実行
  useEffect(() => {
    searchCustomers()
  }, [searchCustomers])

  useEffect(() => {
    if (!tenantId || !orgId) return
    reset({
      customer_uid: undefined, // 顧客ID
      staff_id: undefined, // スタッフID
      staff_name: undefined, // スタッフ名
      menus: [], // メニューID（複数）
      tenant_id: tenantId, // サロンID
      org_id: orgId, // サロンID
      status: 'pending', // 予約ステータス
      options: [], // オプションID
      unit_price: undefined, // 単価
      total_price: undefined, // 合計金額
      start_time_unix: undefined, // 開始時間 UNIXタイム
      end_time_unix: undefined, // 終了時間 UNIXタイム
      use_points: undefined, // 使用ポイント数
      coupon_id: undefined, // クーポンID
      featured_hairimg_path: undefined, // 顧客が希望する髪型の画像ファイルパス
      notes: undefined, // 備考
      payment_method: 'cash', // 支払い方法
      is_existing_customer: isExistingCustomer, // 既存顧客フラグ
    })
  }, [tenantId, orgId, reset, isExistingCustomer])

  // 価格計算の統合フック使用
  const {
    totalTimeMinutes,
    menuTotalPrice,
    extraChargePrice,
    totalPrice: totalPriceCalculated,
  } = usePriceCalculation({
    selectedMenus,
    selectedOptions,
    menus,
    options,
    selectedStaffId: selectedStaffId === 'free' ? null : selectedStaffId,
    availableStaff,
  })

  useEffect(() => {
    setValue('total_price', totalPriceCalculated)
    setValue('unit_price', menuTotalPrice)
  }, [totalPriceCalculated, menuTotalPrice, setValue])

  // 時間スロット取得の最適化されたコールバック
  const getAvailableTimeSlots = useCallback(async () => {
    if (!selectedStaffId || !tenantId || !orgId || !selectdate || !totalTimeMinutes) {
      setAvailableTimeSlots([])
      return
    }

    try {
      // 日付をYYYY-MM-DD形式に変換
      const formattedDate = format(selectdate!, 'yyyy-MM-dd')

      if (selectedStaffId === 'free') {
        // 指名フリーの場合は統合空き時間を取得
        const result = await fetchQuery(api.reservation.query.calculateIntegratedAvailableTimes, {
          tenant_id: tenantId,
          org_id: orgId,
          menu_ids: selectedMenus.map((m) => m.id),
          option_ids: selectedOptions.map((o) => o.id),
          date: formattedDate,
        })

        if (result.available && result.timeSlots) {
          // 統合スロットをTimeRange形式に変換
          const timeRanges = result.timeSlots.map((slot) => ({
            startHour: slot.start,
            endHour: slot.end,
          }))
          setAvailableTimeSlots(timeRanges)
        } else {
          setAvailableTimeSlots([])
        }
      } else {
        // 通常のスタッフ指名の場合
        const result = await fetchQuery(api.reservation.query.calculateReservationTime, {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: selectedStaffId,
          date: formattedDate,
          duration_min: totalTimeMinutes,
        })

        // 結果が配列で返され、選択したスタッフのスロットを含む場合
        if (Array.isArray(result) && result.length > 0) {
          setAvailableTimeSlots(result)
        } else {
          setAvailableTimeSlots([])
        }
      }
    } catch (error) {
      showErrorToast(error)
      setAvailableTimeSlots([])
    }
  }, [
    selectedStaffId,
    tenantId,
    orgId,
    selectdate,
    totalTimeMinutes,
    selectedMenus,
    selectedOptions,
    showErrorToast,
  ])

  // 時間スロット取得の実行
  useEffect(() => {
    getAvailableTimeSlots()
  }, [getAvailableTimeSlots])

  // ─────────────────────────
  // メニュー数量操作用ヘルパー
  // ─────────────────────────
  const getMenuCount = React.useCallback(
    (id: Id<'menu'>) => selectedMenus.filter((m) => m.id === id).length,
    [selectedMenus]
  )

  // 選択中メニュー ID を一意にした配列

  const calcMenuSubTotal = React.useCallback(
    (ids: Id<'menu'>[]) =>
      ids.reduce((sum, id) => {
        const menu = menus?.find((m) => m._id === id)
        if (!menu) return sum
        const price =
          menu.sale_price && menu.sale_price > 0 ? menu.sale_price : (menu.unit_price ?? 0)
        return sum + price
      }, 0),
    [menus]
  )

  const addMenu = useCallback(
    (menu: ReservationMenu) => {
      if (selectedMenus.length >= MAX_MENU_ITEMS) {
        toast.error(t('maxMenuError', { max: MAX_MENU_ITEMS }))
        return
      }
      const newMenus = [...selectedMenus, menu]
      setSelectedMenus(newMenus)
      setValue('menus', newMenus)
      setValue('unit_price', calcMenuSubTotal(newMenus.map((m) => m.id)))
      // 新しいメニューが追加された場合のみスタッフをリセット（同じメニューの数量増加では不要）
      const isNewMenu = !selectedMenus.some((m) => m.id === menu.id)
      if (isNewMenu && selectedStaffId) {
        // 選択中のスタッフが新しいメニューに対応可能か後でチェックされる
        // ここではリセットしない
      }
    },
    [selectedMenus, setValue, calcMenuSubTotal, selectedStaffId, t]
  )

  const removeMenu = useCallback(
    (menuId: Id<'menu'>) => {
      const idx = selectedMenus.findIndex((m) => m.id === menuId)
      if (idx === -1) return
      const newMenus = [...selectedMenus]
      newMenus.splice(idx, 1)
      setSelectedMenus(newMenus)
      setValue('menus', newMenus)
      setValue('unit_price', calcMenuSubTotal(newMenus.map((m) => m.id)))
      // 全てのメニューが削除された場合のみスタッフをリセット
      if (newMenus.length === 0) {
        setSelectedStaffId(null)
        setValue('staff_id', '')
      }
      // メニューが残っている場合、選択中のスタッフが対応可能かは後でチェックされる
    },
    [selectedMenus, setValue, calcMenuSubTotal]
  )

  // 指定メニュー ID をすべて取り除く

  const getOptionCount = React.useCallback(
    (id: Id<'option'>) => selectedOptions.find((o) => o.id === id)?.quantity ?? 0,
    [selectedOptions]
  )

  const addOption = (option: ReservationOption) => {
    const existing = selectedOptions.find((o) => o.id === option.id)

    // まだ存在しないオプションを追加する際、上限チェック
    if (!existing && selectedOptions.length >= MAX_OPTION_ITEMS) {
      toast.error(t('maxOptionError', { max: MAX_OPTION_ITEMS }))
      return
    }

    const newOpts = existing
      ? selectedOptions.map((o) => (o.id === option.id ? { ...o, quantity: o.quantity + 1 } : o))
      : [...selectedOptions, { ...option, quantity: 1 }]

    setSelectedOptions(newOpts)
    setValue('options', newOpts)
  }

  const removeOption = (optionId: Id<'option'>) => {
    const existing = selectedOptions.find((o) => o.id === optionId)
    if (!existing) return
    const newOpts =
      existing.quantity > 1
        ? selectedOptions.map((o) => (o.id === optionId ? { ...o, quantity: o.quantity - 1 } : o))
        : selectedOptions.filter((o) => o.id !== optionId)
    setSelectedOptions(newOpts)
    setValue('options', newOpts)
  }

  // ステップナビゲーション関数
  const canProceedToNextStep = useCallback(() => {
    switch (currentStep) {
      case STEPS.MENU:
        return selectedMenus.length > 0
      case STEPS.STAFF:
        return selectedStaffId !== null
      case STEPS.DATETIME:
        return selectdate !== null && selectTime !== null
      case STEPS.CUSTOMER:
        return isExistingCustomer
          ? selectedCustomer !== null
          : watch('customer_first_name') && watch('customer_last_name') && watch('customer_phone')
      default:
        return false
    }
  }, [
    currentStep,
    selectedMenus,
    selectedStaffId,
    selectdate,
    selectTime,
    isExistingCustomer,
    selectedCustomer,
    watch,
  ])

  const goToNextStep = useCallback(() => {
    if (canProceedToNextStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.CUSTOMER) as StepType)
      // 画面の一番上までスムーズにスクロール（状態更新後に実行）
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
    }
  }, [canProceedToNextStep])

  const goToPreviousStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, STEPS.MENU) as StepType)
    // 画面の一番上までスムーズにスクロール（状態更新後に実行）
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
  }, [])

  const onSubmit = async (data: z.infer<typeof schemaReservation>) => {
    if (!tenantId || !orgId) return

    // 時間選択の検証
    if (!selectTime?.startTimeUnix || !selectTime?.endTimeUnix) {
      toast.error(t('selectTimeRequired'))
      return
    }

    try {
      let customerUid
      if (!isExistingCustomer) {
        // 新規顧客の場合、CustomerRepositoryで顧客を作成
        try {
          const result = await customerRepository.createCustomerWithDetailsAndPoints(
            {
              uid: crypto.randomUUID(), // 一時的にUIDを生成（RPC側自動で設定されるので、実際は違うUIDが設定される）
              email: '', // 新規顧客の場合、emailは必須ではない
              first_name: data.customer_first_name || '',
              last_name: data.customer_last_name || '',
              phone: data.customer_phone || '',
              tenant_id: tenantId,
              org_id: orgId,
              line_id: '',
              line_user_name: '',
            } as InsertType<'customer'>,
            {
              email: '', // 詳細情報のemail
              gender: data.customer_gender || 'unselected',
              birthday: data.customer_birthday
                ? format(new Date(data.customer_birthday), 'yyyy-MM-dd')
                : '',
              age: 0, // 年齢は後で計算
              notes: data.customer_notes || '',
            },
            0 // 初期ポイント
          )

          if (!result.customer) {
            throw new Error('顧客の作成に失敗しました')
          }

          customerUid = result.customer.uid
          console.log('Created new customer with uid:', customerUid)
        } catch (error) {
          console.error('Error creating customer:', error)
          showErrorToast(error)
          return
        }
      }

      const customerName = isExistingCustomer
        ? selectedCustomer?.last_name + ' ' + selectedCustomer?.first_name
        : data.customer_last_name + ' ' + data.customer_first_name

      const trimmedCustomerName = customerName.trim()
      const finalCustomerName =
        trimmedCustomerName === ''
          ? (selectedCustomer?.email ?? selectedCustomer?.line_user_name)
          : customerName

      // 指名フリーの場合のスタッフ取得
      let finalStaffId = selectedStaffId
      let assignedStaffName = selectStaff?.name ?? ''

      if (selectedStaffId === 'free') {
        try {
          const bestStaff = await fetchQuery(
            api.reservation.query.getBestAvailableStaffForTimeSlot,
            {
              tenant_id: tenantId,
              org_id: orgId,
              menu_ids: selectedMenus.map((m) => m.id),
              date: format(selectdate as Date, 'yyyy-MM-dd'),
              start_time_unix: selectTime?.startTimeUnix as number,
              end_time_unix: selectTime?.endTimeUnix as number,
            }
          )
          finalStaffId = bestStaff?.staff_id || (availableStaff[0]?._id as Id<'staff'>)

          // 割り当てられたスタッフの詳細情報を取得してスタッフ名を設定
          try {
            const assignedStaff = await fetchQuery(api.staff.query.getById, {
              id: finalStaffId as Id<'staff'>,
            })
            assignedStaffName = assignedStaff?.name ?? '指名フリー'
          } catch (staffError) {
            console.error('Failed to get assigned staff details:', staffError)
            // フォールバック: 利用可能スタッフリストから名前を取得
            const fallbackStaff = availableStaff.find((staff) => staff._id === finalStaffId)
            assignedStaffName = fallbackStaff?.name ?? '指名フリー'
          }
        } catch (error) {
          console.error('Failed to get best staff:', error)
          finalStaffId = availableStaff[0]?._id as Id<'staff'>
          // フォールバック時のスタッフ名も設定
          assignedStaffName = availableStaff[0]?.name ?? '指名フリー'
        }
      }

      await manageReservation({
        mode: 'create',
        payload: {
          tenant_id: tenantId,
          org_id: orgId,
          customer_uid: isExistingCustomer ? (selectedCustomer?.uid ?? '') : (customerUid ?? ''),
          staff_id: finalStaffId as Id<'staff'>,
          customer_name: finalCustomerName ?? selectedCustomer?.phone ?? '不明',
          staff_name: assignedStaffName,
          is_free_nomination: selectedStaffId === 'free',
          status: 'confirmed',
          date: format(selectdate as Date, 'yyyy-MM-dd'),
          start_time_unix: selectTime?.startTimeUnix as number,
          end_time_unix: selectTime?.endTimeUnix as number,
          total_price: totalPriceCalculated,
          coupon_id: undefined,
          payment_method: 'cash',
          stripe_checkout_session_id: undefined,
          payment_status: 'pending',
          menus: selectedMenus,
          options: selectedOptions,
          extra_charge: extraChargePrice,
          use_points: undefined,
          coupon_discount: undefined,
          featured_hair_images: [],
          notes: data.notes ?? '',
          pending_duration_minutes: undefined,
          checkout_url: undefined,
        },
      })

      toast.success(t('reservationCompleted'))
      router.push('/dashboard/reservation')
    } catch (error) {
      showErrorToast(error)
    }
  }

  const selectStaff =
    selectedStaffId === 'free'
      ? null
      : availableStaff.find((staff) => staff._id === selectedStaffId)

  const toDate = reservationConfig?.reservation_limit_days
    ? new Date(
        new Date().setDate(new Date().getDate() + (reservationConfig.reservation_limit_days ?? 30))
      )
    : undefined

  if (!tenantId || !orgId) return <Loading />

  return (
    <div>
      {/* プログレスバー */}
      <div className="mb-8 ">
        <div className="flex items-center justify-center mb-4">
          {stepConfig.map((step, index) => (
            <div key={step.id} className="flex items-center justify-center w-fit">
              <div key={step.id} className="flex items-center w-full">
                <div className="flex flex-col md:flex-row items-center">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
                      currentStep >= step.id ? 'text-success-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {currentStep > step.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <step.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs md:text-sm font-medium text-center text-balance md:text-nowrap',
                      currentStep >= step.id ? 'text-success-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center w-full mx-2 md:mx-4">
                {index < stepConfig.length - 1 && (
                  <div className="flex-1 min-w-10">
                    <Progress value={currentStep > step.id ? 100 : 0} className="h-1" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
      >
        <div className="min-h-[500px] max-w-3xl mx-auto">
          {/* ステップ1: メニュー選択 */}
          {currentStep === STEPS.MENU && (
            <div className="space-y-3 md:space-y-6">
              <div className="bg-background rounded-2xl shadow-sm border border-border p-3 md:p-6">
                {/* フィルタリングセクション */}
                <div className="mb-6">
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="filters">
                      <AccordionTrigger>
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">メニューを絞り込み</span>
                          {(selectedCategories.length > 0 || selectedGender || selectedType) && (
                            <Badge variant="outline" className="ml-2">
                              {selectedCategories.length +
                                (selectedGender ? 1 : 0) +
                                (selectedType ? 1 : 0)}
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {/* カテゴリーフィルター */}
                        <div className="mb-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            カテゴリー
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {MENU_CATEGORY_VALUES.map((category) => {
                              const isSelected = selectedCategories.includes(category)
                              return (
                                <Badge
                                  key={category}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className={cn(
                                    'cursor-pointer transition-all',
                                    isSelected
                                      ? 'bg-success-foreground hover:bg-success-foreground'
                                      : 'hover:bg-muted'
                                  )}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedCategories((prev) =>
                                        prev.filter((c) => c !== category)
                                      )
                                    } else {
                                      setSelectedCategories((prev) => [...prev, category])
                                    }
                                  }}
                                >
                                  {category}
                                  {isSelected && <Check className="w-3 h-3 ml-1" />}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>

                        {/* 性別フィルター */}
                        <div className="mb-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2">性別</div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: 'male', label: '男性' },
                              { value: 'female', label: '女性' },
                              { value: 'unselected', label: '指定なし' },
                            ].map((gender) => {
                              const isSelected = selectedGender === gender.value
                              return (
                                <Badge
                                  key={gender.value}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className={cn(
                                    'cursor-pointer transition-all',
                                    isSelected ? 'bg-success hover:bg-success/90' : 'hover:bg-muted'
                                  )}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedGender(null)
                                    } else {
                                      setSelectedGender(
                                        gender.value as 'male' | 'female' | 'unselected'
                                      )
                                    }
                                  }}
                                >
                                  {gender.label}
                                  {isSelected && <Check className="w-3 h-3 ml-1" />}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>

                        {/* タイプフィルター */}
                        <div className="mb-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            タイプ
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { value: 'all', label: '全て' },
                              { value: 'first_time', label: '初回' },
                              { value: 'repeat', label: 'リピーター' },
                            ].map((type) => {
                              const isSelected = selectedType === type.value
                              return (
                                <Badge
                                  key={type.value}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className={cn(
                                    'cursor-pointer transition-all',
                                    isSelected ? 'bg-success hover:bg-success/90' : 'hover:bg-muted'
                                  )}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedType(null)
                                    } else {
                                      setSelectedType(type.value as 'all' | 'first_time' | 'repeat')
                                    }
                                  }}
                                >
                                  {type.label}
                                  {isSelected && <Check className="w-3 h-3 ml-1" />}
                                </Badge>
                              )
                            })}
                          </div>
                        </div>

                        {/* 全フィルタークリア */}
                        {(selectedCategories.length > 0 || selectedGender || selectedType) && (
                          <div className="flex justify-end">
                            <Badge
                              variant="secondary"
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedCategories([])
                                setSelectedGender(null)
                                setSelectedType(null)
                              }}
                            >
                              全てクリア
                            </Badge>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                {/* メニューリスト */}
                <div className="grid gap-4">
                  {filteredMenus?.map((menu) => {
                    const count = getMenuCount(menu._id)
                    const isSelected = count > 0
                    return (
                      <div
                        key={menu._id}
                        className={cn(
                          'p-4 rounded-xl border-2 transition-all cursor-pointer',
                          isSelected
                            ? 'border-success bg-success/5'
                            : 'border-border hover:border-success'
                        )}
                      >
                        <div className="flex flex-col md:flex-row items-start justify-start">
                          <div className="flex mdflex-col justify-start items-start gap-4">
                            {menu.images && menu.images[0]?.original_url ? (
                              <Image
                                src={menu.images[0].original_url}
                                alt={menu.name ?? ''}
                                className="w-16 h-16 rounded-lg object-cover"
                                width={64}
                                height={64}
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                                <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-semibold text-base md:text-nowrap">
                                {menu.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">{menu.duration_min}分</p>
                              <div className="flex items-center gap-2 mt-1">
                                {menu.sale_price && menu.sale_price > 0 ? (
                                  <>
                                    <span className="line-through text-muted-foreground text-sm">
                                      ￥{menu.unit_price?.toLocaleString()}
                                    </span>
                                    <span className="font-bold text-success-foreground">
                                      ￥{menu.sale_price.toLocaleString()}
                                    </span>
                                  </>
                                ) : (
                                  <span className="font-bold">
                                    ￥{menu.unit_price?.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-end w-full gap-2 min-w-18 mt-2 md:mt-0">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() => removeMenu(menu._id)}
                              disabled={count === 0}
                              className={cn(
                                'h-10 w-10 rounded-full transition-all',
                                count === 0 && 'opacity-50'
                              )}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-8 text-center font-semibold text-lg">{count}</span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              onClick={() =>
                                addMenu({
                                  id: menu._id,
                                  name: menu.name,
                                  price: menu.sale_price ?? menu.unit_price,
                                  quantity: 1,
                                })
                              }
                              disabled={selectedMenus.length >= MAX_MENU_ITEMS}
                              className={cn(
                                'h-10 w-10 rounded-full transition-all',
                                selectedMenus.length >= MAX_MENU_ITEMS && 'opacity-50'
                              )}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* オプション選択（メニュー選択時のみ表示） */}
              {selectedMenus.length > 0 && (
                <div className="bg-background  rounded-2xl shadow-sm border border-border p-6">
                  <h3 className="text-lg font-semibold mb-4">{t('optionsOptional')}</h3>
                  <div className="grid gap-3">
                    {options?.map((option) => {
                      const count = getOptionCount(option._id)
                      const isSelected = count > 0
                      return (
                        <div
                          key={option._id}
                          className={cn(
                            'p-4 rounded-lg border transition-all',
                            isSelected ? 'border-success bg-success' : 'border-border'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{option.name}</p>
                              {option.duration_min &&
                              option.duration_min > 0 &&
                              option.duration_min !== 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  {option.duration_min}分
                                </p>
                              ) : null}
                              {option.in_stock ? (
                                <p className="text-sm text-muted-foreground">
                                  在庫あり 残り{option.in_stock}個
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">在庫なし</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium mr-4">
                                ￥{(option.sale_price ?? option.unit_price)?.toLocaleString()}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeOption(option._id)}
                                disabled={count === 0}
                                className="h-8 w-8"
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="w-6 text-center">{count}</span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  addOption({
                                    id: option._id,
                                    name: option.name,
                                    price: option.sale_price ?? option.unit_price,
                                    quantity: 1,
                                  })
                                }
                                disabled={count === 0 && selectedOptions.length >= MAX_OPTION_ITEMS}
                                className="h-8 w-8"
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ステップ2: スタッフ選択 */}
          {currentStep === STEPS.STAFF && (
            <div className="space-y-6">
              <div className="bg-background  rounded-2xl shadow-sm border border-border p-6">
                <h2 className="text-2xl font-bold mb-2">{t('staffForTreatment')}</h2>
                <p className="text-muted-foreground mb-6">
                  施術を担当するスタッフを選択してください
                </p>

                {staffFormData === undefined && selectedMenus.length > 0 ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-3 text-success-foreground" />
                    <span className="text-success-foreground">{t('searchingStaff')}</span>
                  </div>
                ) : availableStaff.length > 0 ? (
                  <div className="grid gap-4">
                    {/* 指名フリーオプション */}
                    <div
                      onClick={() => {
                        setSelectedStaffId('free')
                        setValue('staff_id', 'free')
                      }}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all cursor-pointer',
                        selectedStaffId === 'free'
                          ? 'border-success bg-success'
                          : 'border-border hover:border-success'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-success/20 to-success/40 flex items-center justify-center">
                            <span className="text-xl font-bold text-success-foreground">FREE</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">指名フリー</h3>
                            <p className="text-sm text-muted-foreground">
                              最適なスタッフを自動で割り当て
                            </p>
                            <p className="text-sm font-medium text-success-foreground mt-1">
                              指名料無料
                            </p>
                          </div>
                        </div>
                        {selectedStaffId === 'free' && (
                          <Check className="w-6 h-6 text-success-foreground" />
                        )}
                      </div>
                    </div>

                    {/* スタッフリスト */}
                    {availableStaff
                      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                      .map((staff) => (
                        <div
                          key={staff._id}
                          onClick={() => {
                            setSelectedStaffId(staff._id)
                            setValue('staff_id', staff._id)
                          }}
                          className={cn(
                            'p-4 rounded-xl border-2 transition-all cursor-pointer',
                            selectedStaffId === staff._id
                              ? 'border-success bg-success'
                              : 'border-border hover:border-success'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {staff.images?.[0]?.original_url ? (
                                <Image
                                  src={staff.images[0].original_url}
                                  alt={staff.name}
                                  className="w-16 h-16 rounded-full object-cover"
                                  width={64}
                                  height={64}
                                />
                              ) : (
                                <Avatar className="w-16 h-16">
                                  <AvatarFallback className="text-lg">
                                    {staff.name.slice(0, 1)}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <div>
                                <h3 className="font-semibold text-lg">{staff.name}</h3>
                                {staff.extra_charge && staff.extra_charge > 0 ? (
                                  <p className="text-sm font-medium text-muted-foreground">
                                    指名料 ￥{staff.extra_charge.toLocaleString()}
                                  </p>
                                ) : (
                                  <p className="text-sm font-medium text-muted-foreground">
                                    指名料 無料
                                  </p>
                                )}
                              </div>
                            </div>
                            {selectedStaffId === staff._id && (
                              <Check className="w-6 h-6 text-success-foreground" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center p-8">
                    <p className="text-destructive">{t('noAvailableStaff')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ステップ3: 日時選択 */}
          {currentStep === STEPS.DATETIME && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center bg-background  rounded-2xl shadow-sm border border-border p-6">
                <h2 className="text-2xl font-bold mb-2">{t('reservationDate')}</h2>
                <p className="text-muted-foreground mb-6">ご希望の日時を選択してください</p>

                {/* カレンダー */}
                <div className="mb-6">
                  <Calendar
                    fromDate={new Date()}
                    toDate={toDate}
                    disabled={[
                      ...(orgExceptionSchedules?.map((day) => new Date(day.date)) ?? []),
                      (date: Date) => {
                        const dayKey = getDayOfWeek(date)
                        const orgWeekSchedule = orgWeekSchedules?.find(
                          (s) => s.day_of_week === dayKey
                        )
                        const staffWeekSchedule = staffWeekSchedules?.find(
                          (s) => s.day_of_week === dayKey
                        )
                        return (
                          (orgWeekSchedule ? !orgWeekSchedule.is_open : false) ||
                          (staffWeekSchedule ? !staffWeekSchedule.is_open : false)
                        )
                      },
                    ]}
                    className="rounded-xl border-2"
                    mode="single"
                    locale={ja}
                    selected={selectdate ?? undefined}
                    onSelect={(day) => {
                      setSelectDate(day as Date)
                      setSelectTime(null)
                    }}
                  />
                </div>

                {/* 時間スロット */}
                {selectdate && (
                  <div>
                    <h3 className="font-semibold mb-4">
                      {selectdate.toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                      の空き時間
                    </h3>
                    {availableTimeSlots.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {availableTimeSlots.map((slot, index) => (
                          <button
                            key={index}
                            type="button"
                            className={cn(
                              'p-3 rounded-lg font-medium transition-all border border-transparent',
                              watch('start_time_unix') ===
                                convertHourToTimestamp(slot.startHour, formattedDate)
                                ? 'bg-success text-success-foreground'
                                : 'bg-background border-border hover:bg-success'
                            )}
                            onClick={() => {
                              const timestampStart = convertHourToTimestamp(
                                slot.startHour,
                                formattedDate
                              )!
                              const timestampEnd = convertHourToTimestamp(
                                slot.endHour,
                                formattedDate
                              )!
                              setValue('start_time_unix', timestampStart)
                              setValue('end_time_unix', timestampEnd)
                              setSelectTime({
                                startTimeUnix: timestampStart,
                                endTimeUnix: timestampEnd,
                              })
                            }}
                          >
                            <p className="text-sm">{slot.startHour}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center p-8 bg-background  rounded-lg">
                        <p className="text-muted-foreground">{t('noAvailableSlots')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ステップ4: 顧客情報 */}
          {currentStep === STEPS.CUSTOMER && (
            <div className="space-y-6">
              <div className="bg-background  rounded-2xl shadow-sm border border-border p-6">
                <h2 className="text-2xl font-bold mb-6">{t('customerInfo')}</h2>

                {/* 顧客タイプ選択 */}
                <div className="mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsExistingCustomer(true)
                        setValue('is_existing_customer', true)
                      }}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all',
                        isExistingCustomer ? 'border-success bg-success/5' : 'border-border'
                      )}
                    >
                      <User className="w-6 h-6 mb-2 mx-auto" />
                      <p className="font-medium text-sm md:text-base">{t('existingCustomer')}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsExistingCustomer(false)
                        setValue('is_existing_customer', false)
                      }}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all',
                        !isExistingCustomer ? 'border-success bg-success' : 'border-border'
                      )}
                    >
                      <Plus className="w-6 h-6 mb-2 mx-auto" />
                      <p className="font-medium text-sm md:text-base">{t('newCustomer')}</p>
                    </button>
                  </div>
                </div>

                {/* 既存顧客検索 */}
                {isExistingCustomer ? (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">{t('customerSearch')}</Label>
                    <Input
                      className="mb-4"
                      placeholder={t('searchCustomer')}
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                    />

                    {isLoadingCustomers ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-5 w-5 animate-spin mr-2 text-success-foreground" />
                        <span className="text-success-foreground">{t('searching')}</span>
                      </div>
                    ) : customers.length > 0 ? (
                      <div className="grid gap-3">
                        {customers.map((customer) => (
                          <div
                            key={customer.uid}
                            onClick={() => {
                              setSelectedCustomer(customer)
                              setValue('customer_uid', customer.uid)
                            }}
                            className={cn(
                              'p-4 rounded-lg border-2 transition-all cursor-pointer',
                              selectedCustomer?.uid === customer.uid
                                ? 'border-success bg-success'
                                : 'border-border'
                            )}
                          >
                            <p className="font-medium">{formatCustomerDisplay(customer)}</p>
                          </div>
                        ))}
                      </div>
                    ) : searchName.length > 0 ? (
                      <div className="text-center p-8 bg-warning rounded-lg">
                        <p className="text-warning-foreground">{t('noCustomersFound')}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* 新規顧客フォーム */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{t('lastName')}</Label>
                        <Input
                          {...register('customer_last_name')}
                          placeholder={t('lastName')}
                          className="mt-1"
                        />
                        {errors.customer_last_name && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.customer_last_name.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label>{t('firstName')}</Label>
                        <Input
                          {...register('customer_first_name')}
                          placeholder={t('firstName')}
                          className="mt-1"
                        />
                        {errors.customer_first_name && (
                          <p className="text-destructive text-sm mt-1">
                            {errors.customer_first_name.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label>{t('tel')}</Label>
                      <Input
                        {...register('customer_phone')}
                        type="tel"
                        placeholder={t('tel')}
                        className="mt-1"
                      />
                      {errors.customer_phone && (
                        <p className="text-destructive text-sm mt-1">
                          {errors.customer_phone.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>{tCommon('gender')}</Label>
                        <Select
                          value={watch('customer_gender') ?? ''}
                          onValueChange={(value: string) => {
                            setValue('customer_gender', value as Gender)
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={tCommon('gender')} />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDER_VALUES.map((gender) => (
                              <SelectItem key={gender} value={gender}>
                                {convertGender(gender, true)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{tCommon('birthday')}</Label>
                        <DatePicker
                          value={
                            watch('customer_birthday')
                              ? new Date(watch('customer_birthday')!)
                              : undefined
                          }
                          onChange={(date) =>
                            setValue('customer_birthday', date ? format(date, 'yyyy-MM-dd') : '')
                          }
                          placeholder={tCommon('birthdayPlaceholder')}
                          toDate={new Date()}
                          className="mt-1 overflow-hidden"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 備考 */}
              <div className="bg-background  rounded-2xl shadow-sm border border-border p-6">
                <Label className="text-lg font-semibold mb-3 block">{t('notes')}</Label>
                <Textarea
                  {...register('notes')}
                  placeholder={t('notesPlaceholder')}
                  className="resize-none"
                  rows={4}
                />
              </div>
            </div>
          )}
        </div>

        {/* ナビゲーションボタン */}
        <div className="flex justify-between items-center mt-8 pb-24 max-w-3xl mx-auto">
          <Button
            type="button"
            variant="outline"
            onClick={goToPreviousStep}
            disabled={currentStep === STEPS.MENU}
            className={cn(
              'px-6 py-3 rounded-xl transition-all',
              currentStep === STEPS.MENU && 'opacity-50'
            )}
          >
            <ChevronRight className="w-5 h-5 mr-2 rotate-180" />
            前へ
          </Button>

          {currentStep < STEPS.CUSTOMER ? (
            <Button
              onClick={goToNextStep}
              disabled={!canProceedToNextStep()}
              className={cn(
                'px-6 py-3 rounded-xl transition-all',
                !canProceedToNextStep() && 'opacity-50'
              )}
            >
              次へ
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isSubmitting || !canProceedToNextStep()}
              className={cn(
                'px-8 py-3 rounded-xl transition-all',
                (isSubmitting || !canProceedToNextStep()) && 'opacity-50'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {t('creating')}
                </>
              ) : (
                <>
                  {t('createReservationButton')}
                  <Check className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </form>

      {/* 新しいボトムバー */}
      <div className="fixed bottom-0 left-0 right-0 bg-background  border-t border-border px-4 py-4 z-50">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              {selectdate && selectTime && (
                <p className="text-sm text-muted-foreground text-nowrap">
                  {format(selectdate!, 'yyyy年MM月dd日')}{' '}
                  {formatTimestamp(selectTime.startTimeUnix!, { useJST: true })} 〜{' '}
                  {formatTimestamp(selectTime.endTimeUnix!, { useJST: true })}
                </p>
              )}
              <p className="text-sm font-medium">
                {totalTimeMinutes > 0 && (
                  <span className="text-muted-foreground mr-3">施術時間: {totalTimeMinutes}分</span>
                )}
                <span className="text-xl font-bold text-success-foreground">
                  ￥{totalPriceCalculated.toLocaleString()}
                </span>
              </p>
              {/* 選択内容サマリー */}
              <div className="flex items-center gap-4">
                {selectedMenus.length > 0 && (
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{selectedMenus.length}個</span>
                  </div>
                )}
                {selectedStaffId && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {selectedStaffId === 'free' ? '指名フリー' : selectStaff?.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
