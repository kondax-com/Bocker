'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Id } from '@/convex/_generated/dataModel'
import { useRouter } from 'next/navigation'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Clock, Calendar, Save, Clock3, Loader2, Coffee, Settings2, X, Check } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { useQuery, useMutation } from 'convex/react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { useZodForm } from '@/hooks/useZodForm'
import { z } from 'zod'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

// dayOfWeekTypeの値を定義（エラー修正用）
const DAY_OF_WEEK_VALUES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

const staffScheduleConfigSchema = z.object({
  staff_id: z.string().optional(),
  day_of_week: z.enum(DAY_OF_WEEK_VALUES).optional(),
  is_open: z.boolean().optional(),
  start_hour: z.string().optional(),
  end_hour: z.string().optional(),
})

// 曜日の定義（日本語と英語の対応）- 月曜から日曜の順
const DAYS_OF_WEEK = (t: ReturnType<typeof useTranslations>) => [
  {
    id: 'monday',
    week: t('monday'),
    short_week: '月',
    color: 'bg-accent-2-foreground border-accent-2 text-accent-2',
  },
  {
    id: 'tuesday',
    week: t('tuesday'),
    short_week: '火',
    color: 'bg-accent-2-foreground border-accent-2 text-accent-2',
  },
  {
    id: 'wednesday',
    week: t('wednesday'),
    short_week: '水',
    color: 'bg-accent-2-foreground border-accent-2 text-accent-2',
  },
  {
    id: 'thursday',
    week: t('thursday'),
    short_week: '木',
    color: 'bg-accent-2-foreground border-accent-2 text-accent-2',
  },
  {
    id: 'friday',
    week: t('friday'),
    short_week: '金',
    color: 'bg-accent-2-foreground border-accent-2 text-accent-2',
  },
  {
    id: 'saturday',
    week: t('saturday'),
    short_week: '土',
    color: 'bg-link border-link-foreground text-link-foreground',
  },
  {
    id: 'sunday',
    week: t('sunday'),
    short_week: '日',
    color: 'bg-link border-link-foreground text-link-foreground',
  },
]

// サロン曜日スケジュールの型定義
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

// 各曜日の営業時間設定
export interface DaySchedule {
  is_open: boolean
  start_hour: string
  end_hour: string
  schedule_id?: string // 既存レコードのID
}

// 曜日スケジュールデータ
export interface WeekScheduleData {
  // 各曜日の設定
  schedule_settings: Record<DayOfWeek, DaySchedule>
  // 共通設定
  use_common_hours: boolean
  common_start_hour: string
  common_end_hour: string
}

const defaultScheduleHour = { start_hour: '09:00', end_hour: '17:00' }

