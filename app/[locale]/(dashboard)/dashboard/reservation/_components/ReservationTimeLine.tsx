'use client'
import { Link } from '@/i18n/navigation'
import React, { useState, useMemo, useCallback, memo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useTimelineData, useReservationBars, useScheduleBars } from '@/hooks/useTimelineData'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useRouter } from 'next/navigation'
import { Id } from '@/convex/_generated/dataModel'

import type {
  StaffTimelineData,
  ReservationWithDetails,
  TimeSlot,
  ReservationBar,
  StaffSchedule,
  ScheduleBar,
} from '@/hooks/useTimelineData'
import { SubscriptionPlanName } from '@/convex/types'
import { Loader2 } from 'lucide-react'
import { RESERVATION_COLORS, FREE_NOMINATION_COLORS } from '@/hooks/useTimelineData'
import { Loading } from '@/components/common'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CalendarDays,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Shuffle,
  Plus,
  Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTimestamp, convertTimestampToHour } from '@/lib/schedules'
import { format, addDays, subDays, isWeekend } from 'date-fns'
import { ja, enUS, th } from 'date-fns/locale'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import { useQueryWithStatus } from '@/hooks/useQueryWithStatus'
import { api } from '@/convex/_generated/api'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useDebounce } from 'use-debounce'
import type { ReservationMenu, ReservationOption } from '@/convex/types'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import type { RowType, InsertType } from '@/services/supabase/SupabaseService'
import { useQuery, useMutation } from 'convex/react'
import { GENDER_VALUES, Gender } from '@/convex/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { convertGender } from '@/convex/types'

// 1スロット（10分）の幅(px) - 隙間をなくすために調整
const SLOT_WIDTH = 32

