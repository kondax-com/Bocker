'use client'

import { createCustomerReservation } from '@/services/reservations/createCustomerReservation'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/convex/_generated/api'
import { convertDayOfWeek } from '@/lib/schedules'
import { fetchQuery } from 'convex/nextjs'
import { Doc, Id } from '@/convex/_generated/dataModel'
import { Loading } from '@/components/common'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { SubscriptionPlanName } from '@/convex/types'
import {
  CouponMenuView,
  StaffView,
  OptionView,
  DateView,
  PaymentView,
  ConfirmView,
} from './_components'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import Image from 'next/image'
import { ReservationPaymentStatus, ActiveCustomerType } from '@/convex/types'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import { formatDateToYYYYMMDD } from '@/lib/schedules'
import { performCompleteLogout } from '@/lib/auth/logout'

import {
  Check,
  CheckCheck,
  LogOut,
  ShoppingCart,
  User2,
  Settings,
  Calendar,
  CreditCard,
  CheckCircle,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import type { StaffDisplay, SessionPayload } from '@/lib/types'

// 自動割り当てされたスタッフ用の型
type AutoAssignedStaff = StaffDisplay & {
  isAutoAssigned: boolean
  extraCharge: number
}
import { Separator } from '@/components/ui/separator'
import { Questionnaire } from './_components/Questionnaire'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ModeToggle } from '@/components/common'
import { PaymentMethod, ReservationStatus } from '@/convex/types'
import type { TimeRange } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useQuery } from 'convex/react'
import { RowType } from '@/services/supabase/SupabaseService'
import { useAnalytics } from '@/hooks/useAnalytics'
import { requestSalonReservationNotification } from '@/services/line/requestSalonReservationNotification'

// 曜日をソートするための順序を定義
const dayOrder: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7, // 日曜日を最後にする場合は 7, 最初にする場合は 0
}

// 予約ステップの定義
type ReservationStep = 'menu' | 'staff' | 'option' | 'date' | 'payment' | 'confirm'

// 電話番号バリデーション関数
const isValidPhoneNumber = (phone: string | null): boolean => {
  if (!phone) return false
  // ハイフンあり・なし両対応の簡易的なバリデーション
  const phoneRegex = /^\d{2,4}-?\d{2,4}-?\d{3,4}$/
  return phoneRegex.test(phone)
}

interface OrganizationCompleteData {
  organization: Doc<'organization'>
  config: Doc<'config'> | null
  reservationConfig: Doc<'reservation_config'> | null
  apiConfig: Doc<'api_config'> | null
}

// 複数選択されたオプションをカウントして配列にする関数を追加
const countOptionOccurrences = (
  options: Doc<'option'>[]
): { id: Id<'option'>; quantity: number; name: string; price: number }[] => {
  const counts = new Map<string, number>()

  options.forEach((option) => {
    counts.set(option._id, (counts.get(option._id) || 0) + 1)
  })

  return Array.from(counts.entries()).map(([optionId, quantity]) => ({
    id: optionId as Id<'option'>,
    quantity,
    name: options.find((opt) => opt._id === optionId)?.name ?? '不明',
    price: options.find((opt) => opt._id === optionId)?.sale_price ?? 0,
  }))
}

// 同じオプションをグループ化する関数を追加
const groupOptionsByName = (options: Doc<'option'>[]) => {
  const groupedOptions = new Map<
    string,
    { name: string; count: number; unitPrice: number; salePrice?: number }
  >()

  options.forEach((option) => {
    if (groupedOptions.has(option._id)) {
      const current = groupedOptions.get(option._id)!
      groupedOptions.set(option._id, {
        ...current,
        count: current.count + 1,
      })
    } else {
      groupedOptions.set(option._id, {
        name: option.name,
        count: 1,
        unitPrice: option.unit_price ?? 0,
        salePrice: option.sale_price,
      })
    }
  })

  return Array.from(groupedOptions.values())
}

