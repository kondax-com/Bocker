// カレンダーの日付表示部分を修正し、予約がある日には特別なマークを表示する
'use client'

import { withManagerAccess } from '@/components/common'
import { ChevronLeft, ChevronRight, Ellipsis, Loader2 } from 'lucide-react'
import { DashboardSection } from '@/components/common'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useStablePaginatedQuery } from '@/hooks/useStablePaginatedQuery'
import { api } from '@/convex/_generated/api'
import { Link } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useRef, useState, useEffect, useMemo } from 'react'
import type { DayOfWeek } from '@/convex/types'
import {
  startOfWeek as startOfWeekFns,
  endOfWeek as endOfWeekFns,
  format,
  isSameDay,
  isToday,
} from 'date-fns'
import { useQuery } from 'convex/react'
import { formatDate } from '@/lib/schedules'
import type { SupportedLocale } from '@/lib/dateLocale'
import { Id, Doc } from '@/convex/_generated/dataModel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SubscriptionPlanName } from '@/convex/types'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { useRouter, useSearchParams } from 'next/navigation'
import { convertReservationStatus } from '@/convex/types'
import { convertDayOfWeek } from '@/lib/schedules'

// 10分刻みのグリッド単位を定数として定義
const GRID_UNIT_MIN = 10 // 1行 = 10分
const ROWS_PER_HOUR = 60 / GRID_UNIT_MIN // 1時間 = 6行
const TOTAL_ROWS_PER_DAY = 24 * ROWS_PER_HOUR // 1日 = 144行

const DAY_OF_WEEK_VALUES = [
  { key: 'monday', value: 1 },
  { key: 'tuesday', value: 2 },
  { key: 'wednesday', value: 3 },
  { key: 'thursday', value: 4 },
  { key: 'friday', value: 5 },
  { key: 'saturday', value: 6 },
  { key: 'sunday', value: 7 },
] as const