// ■ メモ化されたコンポーネント
const TimelineHeader = memo(({ timeSlots }: { timeSlots: TimeSlot[] }) => {
  const t = useTranslations('reservations')
  return (
    <div className="flex sticky top-0 z-30 bg-background shadow-sm border-b border-border">
      {/* スタッフ名カラムのヘッダー */}
      <div className="sticky left-0 z-40 bg-background border-r border-border w-20 md:w-40 p-3 flex items-center justify-center font-bold text-muted-foreground">
        <User className="w-4 h-4 mr-2" />
        <span className="hidden md:block text-xs">{t('staff')}</span>
      </div>

      {/* 時間スロットヘッダー */}
      <div className="flex">
        {timeSlots.map((slot) => {
          return (
            <div
              key={slot.index}
              className={cn(
                'relative h-12 text-xs flex items-center justify-center transition-colors z-10',
                // 太い線を削除し、通常のボーダーのみ使用
                slot.minutes % 60 === 0
                  ? 'w-24 border-l-2 border-accent-2 font-semibold bg-muted'
                  : 'w-24 border-l border-border/50'
              )}
            >
              {slot.minutes % 60 === 0 && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 whitespace-nowrap text-sm   text-accent-2 font-semibold">
                  {slot.timeLabel}
                </span>
              )}
              {/* 30分マーク */}
              {slot.minutes % 60 === 30 && (
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                  {slot.timeLabel.split(':')[0]}:30
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

TimelineHeader.displayName = 'TimelineHeader'

const ReservationBarComponent = memo(
  ({
    bar,
    onReservationClick,
  }: {
    bar: ReservationBar
    onReservationClick: (reservation: ReservationWithDetails) => void
  }) => {
    const t = useTranslations('reservations')
    const { reservation, startColumn, spanColumns } = bar

    // ステータスに基づいてアイコンを選択
    const getStatusIcon = (status: string) => {
      // フリー指名の場合は専用アイコンを表示
      if (reservation.is_free_nomination) {
        return <Shuffle className="w-3 h-3" />
      }

      switch (status) {
        case 'confirmed':
          return <UserCheck className="w-3 h-3" />
        case 'pending':
          return <Clock className="w-3 h-3" />
        case 'completed':
          return <UserCheck className="w-3 h-3" />
        default:
          return <User className="w-3 h-3" />
      }
    }

    const colorSet = reservation.is_free_nomination ? FREE_NOMINATION_COLORS : RESERVATION_COLORS
    const enhancedColor =
      colorSet[reservation.status as keyof typeof colorSet] || colorSet.confirmed

    return (
      <div
        className={cn(
          'absolute top-0 h-full rounded cursor-pointer',
          'text-xs flex items-center px-2 gap-1 border',
          enhancedColor
        )}
        style={{
          left: `${startColumn * SLOT_WIDTH + 1}px`, // 少し右にずらして視覚的な間隔を作る
          width: `${spanColumns * SLOT_WIDTH - 2}px`, // 間隔調整を改善
          zIndex: 20,
        }}
        onClick={() => onReservationClick(reservation)}
        title={`${reservation.is_free_nomination ? '[指名フリー] ' : ''}${reservation.customer_name} (${convertTimestampToHour(reservation.start_time_unix)} - ${convertTimestampToHour(reservation.end_time_unix)})`}
      >
        <div className="flex flex-col items-start gap-1 overflow-hidden">
          <div className="flex items-center gap-1">
            {getStatusIcon(reservation.status)}
            <span className="truncate font-medium">
              {reservation.staff_name ?? t('nameNotSet')}
            </span>
            {reservation.is_free_nomination ? (
              <div className="text-xs text-nowrap bg-link-foreground text-link px-1 rounded-full font-medium">
                <small>指名フリー</small>
              </div>
            ) : (
              <div className="text-xs text-nowrap bg-success-foreground text-success px-1 rounded-full font-medium">
                <small>指名予約</small>
              </div>
            )}
          </div>
          {/* 時間表示（幅が十分な場合のみ） */}
          <div className="flex flex-col items-start justify-between w-full gap-1">
            <span className="text-xs font-bold underline">
              {convertTimestampToHour(reservation.start_time_unix)}~
              {convertTimestampToHour(reservation.end_time_unix)}
            </span>
            <span className="text-xs opacity-75 text-nowrap truncate">
              {reservation.customer_name}様
            </span>
          </div>
        </div>
      </div>
    )
  }
)

ReservationBarComponent.displayName = 'ReservationBarComponent'

const ScheduleBarComponent = ({ schedule }: { schedule: ScheduleBar }) => {
  const t = useTranslations('reservations')

  // スケジュールの種類に応じて表示内容を決定
  const renderContent = () => {
    if (schedule.source === 'organization') {
      // 組織全体のスケジュール（店舗休業など）
      return null
    }

    // スタッフ個別のスケジュール
    const staffSchedule = schedule.schedule as StaffSchedule
    if (staffSchedule.is_all_day) {
      return <div>{t('ReservationTimeLine.allDayOff')}</div>
    }

    if (staffSchedule.start_time_unix && staffSchedule.end_time_unix) {
      return (
        <div
          className={cn(
            'absolute top-0 h-full rounded',
            'text-xs flex items-center px-2 gap-1 border',
            schedule.color
          )}
          style={{
            left: `${schedule.startColumn * SLOT_WIDTH + 1}px`, // 少し右にずらして視覚的な間隔を作る
            width: `${schedule.spanColumns * SLOT_WIDTH - 2}px`, // 間隔調整を改善
            zIndex: 20,
          }}
          title={schedule.type}
        >
          <div className="flex flex-col items-start gap-1 overflow-hidden">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span className="truncate font-medium">予定あり</span>
            </div>
            {/* 時間表示（幅が十分な場合のみ） */}
            <div className="flex flex-col items-start justify-between w-full gap-1">
              <span className="text-xs font-bold">
                {convertTimestampToHour(staffSchedule.start_time_unix)}~
                {convertTimestampToHour(staffSchedule.end_time_unix)}
              </span>
            </div>
          </div>
        </div>
      )
    }

    return <div>{t('ReservationTimeLine.scheduled')}</div> // フォールバック
  }

  return renderContent()
}

ScheduleBarComponent.displayName = 'ScheduleBarComponent'

const StaffTimelineRow = memo(
  ({
    staffData,
    selectedDate,
    timeSlots,
    onReservationClick,
    handleTimeSlotClick,
  }: {
    staffData: StaffTimelineData
    selectedDate: Date
    timeSlots: TimeSlot[]
    onReservationClick: (reservation: ReservationWithDetails) => void
    handleTimeSlotClick: (staffId: Id<'staff'>, slot: TimeSlot, date: Date) => void
  }) => {
    const t = useTranslations('reservations')
    const reservationBars = useReservationBars(staffData.reservations)
    const scheduleBars = useScheduleBars(staffData.schedules || [])

    return (
      <div
        className={cn(
          'flex z-30 transition-colors hover:border-accent-2 border-b border-border last:border-b h-full'
        )}
      >
        {/* スタッフ名（左端固定） */}
        <div className="sticky left-0 z-20 bg-background border-r border-border w-20 md:w-40 p-2 md:p-4 flex h-full items-center overflow-hidden">
          <Link className="pointer-cursor w-full" href={`/dashboard/staff/${staffData.staff._id}`}>
            <div className="flex flex-col md:flex-row items-center gap-3 w-full overflow-hidden">
              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                {staffData.staff.images && staffData.staff.images.length > 0 ? (
                  <Image
                    src={staffData.staff.images[0].thumbnail_url}
                    alt={staffData.staff.name}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5 text-primary" />
                )}
              </div>
              <div
                className="flex-1 min-w-0 flex flex-col items-center overflow-hidden"
                style={{ maxWidth: '100%' }}
              >
                <div
                  className="font-semibold text-xs md:text-sm text-primary w-full text-start"
                  title={staffData.staff.name} // ツールチップで完全な名前を表示
                >
                  {staffData.staff.name}
                </div>
                <div className="text-xs text-link-foreground flex items-center gap-1">
                  <Clock className="hidden md:block w-3 h-3" />
                  {reservationBars.length}
                  {t('reservationCount')}
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* タイムライン部分 */}
        <div className="relative flex-1 bg-background z-10">
          {/* 時間グリッド */}
          <div className="flex h-full">
            {timeSlots.map((slot) => {
              return (
                <div
                  key={slot.index}
                  data-staff-id={staffData.staff._id}
                  data-selected-date={format(selectedDate, 'yyyy-MM-dd', {
                    locale: ja,
                  })}
                  onClick={() => handleTimeSlotClick(staffData.staff._id, slot, selectedDate)}
                  className={cn(
                    'h-full transition-colors cursor-pointer',
                    // 太い線を削除し、通常のボーダーのみ使用
                    slot.minutes % 60 === 0
                      ? 'w-24 border-l border-border'
                      : 'w-24 border-l border-border/50',

                    // 30分ごとに微妙な色の変化を追加
                    slot.minutes % 60 !== 30 && 'bg-muted'
                  )}
                />
              )
            })}
          </div>

          <div className="absolute inset-0 pointer-events-none">
            {scheduleBars.map((bar, index) => (
              <div key={`${bar.schedule.type}-${index}`} className="pointer-events-auto">
                <ScheduleBarComponent schedule={bar} />
              </div>
            ))}
          </div>
          {/* 予約バー */}
          <div className="absolute inset-0 pointer-events-none">
            {reservationBars.map((bar, index) => (
              <div key={`${bar.reservation._id}-${index}`} className="pointer-events-auto">
                <ReservationBarComponent bar={bar} onReservationClick={onReservationClick} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
)

StaffTimelineRow.displayName = 'StaffTimelineRow'

// ■ 予約詳細ダイアログ
const ReservationDetailDialog = memo(
  ({
    reservation,
    isOpen,
    onClose,
  }: {
    reservation: ReservationWithDetails | null
    isOpen: boolean
    onClose: () => void
  }) => {
    const t = useTranslations('reservations')
    const router = useRouter()
    const { showErrorToast } = useErrorHandler()
    const [updating, setUpdating] = useState(false)
    const manageReservation = useMutation(api.reservation.manage.handleReservationManage)

    if (!reservation) return null

    const colorSet = reservation.is_free_nomination ? FREE_NOMINATION_COLORS : RESERVATION_COLORS
    const enhancedColor =
      colorSet[reservation.status as keyof typeof colorSet] || colorSet.confirmed

    const handleCompleteReservation = async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      try {
        setUpdating(true)
        if (!reservation) return

        await manageReservation({
          mode: 'status',
          payload: {
            reservationId: reservation._id,
            status: 'completed',
          },
        })

        toast.success('施術のステータスを完了にしました。')
        router.push('/dashboard/reservation')
      } catch (error) {
        showErrorToast(error)
      } finally {
        setUpdating(false)
        onClose()
      }
    }

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reservation.is_free_nomination ? (
                <Shuffle className="w-5 h-5 text-link-foreground" />
              ) : (
                <User className="w-5 h-5" />
              )}
              {t('detail')}
              {reservation.is_free_nomination && (
                <span className="text-xs bg-link-foreground text-link px-2 py-1 rounded-full font-medium ml-2">
                  指名フリー
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="w-full flex flex-col items-start gap-2">
                <label className="text-xs font-semibold text-primary">担当スタッフ</label>
                <Link href={`/dashboard/staff/${reservation.staff_id}`} className="underline">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <p className="text-sm text-primary font-medium">{reservation.staff_name}</p>
                  </div>
                </Link>
              </div>
              <div className="w-full">
                <label className="text-xs font-semibold text-primary">{t('status')}</label>
                <div className="mt-1">
                  <Badge className={cn('text-xs px-2 py-1 rounded-full', enhancedColor)}>
                    {t(`statuses.${reservation.status}`)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="w-full flex flex-col items-start gap-2">
              <label className="text-xs font-semibold text-primary">顧客名</label>
              <Link href={`/dashboard/carte/${reservation.customer_uid}`} className="underline">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <p className="text-sm text-primary font-medium">{reservation.customer_name}様</p>
                </div>
              </Link>
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">{t('dateTime')}</label>
              <div className="mt-1 p-3 border rounded-lg font-bold text-link-foreground">
                <p className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {format(new Date(reservation.start_time_unix), 'yyyy年MM月dd日(EEE)', {
                    locale: ja,
                  })}
                </p>
                <p className="text-base flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4" />
                  {convertTimestampToHour(reservation.start_time_unix)} -{' '}
                  {convertTimestampToHour(reservation.end_time_unix)}
                </p>
              </div>
              <div className="w-full flex flex-col items-start gap-2 mt-2">
                <label className="text-xs font-semibold text-primary">備考</label>
                <p className="text-sm text-muted-foreground">
                  {reservation.note || '備考はありません'}
                </p>
              </div>
            </div>
            <div className="pt-8 flex flex-col items-center justify-between gap-6">
              <div className="flex  gap-2 w-full">
                <Button className="w-full" asChild variant="outline">
                  <Link href={`/dashboard/reservation/${reservation._id}`}>{t('moreDetail')}</Link>
                </Button>

                {/* 顧客IDが存在する場合のみカルテリンクを表示 */}
                {reservation.customer_uid && (
                  <Button className="w-full" asChild variant="info">
                    <Link href={`/dashboard/carte/${reservation.customer_uid}`}>
                      カルテを確認する
                    </Link>
                  </Button>
                )}
              </div>
              <Button onClick={handleCompleteReservation} className="w-full" disabled={updating}>
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    ステータスを更新中...
                  </>
                ) : (
                  '施術を完了にする'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
)

ReservationDetailDialog.displayName = 'ReservationDetailDialog'

// ■ 予約作成ダイアログ
const ReservationCreateDialog = memo(
  ({
    slot,
    date,
    selectedStaffId,
    isOpen,
    onClose,
  }: {
    slot: TimeSlot | undefined
    date: Date | undefined
    selectedStaffId: Id<'staff'> | undefined
    isOpen: boolean
    onClose: () => void
  }) => {
    const manageReservation = useMutation(api.reservation.manage.handleReservationManage)
    const { tenantId, orgId, planName } = useTenantAndOrganization()
    const [selectedMenus, setSelectedMenus] = useState<ReservationMenu[]>([])
    const [selectedOptions, setSelectedOptions] = useState<ReservationOption[]>([])
    const [searchName, setSearchName] = useState<string>('')
    const [debouncedSearchName] = useDebounce(searchName, 500)
    const [customers, setCustomers] = useState<RowType<'customer'>[]>([])
    const [isLoadingCustomers, setIsLoadingCustomers] = useState<boolean>(false)
    const [selectedCustomer, setSelectedCustomer] = useState<RowType<'customer'> | null>(null)
    const customerRepository = useMemo(() => new CustomerRepository(), [])

    // 新規顧客作成用state
    const [isNewCustomer, setIsNewCustomer] = useState<boolean>(false)
    const [newCustomerData, setNewCustomerData] = useState({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      gender: undefined as Gender | undefined,
      memo: '',
    })

    // 初期データ取得（メニュー・オプション）
    const initialFormData = useQueryWithStatus(
      api.reservation.query.getReservationFormData,
      tenantId && orgId && planName
        ? {
            tenant_id: tenantId,
            org_id: orgId,
            planName: planName as SubscriptionPlanName,
            menu_ids: [],
          }
        : 'skip'
    )

    const staff = useQuery(
      api.staff.query.getRelatedTables,
      tenantId && orgId && selectedStaffId
        ? {
            tenant_id: tenantId as Id<'tenant'>,
            org_id: orgId as Id<'organization'>,
            staff_id: selectedStaffId as Id<'staff'>,
          }
        : 'skip'
    )

    const menus = useMemo(() => initialFormData.data?.menus || [], [initialFormData.data?.menus])
    const options = useMemo(
      () => initialFormData.data?.options || [],
      [initialFormData.data?.options]
    )

    // 価格/時間計算（手動）
    const menuTotalPrice = useMemo(() => {
      return selectedMenus.reduce((sum, item) => {
        const menu = menus.find((m) => m._id === item.id)
        if (!menu) return sum
        const price =
          menu.sale_price && menu.sale_price > 0 ? menu.sale_price : menu.unit_price || 0
        return sum + price * (item.quantity || 1)
      }, 0)
    }, [selectedMenus, menus])

    const optionTotalPrice = useMemo(() => {
      return selectedOptions.reduce((sum, item) => {
        const opt = options.find((o) => o._id === item.id)
        if (!opt) return sum
        const price = opt.sale_price && opt.sale_price > 0 ? opt.sale_price : opt.unit_price || 0
        return sum + price * (item.quantity || 1)
      }, 0)
    }, [selectedOptions, options])

    const totalTimeMinutes = useMemo(() => {
      const menuTime = selectedMenus.reduce((sum, item) => {
        const menu = menus.find((m) => m._id === item.id)
        return sum + (menu?.duration_min ?? 0) * (item.quantity || 1)
      }, 0)
      const optionTime = selectedOptions.reduce((sum, item) => {
        const opt = options.find((o) => o._id === item.id)
        return sum + (opt?.duration_min ?? 0) * (item.quantity || 1)
      }, 0)
      return menuTime + optionTime
    }, [selectedMenus, selectedOptions, menus, options])

    const [includeNominationFee, setIncludeNominationFee] = useState<boolean>(true)
    const displayExtraCharge = includeNominationFee ? (staff?.extra_charge ?? 0) : 0
    const displayTotalPrice = (menuTotalPrice || 0) + (optionTotalPrice || 0) + displayExtraCharge

    // 顧客検索
    useEffect(() => {
      const run = async () => {
        if (!tenantId || !orgId || debouncedSearchName.trim() === '') {
          setCustomers([])
          return
        }
        setIsLoadingCustomers(true)
        try {
          const result = await customerRepository.findBySearchableText(
            tenantId,
            orgId,
            debouncedSearchName,
            { page: 1, pageSize: 20 }
          )
          setCustomers(result.data)
        } finally {
          setIsLoadingCustomers(false)
        }
      }
      run()
    }, [tenantId, orgId, debouncedSearchName, customerRepository])

    // メニュー追加/削除
    const incMenu = useCallback((menuId: Id<'menu'>, name: string, price: number) => {
      setSelectedMenus((prev) => {
        const idx = prev.findIndex((m) => m.id === menuId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
          return next
        }
        return [...prev, { id: menuId, name, price, quantity: 1 }]
      })
    }, [])
    const decMenu = useCallback((menuId: Id<'menu'>) => {
      setSelectedMenus((prev) => {
        const idx = prev.findIndex((m) => m.id === menuId)
        if (idx < 0) return prev
        const item = prev[idx]
        if (item.quantity <= 1) return prev.filter((m) => m.id !== menuId)
        const next = [...prev]
        next[idx] = { ...item, quantity: item.quantity - 1 }
        return next
      })
    }, [])

    // オプション追加/削除（数量）
    const incOption = useCallback((optionId: Id<'option'>, name: string, price: number) => {
      setSelectedOptions((prev) => {
        const idx = prev.findIndex((o) => o.id === optionId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
          return next
        }
        return [...prev, { id: optionId, name, price, quantity: 1 }]
      })
    }, [])
    const decOption = useCallback((optionId: Id<'option'> | string) => {
      setSelectedOptions((prev) => {
        const idx = prev.findIndex((o) => o.id === optionId)
        if (idx < 0) return prev
        const item = prev[idx]
        if (item.quantity <= 1) return prev.filter((o) => o.id !== optionId)
        const next = [...prev]
        next[idx] = { ...item, quantity: item.quantity - 1 }
        return next
      })
    }, [])

    // 予約作成処理
    const [isCreating, setIsCreating] = useState(false)
    const { showErrorToast } = useErrorHandler()

    const handleCreateReservation = useCallback(async () => {
      if (!tenantId || !orgId || !selectedStaffId || !slot || !date || selectedMenus.length === 0) {
        toast.error('必要な情報が不足しています')
        return
      }

      setIsCreating(true)
      try {
        let customerId: string

        if (isNewCustomer) {
          // 新規顧客作成
          if (!newCustomerData.first_name || !newCustomerData.last_name) {
            toast.error('名前（姓・名）は必須です')
            return
          }

          const customerCoreData: InsertType<'customer'> = {
            uid: crypto.randomUUID(),
            tenant_id: tenantId,
            org_id: orgId,
            first_name: newCustomerData.first_name.trim(),
            last_name: newCustomerData.last_name.trim(),
            phone: newCustomerData.phone.trim() || null,
            email: newCustomerData.email.trim() || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          const customerDetailData: Omit<
            InsertType<'customer_detail'>,
            'uid' | 'customer_uid' | 'created_at' | 'updated_at' | 'is_archive'
          > = {
            email: newCustomerData.email.trim() || null,
            gender: newCustomerData.gender || null,
            notes: newCustomerData.memo.trim() || null,
          }

          const newCustomer = await customerRepository.createCustomerWithDetailsAndPoints(
            customerCoreData,
            customerDetailData,
            0
          )
          customerId = newCustomer.customer?.uid || ''
        } else {
          if (!selectedCustomer) {
            toast.error('顧客を選択してください')
            return
          }
          customerId = selectedCustomer.uid
        }

        // 予約作成

        // 開始/終了時刻を「選択日付の5:00起点」で計算
        const START_HOUR = 5
        const base = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
        // タイムラインは 5:00 → 翌日5:00 表示。5:00未満のスロットは翌日扱いにする
        if (slot.minutes < START_HOUR * 60) {
          base.setDate(base.getDate() + 1)
        }
        const target = new Date(base)
        target.setMinutes(target.getMinutes() + slot.minutes)
        // Note: All codebase utilities expect Unix time in milliseconds
        const startTimeUnix = target.getTime()
        const endTimeUnix = startTimeUnix + totalTimeMinutes * 60 * 1000

        await manageReservation({
          mode: 'create',
          payload: {
            tenant_id: tenantId,
            org_id: orgId,
            customer_uid: customerId,
            staff_id: selectedStaffId,
            customer_name: isNewCustomer
              ? `${newCustomerData.last_name}${newCustomerData.first_name}`
              : `${selectedCustomer?.last_name ?? ''}${selectedCustomer?.first_name ?? ''}`.trim() ||
                selectedCustomer?.phone ||
                '不明',
            staff_name: staff?.name || '',
            is_free_nomination: !includeNominationFee,
            status: 'confirmed',
            // 予約日付も開始時刻ベース（5時跨ぎに対応）
            date: format(new Date(startTimeUnix), 'yyyy-MM-dd'),
            start_time_unix: startTimeUnix,
            end_time_unix: endTimeUnix,
            total_price: displayTotalPrice,
            coupon_id: undefined,
            payment_method: 'cash',
            stripe_checkout_session_id: undefined,
            payment_status: 'pending',
            menus: selectedMenus,
            options: selectedOptions,
            extra_charge: displayExtraCharge,
            use_points: 0,
            coupon_discount: 0,
            notes: '',
            featured_hair_images: [],
          },
        })

        toast.success('予約を作成しました')
        onClose()

        // フォームリセット
        setSelectedMenus([])
        setSelectedOptions([])
        setSelectedCustomer(null)
        setIsNewCustomer(false)
        setNewCustomerData({
          first_name: '',
          last_name: '',
          phone: '',
          email: '',
          gender: undefined,
          memo: '',
        })
        setSearchName('')
      } catch (error) {
        showErrorToast(error)
      } finally {
        setIsCreating(false)
      }
    }, [
      manageReservation,
      tenantId,
      orgId,
      selectedStaffId,
      slot,
      date,
      selectedMenus,
      selectedOptions,
      isNewCustomer,
      newCustomerData,
      selectedCustomer,
      customerRepository,
      displayTotalPrice,
      includeNominationFee,
      totalTimeMinutes,
      onClose,
      showErrorToast,
      staff?.name,
      displayExtraCharge,
    ])

    if (!slot || !date || !selectedStaffId || !staff) return null
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[92vw] max-h-[80vh] overflow-y-auto max-w-screen-sm md:max-w-2xl rounded-md lg:max-w-3xl overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">予約を作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                <span className="font-bold text-lg text-link-foreground">
                  {format(date, 'yyyy-MM-dd')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span className="font-bold text-lg text-link-foreground">{slot.timeLabel} 〜</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-primary">担当スタッフ</label>
              <div className="mt-1 flex items-center gap-2 text-sm">
                {staff.images && staff.images.length > 0 && staff.images[0]?.thumbnail_url ? (
                  <Image
                    src={staff.images[0].thumbnail_url}
                    alt={staff.name}
                    width={80}
                    height={80}
                    className="object-contain rounded-full overflow-hidden"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                )}
                <span>{staff.name}</span>
              </div>
            </div>

            {/* メニュー選択（Accordion） */}
            <Accordion type="single" collapsible className="w-full max-w-[300px] md:max-w-none">
              <AccordionItem value="menus" className="border border-border rounded-md w-full ">
                <AccordionTrigger className="px-3 py-2 text-sm w-full">
                  メニューを選択
                </AccordionTrigger>
                <AccordionContent className="px-2 md:px-3 pb-3 ">
                  <div className="space-y-2 max-h-48 overflow-auto overflow-x-hidden pr-1 w-full max-w-full">
                    {menus.length === 0 && (
                      <p className="text-xs text-muted-foreground">メニューがありません</p>
                    )}
                    {menus.map((menu) => {
                      const price =
                        menu.sale_price && menu.sale_price > 0
                          ? menu.sale_price
                          : menu.unit_price || 0
                      const count = selectedMenus.find((m) => m.id === menu._id)?.quantity || 0
                      return (
                        <div
                          key={menu._id}
                          className="flex items-center justify-between gap-2 border border-border rounded-md p-2 w-full max-w-full"
                        >
                          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            {menu.images?.[0]?.thumbnail_url && (
                              <Image
                                src={menu.images[0].thumbnail_url}
                                alt={menu.name ?? ''}
                                width={32}
                                height={32}
                                className="rounded-full"
                              />
                            )}
                            <div className="min-w-0 max-w-full overflow-hidden">
                              <p className="text-sm font-medium truncate">{menu.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                ￥{price?.toLocaleString()}／{menu.duration_min}分
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => decMenu(menu._id)}
                              disabled={count === 0}
                              className="h-7 w-7"
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-5 text-center text-sm">{count}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => incMenu(menu._id, menu.name ?? '', price || 0)}
                              className="h-7 w-7"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* オプション選択（Accordion） */}
            <Accordion type="single" collapsible className="w-full max-w-[300px] md:max-w-none">
              <AccordionItem value="options" className="border border-border rounded-md w-full">
                <AccordionTrigger className="px-3 py-2 text-sm w-full">
                  オプションを選択
                </AccordionTrigger>
                <AccordionContent className="px-2 md:px-3 pb-3 w-full">
                  <div className="space-y-2 max-h-40 overflow-auto overflow-x-hidden pr-1 w-full max-w-full">
                    {options.length === 0 && (
                      <p className="text-xs text-muted-foreground">オプションがありません</p>
                    )}
                    {options.map((opt) => {
                      const price =
                        opt.sale_price && opt.sale_price > 0 ? opt.sale_price : opt.unit_price || 0
                      const count = selectedOptions.find((o) => o.id === opt._id)?.quantity || 0
                      return (
                        <div
                          key={opt._id}
                          className="flex items-center justify-between gap-2 border border-border rounded-md p-2 w-full max-w-full"
                        >
                          <div className="min-w-0 max-w-full overflow-hidden">
                            <p className="text-sm font-medium truncate">{opt.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              ￥{price?.toLocaleString()}／{opt.duration_min}分
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => decOption(opt._id)}
                              disabled={count === 0}
                              className="h-7 w-7"
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-5 text-center text-sm">{count}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => incOption(opt._id, opt.name ?? '', price || 0)}
                              className="h-7 w-7"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* 顧客選択（Accordion） */}
            <Accordion type="single" collapsible className="w-full max-w-[300px] md:max-w-none">
              <AccordionItem
                value="customer"
                className="border border-border rounded-md w-full h-full"
              >
                <AccordionTrigger className="px-3 py-2 text-sm w-full">顧客を選択</AccordionTrigger>
                <AccordionContent className="px-2 md:px-3 pb-3 space-y-2 w-full h-full">
                  <Input
                    placeholder="お名前・電話・メールなどで検索"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                  />
                  <div className="flex flex-col gap-2 w-full max-w-full overflow-x-hidden">
                    {isLoadingCustomers ? (
                      <div className="text-xs text-muted-foreground">検索中...</div>
                    ) : customers.length === 0 ? (
                      <div className="text-xs text-muted-foreground">該当する顧客がいません</div>
                    ) : (
                      customers.map((c) => (
                        <button
                          key={c.uid}
                          type="button"
                          className={cn(
                            'w-full max-w-full text-left p-2 rounded-md border transition-colors',
                            selectedCustomer?.uid === c.uid
                              ? 'border-accent-2 bg-accent-2-foreground'
                              : 'border-border hover:bg-muted'
                          )}
                          onClick={() => setSelectedCustomer(c)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm truncate min-w-0 max-w-full">
                              {`${c.last_name ?? ''}${c.first_name ?? ''}`.trim() ||
                                c.line_user_name ||
                                c.email ||
                                '名称未登録'}
                            </span>
                            {c.phone && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {c.phone}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedCustomer && !isNewCustomer && (
                    <Badge variant="outline" className="w-full justify-start">
                      選択中:{' '}
                      {`${selectedCustomer.last_name ?? ''}${selectedCustomer.first_name ?? ''}`.trim() ||
                        selectedCustomer.line_user_name ||
                        selectedCustomer.email}
                    </Badge>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      checked={isNewCustomer}
                      onCheckedChange={(checked) => {
                        setIsNewCustomer(checked)
                        if (checked) {
                          setSelectedCustomer(null)
                          setSearchName('')
                        }
                      }}
                    />
                    <Label className="text-sm">新規顧客として登録</Label>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* 新規顧客フォーム */}
            {isNewCustomer && (
              <Accordion type="single" collapsible className="w-full max-w-[300px] md:max-w-none">
                <AccordionItem
                  value="new-customer"
                  className="border border-border rounded-md w-full"
                >
                  <AccordionTrigger className="px-3 py-2 text-sm w-full">
                    新規顧客情報
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">姓 *</Label>
                        <Input
                          placeholder="山田"
                          value={newCustomerData.last_name}
                          onChange={(e) =>
                            setNewCustomerData((prev) => ({
                              ...prev,
                              last_name: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">名 *</Label>
                        <Input
                          placeholder="太郎"
                          value={newCustomerData.first_name}
                          onChange={(e) =>
                            setNewCustomerData((prev) => ({
                              ...prev,
                              first_name: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">電話番号</Label>
                      <Input
                        placeholder="090-1234-5678"
                        value={newCustomerData.phone}
                        onChange={(e) =>
                          setNewCustomerData((prev) => ({
                            ...prev,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-xs">メールアドレス</Label>
                      <Input
                        type="email"
                        placeholder="example@example.com"
                        value={newCustomerData.email}
                        onChange={(e) =>
                          setNewCustomerData((prev) => ({
                            ...prev,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label className="text-xs">性別</Label>
                      <Select
                        value={newCustomerData.gender || ''}
                        onValueChange={(value) =>
                          setNewCustomerData((prev) => ({
                            ...prev,
                            gender: (value as Gender) || undefined,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDER_VALUES.map((gender) => (
                            <SelectItem key={gender} value={gender}>
                              {convertGender(gender)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">メモ</Label>
                      <Textarea
                        placeholder="特記事項があれば記入してください"
                        value={newCustomerData.memo}
                        onChange={(e) =>
                          setNewCustomerData((prev) => ({
                            ...prev,
                            memo: e.target.value,
                          }))
                        }
                        rows={3}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* サマリー（Accordion） */}
            <Accordion
              type="single"
              collapsible
              value="summary"
              className="w-full max-w-[300px] md:max-w-none"
            >
              <AccordionItem value="summary" className="border border-border rounded-md w-full">
                <AccordionTrigger className="px-3 py-2 text-sm w-full">サマリー</AccordionTrigger>
                <AccordionContent className="px-3 pb-3 w-full">
                  <div className="border border-border rounded-md p-3 space-y-2 text-sm">
                    {/* 指名料トグル */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">指名料を含める</span>
                      <Switch
                        checked={includeNominationFee}
                        onCheckedChange={(v) => setIncludeNominationFee(!!v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>メニュー小計</span>
                      <span>￥{menuTotalPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>オプション小計</span>
                      <span>￥{optionTotalPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>指名料</span>
                      <span>￥{displayExtraCharge.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between font-semibold">
                      <span>合計</span>
                      <span>￥{displayTotalPrice.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      施術時間目安: {totalTimeMinutes}分
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex gap-2 pt-5">
              <Button variant="outline" className="w-full" onClick={onClose}>
                閉じる
              </Button>
              <Button
                className="w-full"
                disabled={
                  isCreating ||
                  selectedMenus.length === 0 ||
                  (!selectedCustomer && !isNewCustomer) ||
                  (isNewCustomer && (!newCustomerData.first_name || !newCustomerData.last_name))
                }
                onClick={handleCreateReservation}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    作成中...
                  </>
                ) : (
                  '予約を作成'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
)

ReservationCreateDialog.displayName = 'ReservationCreateDialog'

// ■ 統計情報コンポーネント
const StatsCards = memo(({ totalReservations }: { totalReservations: number }) => {
  const t = useTranslations('reservations')

  return (
    <div className="flex gap-4 pb-4">
      <Card className="flex items-center justify-between gap-4 px-2 py-1 bg-accent-2-foreground border-accent-2">
        <div className="text-xs text-accent-2 font-medium">{t('totalReservations')}</div>
        <div className="text-sm font-bold text-accent-2">
          {totalReservations}
          {t('count')}
        </div>
      </Card>
    </div>
  )
})

StatsCards.displayName = 'StatsCards'

// ■ 予約リストコンポーネント
const ReservationList = memo(
  ({
    reservations,
    onReservationClick,
  }: {
    reservations: ReservationWithDetails[]
    onReservationClick: (reservation: ReservationWithDetails) => void
  }) => {
    const t = useTranslations('reservations')

    // 予約を開始時間の早い順にソート
    const sortedReservations = [...reservations].sort((a, b) => {
      return a.start_time_unix - b.start_time_unix
    })

    return (
      <div className="p-4 space-y-3">
        {sortedReservations.map((reservation) => {
          const colorSet = reservation.is_free_nomination
            ? FREE_NOMINATION_COLORS
            : RESERVATION_COLORS
          const enhancedColor =
            colorSet[reservation.status as keyof typeof colorSet] || colorSet.confirmed

          return (
            <Card
              key={reservation._id}
              className="cursor-pointer   border-l-4"
              onClick={() => onReservationClick(reservation)}
            >
              <CardContent className="p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="font-semibold text-primary flex flex-wrap items-center gap-2">
                      {reservation.is_free_nomination ? (
                        <Shuffle className="w-4 h-4 text-palette-1 flex-shrink-0" />
                      ) : (
                        <User className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span className="break-all">{reservation.staff_name}</span>
                      {reservation.is_free_nomination && (
                        <span className="text-xs bg-link text-link-foreground px-2 py-1 rounded-full font-medium whitespace-nowrap">
                          指名フリー
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-semibold">{t('assignedStaff')}</span>{' '}
                      <span className="break-all">{reservation.customer_name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="whitespace-nowrap">
                        {formatTimestamp(reservation.start_time_unix, { useJST: true })} -
                        {formatTimestamp(reservation.end_time_unix, { useJST: true })}
                      </span>
                    </div>
                  </div>
                  <div className="self-start sm:self-center">
                    <Badge
                      className={cn('px-3 py-1 rounded-full whitespace-nowrap', enhancedColor)}
                    >
                      {t(`statuses.${reservation.status}`)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }
)

ReservationList.displayName = 'ReservationList'

// ■ メインコンポーネント
export default function ReservationTimeLine() {
  const t = useTranslations('reservations')
  const locale = useLocale()
  // ■ ステート管理
  const { tenantId, orgId, ready, subscription } = useTenantAndOrganization()
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(
    null
  )

  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [reservationCounts, setReservationCounts] = useState<{ date: string; count: number }[]>([])
  const [isReservationCreateDialogOpen, setIsReservationCreateDialogOpen] = useState(false)
  const [createReservationInfo, setCreateReservationInfo] = useState<{
    slot: TimeSlot
    date: Date
    selectedStaffId: Id<'staff'>
  } | null>(null)

  // ■ データ取得（最適化されたカスタムフック使用）
  const targetDateStr = format(selectedDate, 'yyyy-MM-dd')

  const { data: orgExceptionSchedule } = useQueryWithStatus(
    api.organization.exception_schedule.query.getByOrgAndDate,
    tenantId && orgId && ready ? { org_id: orgId, type: 'holiday', tenant_id: tenantId } : 'skip'
  )

  console.log('orgExceptionSchedule', orgExceptionSchedule)

  const { staffTimelineData, timeSlots, isLoading } = useTimelineData({
    tenantId,
    orgId,
    date: targetDateStr,
    ready,
  })

  // ■ 今日から2週間後までの予約件数を取得
  const today = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0) // 時刻をリセット
    return date
  }, []) // 空の依存配列でコンポーネントマウント時のみ実行

  const twoWeeksLater = useMemo(() => addDays(today, 13), [today]) // 今日を含めて14日間
  const startDateStr = useMemo(() => format(today, 'yyyy-MM-dd'), [today])
  const endDateStr = useMemo(() => format(twoWeeksLater, 'yyyy-MM-dd'), [twoWeeksLater])

  const { data: reservationCountsData } = useQueryWithStatus(
    api.reservation.query.getReservationCountsByDateRange,
    ready && tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          start_date: startDateStr,
          end_date: endDateStr,
        }
      : 'skip'
  )

  // 全ての日付の予約件数データを生成（0件の日も含む）
  useEffect(() => {
    const allDates: { date: string; count: number }[] = []
    const dateCountMap = new Map<string, number>()

    // 予約データをマップに変換
    if (reservationCountsData) {
      reservationCountsData.forEach((item) => {
        dateCountMap.set(item.date, item.count)
      })
    }

    // 今日から14日間の全ての日付を生成
    for (let i = 0; i <= 13; i++) {
      // 今日を含めて14日間
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      const dateStr = format(date, 'yyyy-MM-dd')
      allDates.push({
        date: dateStr,
        count: dateCountMap.get(dateStr) || 0,
      })
    }

    setReservationCounts(allDates)
  }, [reservationCountsData, today])

  // 表示用は30分単位
  const halfHourSlots = useMemo(
    () => timeSlots.filter((slot) => slot.minutes % 30 === 0),
    [timeSlots]
  )

  console.log('orgExceptionSchedule', orgExceptionSchedule)

  // ■ イベントハンドラー
  const handleReservationClick = useCallback((reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation)
    setIsDetailDialogOpen(true)
  }, [])

  const handleDateChange = useCallback((days: number) => {
    setSelectedDate((prev) => (days > 0 ? addDays(prev, days) : subDays(prev, Math.abs(days))))
  }, [])

  const handleCloseDetailDialog = useCallback(() => {
    setIsDetailDialogOpen(false)
    setSelectedReservation(null)
  }, [])

  // ■ レンダリング
  if (!ready || isLoading) {
    return <Loading />
  }

  const isWeekendDate = isWeekend(selectedDate)
  const isSubscriptionActive =
    subscription?.status === 'active' || subscription?.status === 'trialing'

  if (!isSubscriptionActive) {
    return (
      <div>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-sm text-muted-foreground flex flex-col items-center justify-center gap-8">
            <p className="text-center text-lg font-bold">{t('subscriptionRequired')}</p>
            <Link href="/dashboard/subscription">
              <Button className="w-fit text-xs">{t('goToSubscription')}</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={`h-fit w-full ${subscription === null ? 'hidden' : ''}`}>
      {/* ヘッダー部分 */}
      <div className="w-full md:space-y-2 md:p-4">
        {/* 日付選択とビュー切り替え */}
        {/* 今日から2週間後までの予約件数を表示 */}
        <div className="pb-2 mt-2">
          <div className="w-full flex gap-2 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide">
            {reservationCounts.map((item) => {
              const date = new Date(item.date)
              const dateFnsLocale = locale === 'ja' ? ja : locale === 'th' ? th : enUS
              const dayOfWeek = format(date, 'E', { locale: dateFnsLocale })
              const isWeekend = date.getDay() === 0 || date.getDay() === 6
              const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
              const isSelected = format(date, 'yyyy-MM-dd') === targetDateStr
              const isHoliday = orgExceptionSchedule?.some(
                (schedule) => schedule.date === item.date
              )

              return (
                <button
                  key={item.date}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    'flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[52px] w-full snap-start',
                    'border hover:border-secondary hover:shadow-sm',
                    isSelected
                      ? isHoliday
                        ? 'bg-warning text-warning-foreground border-warning-foreground'
                        : 'bg-accent text-accent-foreground border-accent-foreground shadow-md'
                      : null,
                    isToday && !isSelected && 'font-semibold',
                    item.count > 0 && !isSelected && 'bg-background',
                    isWeekend && !isSelected && 'text-destructive',
                    isHoliday && !isSelected && 'bg-warning text-warning-foreground'
                  )}
                >
                  <span className="text-[10px] opacity-70">{dayOfWeek}</span>
                  <span className="text-sm font-medium">{format(date, 'd')}</span>
                  <div className="flex items-center justify-center gap-1">
                    {item.count > 0 && (
                      <div className="w-1.5 h-1.5 bg-success-foreground rounded-full mt-0.5" />
                    )}
                    <span
                      className={cn(
                        'text-xs',
                        item.count > 0
                          ? 'font-bold'
                          : `text-muted-foreground opacity-50 ${isSelected ? 'text-muted-foreground' : ''}`
                      )}
                    >
                      {item.count}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center justify-between w-full my-4 ">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center justify-end md:justify-start gap-2 w-full">
                <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* 予約がある日をマーカー付きで表示 */}
                <EnhancedDatePicker
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  className={cn('w-fit', isWeekendDate && 'border-muted-foreground')}
                  reservationDates={reservationCounts
                    .filter((item) => item.count > 0)
                    .map((item) => item.date)}
                  reservationCounts={reservationCounts}
                />
                <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-4 w-full md:mt-0">
            <Button variant="outline" onClick={() => setSelectedDate(new Date())}>
              {t('today')}
            </Button>
          </div>
        </div>
      </div>

      {orgExceptionSchedule?.some((schedule) => schedule.date === targetDateStr) && (
        <div className="w-full border border-destructive">
          <div className="p-3 text-xs text-center font-bold text-destructive bg-destructive-foreground tracking-widest">
            店舗休業日
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="overflow-hidden">
        <div className="overflow-x-auto  bg-background border-t border-x border-border">
          <div className="relative max-h-[calc(100vh-200px)] min-w-max">
            {/* タイムラインヘッダー */}
            <TimelineHeader timeSlots={halfHourSlots} />

            {/* スタッフ行 */}
            <div>
              {staffTimelineData.map((staffData) => (
                <StaffTimelineRow
                  key={staffData.staff._id}
                  selectedDate={selectedDate}
                  staffData={staffData}
                  timeSlots={halfHourSlots}
                  onReservationClick={handleReservationClick}
                  handleTimeSlotClick={(staffId, slot, date) => {
                    setCreateReservationInfo({ slot, date, selectedStaffId: staffId })
                    setIsReservationCreateDialogOpen(true)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 予約詳細ダイアログ */}
      <ReservationDetailDialog
        reservation={selectedReservation}
        isOpen={isDetailDialogOpen}
        onClose={handleCloseDetailDialog}
      />
      <ReservationCreateDialog
        slot={createReservationInfo?.slot}
        date={createReservationInfo?.date}
        selectedStaffId={createReservationInfo?.selectedStaffId}
        isOpen={isReservationCreateDialogOpen}
        onClose={() => setIsReservationCreateDialogOpen(false)}
      />
    </div>
  )
}

// ■ 拡張DatePickerコンポーネント（予約マーカー付き）
interface EnhancedDatePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  className?: string
  reservationDates?: string[]
  reservationCounts?: { date: string; count: number }[]
}

function EnhancedDatePicker({
  value,
  onChange,
  className,
  reservationDates = [],
  reservationCounts = [],
}: EnhancedDatePickerProps) {
  const t = useTranslations('common')
  const locale = useLocale()
  const [isOpen, setIsOpen] = useState(false)

  // 予約データのマップを作成（日付→件数）
  const reservationCountMap = useMemo(() => {
    const map = new Map<string, number>()
    if (reservationCounts.length > 0) {
      // reservationCountsが渡された場合はそれを使用
      reservationCounts.forEach((item) => {
        if (item.count > 0) {
          map.set(item.date, item.count)
        }
      })
    } else {
      // 後方互換性のため、reservationDatesのみの場合
      reservationDates.forEach((dateStr) => {
        map.set(dateStr, 1)
      })
    }
    return map
  }, [reservationDates, reservationCounts])

  // カスタムDayContentコンポーネント
  const DayContent = (props: {
    date: Date
    displayMonth?: Date
    activeModifiers?: Record<string, boolean>
  }) => {
    const { date, activeModifiers } = props
    const dayNumber = format(date, 'd')
    const dateStr = format(date, 'yyyy-MM-dd')
    const hasReservation = reservationCountMap.has(dateStr)
    const count = reservationCountMap.get(dateStr) || 0

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <span className={cn(activeModifiers?.selected && 'text-primary-foreground')}>
          {dayNumber}
        </span>
        {hasReservation && count > 0 && (
          <span className="text-[7px] font-bold text-success-foreground absolute top-0 right-0 bg-background rounded-full p-1.5 border border-success-foreground h-3 w-3 flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-fit justify-start text-left font-normal h-9 bg-input',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {value ? format(value, 'yyyy/MM/dd') : <span>{t('datePicker.selectDate')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange?.(date)
            setIsOpen(false)
          }}
          initialFocus
          locale={locale === 'ja' ? ja : locale === 'th' ? th : enUS}
          modifiers={{
            hasReservation: (date) => reservationCountMap.has(format(date, 'yyyy-MM-dd')),
          }}
          modifiersClassNames={{
            hasReservation: 'has-reservation',
          }}
          components={{
            DayContent,
          }}
          fromDate={new Date()}
          toDate={addDays(new Date(), 90)}
        />
      </PopoverContent>
    </Popover>
  )
}
