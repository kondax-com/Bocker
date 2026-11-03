'use client'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Loading } from '@/components/common'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
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
import { Calendar, Save, Coffee, Settings2, X, Check } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { useQuery, useMutation } from 'convex/react'
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

const salonScheduleConfigSchema = z.object({
  salonId: z.string().optional(),
  dayOfWeek: z.enum(DAY_OF_WEEK_VALUES).optional(),
  isOpen: z.boolean().optional(),
  startHour: z.string().optional(),
  endHour: z.string().optional(),
})

// 曜日の定義（日本語と英語の対応）- 月曜から日曜の順
const DAYS_OF_WEEK = (t: ReturnType<typeof useTranslations>) => [
  {
    id: 'monday',
    week: t('days.monday'),
    shortWeek: t('days.monday').slice(0, 1),
    color: 'bg-success border-success-foreground text-success-foreground',
  },
  {
    id: 'tuesday',
    week: t('days.tuesday'),
    shortWeek: t('days.tuesday').slice(0, 1),
    color: 'bg-success border-success-foreground text-success-foreground',
  },
  {
    id: 'wednesday',
    week: t('days.wednesday'),
    shortWeek: t('days.wednesday').slice(0, 1),
    color: 'bg-success border-success-foreground text-success-foreground',
  },
  {
    id: 'thursday',
    week: t('days.thursday'),
    shortWeek: t('days.thursday').slice(0, 1),
    color: 'bg-success border-success-foreground text-success-foreground',
  },
  {
    id: 'friday',
    week: t('days.friday'),
    shortWeek: t('days.friday').slice(0, 1),
    color: 'bg-success border-success-foreground text-success-foreground',
  },
  {
    id: 'saturday',
    week: t('days.saturday'),
    shortWeek: t('days.saturday').slice(0, 1),
    color: 'bg-link border-link-foreground text-link-foreground',
  },
  {
    id: 'sunday',
    week: t('days.sunday'),
    shortWeek: t('days.sunday').slice(0, 1),
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
  isOpen: boolean
  startHour: string
  endHour: string
  scheduleId?: string // 既存レコードのID
}

// 曜日スケジュールデータ
export interface WeekScheduleData {
  // 各曜日の設定
  scheduleSettings: Record<DayOfWeek, DaySchedule>
  // 共通設定
  useCommonHours: boolean
  commonStartHour: string
  commonEndHour: string
}

const defaultScheduleHour = { startHour: '08:00', endHour: '19:00' }

export default function OrgWeekHourSchedule() {
  const router = useRouter()
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()
  const t = useTranslations('settings.businessHours')
  const [isSaving, setIsSaving] = useState(false)
  const [scheduleTab, setScheduleTab] = useState('common')
  const { showErrorToast } = useErrorHandler()

  // スケジュールデータの状態
  const [weekScheduleData, setWeekScheduleData] = useState<WeekScheduleData>({
    scheduleSettings: {
      monday: { isOpen: false, ...defaultScheduleHour },
      tuesday: { isOpen: false, ...defaultScheduleHour },
      wednesday: { isOpen: false, ...defaultScheduleHour },
      thursday: { isOpen: false, ...defaultScheduleHour },
      friday: { isOpen: false, ...defaultScheduleHour },
      saturday: { isOpen: false, ...defaultScheduleHour },
      sunday: { isOpen: false, ...defaultScheduleHour },
    },
    useCommonHours: false,
    commonStartHour: defaultScheduleHour.startHour,
    commonEndHour: defaultScheduleHour.endHour,
  })

  // すでに登録されているデータを取得
  const salonWeekSchedules = useQuery(
    api.organization.week_schedule.query.getAllByTenantAndOrg,
    tenantId && orgId ? { tenant_id: tenantId, org_id: orgId } : 'skip'
  )

  const updateWeekSchedule = useMutation(api.organization.week_schedule.mutation.updateWeekSchedule)

  const { handleSubmit } = useZodForm(salonScheduleConfigSchema)

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
    () => getEndHourOptions(weekScheduleData.commonStartHour),
    [weekScheduleData.commonStartHour, getEndHourOptions]
  )

  // DBから取得したスケジュールデータを初期表示に反映
  useEffect(() => {
    if (salonWeekSchedules && Array.isArray(salonWeekSchedules) && salonWeekSchedules.length > 0) {
      // 初期データロード時のみ反映するために、scheduleIdが設定されていない場合のみ更新する
      const shouldUpdateSchedule = Object.values(weekScheduleData.scheduleSettings).some(
        (setting) => !setting.scheduleId
      )

      if (shouldUpdateSchedule) {
        const newScheduleSettings = { ...weekScheduleData.scheduleSettings }
        let earliestStartHour = '24:00' // 最も早い開始時間を追跡
        let latestEndHour = '00:00' // 最も遅い終了時間を追跡
        let hasOpenDay = false // 営業日があるかどうかを追跡

        salonWeekSchedules.forEach((schedule) => {
          if (schedule.day_of_week && typeof schedule.day_of_week === 'string') {
            const dayOfWeek = schedule.day_of_week as DayOfWeek
            const isOpen = schedule.is_open ?? false
            const startHour = schedule.start_hour || defaultScheduleHour.startHour
            const endHour = schedule.end_hour || defaultScheduleHour.endHour

            newScheduleSettings[dayOfWeek] = {
              isOpen,
              startHour,
              endHour,
              scheduleId: schedule._id,
            }

            // 営業日の場合、最も早い開始時間と最も遅い終了時間を更新
            if (isOpen) {
              hasOpenDay = true
              if (startHour < earliestStartHour) {
                earliestStartHour = startHour
              }
              if (endHour > latestEndHour) {
                latestEndHour = endHour
              }
            }
          }
        })

        // 共通時間を更新（営業日がある場合のみ）
        const updatedCommonHours = {
          commonStartHour: hasOpenDay ? earliestStartHour : defaultScheduleHour.startHour,
          commonEndHour: hasOpenDay ? latestEndHour : defaultScheduleHour.endHour,
        }

        setWeekScheduleData((prev) => ({
          ...prev,
          ...updatedCommonHours,
          scheduleSettings: newScheduleSettings,
        }))
      }
    }
  }, [salonWeekSchedules]) // eslint-disable-line react-hooks/exhaustive-deps

  // 営業日変更時の処理
  const handleDayToggle = useCallback((day: DayOfWeek) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.scheduleSettings }
      const dayId = day as DayOfWeek

      // 営業状態を切り替え
      const newIsOpen = !newScheduleSettings[dayId].isOpen

      // 営業状態がONになるとき
      if (newIsOpen) {
        // 共通設定がONの場合は共通の時間設定を適用
        if (prev.useCommonHours) {
          newScheduleSettings[dayId] = {
            isOpen: true,
            startHour: prev.commonStartHour,
            endHour: prev.commonEndHour,
            ...(newScheduleSettings[dayId].scheduleId
              ? { scheduleId: newScheduleSettings[dayId].scheduleId }
              : {}),
          }
        } else {
          newScheduleSettings[dayId] = {
            isOpen: true,
            startHour: newScheduleSettings[dayId].startHour,
            endHour: newScheduleSettings[dayId].endHour,
            ...(newScheduleSettings[dayId].scheduleId
              ? { scheduleId: newScheduleSettings[dayId].scheduleId }
              : {}),
          }
        }
      } else {
        // 営業状態をOFFに
        newScheduleSettings[dayId] = {
          ...newScheduleSettings[dayId],
          isOpen: false,
          ...(newScheduleSettings[dayId].scheduleId
            ? { scheduleId: newScheduleSettings[dayId].scheduleId }
            : {}),
        }
      }

      return {
        ...prev,
        scheduleSettings: newScheduleSettings,
      }
    })
  }, [])

  // 共通営業時間設定の切り替え
  const handleUseCommonHoursChange = useCallback((checked: boolean) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.scheduleSettings }
      if (checked) {
        // 共通設定がONになるタイミングで、営業日の時間を一括で共通にそろえる
        Object.keys(newScheduleSettings).forEach((day) => {
          const dayId = day as DayOfWeek
          if (newScheduleSettings[dayId].isOpen) {
            newScheduleSettings[dayId].startHour = prev.commonStartHour
            newScheduleSettings[dayId].endHour = prev.commonEndHour
          }
        })
      }

      return {
        ...prev,
        useCommonHours: checked,
        scheduleSettings: newScheduleSettings,
      }
    })
  }, [])

  // 共通開始時間の変更
  const handleCommonStartHourChange = useCallback(
    (value: string) => {
      setWeekScheduleData((prev) => {
        const newScheduleSettings = { ...prev.scheduleSettings }

        // 終了時間が開始時間より前になる場合、終了時間を調整
        let newEndHour = prev.commonEndHour
        if (newEndHour <= value) {
          // 開始時間の次の時間帯を終了時間に設定
          const endHourOptions = getEndHourOptions(value)
          newEndHour = endHourOptions.length > 0 ? endHourOptions[0] : '24:00'
        }

        if (prev.useCommonHours) {
          Object.keys(newScheduleSettings).forEach((day) => {
            const dayId = day as DayOfWeek
            if (newScheduleSettings[dayId].isOpen) {
              newScheduleSettings[dayId].startHour = value
              // 終了時間も調整
              if (newScheduleSettings[dayId].endHour <= value) {
                newScheduleSettings[dayId].endHour = newEndHour
              }
            }
          })
        }

        return {
          ...prev,
          commonStartHour: value,
          commonEndHour: newEndHour,
          scheduleSettings: newScheduleSettings,
        }
      })
    },
    [getEndHourOptions]
  )

  // 共通終了時間の変更
  const handleCommonEndHourChange = useCallback((value: string) => {
    setWeekScheduleData((prev) => {
      const newScheduleSettings = { ...prev.scheduleSettings }
      if (prev.useCommonHours) {
        Object.keys(newScheduleSettings).forEach((day) => {
          const dayId = day as DayOfWeek
          if (newScheduleSettings[dayId].isOpen) {
            newScheduleSettings[dayId].endHour = value
          }
        })
      }

      return {
        ...prev,
        commonEndHour: value,
        scheduleSettings: newScheduleSettings,
      }
    })
  }, [])

  // 個別の曜日設定の更新
  const updateDaySchedule = useCallback(
    (day: DayOfWeek, field: 'startHour' | 'endHour', value: string) => {
      setWeekScheduleData((prev) => {
        const newScheduleSettings = { ...prev.scheduleSettings }

        if (field === 'startHour') {
          // 開始時間を変更した場合、終了時間が開始時間より前になる場合は終了時間も調整
          const currentEndHour = newScheduleSettings[day].endHour
          if (currentEndHour <= value) {
            const endHourOptions = getEndHourOptions(value)
            const newEndHour = endHourOptions.length > 0 ? endHourOptions[0] : '24:00'
            newScheduleSettings[day] = {
              ...newScheduleSettings[day],
              startHour: value,
              endHour: newEndHour,
            }
          } else {
            newScheduleSettings[day] = {
              ...newScheduleSettings[day],
              startHour: value,
            }
          }
        } else {
          // 終了時間の変更
          newScheduleSettings[day] = {
            ...newScheduleSettings[day],
            endHour: value,
          }
        }

        return {
          ...prev,
          scheduleSettings: newScheduleSettings,
        }
      })
    },
    [getEndHourOptions]
  )

  // 営業中の曜日を取得（メモ化）
  const activeDays = useMemo(
    () =>
      Object.entries(weekScheduleData.scheduleSettings)
        .filter(([, setting]) => setting.isOpen)
        .map(([day]) => day),
    [weekScheduleData.scheduleSettings]
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
    Object.entries(weekScheduleData.scheduleSettings).forEach(([day, settings]) => {
      cleanedScheduleSettings[day] = {
        is_open: settings.isOpen,
        start_hour: settings.startHour,
        end_hour: settings.endHour,
      }
    })

    try {
      await updateWeekSchedule({
        tenant_id: tenantId!,
        org_id: orgId!,
        schedule_settings: cleanedScheduleSettings,
      })

      // 成功メッセージ
      toast.success(t('settingsSaved'))
      router.push(`/dashboard/setting`)
    } catch (err) {
      showErrorToast(err)
    } finally {
      setIsSaving(false)
    }
  }, [weekScheduleData, orgId, tenantId, updateWeekSchedule, showErrorToast, t, router])

  // ローディング状態
  if (salonWeekSchedules === undefined) {
    return <Loading />
  }
  if (!isLoaded) {
    return <Loading />
  }

  return (
    <div className="admin-panel admin-form p-5 sm:p-6">
      <div className="">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>

        <div className="space-y-8 my-5">
          {/* 営業日設定 */}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            {DAYS_OF_WEEK(t).map((day) => {
              const dayId = day.id as DayOfWeek
              const isOpen = weekScheduleData.scheduleSettings[dayId].isOpen

              return (
                <button
                  type="button"
                  aria-pressed={isOpen}
                  key={day.id}
                  onClick={() => handleDayToggle(dayId)}
                  className={`
                          cursor-pointer p-3 rounded-xl border border-border transition-colors text-left
                          ${
                            isOpen
                              ? `${day.color} border-current shadow-sm`
                              : 'bg-muted border-border text-muted-foreground'
                          }
                        `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold mb-1">{day.week}</span>
                    {isOpen ? (
                      <div className="flex flex-col items-center gap-1 text-xs">
                        <Check className="h-4 w-4" />
                        <span>{t('businessDay')}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-xs">
                        <X className="h-4 w-4" />
                        <span>{t('regularHoliday')}</span>
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-1 text-sm md:text-base font-bold w-full text-center">
                      {weekScheduleData.scheduleSettings[dayId].startHour} ~{' '}
                      {weekScheduleData.scheduleSettings[dayId].endHour}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-lg font-semibold text-primary">営業時間設定</h3>
            </div>

            <Tabs value={scheduleTab} onValueChange={setScheduleTab} className="w-full">
              <TabsList className="mb-4 flex h-auto max-w-full flex-wrap gap-1 rounded-xl p-1.5">
                <TabsTrigger value="common">
                  <Settings2 className="h-4 w-4 mr-2" />
                  {t('commonSettings')}
                </TabsTrigger>
                <TabsTrigger value="individual">
                  <Calendar className="h-4 w-4 mr-2" />
                  {t('daySpecificSettings')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="common">
                <div className="flex items-center gap-2 mb-6">
                  <Switch
                    checked={weekScheduleData.useCommonHours}
                    onCheckedChange={handleUseCommonHoursChange}
                  />
                  <Label className="font-medium cursor-pointer">{t('useCommonHours')}</Label>
                </div>

                {weekScheduleData.useCommonHours && (
                  <div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center">
                        <span className="font-bold text-primary text-sm">
                          {t('commonBusinessHours')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <Select
                          value={weekScheduleData.commonStartHour}
                          onValueChange={handleCommonStartHourChange}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="開始時間" />
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
                          value={weekScheduleData.commonEndHour}
                          onValueChange={handleCommonEndHourChange}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue placeholder="終了時間" />
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
                                  {t('laterThanOpenTime')}
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
                          (day) => weekScheduleData.scheduleSettings[day.id as DayOfWeek].isOpen
                        )
                        .map((day) => {
                          const dayId = day.id as DayOfWeek
                          const daySetting = weekScheduleData.scheduleSettings[dayId]
                          // 各曜日ごとに、開始時間より後の終了時間オプションを取得
                          const endHourOptions = getEndHourOptions(daySetting.startHour)

                          return (
                            <div
                              key={dayId}
                              className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg ${day.color}`}
                            >
                              <div className="flex flex-col justify-between w-full">
                                <div className="font-semibold min-w-24 mb-1 text-sm">
                                  {day.week}
                                </div>

                                <div className="flex items-center gap-2">
                                  <Select
                                    value={daySetting.startHour}
                                    onValueChange={(value) =>
                                      updateDaySchedule(dayId, 'startHour', value)
                                    }
                                  >
                                    <SelectTrigger className="w-28">
                                      <SelectValue placeholder="開始時間" />
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
                                    value={daySetting.endHour}
                                    onValueChange={(value) =>
                                      updateDaySchedule(dayId, 'endHour', value)
                                    }
                                  >
                                    <SelectTrigger className="w-28">
                                      <SelectValue placeholder="終了時間" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <ScrollArea className="h-60">
                                        {endHourOptions.length > 0 ? (
                                          endHourOptions.map((time) => (
                                            <SelectItem key={`close-${dayId}-${time}`} value={time}>
                                              {time}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                            {t('laterThanOpenTime')}
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
                    <div className="admin-empty-state rounded-xl bg-muted p-8">
                      <Coffee className="h-12 w-12  mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground font-semibold mb-2">
                        {t('businessDayNotSet')}
                      </p>
                      <p className="text-sm text-muted-foreground">{t('selectBusinessDay')}</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="admin-toolbar mt-8 justify-end border-t border-border pt-5">
          <Button
            type="submit"
            size="lg"
            className="min-h-11 min-w-[120px] rounded-lg shadow-none"
            onClick={handleSubmit(onSubmit)}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('savingSettings')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t('saveBusinessHours')}
              </>
            )}
          </Button>
        </div>
      </div>
      <div>
        <Accordion type="multiple" className="mt-8">
          <AccordionItem value="business-days">
            <AccordionTrigger>営業日設定とは？</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-4 leading-6">
              <section>
                <p className="font-bold text-base text-primary mb-2">営業日設定について</p>

                <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
                  <li>
                    カレンダーに予約を受付ける<strong>曜日毎の営業時間</strong>を指定する機能です。
                  </li>
                  <li>
                    チェックした曜日の営業時間内だけが予約画面に表示され、未チェックの曜日は
                    <span className="font-semibold">定休日</span>として扱われます。
                  </li>
                </ul>

                <p className="font-bold text-primary mt-2">例</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    火曜を定休日にした場合、火曜日の予約枠は表示されず予約を受け付けられなくなります。
                  </li>
                  <li>
                    臨時休業を設定したい場合は、
                    <span className="font-semibold">休業日設定</span> を開き、
                    該当曜日を選択して保存します。
                    <br />
                    隔週定休日の場合は、<span className="font-semibold">営業日設定</span>
                    で基本の営業日を設定しておき、 該当曜日を定休日にして保存するだけです。
                  </li>
                </ul>

                <p className="font-bold text-muted-foreground mt-2">注意点</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    定休日を変更すると<strong>既存予約</strong>
                    には影響しません。変更した時点から予約の受付が停止されます。
                    必要に応じて顧客へ連絡してください。
                  </li>
                  <li>
                    繁忙期や祝日営業の場合などは、営業日設定を一時的に変更すると
                    <strong>すぐに反映</strong>されます。
                  </li>
                </ul>
              </section>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