function StaffSchedulePage() {
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('reservations')
  const tNav = useTranslations('navigation')
  const locale = useLocale() as SupportedLocale

  // クエリパラメータから初期値を取得
  const initialStaffId = searchParams.get('staffId') as Id<'staff'> | null
  const initialDate = searchParams.get('date') ? new Date(searchParams.get('date')!) : new Date()
  const initialViewMode =
    searchParams.get('viewMode') === 'day' || searchParams.get('viewMode') === 'week'
      ? (searchParams.get('viewMode') as 'week' | 'day')
      : 'week'

  const containerOffset = useRef<HTMLDivElement | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState<Id<'staff'> | null>(initialStaffId)
  const [currentDate, setCurrentDate] = useState<Date>(
    initialViewMode === 'week' ? initialDate : new Date()
  )
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialViewMode === 'day' ? initialDate : new Date()
  )
  const [viewMode, setViewMode] = useState<'week' | 'day'>(initialViewMode)

  const [currentReservations, setCurrentReservations] = useState<Doc<'reservation'>[]>([])
  const [currentSchedules, setCurrentSchedules] = useState<Doc<'staff_exception_schedule'>[]>([])
  const [weekStartFormatted, setWeekStartFormatted] = useState('')
  const [weekEndFormatted, setWeekEndFormatted] = useState('')
  const [selectedDateFormatted, setSelectedDateFormatted] = useState('')

  const staffWeekSchedules = useQuery(
    api.staff.week_schedule.query.getByTenantOrgStaff,
    tenantId && orgId && selectedStaffId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: selectedStaffId,
        }
      : 'skip'
  )

  // FIXME: 100件ずつ取得しているので、100件以上の予約がある場合は、ページネーションを実装する
  const { results: reservations, isLoading: isReservationsLoading } = useStablePaginatedQuery(
    api.reservation.query.listByStaffId,
    tenantId && orgId && selectedStaffId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: selectedStaffId,
        }
      : 'skip',
    {
      initialNumItems: 150,
    }
  )

  const { results: staffSchedules } = useStablePaginatedQuery(
    api.staff.exception_schedule.query.listByTenantOrgStaff,
    tenantId && orgId && selectedStaffId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: selectedStaffId,
        }
      : 'skip',
    {
      initialNumItems: 100,
    }
  )

  console.log('staffSchedules', staffSchedules)
  useEffect(() => {
    if (staffSchedules) {
      setCurrentSchedules(staffSchedules)
    }
  }, [staffSchedules])

  const staffs = useQuery(
    api.staff.query.list,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          planName: planName as SubscriptionPlanName,
          sort: 'asc',
        }
      : 'skip'
  )

  // 曜日の配列（国際化対応）
  const weekDays: string[] = [
    t('weekdays.monday'),
    t('weekdays.tuesday'),
    t('weekdays.wednesday'),
    t('weekdays.thursday'),
    t('weekdays.friday'),
    t('weekdays.saturday'),
    t('weekdays.sunday'),
  ]
  const weekDaysFull: string[] = [
    t('weekdaysFull.monday'),
    t('weekdaysFull.tuesday'),
    t('weekdaysFull.wednesday'),
    t('weekdaysFull.thursday'),
    t('weekdaysFull.friday'),
    t('weekdaysFull.saturday'),
    t('weekdaysFull.sunday'),
  ]

  // ビューモードに応じたカラム数クラス（SP/PC 共通）
  const gridColsClass = viewMode === 'week' ? 'grid-cols-8' : 'grid-cols-1'

  // SP 週表示時は横スクロール出来る様に最小幅を確保し、PC では自動調整
  const timelineContainerWidthClass = viewMode === 'week' ? 'min-w-[720px] md:min-w-0' : 'w-full'

  // 予約のある日を特定する関数
  const datesWithReservations = useMemo(() => {
    if (!currentReservations || currentReservations.length === 0) return {}

    const dates: Record<string, boolean> = {}

    currentReservations.forEach((reservation) => {
      // startTimeUnix はミリ秒のタイムスタンプなので、そのまま使用
      const startTime = new Date(reservation.start_time_unix!)
      const dateKey = format(startTime, 'yyyy-MM-dd')
      dates[dateKey] = true
    })

    return dates
  }, [currentReservations])

  // 当日に予約があるかをチェックする関数
  const hasReservationsOnDate = (date: Date): boolean => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return !!datesWithReservations[dateKey]
  }

  // 10分刻みグリッド用の時間計算関数
  const calculateGridRow = (hours: number, minutes: number): number => {
    // 時間を10分単位の行番号に変換（ヘッダー行 +2 を考慮）
    return hours * ROWS_PER_HOUR + Math.floor(minutes / GRID_UNIT_MIN) + 2
  }

  const calculateRowSpan = (totalMinutes: number): number => {
    // 継続時間を10分単位の行数に変換
    return Math.ceil(totalMinutes / GRID_UNIT_MIN)
  }

  const renderSchedules = () => {
    if (!currentSchedules) return null
    return currentSchedules.map((schedule) => {
      const startTime = new Date(schedule.start_time_unix!)
      // ビュー外のスケジュールは表示しない
      if (viewMode === 'week') {
        if (
          startTime < startOfWeekFns(currentDate, { weekStartsOn: 1 }) ||
          startTime > endOfWeekFns(currentDate, { weekStartsOn: 1 })
        )
          return null
      } else {
        if (!isSameDay(startTime, selectedDate)) return null
      }
      const endTime = new Date(schedule.end_time_unix!)
      // 全日スケジュール
      if (schedule.is_all_day) {
        // 全日スケジュール: 00:00から23:59まで赤く表示（144行すべて）
        const dayIndex = (new Date(schedule.start_time_unix!).getDay() + 6) % 7
        const colStart = viewMode === 'week' ? dayIndex + 2 : 1
        return (
          <li
            key={`sched-${schedule._id}`}
            className="relative flex"
            style={{
              gridColumn: `${colStart} / span 1`,
              gridRow: `2 / span ${TOTAL_ROWS_PER_DAY}`,
            }}
          >
            <div className="absolute inset-1 bg-palette-4 opacity-75 rounded-md">
              <p className="text-xs p-2 font-bold text-center text-palette-4-foreground">
                {schedule.is_all_day ? t('allDay') : t('schedule')}
              </p>
              <p className="text-xs p-2 text-center text-palette-4">
                {schedule.notes ? `(${schedule.notes})` : ''}
              </p>
            </div>
          </li>
        )
      }
      // 部分スケジュール（赤く表示）
      const dayIndex = (startTime.getDay() + 6) % 7
      const colStart = viewMode === 'week' ? dayIndex + 2 : 1
      const startRow = calculateGridRow(startTime.getHours(), startTime.getMinutes())
      const totalMinutes = (endTime.getTime() - startTime.getTime()) / 60000
      const rowSpan = calculateRowSpan(totalMinutes)
      return (
        <li
          key={`sched-${schedule._id}`}
          className="relative mt-px flex"
          style={{
            gridRow: `${startRow} / span ${rowSpan}`,
            gridColumn: `${colStart} / span 1`,
          }}
        >
          <div className="absolute inset-1 bg-palette-4 opacity-75 rounded-md flex items-start justify-center p-2 overflow-scroll">
            <p className="text-xs text-start text-palette-4">
              {schedule.is_all_day ? t('fullDay') : t('schedule')}
              {schedule.is_all_day
                ? '00:00 - 24:00'
                : `${format(startTime, 'HH:mm')} - ${format(endTime, 'HH:mm')}`}
            </p>
          </div>
        </li>
      )
    })
  }

  const renderReservations = () => {
    if (!currentReservations) return null

    // ts-ignore next-line
    return currentReservations.map((reservation) => {
      // FIXME: any
      // startTimeUnix, endTimeUnix はミリ秒のタイムスタンプなので、そのまま使用
      const startTime = new Date(reservation.start_time_unix!)
      const endTime = new Date(reservation.end_time_unix!)

      // 週表示の場合は週内の予約を全て表示
      // 日表示の場合は選択された日付の予約のみを表示
      if (viewMode === 'week') {
        if (
          startTime < startOfWeekFns(currentDate, { weekStartsOn: 1 }) ||
          startTime > endOfWeekFns(currentDate, { weekStartsOn: 1 })
        )
          return null
      } else {
        // 選択された日付と同じ日付かどうかをチェック
        if (!isSameDay(startTime, selectedDate)) return null
      }

      // 日本の曜日（月曜始まり）に合わせて調整
      let dayOfWeek = startTime.getDay() - 1 // 0が月曜、6が日曜
      if (dayOfWeek < 0) dayOfWeek = 6 // 日曜日の場合

      // 週表示のときは各曜日の列に配置
      // 日表示のときは1列目に配置
      const colStart = viewMode === 'week' ? dayOfWeek + 2 : 1

      const startRow = calculateGridRow(startTime.getHours(), startTime.getMinutes())
      const totalMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60)
      const rowSpan = calculateRowSpan(totalMinutes)

      return (
        <li
          key={reservation._id}
          className="relative mt-px flex"
          style={{
            gridRow: `${startRow} / span ${rowSpan}`,
            gridColumn: `${colStart} / span 1`,
          }}
        >
          <Link
            href={`/dashboard/reservation/${reservation._id}`}
            className="group absolute z-0 inset-1 flex flex-col overflow-y-auto rounded-md bg-success p-2 text-xs/5 hover:opacity-80 transition-opacity duration-200"
          >
            <p className="order-1 font-semibold text-success-foreground">
              {reservation.staff_name}
            </p>
            <p className="text-success-foreground group-hover:text-success-foreground font-bold">
              <time dateTime={startTime.toISOString()}>
                {format(startTime, 'HH:mm')} - {format(endTime, 'HH:mm')}
              </time>
            </p>
            <p className="mt-1 text-success-foreground my-4">
              {convertReservationStatus(reservation.status)}
            </p>
          </Link>
        </li>
      )
    })
  }

  // 10分刻みの時間表示を生成する関数（144行対応）
  const renderTimeSlots = () => {
    const slots: React.ReactNode[] = []

    // 144行分のスロットを生成（10分刻み）
    for (let i = 0; i < TOTAL_ROWS_PER_DAY; i++) {
      const totalMinutes = i * GRID_UNIT_MIN
      const hour = Math.floor(totalMinutes / 60)
      const minute = totalMinutes % 60

      // 1時間ごと（minute === 0）の時のみ時間ラベルを表示
      if (minute === 0) {
        const ampm = hour < 12 ? t('am') : t('pm')
        const hour12 = hour % 12 === 0 ? 12 : hour % 12

        slots.push(
          <div key={`hour-${i}`}>
            <div className="sticky bg-background rounded-md left-0 z-10 -mt-2.5 -ml-14 w-14 pr-2 text-right text-xs/5 text-muted-foreground text-nowrap">
              {ampm}
              {hour12}
              {t('oclock')}
            </div>
          </div>
        )
      } else {
        // 時間ラベル以外の行は空要素
        slots.push(<div key={`slot-${i}`} />)
      }
    }

    return slots
  }

  // クエリパラメータを更新する関数
  const updateQueryParams = (params: {
    staffId?: Id<'staff'> | null
    date?: Date
    viewMode?: 'week' | 'day'
  }) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (params.staffId !== undefined) {
      if (params.staffId) sp.set('staffId', params.staffId)
      else sp.delete('staffId')
    }
    if (params.date !== undefined) {
      if (params.date) sp.set('date', params.date.toISOString())
      else sp.delete('date')
    }
    if (params.viewMode !== undefined) {
      sp.set('viewMode', params.viewMode)
    }
    router.replace(`?${sp.toString()}`)
  }

  // スタッフ選択時
  const handleStaffChange = (value: Id<'staff'>) => {
    setSelectedStaffId(value)
    updateQueryParams({ staffId: value })
  }

  // 日付選択時
  const handleDateChange = (date: Date) => {
    if (viewMode === 'week') {
      setCurrentDate(date)
      updateQueryParams({ date, viewMode: 'week' })
    } else {
      setSelectedDate(date)
      updateQueryParams({ date, viewMode: 'day' })
    }
  }

  // ビューモード切替時
  const handleViewModeToggle = () => {
    const newMode = viewMode === 'week' ? 'day' : 'week'
    setViewMode(newMode)
    updateQueryParams({ viewMode: newMode, date: newMode === 'week' ? currentDate : selectedDate })
  }

  // 前の日/週へ移動
  const moveToPrevious = (): void => {
    if (viewMode === 'week') {
      const newDate = new Date(currentDate)
      newDate.setDate(currentDate.getDate() - 7)
      setCurrentDate(newDate)
      updateQueryParams({ date: newDate, viewMode: 'week' })
    } else {
      const newDate = new Date(selectedDate)
      newDate.setDate(selectedDate.getDate() - 1)
      setSelectedDate(newDate)
      updateQueryParams({ date: newDate, viewMode: 'day' })
    }
  }

  // 次の日/週へ移動
  const moveToNext = (): void => {
    if (viewMode === 'week') {
      const newDate = new Date(currentDate)
      newDate.setDate(currentDate.getDate() + 7)
      setCurrentDate(newDate)
      updateQueryParams({ date: newDate, viewMode: 'week' })
    } else {
      const newDate = new Date(selectedDate)
      newDate.setDate(selectedDate.getDate() + 1)
      setSelectedDate(newDate)
      updateQueryParams({ date: newDate, viewMode: 'day' })
    }
  }

  // 今日/今週へ移動
  const moveToToday = (): void => {
    setCurrentDate(new Date())
    setSelectedDate(new Date())
    updateQueryParams({ date: new Date(), viewMode })
  }

  // MICROプランでスタッフが一名の場合、自動選択する処理
  useEffect(() => {
    if (planName === 'MICRO' && staffs && staffs.length === 1 && !selectedStaffId) {
      setSelectedStaffId(staffs[0]._id)
    }
  }, [planName, staffs, selectedStaffId])

  // 予約データの更新
  useEffect(() => {
    if (reservations) {
      setCurrentReservations(reservations)
    }
  }, [reservations])

  // 日付フォーマットの更新
  useEffect(() => {
    const formatDates = async () => {
      if (viewMode === 'week') {
        const weekStart = startOfWeekFns(currentDate, { weekStartsOn: 1 })
        const weekEnd = endOfWeekFns(currentDate, { weekStartsOn: 1 })
        const [start, end] = await Promise.all([
          formatDate(weekStart, 'PPP', locale),
          formatDate(weekEnd, 'PPP', locale),
        ])
        setWeekStartFormatted(start)
        setWeekEndFormatted(end)
      } else {
        const formatted = await formatDate(selectedDate, 'PPP', locale)
        setSelectedDateFormatted(formatted)
      }
    }
    formatDates()
  }, [currentDate, selectedDate, viewMode, locale])

  return (
    <DashboardSection
      title={tNav('staffSchedule')}
      backLink="/dashboard"
      backLinkTitle={t('backToDashboard')}
    >
      <div className="flex min-w-0 h-full flex-col">
        <div className="sticky bg-card z-10 rounded-xl border border-border">
          <header className="flex flex-none flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex flex-col">
              <h2 className="text-sm md:text-lg font-semibold text-foreground">
                {viewMode === 'week' ? (
                  <time
                    className="flex flex-col md:flex-row items-center justify-center gap-1"
                    dateTime={`${format(startOfWeekFns(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')}/${format(endOfWeekFns(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`}
                  >
                    <span className="font-bold text-base md:text-xl">{weekStartFormatted}</span>
                    <div className=" text-muted-foreground text-xs">{t('from')}</div>
                    <span className="font-bold text-base md:text-xl">{weekEndFormatted}</span>
                  </time>
                ) : (
                  <time dateTime={format(selectedDate, 'yyyy-MM-dd')}>
                    {selectedDateFormatted}
                    <div className="md:hidden ml-2 inline-block text-muted-foreground text-xs">
                      ({weekDaysFull[selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1]})
                    </div>
                  </time>
                )}
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              <div className="md:hidden flex flex-col gap-2 items-end justify-end">
                <div className="w-fit min-w-[180px]">
                  <Select value={selectedStaffId ?? ''} onValueChange={handleStaffChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectStaff')} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffs?.map((staff) => (
                        <SelectItem key={staff._id} value={staff._id}>
                          {staff.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center">
                <div className="relative flex items-center rounded-md bg-background shadow-xs md:items-stretch">
                  <button
                    type="button"
                    className="flex size-11 items-center justify-center rounded-l-lg border-y border-l border-border text-muted-foreground hover:bg-muted hover:text-primary focus:relative"
                    onClick={moveToPrevious}
                  >
                    <span className="sr-only">
                      {viewMode === 'week' ? t('prevWeek') : t('prevDay')}
                    </span>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="hidden border-y border-border px-3.5 text-sm font-semibold text-primary hover:bg-muted focus:relative md:block"
                    onClick={moveToToday}
                  >
                    {t('today')}
                  </button>
                  <span className="relative -mx-px h-5 w-px bg-border md:hidden" />
                  <button
                    type="button"
                    className="flex size-11 items-center justify-center rounded-r-lg border-y border-r border-border text-primary hover:bg-muted focus:relative"
                    onClick={moveToNext}
                  >
                    <span className="sr-only">
                      {viewMode === 'week' ? t('nextWeek') : t('nextDay')}
                    </span>
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </button>
                </div>
                {/* ビューモード切替ボタン（PC表示専用） */}
                <button
                  type="button"
                  onClick={handleViewModeToggle}
                  className="ml-4 hidden md:inline-flex items-center rounded-md border border-border bg-background px-3.5 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-muted"
                >
                  {viewMode === 'day' ? t('weekView') : t('dayView')}
                </button>
                <div className="hidden md:ml-4 md:flex md:flex-col md:items-center">
                  <Select value={selectedStaffId ?? ''} onValueChange={handleStaffChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectStaff')} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffs &&
                        staffs.length > 0 &&
                        staffs.map((staff) => (
                          <SelectItem key={staff._id} value={staff._id}>
                            {staff.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Menu as="div" className="relative ml-6 md:hidden">
                  <MenuButton className="flex size-11 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-primary">
                    <span className="sr-only">{t('openMenu')}</span>
                    <Ellipsis className="size-5" aria-hidden="true" />
                  </MenuButton>

                  <MenuItems
                    transition
                    className="absolute right-0 z-20 mt-3 w-36 origin-top-right divide-y divide-border overflow-hidden rounded-md bg-background shadow-lg ring-1 ring-black/5 focus:outline-hidden data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                  >
                    <div className="py-1">
                      <MenuItem>
                        <a
                          href="#"
                          className="block px-4 py-2 text-sm text-muted-foreground data-focus:bg-muted data-focus:text-primary data-focus:outline-hidden"
                          onClick={moveToToday}
                        >
                          {t('goToToday')}
                        </a>
                      </MenuItem>
                      <MenuItem>
                        <Link
                          href="#"
                          className="block px-4 py-2 text-sm text-muted-foreground data-focus:bg-muted data-focus:text-primary data-focus:outline-hidden"
                          onClick={handleViewModeToggle}
                        >
                          {viewMode === 'day' ? t('switchToWeekView') : t('switchToDayView')}
                        </Link>
                      </MenuItem>
                    </div>
                  </MenuItems>
                </Menu>
              </div>
            </div>
          </header>
        </div>
        <div className="mt-6 mb-4">
          <p className="text-sm font-medium mb-2">出勤表</p>
          {staffWeekSchedules && staffWeekSchedules.length > 0 ? (
            <div className="flex gap-2 w-full overflow-x-auto pb-4">
              {staffWeekSchedules
                .sort((a, b) => {
                  const aValue = DAY_OF_WEEK_VALUES.find((d) => d.key === a.day_of_week)?.value ?? 0
                  const bValue = DAY_OF_WEEK_VALUES.find((d) => d.key === b.day_of_week)?.value ?? 0
                  return aValue - bValue
                })
                .map((schedule) => (
                  <div
                    key={schedule._id}
                    className={`flex flex-col p-3 rounded-lg border w-full text-nowrap ${
                      schedule.is_open
                        ? 'bg-success border-success-foreground text-success-foreground'
                        : 'bg-muted border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-2">
                      <span className="text-sm font-medium">
                        {weekDays[Number(schedule.day_of_week) - 1]}
                      </span>
                      <span className="text-xs text-nowrap px-2 py-0.5 rounded-full">
                        {convertDayOfWeek(schedule.day_of_week as DayOfWeek, locale)}
                      </span>
                      <span
                        className={`text-xs text-nowrap px-2 py-0.5 rounded-full ${
                          schedule.is_open
                            ? 'bg-success text-success-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {schedule.is_open ? '出勤' : '休み'}
                      </span>
                    </div>
                    {schedule.is_open && (
                      <div className="text-xs text-muted-foreground text-nowrap text-center tracking-wider font-medium">
                        {schedule.start_hour} - {schedule.end_hour}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="admin-empty-state flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('noScheduleAvailable')}</p>
            </div>
          )}
        </div>
        {reservations && reservations.length > 0 ? (
          <div className="flex min-w-0 h-full flex-col">
            <ScrollArea className="relative h-[calc(100vh)]">
              <div className="flex flex-auto flex-col">
                {/* 日付ヘッダー部分（モバイル） - 日本語化 */}
                {viewMode === 'week' && (
                  <div
                    className={`calendar-weekday-header shadow-sm sticky z-30 grid h-[70px] border-b border-border ${gridColsClass} bg-background ${timelineContainerWidthClass}`}
                    style={{
                      top: 'var(--header-offset, 0px)',
                      zIndex: 15,
                      gridTemplateRows: '1.75rem repeat(144, minmax(0, 1fr)) auto',
                    }}
                    aria-label={t('weekdayHeader')}
                  >
                    <div className="min-w-[56px]"></div>
                    {DAY_OF_WEEK_VALUES.filter((day) =>
                      staffWeekSchedules?.some((schedule) => schedule.day_of_week === day.key)
                    ).map((day) => {
                      const currentDate = new Date()
                      const dayOffset = day.value - currentDate.getDay()
                      const targetDate = new Date(currentDate)
                      targetDate.setDate(currentDate.getDate() + dayOffset)

                      const dateIsToday = isToday(targetDate)
                      const isSelected = targetDate.toDateString() === selectedDate.toDateString()
                      const hasReservations = hasReservationsOnDate(targetDate)
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className="flex flex-col text-xs items-center pt-2 bg-background"
                          onClick={() => {
                            handleDateChange(targetDate)
                          }}
                        >
                          <div className="flex items-center justify-center">
                            {weekDays[day.value - 1]}{' '}
                            {hasReservations && (
                              <span className="ml-1 w-1.5 h-1.5 bg-success text-success-foreground rounded-full" />
                            )}
                          </div>
                          <span
                            className={`mt-1 flex size-8 items-center justify-center py-3 ${
                              dateIsToday
                                ? 'rounded-full bg-success font-semibold text-success-foreground'
                                : isSelected
                                  ? 'rounded-full bg-success font-semibold text-success-foreground'
                                  : hasReservations
                                    ? 'font-semibold text-success-foreground ring-1 ring-success-foreground bg-success rounded-full'
                                    : 'font-semibold text-success-foreground'
                            }`}
                          >
                            {targetDate.getDate()}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {viewMode === 'day' && (
                  <div className="grid grid-cols-1 text-sm/6 text-muted-foreground sm:hidden">
                    <div className="flex justify-center items-center pt-2 pb-3">
                      <span className="font-medium">
                        {weekDaysFull[selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1]}
                      </span>
                      {hasReservationsOnDate(selectedDate) && (
                        <span className="ml-2 bg-success text-success-foreground px-2 py-0.5 rounded-full text-xs font-medium">
                          {t('hasReservations')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className={`flex flex-none flex-col ${timelineContainerWidthClass}`}>
                  <div className="flex flex-auto">
                    <div className="grid flex-auto grid-cols-1 grid-rows-1">
                      {/* 時間の行 - 144行（10分刻み） */}
                      <div
                        className={`col-start-1 col-end-2 row-start-1 grid divide-y divide-border`}
                        style={{
                          gridTemplateRows: `repeat(${TOTAL_ROWS_PER_DAY}, minmax(2.5rem, 1fr))`,
                        }}
                      >
                        <div ref={containerOffset} className="row-end-1 h-7"></div>
                        {renderTimeSlots()}
                      </div>

                      {/* gridの線 - 境界線を追加 */}
                      <div
                        className={`col-start-1 col-end-2 row-start-1 ${
                          viewMode === 'week' ? 'grid' : 'hidden'
                        } grid-rows-1 divide-x divide-border ${gridColsClass}`}
                      >
                        {viewMode === 'week' ? (
                          <>
                            <div className="col-start-1 row-span-full" />
                            <div className="col-start-2 row-span-full" />
                            <div className="col-start-3 row-span-full" />
                            <div className="col-start-4 row-span-full" />
                            <div className="col-start-5 row-span-full" />
                            <div className="col-start-6 row-span-full" />
                            <div className="col-start-7 row-span-full" />
                            <div className="col-start-8 row-span-full w-px sm:w-8" />
                          </>
                        ) : (
                          <div className="col-start-1 row-span-full border-r border-border" />
                        )}
                      </div>

                      {/* イベント表示エリア - 144行（10分刻み） */}
                      <ol
                        className={`col-start-1 col-end-2 row-start-1 grid ${gridColsClass}`}
                        style={{ gridTemplateRows: '1.75rem repeat(144, minmax(0, 1fr)) auto' }}
                      >
                        <div className="w-[56px]"></div>
                        {renderSchedules()}
                        {renderReservations()}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
              {viewMode === 'week' && <ScrollBar orientation="horizontal" />}
              <ScrollBar orientation="vertical" />
            </ScrollArea>
          </div>
        ) : isReservationsLoading && selectedStaffId ? (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-center h-full pt-24 py-12 px-4 sm:px-6 lg:px-8">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            </div>
          </div>
        ) : reservations.length === 0 && selectedStaffId ? (
          <div className="admin-empty-state flex-1 overflow-y-auto mt-4">
            <div className="flex items-center justify-center h-full py-12 px-4 sm:px-6 lg:px-8">
              <p className="text-muted-foreground text-sm">{t('noReservations')}</p>
            </div>
          </div>
        ) : (
          <div className="admin-empty-state flex-1 overflow-y-auto mt-4">
            <div className="flex items-center justify-center h-full py-12 px-4 sm:px-6 lg:px-8">
              <p className="text-muted-foreground text-sm">{t('selectStaffToShow')}</p>
            </div>
          </div>
        )}
      </div>
    </DashboardSection>
  )
}

export default withManagerAccess(StaffSchedulePage)