export default function MyWeekScheduleForm() {
  const { tenantId, orgId, staffId } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const t = useTranslations('staff.myPage.weekSchedule')
  // 横スクロール可否判定用
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isScrollable, setIsScrollable] = useState(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const updateScrollable = () => {
      setIsScrollable(el.scrollWidth > el.clientWidth)
    }
    updateScrollable() // 初回判定
    el.addEventListener('scroll', updateScrollable)
    window.addEventListener('resize', updateScrollable)
    return () => {
      el.removeEventListener('scroll', updateScrollable)
      window.removeEventListener('resize', updateScrollable)
    }
  }, [])
  const [isSaving, setIsSaving] = useState(false)
  const [scheduleTab, setScheduleTab] = useState('common')
  const router = useRouter()
  // スケジュールデータの状態
  const [weekScheduleData, setWeekScheduleData] = useState<WeekScheduleData>({
    schedule_settings: {
      monday: { is_open: false, ...defaultScheduleHour },
      tuesday: { is_open: false, ...defaultScheduleHour },
      wednesday: { is_open: false, ...defaultScheduleHour },
      thursday: { is_open: false, ...defaultScheduleHour },
      friday: { is_open: false, ...defaultScheduleHour },
      saturday: { is_open: false, ...defaultScheduleHour },
      sunday: { is_open: false, ...defaultScheduleHour },
    },
    use_common_hours: false,
    common_start_hour: defaultScheduleHour.start_hour,
    common_end_hour: defaultScheduleHour.end_hour,
  })

  // すでに登録されているデータを取得
  const staffWeekSchedules = useQuery(api.staff.week_schedule.query.getByTenantOrgStaff, {
    tenant_id: tenantId as Id<'tenant'>,
    org_id: orgId as Id<'organization'>,
    staff_id: staffId as Id<'staff'>,
  })

  const orgWeekSchedules = useQuery(api.organization.week_schedule.query.getAllByTenantAndOrg, {
    tenant_id: tenantId as Id<'tenant'>,
    org_id: orgId as Id<'organization'>,
  })

  const updateWeekSchedule = useMutation(api.staff.week_schedule.mutation.updateWeekSchedule)

  const { handleSubmit } = useZodForm(staffScheduleConfigSchema)

  // 時間の選択肢を生成（メモ化で最適化）
  const timeOptions = useMemo(() => {
    const options: string[] = []
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const h = hour.toString().padStart(2, '0')
        const m = minute.toString().padStart(2, '0')
        options.push(`${h}:${m}`)
      }
    }
    options.push('24:00')
    return options
  }, [])

  // 開始時間より後の時間オプションをフィルタリングする関数（メモ化）
  const getEndHourOptions = useCallback(
    (startHour: string) => {
      return timeOptions.filter((time) => time > startHour)
    },
    [timeOptions]
  )

  // 共通設定用の終了時間オプション（メモ化）
  const commonEndHourOptions = useMemo(
    () => getEndHourOptions(weekScheduleData.common_start_hour),
    [weekScheduleData.common_start_hour, getEndHourOptions]
  )

  // staffIdが変更されたときにスケジュールをリセット
  useEffect(() => {
    setWeekScheduleData({
      schedule_settings: {
        monday: { is_open: false, ...defaultScheduleHour },
        tuesday: { is_open: false, ...defaultScheduleHour },
        wednesday: { is_open: false, ...defaultScheduleHour },
        thursday: { is_open: false, ...defaultScheduleHour },
        friday: { is_open: false, ...defaultScheduleHour },
        saturday: { is_open: false, ...defaultScheduleHour },
        sunday: { is_open: false, ...defaultScheduleHour },
      },
      use_common_hours: true,
      common_start_hour: defaultScheduleHour.start_hour,
      common_end_hour: defaultScheduleHour.end_hour,
    })
  }, [staffId])

  // DBから取得したスケジュールデータを初期表示に反映
  useEffect(() => {
    if (staffWeekSchedules && Array.isArray(staffWeekSchedules) && staffWeekSchedules.length > 0) {
      // 初期データロード時のみ反映するために、scheduleIdが設定されていない場合のみ更新する
      const shouldUpdateSchedule = Object.values(weekScheduleData.schedule_settings).some(
        (setting) => !setting.schedule_id
      )

      if (shouldUpdateSchedule) {
        const newScheduleSettings = { ...weekScheduleData.schedule_settings }
        let earliest_start_hour = '24:00' // 最も早い開始時間を追跡
        let latest_end_hour = '00:00' // 最も遅い終了時間を追跡
        staffWeekSchedules.forEach((schedule) => {
          if (schedule.day_of_week && typeof schedule.day_of_week === 'string') {
            const dayOfWeek = schedule.day_of_week as DayOfWeek
            const isOpen = schedule.is_open ?? false
            const startHour = schedule.start_hour || defaultScheduleHour.start_hour
            const endHour = schedule.end_hour || defaultScheduleHour.end_hour

            newScheduleSettings[dayOfWeek] = {
              is_open: isOpen,
              start_hour: startHour,
              end_hour: endHour,
              schedule_id: schedule._id,
            }

            // 営業日の場合、最も早い開始時間と最も遅い終了時間を更新
            if (isOpen) {
              if (startHour < earliest_start_hour) {
                earliest_start_hour = startHour
              }
              if (endHour > latest_end_hour) {
                latest_end_hour = endHour
              }
            }
          }
        })

        setWeekScheduleData((prev) => ({
          ...prev,
          schedule_settings: newScheduleSettings,
        }))
      }
    }
  }, [staffWeekSchedules]) // eslint-disable-line react-hooks/exhaustive-deps

  // 営業日変更時の処理
  const handleDayToggle = useCallback((day: DayOfWeek) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.schedule_settings }
      const dayId = day as DayOfWeek

      // 営業状態を切り替え
      const newIsOpen = !newScheduleSettings[dayId].is_open

      // 営業状態がONになるとき
      if (newIsOpen) {
        // 共通設定がONの場合は共通の時間設定を適用
        if (prev.use_common_hours) {
          newScheduleSettings[dayId] = {
            is_open: true,
            start_hour: prev.common_start_hour,
            end_hour: prev.common_end_hour,
            ...(newScheduleSettings[dayId].schedule_id
              ? { schedule_id: newScheduleSettings[dayId].schedule_id }
              : {}),
          }
        } else {
          newScheduleSettings[dayId] = {
            is_open: true,
            start_hour: newScheduleSettings[dayId].start_hour,
            end_hour: newScheduleSettings[dayId].end_hour,
            ...(newScheduleSettings[dayId].schedule_id
              ? { schedule_id: newScheduleSettings[dayId].schedule_id }
              : {}),
          }
        }
      } else {
        // 営業状態をOFFに
        newScheduleSettings[dayId] = {
          ...newScheduleSettings[dayId],
          is_open: false,
          ...(newScheduleSettings[dayId].schedule_id
            ? { schedule_id: newScheduleSettings[dayId].schedule_id }
            : {}),
        }
      }

      return {
        ...prev,
        schedule_settings: newScheduleSettings,
      }
    })
  }, [])

  // 共通営業時間設定の切り替え
  const handleUseCommonHoursChange = useCallback((checked: boolean) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.schedule_settings }
      if (checked) {
        // 共通設定がONになるタイミングで、営業日の時間を一括で共通にそろえる
        Object.keys(newScheduleSettings).forEach((day) => {
          const dayId = day as DayOfWeek
          if (newScheduleSettings[dayId].is_open) {
            newScheduleSettings[dayId].start_hour = prev.common_start_hour
            newScheduleSettings[dayId].end_hour = prev.common_end_hour
          }
        })
      }

      return {
        ...prev,
        use_common_hours: checked,
        schedule_settings: newScheduleSettings,
      }
    })
  }, [])

  // 共通開始時間の変更
  const handleCommonStartHourChange = useCallback(
    (value: string) => {
      setWeekScheduleData((prev) => {
        const newScheduleSettings = { ...prev.schedule_settings }

        // 終了時間が開始時間より前になる場合、終了時間を調整
        let new_end_hour = prev.common_end_hour
        if (new_end_hour <= value) {
          // 開始時間の次の時間帯を終了時間に設定
          const endHourOptions = getEndHourOptions(value)
          new_end_hour = endHourOptions.length > 0 ? endHourOptions[0] : '24:00'
        }

        if (prev.use_common_hours) {
          Object.keys(newScheduleSettings).forEach((day) => {
            const dayId = day as DayOfWeek
            if (newScheduleSettings[dayId].is_open) {
              newScheduleSettings[dayId].start_hour = value
              // 終了時間も調整
              if (newScheduleSettings[dayId].end_hour <= value) {
                newScheduleSettings[dayId].end_hour = new_end_hour
              }
            }
          })
        }

        return {
          ...prev,
          common_start_hour: value,
          common_end_hour: new_end_hour,
          schedule_settings: newScheduleSettings,
        }
      })
    },
    [getEndHourOptions]
  )

  // 共通終了時間の変更
  const handleCommonEndHourChange = useCallback((value: string) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.schedule_settings }
      if (prev.use_common_hours) {
        Object.keys(newScheduleSettings).forEach((day) => {
          const dayId = day as DayOfWeek
          if (newScheduleSettings[dayId].is_open) {
            newScheduleSettings[dayId].end_hour = value
          }
        })
      }

      return {
        ...prev,
        common_end_hour: value,
        schedule_settings: newScheduleSettings,
      }
    })
  }, [])

  // 個別の曜日設定の更新
  const updateDaySchedule = useCallback(
    (day: DayOfWeek, field: 'start_hour' | 'end_hour', value: string) => {
      setWeekScheduleData((prev) => {
        const newScheduleSettings = { ...prev.schedule_settings }

        if (field === 'start_hour') {
          // 開始時間を変更した場合、終了時間が開始時間より前になる場合は終了時間も調整
          const current_end_hour = newScheduleSettings[day].end_hour
          if (current_end_hour <= value) {
            const endHourOptions = getEndHourOptions(value)
            const new_end_hour = endHourOptions.length > 0 ? endHourOptions[0] : '24:00'
            newScheduleSettings[day] = {
              ...newScheduleSettings[day],
              start_hour: value,
              end_hour: new_end_hour,
            }
          } else {
            newScheduleSettings[day] = {
              ...newScheduleSettings[day],
              start_hour: value,
            }
          }
        } else {
          // 終了時間の変更
          newScheduleSettings[day] = {
            ...newScheduleSettings[day],
            end_hour: value,
          }
        }

        return {
          ...prev,
          schedule_settings: newScheduleSettings,
        }
      })
    },
    [getEndHourOptions]
  )

  // 営業中の曜日を取得（メモ化）
  const activeDays = useMemo(
    () =>
      Object.entries(weekScheduleData.schedule_settings)
        .filter(([, setting]) => setting.is_open)
        .map(([day]) => day),
    [weekScheduleData.schedule_settings]
  )

  // フォーム送信で Mutation 呼び出し
  const onSubmit = useCallback(async () => {
    // 送信中状態を設定
    setIsSaving(true)

    // 送信前にscheduleIdを除外した新しいオブジェクトを作成
    const cleanedScheduleSettings: Record<
      string,
      { is_open: boolean; start_hour: string; end_hour: string }
    > = {}

    // 各曜日のデータからscheduleIdを除外
    Object.entries(weekScheduleData.schedule_settings).forEach(([day, settings]) => {
      cleanedScheduleSettings[day] = {
        is_open: settings.is_open,
        start_hour: settings.start_hour,
        end_hour: settings.end_hour,
      }
    })

    try {
      await updateWeekSchedule({
        tenant_id: tenantId as Id<'tenant'>,
        org_id: orgId as Id<'organization'>,
        staff_id: staffId as Id<'staff'>,
        schedule_settings: cleanedScheduleSettings,
      })

      // 成功メッセージ
      toast.success(t('updated'))
      router.refresh()
    } catch (err) {
      showErrorToast(err)
    } finally {
      setIsSaving(false)
    }
  }, [weekScheduleData, updateWeekSchedule, staffId, router, tenantId, orgId, showErrorToast, t])

  // ローディング状態
  if (staffWeekSchedules === undefined) {
    return <Loading />
  }

  return (
    <div>
      <Card className="admin-panel overflow-hidden">
        <CardHeader>
          <CardTitle className="text-foreground text-lg font-semibold">{t('title')}</CardTitle>
        </CardHeader>

        <CardContent className="px-4 sm:px-6">
          <div className="space-y-8">
            {/* 営業日設定 */}
            <div>
              <p className="text-sm mb-2 font-bold text-muted-foreground">
                {t('salonBusinessDays')}
              </p>
              {/* 横スクロール可能リスト  */}
              <div className="relative mb-4">
                <div
                  ref={scrollContainerRef}
                  className="flex overflow-x-auto w-full divide-x p-2 items-start gap-2 bg-muted rounded-lg pr-6"
                >
                  {DAYS_OF_WEEK(t).map((day) => {
                    const schedule = orgWeekSchedules?.find(
                      (schedule) => schedule.day_of_week === day.id
                    )
                    return (
                      <div
                        key={day.id}
                        className="flex flex-col min-w-24 justify-center items-center gap-2 text-xs p-1"
                      >
                        <p className="font-semibold text-xs flex gap-2 items-center">
                          {day.week}
                          {schedule?.is_open ? (
                            <span className="text-accent-2 bg-accent-2-foreground rounded-full px-2 py-1">
                              {t('businessDay')}
                            </span>
                          ) : (
                            <span className="text-destructive bg-destructive-foreground rounded-full px-2 py-1">
                              {t('regularHoliday')}
                            </span>
                          )}
                        </p>

                        {schedule?.is_open && (
                          <span className="text-muted-foreground">
                            {schedule?.start_hour} ~ {schedule?.end_hour}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 右端グラデーション（スクロールヒント） */}
                {isScrollable && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-muted to-transparent" />
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {DAYS_OF_WEEK(t)
                  .filter((day) =>
                    orgWeekSchedules?.some(
                      (schedule) => schedule.day_of_week === day.id && schedule.is_open === true
                    )
                  )
                  .map((day) => {
                    const dayId = day.id as DayOfWeek
                    const isOpen = weekScheduleData.schedule_settings[dayId].is_open

                    return (
                      <div
                        key={day.id}
                        onClick={() => handleDayToggle(dayId)}
                        className={`
                          cursor-pointer p-3 rounded-lg transition-all border
                          ${
                            isOpen
                              ? `${day.color} border-current shadow-sm`
                              : 'bg-muted border-border text-muted-foreground'
                          }
                        `}
                      >
                        <div className="flex flex-col items-start justify-between">
                          <span className="font-semibold mb-1">{day.week}</span>
                          {isOpen ? (
                            <div className="flex items-center gap-1 text-xs">
                              <Check className="h-4 w-4" />
                              <span>{t('workingDay')}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs">
                              <X className="h-4 w-4" />
                              <span>{t('dayOff')}</span>
                            </div>
                          )}
                        </div>

                        {isOpen && (
                          <div className="mt-2 text-sm font-bold ">
                            {weekScheduleData.schedule_settings[dayId].start_hour} ~{' '}
                            {weekScheduleData.schedule_settings[dayId].end_hour}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-link-foreground" />
                <h3 className="text-lg font-semibold">{t('workTimeSettings')}</h3>
              </div>

              <Tabs value={scheduleTab} onValueChange={setScheduleTab} className="w-full">
                <TabsList className="mb-4 p-1 rounded-lg">
                  <TabsTrigger value="common">
                    <Settings2 className="h-4 w-4 mr-2" />
                    {t('commonSettings')}
                  </TabsTrigger>
                  <TabsTrigger value="individual">
                    <Calendar className="h-4 w-4 mr-2" />
                    {t('individualSettings')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="common">
                  <div className="flex items-center gap-2 mb-6">
                    <Switch
                      checked={weekScheduleData.use_common_hours}
                      onCheckedChange={handleUseCommonHoursChange}
                    />
                    <Label className="font-medium cursor-pointer">{t('useCommonHours')}</Label>
                  </div>

                  {weekScheduleData.use_common_hours && (
                    <div>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center">
                          <Clock3 className="mr-2 h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">{t('workingHours')}</span>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <Select
                            value={weekScheduleData.common_start_hour}
                            onValueChange={handleCommonStartHourChange}
                          >
                            <SelectTrigger className="w-24 sm:w-28">
                              <SelectValue placeholder={t('startTime')} />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-60">
                                {timeOptions.map((time) => (
                                  <SelectItem key={`common-open-${time}`} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>

                          <span className="text-lg font-semibold">〜</span>

                          <Select
                            value={weekScheduleData.common_end_hour}
                            onValueChange={handleCommonEndHourChange}
                          >
                            <SelectTrigger className="w-24 sm:w-28">
                              <SelectValue placeholder={t('endTime')} />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-60">
                                {commonEndHourOptions.length > 0 ? (
                                  commonEndHourOptions.map((time) => (
                                    <SelectItem key={`common-close-${time}`} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                    {t('laterThanStartTime')}
                                  </div>
                                )}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="individual">
                  <div>
                    {activeDays.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {DAYS_OF_WEEK(t)
                          .filter(
                            (day) => weekScheduleData.schedule_settings[day.id as DayOfWeek].is_open
                          )
                          .map((day) => {
                            const dayId = day.id as DayOfWeek
                            const daySetting = weekScheduleData.schedule_settings[dayId]
                            // 各曜日ごとに、開始時間より後の終了時間オプションを取得
                            const endHourOptions = getEndHourOptions(daySetting.start_hour)

                            return (
                              <div
                                key={dayId}
                                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg ${day.color}`}
                              >
                                <div className="flex flex-col justify-between w-full">
                                  <div className="font-semibold min-w-24 mb-1">{day.week}</div>

                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={daySetting.start_hour}
                                      onValueChange={(value) =>
                                        updateDaySchedule(dayId, 'start_hour', value)
                                      }
                                    >
                                      <SelectTrigger className="w-24 sm:w-28">
                                        <SelectValue placeholder={t('startTime')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <ScrollArea className="h-60">
                                          {timeOptions.map((time) => (
                                            <SelectItem key={`open-${dayId}-${time}`} value={time}>
                                              {time}
                                            </SelectItem>
                                          ))}
                                        </ScrollArea>
                                      </SelectContent>
                                    </Select>

                                    <span className="text-lg ">〜</span>

                                    <Select
                                      value={daySetting.end_hour}
                                      onValueChange={(value) =>
                                        updateDaySchedule(dayId, 'end_hour', value)
                                      }
                                    >
                                      <SelectTrigger className="w-24 sm:w-28">
                                        <SelectValue placeholder={t('endTime')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <ScrollArea className="h-60">
                                          {endHourOptions.length > 0 ? (
                                            endHourOptions.map((time) => (
                                              <SelectItem
                                                key={`close-${dayId}-${time}`}
                                                value={time}
                                              >
                                                {time}
                                              </SelectItem>
                                            ))
                                          ) : (
                                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                              {t('laterThanStartTime')}
                                            </div>
                                          )}
                                        </ScrollArea>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    ) : (
                      <div className="admin-empty-state flex flex-col items-center text-center">
                        <Coffee className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground mb-2">{t('noWorkingDays')}</p>
                        <p className="text-sm text-muted-foreground">{t('selectWorkingDay')}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="mt-8 flex justify-end items-center gap-3">
            <Button
              type="submit"
              size="lg"
              className="min-h-11 min-w-[120px] rounded-lg px-5"
              onClick={handleSubmit(onSubmit)}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('save')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