export default function CalendarPage() {
  const router = useRouter()
  const params = useParams()
  const orgId = params.id as Id<'organization'>
  const { showErrorToast } = useErrorHandler()
  const { trackConversion } = useAnalytics()
  const [planName, setPlanName] = useState<SubscriptionPlanName>('UNKNOWN')

  // ユーティリティ関数: 自動割り当てスタッフかどうかをチェック
  const isAutoAssignedStaff = (staff: StaffDisplay | 'free' | null | undefined): boolean => {
    return (
      staff !== null &&
      staff !== undefined &&
      staff !== 'free' &&
      typeof staff === 'object' &&
      'isAutoAssigned' in staff &&
      staff.isAutoAssigned === true
    )
  }
  // STATES
  const customerRepository = useMemo(() => new CustomerRepository(), [])

  const [sessionCustomer, setSessionCustomer] = useState<SessionPayload | null>(null)
  const [customerPhone, setCustomerPhone] = useState<string | null>(null)
  const [customerData, setCustomerData] = useState<{
    customer: RowType<'customer'> | null
    customerDetail: RowType<'customer_detail'> | null
    customerPoints: RowType<'customer_points'> | null
  } | null>(null)
  const [notes, setNotes] = useState<string>('')
  const [isPhoneValid, setIsPhoneValid] = useState(false) // 電話番号の有効性ステート
  const [organizationComplete, setOrganizationComplete] = useState<OrganizationCompleteData | null>(
    null
  )
  const [selectedMenus, setSelectedMenus] = useState<Doc<'menu'>[]>([])
  const [selectedStaffCompleted, setSelectedStaffCompleted] = useState<{
    staff: StaffDisplay | 'free' | null
  } | null>(null)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<Doc<'option'>[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<TimeRange | null>(null)
  const [reservationStartDateTime, setReservationStartDateTime] = useState<Date | null>(null)
  const [reservationEndDateTime, setReservationEndDateTime] = useState<Date | null>(null)
  const [currentStep, setCurrentStep] = useState<ReservationStep>('menu')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)
  const [appliedDiscount, setAppliedDiscount] = useState<{
    discount: number
    couponId: Id<'coupon'> | null
    couponName?: string
  }>({ discount: 0, couponId: null })
  const [usePoints, setUsePoints] = useState<number>(0)
  const [availablePoints, setAvailablePoints] = useState<number>(0)
  const [direction, setDirection] = useState(0) // アニメーションの方向を制御
  const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(false)
  const [questionnaireStep, setQuestionnaireStep] = useState(1)
  const [isLogout, setIsLogout] = useState(false)
  const totalSteps = 10 // Questionnaireと合わせる
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [isCreatingCheckoutSession, setIsCreatingCheckoutSession] = useState(false) // 追加
  const [isSalonInfoSheetOpen, setIsSalonInfoSheetOpen] = useState(false)

  // bottomBar高さ測定用のrefとstate
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const [bottomBarHeight, setBottomBarHeight] = useState<number>(0)

  // Convex queries
  const orgWeekSchedule = useQuery(
    api.organization.week_schedule.query.getAllByTenantAndOrg,
    sessionCustomer?.tenantId && sessionCustomer.orgId
      ? {
          tenant_id: sessionCustomer.tenantId,
          org_id: sessionCustomer.orgId,
        }
      : 'skip'
  )

  const pointConfig = useQuery(
    api.point.query.findByTenantAndOrg,
    sessionCustomer?.tenantId && sessionCustomer.orgId
      ? {
          tenant_id: sessionCustomer.tenantId,
          org_id: sessionCustomer.orgId,
        }
      : 'skip'
  )
  // Convex mutations

  // ステップ変更時に画面トップへ自動スクロール
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [currentStep])

  // bottomBarの高さを測定してpadding-bottomに予約
  useEffect(() => {
    if (bottomBarRef.current) {
      setBottomBarHeight(bottomBarRef.current.offsetHeight)
    }
  }, [selectedMenus, selectedStaffCompleted, selectedOptions])

  // 割引額を再計算するuseEffect
  useEffect(() => {
    const recalculateDiscount = async () => {
      if (!appliedDiscount.couponId) {
        // クーポンが選択されていない場合は割引を0に
        if (appliedDiscount.discount !== 0) {
          setAppliedDiscount((prev) => ({ ...prev, discount: 0 }))
        }
        return
      }

      // メニューが選択されていない場合は、割引額の計算をスキップ（ただしIDは保持）
      if (selectedMenus.length === 0) {
        return
      }

      const coupon = await fetchQuery(api.coupon.query.findById, {
        coupon_id: appliedDiscount.couponId,
      })
      if (!coupon || !organizationComplete) return

      const exclusionMenus = await fetchQuery(api.coupon.exclusion_menu.query.list, {
        tenant_id: organizationComplete.organization.tenant_id as Id<'tenant'>,
        org_id: organizationComplete.organization._id as Id<'organization'>,
        coupon_id: coupon._id,
      })

      const applicableMenus = selectedMenus.filter(
        (menu) => !exclusionMenus.some((em) => em.menu_id === menu._id)
      )

      if (applicableMenus.length === 0) {
        if (appliedDiscount.discount !== 0) {
          setAppliedDiscount((prev) => ({ ...prev, discount: 0 }))
        }
        toast.info(`選択されたクーポン「${coupon.name}」は、選択中のメニューには適用できません。`)
        return
      }

      // 適用外メニューがある場合は自動で選択解除
      const excludedMenus = selectedMenus.filter(
        (menu) => !applicableMenus.some((applicable) => applicable._id === menu._id)
      )
      if (excludedMenus.length > 0) {
        const remainingMenus = selectedMenus.filter((menu) =>
          applicableMenus.some((applicable) => applicable._id === menu._id)
        )
        setSelectedMenus(remainingMenus)
        toast.warning(
          `クーポン「${coupon.name}」に適用できない${excludedMenus.length}件のメニューが選択から外されました。`
        )
      }

      const applicableTotal = applicableMenus.reduce(
        (total, menu) => total + (menu.sale_price ?? menu.unit_price ?? 0),
        0
      )
      let newDiscount = 0
      if (coupon.discount_type === 'percentage') {
        newDiscount = Math.floor((applicableTotal * (coupon.percentage_discount_value ?? 0)) / 100)
      } else {
        newDiscount = coupon.fixed_discount_value ?? 0
      }

      if (appliedDiscount.discount !== newDiscount) {
        setAppliedDiscount((prev) => ({ ...prev, discount: newDiscount }))
      }
    }

    recalculateDiscount()
  }, [
    selectedMenus,
    appliedDiscount.couponId,
    organizationComplete,
    appliedDiscount.discount,
    showErrorToast,
  ])

  // 次のステップに進む
  const goToNextStep = async () => {
    // メニュー選択ステップでクーポンが選択されている場合のバリデーション
    if (currentStep === 'menu' && appliedDiscount.couponId && organizationComplete) {
      try {
        // クーポン適用外メニューがないかチェック
        const exclusionMenus = await fetchQuery(api.coupon.exclusion_menu.query.list, {
          tenant_id: organizationComplete.organization.tenant_id as Id<'tenant'>,
          org_id: organizationComplete.organization._id as Id<'organization'>,
          coupon_id: appliedDiscount.couponId,
        })

        const hasExcludedMenus = selectedMenus.some((menu) =>
          exclusionMenus.some((em) => em.menu_id === menu._id)
        )

        if (hasExcludedMenus) {
          toast.error(
            '選択中のクーポンでは利用できないメニューがあります。メニューの選択を確認してください。'
          )
          return
        }
      } catch (error) {
        console.error('クーポン適用チェックでエラーが発生しました:', error)
        toast.error('クーポンの確認中にエラーが発生しました。')
        return
      }
    }

    setDirection(1) // 前進方向を設定
    switch (currentStep) {
      case 'menu':
        setCurrentStep('staff')
        break
      case 'staff':
        setCurrentStep('option')
        break
      case 'option':
        setCurrentStep('date')
        break
      case 'date':
        setCurrentStep('payment')
        if (selectedStaffCompleted?.staff === 'free' && organizationComplete && selectedDate) {
          try {
            if (!selectedTime) {
              toast.error('予約時間を選択してください。')
              return
            }
            const startDateTime = new Date(selectedDate)
            const [sh, sm] = selectedTime.startHour.split(':').map(Number)
            startDateTime.setHours(sh, sm, 0, 0)

            const assignedStaff = await fetchQuery(
              api.reservation.query.calculateIntegratedAvailableTimes,
              {
                tenant_id: organizationComplete.organization.tenant_id as Id<'tenant'>,
                org_id: organizationComplete.organization._id as Id<'organization'>,
                menu_ids: selectedMenus.map((menu) => menu._id),
                date: format(selectedDate, 'yyyy-MM-dd'),
                option_ids: selectedOptions.map((option) => option._id),
              }
            )

            console.log('assignedStaff', assignedStaff)

            if (assignedStaff) {
              // スタッフが自動割り当てされた場合も、顧客側表示は「指名フリー」として保持
              // 内部的にスタッフ情報を保存するため、selectedStaffCompletedには特別なフラグをつける
              setSelectedStaffCompleted({
                staff: {
                  _id: assignedStaff.timeSlots[0].availableStaffs[0].id,
                  name: assignedStaff.timeSlots[0].availableStaffs[0].name,
                  priority: assignedStaff.timeSlots[0].availableStaffs[0].priority,
                  extraCharge: assignedStaff.timeSlots[0].availableStaffs[0].extra_charge ?? 0,
                  isAutoAssigned: true, // 自動割り当てフラグ
                } as AutoAssignedStaff,
              })
              console.log('assignedStaff', assignedStaff)
            } else {
              toast.error(
                'この時間帯に対応可能なスタッフが見つかりませんでした。他の時間をお選びください。'
              )
              // 時間選択をリセット
              setSelectedTime(null)
              setReservationStartDateTime(null)
              setReservationEndDateTime(null)
            }
          } catch (error) {
            console.error('スタッフ自動割り当てエラー:', error)
            toast.error('スタッフの割り当てに失敗しました。他の時間をお選びください。')
            // 時間選択をリセット
            setSelectedTime(null)
            setReservationStartDateTime(null)
            setReservationEndDateTime(null)
          }
        }
        break
      case 'payment':
        setCurrentStep('confirm')
        break
      case 'confirm':
        // 予約完了処理
        console.log('予約完了')
        break
    }
  }

  // 前のステップに戻る
  const goToPreviousStep = () => {
    setDirection(-1) // 後退方向を設定
    switch (currentStep) {
      case 'menu':
        // 最初のステップなので何もしない
        return
      case 'staff':
        setCurrentStep('menu')
        // スタッフの選択をクリア
        setSelectedStaffCompleted(null)
        break
      case 'option':
        setCurrentStep('staff')
        // オプションの選択をクリア
        setSelectedOptions([])
        break
      case 'date':
        setCurrentStep('option')
        // 日付の選択をクリア
        setSelectedDate(null)
        setSelectedTime(null)
        setReservationStartDateTime(null)
        setReservationEndDateTime(null)
        // 指名フリーで自動割り当てされたスタッフをリセット
        if (selectedStaffCompleted?.staff && isAutoAssignedStaff(selectedStaffCompleted.staff)) {
          setSelectedStaffCompleted({ staff: 'free' })
        }
        break
      case 'payment':
        setCurrentStep('date')
        setSelectedPaymentMethod(null)
        break
      case 'confirm':
        setCurrentStep('payment')
        // ポイント使用をクリア
        setUsePoints(0)
        break
    }
  }

  const handleShowLogoutDialog = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setShowLogoutDialog(true)
  }

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsLogout(true)

    try {
      // 1) LINEトークン（HttpOnly）をサーバー側でクリア
      try {
        await fetch('/api/auth/line/refresh', { method: 'DELETE', credentials: 'include' })
      } catch (lineClearError) {
        console.warn('Failed to clear LINE tokens (non-fatal):', lineClearError)
      }

      // 2) アプリのセッション（bocker_login_session）をサーバー側で削除
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })

      // 3) クライアントサイドの完全ログアウト（LIFF等）
      performCompleteLogout()

      toast.success('ログアウトしました。')

      // 少し待ってからリダイレクト
      setTimeout(() => {
        router.push(`/reservation/${orgId}`)
      }, 100)
    } catch (error) {
      console.error('Logout error:', error)
      // エラーでも完全ログアウトは実行
      performCompleteLogout()
      router.push(`/reservation/${orgId}`)
    }

    setIsLogout(false)
  }

  // クレジットカード決済処理を共通化
  const processCreditCardPayment = async (): Promise<string | null> => {
    if (
      !sessionCustomer ||
      !organizationComplete?.organization?._id ||
      !selectedStaffCompleted?.staff ||
      !reservationStartDateTime ||
      !reservationEndDateTime
    ) {
      console.error('予約に必要な情報が不足しています。')
      toast.error('予約に必要な情報が不足しています。選択内容をご確認ください。')
      return null
    }

    // 指名フリーの場合のスタッフ情報設定
    const isAutoAssigned =
      selectedStaffCompleted.staff !== 'free' &&
      'isAutoAssigned' in selectedStaffCompleted.staff &&
      selectedStaffCompleted.staff.isAutoAssigned

    const staffData =
      selectedStaffCompleted.staff === 'free'
        ? {
            staff_id: undefined as Id<'staff'> | undefined,
            staff_name: undefined as string | undefined,
            is_free_nomination: true,
          }
        : isAutoAssigned
          ? {
              // 自動割り当てされたスタッフ（元はフリー指名）
              staff_id: selectedStaffCompleted.staff._id as Id<'staff'>,
              staff_name: selectedStaffCompleted.staff.name ?? '不明',
              is_free_nomination: true, // フリー指名として扱う
            }
          : {
              // 通常の指名予約
              staff_id: selectedStaffCompleted.staff._id as Id<'staff'>,
              staff_name: selectedStaffCompleted.staff.name ?? '不明',
              is_free_nomination: false,
            }

    try {
      // 予約データを準備 (status: 'pending' で作成)
      const reservationData = {
        tenant_id: sessionCustomer.tenantId,
        org_id: organizationComplete.organization._id as Id<'organization'>,
        customer_uid: sessionCustomer.customerUid,
        ...staffData,
        customer_name:
          sessionCustomer.customerName ??
          sessionCustomer.email ??
          sessionCustomer.lineUserName ??
          '不明',
        status: 'pending' as ReservationStatus,
        date: selectedDate ? formatDateToYYYYMMDD(selectedDate) : '',
        start_time_unix: reservationStartDateTime.getTime(),
        end_time_unix: reservationEndDateTime.getTime(),
        total_price: calculateTotal(), // 表示・保存用の最終合計金額
        coupon_id: appliedDiscount.couponId ?? undefined,
        payment_method: 'credit_card' as PaymentMethod,
        stripe_checkout_session_id: undefined,
        payment_status: 'pending' as ReservationPaymentStatus,
        menus: selectedMenus.map((menu) => ({
          id: menu._id,
          name: menu.name,
          price: menu.sale_price || menu.unit_price || 0,
          quantity: 1,
        })),
        options: countOptionOccurrences(selectedOptions),
        extra_charge:
          selectedStaffCompleted.staff === 'free' ||
          isAutoAssignedStaff(selectedStaffCompleted.staff)
            ? 0
            : 'extraCharge' in selectedStaffCompleted.staff
              ? (selectedStaffCompleted.staff as AutoAssignedStaff).extraCharge || 0
              : selectedStaffCompleted.staff.extra_charge || 0,
        use_points: usePoints,
        coupon_discount: appliedDiscount.discount || undefined,
        featured_hair_images: [],
        notes: notes,
        pending_duration_minutes: 30, // 30分の有効期限
      }

      // 1. Convexに予約データを'pending'ステータスで作成
      let result: {
        reservationId: Id<'reservation'>
        status?: ReservationStatus
        payment_method?: PaymentMethod
        checkout_url?: string
      } | null = null
      try {
        result = await createCustomerReservation(reservationData)
      } catch (error) {
        // 重複予約エラーの場合
        const errorData = error as {
          data?: {
            code?: string
            statusCode?: number
            severity?: string
            callFunc?: string
            message?: string
          }
        }
        if (errorData?.data?.code === 'CONFLICT' || errorData?.data?.statusCode === 409) {
          toast.error(
            '申し訳ございません。選択された時間帯は既に予約済みです。別の時間帯を選択してください。'
          )

          // 日時選択ステップに戻る（空き時間は自動的に再取得される）
          setCurrentStep('date')
          return null
        }

        // その他のエラー
        throw error
      }

      if (!result?.reservationId) {
        throw new Error('予約の作成に失敗しました。')
      }

      const reservationId = result.reservationId

      // 2. Stripe Checkoutセッションを作成するためのlineItemsを準備
      // 各アイテムの unit_amount には、独自システムで計算した割引適用後の価格を設定する

      const totalDiscountAmount = (appliedDiscount.discount || 0) + (usePoints || 0)

      const lineItemsRaw = [
        ...selectedMenus.map((menu) => ({
          name: menu.name,
          originalPrice: menu.sale_price || menu.unit_price || 0,
          type: 'menu' as const,
        })),
        ...countOptionOccurrences(selectedOptions).map(({ id, quantity }) => {
          const option = selectedOptions.find((opt) => opt._id === id)
          return {
            name: option?.name || 'オプション',
            originalPrice:
              (option?.sale_price ? option.sale_price : (option?.unit_price ?? 0)) * quantity,
            type: 'option' as const,
            quantity, // オプションの場合、quantityはここで考慮済みなので按分後の価格計算では使わない
          }
        }),
        ...(selectedStaffCompleted?.staff !== 'free' &&
        selectedStaffCompleted?.staff?.extra_charge &&
        selectedStaffCompleted.staff.extra_charge > 0
          ? [
              {
                name: '指名料',
                originalPrice: selectedStaffCompleted.staff.extra_charge,
                type: 'staff_charge' as const,
              },
            ]
          : []),
      ]

      const subtotalBeforeDiscount = lineItemsRaw.reduce((sum, item) => sum + item.originalPrice, 0)

      const stripeLineItems = lineItemsRaw
        .map((item) => {
          let discountedPrice = item.originalPrice
          if (totalDiscountAmount > 0 && subtotalBeforeDiscount > 0) {
            const itemDiscountShare =
              (item.originalPrice / subtotalBeforeDiscount) * totalDiscountAmount
            discountedPrice = Math.max(0, item.originalPrice - itemDiscountShare) // 価格がマイナスにならないように
          }
          // Stripeのunit_amountは整数である必要があるため、四捨五入または切り捨て/切り上げ
          // JPYの場合、Stripeは最小通貨単位（円）で扱うので、小数点以下は通常不要
          const finalAmount = Math.round(discountedPrice)

          return {
            price_data: {
              currency: 'jpy',
              product_data: { name: item.name },
              // オプションの場合、originalPriceが既にquantityを考慮しているので、
              // unit_amountには按分後の価格をそのまま設定（Stripe側でquantity=1で扱わせる）
              // ただし、元のcheckoutOptionsの構造と合わせるため、ここではitemがもつquantityで割るか、
              // lineItemsRaw作成時にオプションのoriginalPriceを単価にし、ここでquantityを渡すか検討が必要
              // 今回は、オプションも単一アイテムとして扱い、quantityは1でStripeに渡す想定で進める
              // そのため、countOptionOccurrencesで集約されたオプションは、Stripe上では1つのラインアイテムになる
              unit_amount: finalAmount,
            },
            quantity: item.type === 'option' && item.quantity ? item.quantity : 1, // オプションの場合のみ元の数量をStripeに渡す
          }
        })
        .filter(
          (item) =>
            item.price_data.unit_amount > 0 ||
            (item.price_data.unit_amount === 0 &&
              item.quantity > 0 &&
              subtotalBeforeDiscount === totalDiscountAmount)
        )
      // 全額割引の場合など、0円のアイテムも送信する必要がある場合がある。
      // Stripeは0円のラインアイテムを許可するが、最低支払額（JPYで50円）には注意。
      // ここでは、0円でも数量があれば送信し、そうでなければフィルタリング。
      // ただし、合計がStripeの最低金額を下回る場合はエラーになる。
      // もし合計が0円の場合は、Stripe Checkoutではなく別の処理（無料予約完了など）を検討する必要がある。

      // Stripeに渡す最終的なラインアイテムの合計金額を計算 (デバッグ用)
      const totalAmountForStripe = stripeLineItems.reduce(
        (sum, item) => sum + item.price_data.unit_amount * item.quantity,
        0
      )
      console.log('Total amount for Stripe:', totalAmountForStripe)
      if (totalAmountForStripe < 50 && totalAmountForStripe > 0) {
        console.warn('Stripeに渡す合計金額が50円未満です。Stripe側でエラーになる可能性があります。')
      }
      if (totalAmountForStripe === 0 && subtotalBeforeDiscount > 0) {
        // 全額割引で実質0円の場合の処理 (例: Stripe Checkoutをスキップして予約を予約受付(confirmed)ステータスに変更する)
        // このシナリオは別途設計が必要
        console.log('合計金額が0円のため、Stripe Checkoutはスキップします。')
        // ここで予約ステータスを 'confirmed' に更新し、完了ページへリダイレクトするなどの処理を行う。
        // handleConfirmReservation の現金払いと同様のロジックを参考に実装できる。
        // 今回は processCreditCardPayment のスコープ外として、エラーを投げるか、
        // 何もしないで return null するかなどを検討。
        // ここでは一旦、エラーとして処理を進めないようにする。
        toast.error(
          '合計金額が0円になるため、クレジットカード決済はご利用いただけません。別の決済方法を選択するか、お問い合わせください。'
        )
        return null // またはエラーをスロー
      }

      // 3. バックエンドAPIを呼び出してStripe Checkoutセッションを作成
      const requestBody = {
        stripeConnectId: organizationComplete.organization.stripe_account_id,
        reservationId,
        tenantId: sessionCustomer.tenantId,
        orgId,
        customerEmail: sessionCustomer.email,
        lineItems: stripeLineItems,
        couponId: appliedDiscount.couponId ?? undefined,
        pointsUsedAmount: usePoints,
      }
      console.log(
        'Request body for /api/stripe/connect/checkout:',
        JSON.stringify(requestBody, null, 2)
      )

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Stripe Checkoutセッションの作成に失敗しました。')
      }

      const responseData = await response.json()
      const checkoutUrl = responseData.checkoutUrl

      if (checkoutUrl) {
        return checkoutUrl
      } else {
        throw new Error('Checkout URLが取得できませんでした。')
      }
    } catch (error) {
      showErrorToast(error)
      return null
    }
  }

  console.log('#### selectedStaffCompleted: ', selectedStaffCompleted)

  const handleConfirmReservation = async () => {
    if (
      !sessionCustomer ||
      !organizationComplete?.organization?._id ||
      !selectedStaffCompleted?.staff ||
      !reservationStartDateTime ||
      !reservationEndDateTime ||
      !selectedPaymentMethod
    ) {
      console.error('予約に必要な情報が不足しています。')
      alert('予約に必要な情報が不足しています。選択内容をご確認ください。')
      return
    }

    // 指名フリーの場合のスタッフ情報設定
    const isAutoAssigned =
      selectedStaffCompleted.staff !== 'free' &&
      selectedStaffCompleted.staff !== null &&
      typeof selectedStaffCompleted.staff === 'object' &&
      'isAutoAssigned' in selectedStaffCompleted.staff &&
      selectedStaffCompleted.staff.isAutoAssigned

    const staffData =
      selectedStaffCompleted.staff === 'free'
        ? { staff_id: undefined, staff_name: undefined, is_free_nomination: true }
        : isAutoAssigned
          ? {
              // 自動割り当てされたスタッフ（元はフリー指名）
              staff_id: selectedStaffCompleted.staff._id as Id<'staff'>,
              staff_name: selectedStaffCompleted.staff.name ?? '不明',
              is_free_nomination: true, // フリー指名として扱う
            }
          : {
              // 通常の指名予約
              staff_id: selectedStaffCompleted.staff._id as Id<'staff'>,
              staff_name: selectedStaffCompleted.staff.name ?? '不明',
              is_free_nomination: false,
            }

    setIsProcessingPayment(true)

    try {
      // 顧客情報を更新（電話番号, email）
      if (customerData?.customer) {
        const updatedCustomerData = {
          phone: customerPhone || customerData.customer.phone,
          email: customerData.customer.email,
          line_id: customerData.customer.line_id,
          line_user_name: customerData.customer.line_user_name,
        }

        try {
          await customerRepository.updateCustomer(
            customerData.customer.uid,
            sessionCustomer.tenantId,
            organizationComplete.organization._id as Id<'organization'>,
            updatedCustomerData
          )
          console.log('顧客情報を更新しました')
        } catch (error) {
          console.error('顧客情報の更新に失敗しました:', error)
          // エラーでも予約処理は継続
        }
      }

      // ポイント減算は予約作成時のaction側で実行するため、フロントエンドでは事前チェックのみ
      if (usePoints > 0) {
        // 保有ポイント不足チェック（念のため）
        if (usePoints > availablePoints) {
          setIsProcessingPayment(false)
          throw new Error(`保有ポイント（${availablePoints}P）が不足しています。`)
        }
        console.log(`ポイント利用予定: ${usePoints}ポイント (action側で減算実行)`)
      }

      const customerName =
        sessionCustomer.customerName ??
        sessionCustomer.email ??
        sessionCustomer.lineUserName ??
        '不明'
      // 予約データを準備 (handleConfirmReservation内ではstatusをまだ設定しない)
      const reservationBaseData = {
        org_id: organizationComplete.organization._id as Id<'organization'>,
        tenant_id: sessionCustomer.tenantId,
        customer_uid: sessionCustomer.customerUid,
        ...staffData,
        customer_name: customerName,
        status: 'confirmed' as ReservationStatus,
        date: selectedDate ? formatDateToYYYYMMDD(selectedDate) : '',
        start_time_unix: reservationStartDateTime.getTime(),
        end_time_unix: reservationEndDateTime.getTime(),
        total_price: calculateTotal(), // 表示・保存用の最終合計金額
        coupon_id: appliedDiscount.couponId ?? undefined,
        payment_method: selectedPaymentMethod,
        stripe_checkout_session_id: undefined,
        payment_status: 'pending' as ReservationPaymentStatus,
        menus: selectedMenus.map((menu) => ({
          id: menu._id,
          name: menu.name,
          price: menu.sale_price || menu.unit_price || 0,
          quantity: 1,
        })),
        options: countOptionOccurrences(selectedOptions),
        extra_charge:
          selectedStaffCompleted.staff === 'free' ||
          isAutoAssignedStaff(selectedStaffCompleted.staff)
            ? 0
            : 'extraCharge' in selectedStaffCompleted.staff
              ? (selectedStaffCompleted.staff as AutoAssignedStaff).extraCharge || 0
              : selectedStaffCompleted.staff.extra_charge || 0,
        use_points: usePoints,
        coupon_discount: appliedDiscount.discount || undefined,
        featured_hair_images: [],
        notes: notes,
      }

      if (selectedPaymentMethod === 'credit_card') {
        const checkoutUrl = await processCreditCardPayment()
        if (checkoutUrl) {
          router.push(checkoutUrl)
          // リダイレクト後はこのページの操作は不要なため、isProcessingPaymentの解除はしない
        } else {
          // 決済処理失敗
          setIsProcessingPayment(false)
        }
      } else if (selectedPaymentMethod === 'cash') {
        // 1. Convexに予約データを'confirmed'ステータスで作成（現金決済は予約を確定する）
        const reservationDataForCash = {
          ...reservationBaseData,
          status: 'confirmed' as ReservationStatus,
        }

        const result = await createCustomerReservation(reservationDataForCash)

        if (!result?.reservationId) {
          throw new Error('予約の作成に失敗しました。')
        }

        const reservationId = result.reservationId

        // Track conversion event
        trackConversion('reservation', {
          payment_method: 'cash',
          total_price: calculateTotal(),
          reservation_id: reservationId,
        })

        // 店舗通知は顧客向けLINE/メールの有無や送信結果に依存させない
        try {
          await requestSalonReservationNotification({
            tenantId: sessionCustomer.tenantId,
            organizationId: organizationComplete.organization._id,
            reservationId,
          })
        } catch (salonNotificationError) {
          console.warn('サロン通知の送信に失敗しました:', salonNotificationError)
          // サロン通知の失敗は顧客の予約処理をブロックしない
        }

        try {
          const response = await fetch('/api/line/flex-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reservationId }),
          })
          const notification = await response.json()
          if (!response.ok || notification.success !== true) {
            throw new Error('予約確認通知を送信できませんでした')
          }
        } catch {
          toast.error('通知を送信できませんでしたが、予約は受け付けました。')
        }
        toast.success(
          '予約を受け付けました。'
        )
        router.push(
          `/reservation/${organizationComplete.organization._id}/calendar/complete?reservationId=${reservationId}`
        )
      }
    } catch (error) {
      showErrorToast(error)
      setIsProcessingPayment(false)
    }
  }

  // USE EFFECT
  useEffect(() => {
    // JWT Cookieからセッション情報を取得
    const fetchSession = async () => {
      try {
        setIsLoading(true)

        // 組織情報を取得して、テナントIDを設定
        const orgData = await fetchQuery(api.organization.query.findByOrgId, {
          org_id: orgId,
        })

        if (!orgData) {
          console.error('組織情報が見つかりません')
          setTimeout(() => {
            router.push('/reservation')
          }, 100)
          return
        }

        // セッションチェック（tenant_idとorg_idを含める）+ credentials修正
        const response = await fetch(
          `/api/auth/session?tenantId=${encodeURIComponent(orgData.tenant_id)}&orgId=${encodeURIComponent(orgId)}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache',
            },
          }
        )

        if (!response.ok) {
          console.error('認証セッションが見つかりません。完全ログアウト後、予約画面に戻ります。')

          // 完全ログアウト実行
          performCompleteLogout()

          // setTimeoutでナビゲーションを遅延実行（React setState during renderエラーを防ぐ）
          setTimeout(() => {
            router.push(`/reservation/${orgId}`)
          }, 100)

          return
        }

        const data = await response.json()

        if (data.session) {
          // Handle backward compatibility: if 'name' exists but 'customerName' doesn't, use 'name'
          const session = data.session
          const legacySession = session as SessionPayload & { name?: string }
          if (legacySession.name && !session.customerName) {
            session.customerName = legacySession.name
            console.log('[Calendar] Migrated old session format: name -> customerName')
          }
          setSessionCustomer(session)
          try {
            const organizationComplete = await fetchQuery(api.organization.query.getRelations, {
              tenant_id: data.session.tenantId,
              org_id: data.session.orgId,
            })

            setOrganizationComplete(organizationComplete)

            try {
              const subscription = await fetchQuery(
                api.tenant.subscription.query.getSubscription,
                {
                  tenant_id: data.session.tenantId,
                }
              )
              const derivedPlanName = (subscription?.plan_name ?? 'UNKNOWN') as SubscriptionPlanName
              setPlanName(derivedPlanName)
            } catch (subscriptionError) {
              console.error('サブスクリプション情報の取得に失敗しました:', subscriptionError)
              setPlanName('UNKNOWN')
            }

            const { customer, customerDetail, customerPoints } =
              await customerRepository.getCompleteCustomerData(
                data.session.customerUid,
                data.session.tenantId,
                organizationComplete.organization._id
              )

            setCustomerData({
              customer,
              customerDetail,
              customerPoints,
            })

            setAvailablePoints(customerPoints?.total_points || 0)
            setCustomerPhone(customer?.phone || null)
            setIsPhoneValid(isValidPhoneNumber(customer?.phone || null))
          } catch (error) {
            console.error('サロン情報の取得に失敗しました:', error)
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
            toast.error('サロン情報の取得に失敗しました。サロンが削除されている可能性があります。')
            setOrganizationComplete(null)
          }
        } else {
          setTimeout(() => {
            router.push('/reservation')
          }, 100)
        }
      } catch (error) {
        console.error('セッション取得中にエラーが発生しました:', error)
        setTimeout(() => {
          router.push(`/reservation/${orgId}`)
        }, 100)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSession()
  }, [router, orgId, customerRepository]) // Remove dynamic sessionCustomer?.orgId dependency

  console.log('#### sessionCustomer: ', sessionCustomer)

  // 組織情報が読み込まれていない場合のリダイレクト処理を useEffect で行う
  useEffect(() => {
    if (!organizationComplete && !isLoading && sessionCustomer) {
      // Use a stable reference to avoid conditional navigation
      const redirectPath = sessionCustomer.orgId
        ? `/reservation/${sessionCustomer.orgId}`
        : '/reservation'

      setTimeout(() => {
        router.push(redirectPath)
      }, 100)
    }
  }, [organizationComplete, isLoading, sessionCustomer, router]) // Use sessionCustomer object, not property

  if (isLoading) return <Loading />

  if (!organizationComplete) {
    return <Loading />
  }

  // 合計金額の計算
  const calculateTotal = () => {
    // メニュー価格の合計
    const menuTotal = selectedMenus.reduce(
      (sum, menu) => sum + (menu.sale_price || menu.unit_price || 0),
      0
    )

    // オプション価格の合計（複数選択を考慮）
    const optionTotal = selectedOptions.reduce(
      (sum, option) => sum + (option.sale_price ? option.sale_price : (option.unit_price ?? 0)),
      0
    )

    // 指名料（指名フリーの場合は0、自動割り当ての場合も0として表示）
    const extraChargeTotal =
      selectedStaffCompleted?.staff === 'free' || isAutoAssignedStaff(selectedStaffCompleted?.staff)
        ? 0
        : selectedStaffCompleted?.staff?.extra_charge || 0

    // 割引額（クーポン割引は appliedDiscount.discount で既に適用可能メニューのみから計算済み）
    const discount = appliedDiscount.discount + usePoints

    const total = menuTotal + optionTotal + extraChargeTotal - discount

    // 合計金額が負の値にならないようにする
    return Math.max(0, total)
  }

  const calculateTotalMinutes = () => {
    // メニュー時間の合計
    const menuMinutes = selectedMenus.reduce((sum, menu) => {
      return sum + (menu.duration_min || 0)
    }, 0)

    // オプション時間の合計（複数選択を考慮）
    const optionMinutes = selectedOptions.reduce((sum, option) => {
      return sum + (option.duration_min || 0)
    }, 0)

    return menuMinutes + optionMinutes
  }

  // ステップインジケーターのレンダリング
  const renderStepIndicator = () => {
    const steps = [
      {
        key: 'menu',
        label: 'メニュー',
        icon: ShoppingCart,
        color: 'bg-chart-1 text-background',
      },
      {
        key: 'staff',
        label: 'スタッフ',
        icon: User2,
        color: 'bg-chart-2 text-background',
      },
      {
        key: 'option',
        label: 'オプション',
        icon: Settings,
        color: 'bg-chart-3 text-background',
      },
      {
        key: 'date',
        label: '日時',
        icon: Calendar,
        color: 'bg-chart-4 text-background',
      },
      {
        key: 'payment',
        label: '決済',
        icon: CreditCard,
        color: 'bg-chart-5 text-background',
      },
      {
        key: 'confirm',
        label: '確認',
        icon: CheckCircle,
        color: 'bg-accent-2 text-background',
      },
    ]

    return (
      <div className="relative mb-4 w-full max-w-3xl mx-auto">
        {/* ② ステップ丸要素群 */}
        <div className="relative grid grid-cols-6 gap-2">
          {steps.map((step, index) => {
            const isActive = currentStep === step.key
            const isCompleted = index < steps.findIndex((s) => s.key === currentStep)
            return (
              <div key={step.key} className="flex flex-col items-center">
                <motion.div
                  className={`
                    z-10 w-8 h-8 rounded-full flex items-center justify-center
                    ${
                      isActive
                        ? `${step.color}`
                        : isCompleted
                          ? `bg-background border border-accent-2 text-accent-2`
                          : 'bg-background border border-muted-foreground text-muted-foreground'
                    }
                  `}
                  /* アニメーションもここでお好みで */
                >
                  {isCompleted ? <Check size={18} /> : <step.icon size={18} />}
                </motion.div>
                <span
                  className={`tracking-wide text-xs text-nowrap scale-75 ${isActive ? 'font-bold' : 'text-muted-foreground'}`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 現在のステップに応じたコンテンツのレンダリング
  const renderStepContent = () => {
    return (
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          initial="initial"
          animate="animate"
          exit="exit"
          className="w-full max-w-3xl mx-auto"
        >
          {(() => {
            switch (currentStep) {
              case 'menu':
                return (
                  <div>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <CouponMenuView
                        tenantId={organizationComplete.organization.tenant_id as Id<'tenant'>}
                        orgId={organizationComplete.organization._id as Id<'organization'>}
                        planName={planName as SubscriptionPlanName}
                        sessionCustomerType={sessionCustomer?.target_type as ActiveCustomerType}
                        onCouponChange={(coupon) => {
                          setAppliedDiscount((prev) => ({
                            ...prev,
                            couponId: coupon?._id || null,
                          }))
                        }}
                        onMenuChange={(menus) => setSelectedMenus(menus)}
                        selectedCoupon={appliedDiscount.couponId}
                        selectedMenus={selectedMenus}
                        appliedDiscount={appliedDiscount.discount}
                        targetType={sessionCustomer?.target_type as ActiveCustomerType}
                        isMultipleSelection={
                          organizationComplete.reservationConfig?.is_multiple_select_category
                        }
                      />
                    </motion.div>

                    <motion.div
                      className="mt-10 flex justify-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                    >
                      <Button
                        onClick={goToNextStep}
                        disabled={selectedMenus.length === 0}
                        className="relative overflow-hidden w-full transition-all duration-200 ease-in-out"
                      >
                        <motion.div
                          className="flex items-center justify-center gap-2"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
                        >
                          次へ進む
                        </motion.div>
                      </Button>
                    </motion.div>
                  </div>
                )
              case 'staff':
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <StaffView
                      tenantId={organizationComplete.organization.tenant_id as Id<'tenant'>}
                      orgId={organizationComplete.organization._id as Id<'organization'>}
                      planName={planName as SubscriptionPlanName}
                      selectedMenuIds={selectedMenus.map((menu) => menu._id)}
                      selectedStaff={selectedStaffCompleted?.staff as Doc<'staff'> | 'free' | null}
                      onChangeStaffAction={(staff) => {
                        if (staff) {
                          setSelectedStaffCompleted({ staff })
                          // 指名フリー選択時は今日の日付を自動選択
                          if (staff === 'free' && !selectedDate) {
                            const today = new Date()
                            setSelectedDate(today)
                          }
                        }
                      }}
                    />
                    <motion.div
                      className="mt-10 flex justify-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Button
                        onClick={goToNextStep}
                        disabled={!selectedStaffCompleted}
                        className="relative overflow-hidden w-full transition-all duration-200 ease-in-out"
                      >
                        <motion.div
                          className="flex items-center justify-center gap-2"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
                        >
                          次へ進む
                        </motion.div>
                      </Button>
                    </motion.div>
                  </motion.div>
                )
              case 'option':
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <OptionView
                      tenantId={organizationComplete.organization.tenant_id as Id<'tenant'>}
                      orgId={organizationComplete.organization._id as Id<'organization'>}
                      planName={planName as SubscriptionPlanName}
                      selectedOptions={selectedOptions}
                      onChangeOptionsAction={(options) => setSelectedOptions(options)}
                    />
                    <motion.div
                      className="mt-10 flex justify-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Button onClick={goToNextStep} className="relative overflow-hidden w-full">
                        <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          次へ進む
                        </motion.span>
                      </Button>
                    </motion.div>
                  </motion.div>
                )
              case 'date':
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <DateView
                      tenantId={organizationComplete.organization.tenant_id as Id<'tenant'>}
                      orgId={organizationComplete.organization._id as Id<'organization'>}
                      selectedDate={selectedDate}
                      selectedStaff={selectedStaffCompleted?.staff as Doc<'staff'> | 'free' | null}
                      selectedTime={selectedTime}
                      totalMinutes={calculateTotalMinutes()}
                      orgPhoneNumber={organizationComplete.config?.phone ?? ''}
                      selectedMenuIds={selectedMenus.map((menu) => menu._id)}
                      selectedOptionIds={selectedOptions.map((option) => option._id)}
                      onChangeDateAction={(date) => {
                        setSelectedDate(date)
                        setSelectedTime(null)
                        setReservationStartDateTime(null)
                        setReservationEndDateTime(null)
                      }}
                      onChangeTimeAction={async (time) => {
                        setSelectedTime(time)
                        console.log('selectedDate', selectedDate)
                        console.log('time', time)
                        if (selectedDate) {
                          const startDateTime = new Date(selectedDate)
                          const [sh, sm] = time.startHour.split(':').map(Number)
                          startDateTime.setHours(sh, sm, 0, 0)
                          const endDateTime = new Date(selectedDate)
                          const [eh, em] = time.endHour.split(':').map(Number)
                          endDateTime.setHours(eh, em, 0, 0)
                          setReservationStartDateTime(startDateTime)
                          setReservationEndDateTime(endDateTime)
                        }
                      }}
                    />
                    <motion.div
                      className="mt-10 flex justify-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Button
                        onClick={goToNextStep}
                        disabled={!reservationStartDateTime || !reservationEndDateTime}
                        className="relative overflow-hidden w-full"
                      >
                        <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          次へ進む
                        </motion.span>
                      </Button>
                    </motion.div>
                  </motion.div>
                )
              case 'payment':
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <PaymentView
                      selectedMenus={selectedMenus}
                      selectedPaymentMethod={selectedPaymentMethod as PaymentMethod}
                      onChangePaymentMethodAction={(method) => setSelectedPaymentMethod(method)}
                    />
                    <motion.div
                      className="mt-10 flex justify-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <Button
                        onClick={goToNextStep}
                        disabled={!selectedPaymentMethod}
                        className="relative overflow-hidden w-full"
                      >
                        <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          次へ進む
                        </motion.span>
                      </Button>
                    </motion.div>
                  </motion.div>
                )
              case 'confirm':
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <ConfirmView
                      tenantId={organizationComplete.organization.tenant_id as Id<'tenant'>}
                      orgId={organizationComplete.organization._id as Id<'organization'>}
                      selectedMenus={selectedMenus}
                      selectedOptions={selectedOptions}
                      selectedStaff={
                        // 自動割り当てされたスタッフ（フリー指名）は顧客には「free」として表示
                        selectedStaffCompleted?.staff === 'free' ||
                        isAutoAssignedStaff(selectedStaffCompleted?.staff)
                          ? 'free'
                          : (selectedStaffCompleted?.staff as StaffDisplay | null)
                      }
                      availablePoints={availablePoints ?? 0}
                      usePoints={usePoints}
                      minimumChargePoint={pointConfig?.minimum_charge_point ?? 0}
                      selectedPaymentMethod={selectedPaymentMethod as PaymentMethod}
                      onChangePointsAction={(points: number) => setUsePoints(points)}
                      selectedDate={selectedDate}
                      selectedTime={selectedTime}
                      onApplyCoupon={(discount: number, couponId: Id<'coupon'>) =>
                        setAppliedDiscount({ discount, couponId })
                      }
                      appliedCouponInfo={appliedDiscount.couponId ? appliedDiscount : null}
                    />
                    <Separator className="my-6" />
                    <div className="flex flex-col gap-2 my-4">
                      <Label className="text-primary">ご予約者様のお電話番号</Label>
                      <Input
                        type="tel"
                        placeholder="電話番号を入力してください (例: 090-1234-5678)"
                        value={customerPhone || ''}
                        className="w-full"
                        onChange={(e) => {
                          const phone = e.target.value
                          setCustomerPhone(phone)
                          setIsPhoneValid(isValidPhoneNumber(phone))
                        }}
                      />
                      {!isPhoneValid && customerPhone !== null && customerPhone !== '' && (
                        <p className="text-xs text-destructive">
                          有効な電話番号の形式で入力してください。
                        </p>
                      )}
                      {(!customerPhone || customerPhone === '') && (
                        <p className="text-xs text-destructive">
                          ご予約をされるお客様のお電話番号を入力してください
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 my-4">
                      <Label className="text-primary">備考</Label>
                      <Textarea
                        rows={8}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full"
                        placeholder="ご要望などあればご記入ください。"
                      />
                    </div>

                    <motion.div
                      className="mt-8 flex flex-col gap-4 justify-center items-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <div className="flex w-full gap-4">
                        {selectedPaymentMethod === 'credit_card' && (
                          <Button
                            onClick={async () => {
                              setIsCreatingCheckoutSession(true)
                              try {
                                const checkoutUrl = await processCreditCardPayment()
                                if (checkoutUrl) {
                                  router.push(checkoutUrl)
                                } else {
                                  setIsCreatingCheckoutSession(false)
                                }
                              } catch (error) {
                                console.error('Error during credit card payment process:', error)
                                showErrorToast(error)
                                setIsCreatingCheckoutSession(false)
                              }
                            }}
                            disabled={
                              isCreatingCheckoutSession || isProcessingPayment || !isPhoneValid
                            }
                            className="relative overflow-hidden w-full"
                          >
                            <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                              {isCreatingCheckoutSession ? (
                                <div className="flex items-center justify-center gap-2">
                                  処理中...
                                  <Loader2 className="animate-spin ml-2" />
                                </div>
                              ) : (
                                'クレジットカードで支払う'
                              )}
                            </motion.span>
                          </Button>
                        )}
                        <Button
                          onClick={handleConfirmReservation}
                          disabled={
                            isProcessingPayment ||
                            !isPhoneValid ||
                            selectedPaymentMethod === 'credit_card'
                          }
                          className="relative overflow-hidden w-full"
                        >
                          <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            {isProcessingPayment ? (
                              <div className="flex items-center justify-center gap-2">
                                処理中...
                                <Loader2 className="animate-spin ml-2" />
                              </div>
                            ) : selectedPaymentMethod === 'credit_card' ? (
                              '予約内容を確認 (現金払い)'
                            ) : (
                              '予約を確定する'
                            )}
                          </motion.span>
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )
            }
          })()}
        </motion.div>
      </AnimatePresence>
    )
  }

  if (isLogout) {
    return <Loading />
  }

  return (
    <div className="container max-w-3xl mx-auto p-4" style={{ paddingBottom: bottomBarHeight }}>
      <div className="overflow-hidden flex items-center justify-between mb-2">
        <div>
          {/* サロン情報を表示するSheet */}
          <Sheet open={isSalonInfoSheetOpen} onOpenChange={setIsSalonInfoSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost">
                <h1 className="text-xl font-bold text-primary hover:underline cursor-pointer break-words">
                  {organizationComplete.organization.org_name}
                </h1>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto p-6">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl font-bold">
                  {organizationComplete.organization.org_name}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-6">
                {organizationComplete.config?.images &&
                  organizationComplete.config.images.length > 0 && (
                    <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden shadow-md">
                      <Image
                        src={organizationComplete.config?.images[0].original_url ?? ''}
                        alt={organizationComplete.organization.org_name ?? ''}
                        layout="fill"
                        objectFit="cover"
                      />
                    </div>
                  )}

                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">店舗情報</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {organizationComplete.config?.description}
                  </p>
                </div>
                <div className="flex flex-col justify-start items-start mb-4">
                  <p className="text-lg text-primary font-bold">営業日</p>
                  <div className="flex flex-col items-start gap-2 mt-2">
                    {orgWeekSchedule
                      ?.sort((a: Doc<'week_schedule'>, b: Doc<'week_schedule'>) => {
                        const dayA = dayOrder[a.day_of_week!] ?? 8 // 未定義の曜日は最後に
                        const dayB = dayOrder[b.day_of_week!] ?? 8 // 未定義の曜日は最後に
                        return dayA - dayB
                      })
                      .map((schedule: Doc<'week_schedule'>, index: number) => (
                        <div
                          key={index}
                          className="flex  items-center justify-start gap-1 border-b border-border pb-2"
                        >
                          <div className="flex  items-center justify-start gap-2 mr-3">
                            <div
                              className={`h-3 w-3 rounded-full border border-border ring-1 ring-offset-1 ${schedule.is_open ? 'bg-accent-2 ring-accent-2' : 'bg-destructive-foreground ring-destructive-foreground'}`}
                            />
                            <p className="text-sm text-muted-foreground text-nowrap">
                              {convertDayOfWeek(schedule.day_of_week!)}
                            </p>
                          </div>
                          <p
                            className={`text-sm text-center font-bold ${schedule.is_open ? 'text-muted-foreground' : 'text-destructive'}`}
                          >
                            {schedule.is_open
                              ? `${schedule.start_hour} ~ ${schedule.end_hour}`
                              : '休日'}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">連絡先</h3>
                  <ul className="list-none space-y-1 text-sm text-muted-foreground">
                    <li>
                      <strong>住所:</strong> {organizationComplete.config?.postal_code}{' '}
                      {organizationComplete.config?.address}
                    </li>
                    <li>
                      <strong>電話:</strong>{' '}
                      <a
                        href={`tel:${organizationComplete.config?.phone}`}
                        className="hover:underline text-link-foreground"
                      >
                        {organizationComplete.config?.phone}
                      </a>
                    </li>
                    <li>
                      <strong>メール:</strong>{' '}
                      <a
                        href={`mailto:${organizationComplete.organization.org_email}`}
                        className="hover:underline text-link-foreground"
                      >
                        {organizationComplete.organization.org_email}
                      </a>
                    </li>
                  </ul>
                </div>
                {organizationComplete.config?.reservation_rules && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-foreground">予約ルール</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {organizationComplete.config?.reservation_rules}
                    </p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {sessionCustomer?.customerName ? (
            <p className="text-sm flex items-center gap-2 mt-1">
              <CheckCheck className="w-5 h-5 text-accent-2 rounded-full p-1" />
              <span className="font-light">{sessionCustomer?.customerName} 様</span>
            </p>
          ) : sessionCustomer?.email ? (
            <p className="text-sm flex items-center gap-2 mt-1">
              <CheckCheck className="w-5 h-5 text-accent-2" />
              <span className="font-light">{sessionCustomer?.email}</span>
            </p>
          ) : sessionCustomer?.lineUserName ? (
            <p className="text-sm flex items-center gap-2 mt-1">
              <CheckCheck className="w-5 h-5 text-accent-2" />
              <span className="font-light">{sessionCustomer?.lineUserName}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <div className="flex flex-col items-center gap-2">
            <Button size="icon" variant="outline" onClick={(e) => handleShowLogoutDialog(e)}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <Separator className="my-2 mb-3" />

      {renderStepIndicator()}

      <div className="mb-6">{renderStepContent()}</div>

      {(selectedMenus.length > 0 || selectedStaffCompleted || selectedOptions.length > 0) && (
        <motion.div
          ref={bottomBarRef}
          className="fixed bottom-0 left-0 right-0 z-20 px-4 py-2 bg-background border-t shadow-md"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
        >
          <div className="container max-w-3xl mx-auto flex justify-between items-center">
            <div className="flex flex-col items-start justify-between gap-2 w-5/7">
              <motion.div className="text-xs text-muted-foreground">
                {selectedMenus.length > 0 && (
                  <div>
                    <span className="font-bold">メニュー</span>
                    <br />
                    {selectedMenus.map((menu) => menu.name).join('、')}
                  </div>
                )}

                {selectedStaffCompleted?.staff && (
                  <div>
                    <span className="font-bold">スタッフ</span>
                    <br />
                    {selectedStaffCompleted.staff === 'free' ||
                    isAutoAssignedStaff(selectedStaffCompleted.staff)
                      ? '指名フリー'
                      : selectedStaffCompleted.staff?.name || '不明'}
                  </div>
                )}

                {selectedOptions.length > 0 && (
                  <div>
                    <span className="font-bold">オプション</span>
                    <br />
                    {groupOptionsByName(selectedOptions).map((option, index) => (
                      <span key={index}>
                        {option.name}
                        {option.count > 1 ? ` ×${option.count}` : ''}
                        {index < groupOptionsByName(selectedOptions).length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
              <motion.p
                className="font-bold"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                合計: ¥{calculateTotal().toLocaleString()} / {calculateTotalMinutes()}分
              </motion.p>
            </div>
            <div className="flex flex-col items-end justify-between gap-2 w-2/7">
              {pointConfig?.is_active && (
                <motion.p
                  className="text-xs font-bold mb-2 border border-link-foreground text-link-foreground rounded-full px-2 py-1 text-nowrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  獲得予定のポイント:{' '}
                  <span className="font-bold">
                    {Math.floor(
                      pointConfig?.is_fixed_point
                        ? (pointConfig.fixed_point ?? 0)
                        : calculateTotal() * ((pointConfig?.point_rate ?? 0) / 100)
                    )}
                  </span>
                  P
                </motion.p>
              )}
              <div className="flex space-x-2">
                {currentStep !== 'menu' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      variant="outline"
                      onClick={goToPreviousStep}
                      className="relative overflow-hidden"
                    >
                      <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        戻る
                      </motion.span>
                    </Button>
                  </motion.div>
                )}
                {currentStep !== 'confirm' && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Button
                      onClick={goToNextStep}
                      disabled={
                        (currentStep === 'staff' && !selectedStaffCompleted) ||
                        (currentStep === 'date' &&
                          (!reservationStartDateTime ||
                            !reservationEndDateTime ||
                            !selectedDate)) ||
                        (currentStep === 'payment' && !selectedPaymentMethod)
                      }
                      className="relative overflow-hidden"
                    >
                      <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        次へ
                      </motion.span>
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      <Dialog open={isQuestionnaireOpen} onOpenChange={setIsQuestionnaireOpen}>
        <DialogContent className="overflow-y-auto h-[90vh] flex flex-col justify-start items-start">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">問診票</DialogTitle>
          </DialogHeader>
          <Questionnaire
            onComplete={(data) => {
              console.log('data', data)
            }}
            onStepChange={setQuestionnaireStep}
          />
          {questionnaireStep === totalSteps && (
            <Button
              className="w-full"
              onClick={() => {
                setIsQuestionnaireOpen(false)
                console.log('予約完了')
              }}
            >
              予約を確定する
            </Button>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ログアウト</DialogTitle>
          </DialogHeader>
          <DialogDescription>ログアウトしますか？</DialogDescription>
          <DialogFooter className="flex flex-col md:flex-row gap-4">
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={(e) => {
                setShowLogoutDialog(false)
                handleLogout(e)
              }}
            >
              ログアウト
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
