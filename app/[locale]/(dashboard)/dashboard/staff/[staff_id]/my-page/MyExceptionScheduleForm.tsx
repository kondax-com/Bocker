'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { api } from '@/convex/_generated/api'
import { useMutation } from 'convex/react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { convertHourToTimestamp } from '@/lib/schedules'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Id } from '@/convex/_generated/dataModel'
import { CalendarMultiSelect } from '@/components/common'
import { fetchQuery } from 'convex/nextjs'
import { format, compareAsc } from 'date-fns'
import { enUS, ja, th } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

// 開始時間と終了時間を含む日付の型定義
type DateWithTimes = {
  date: Date
  start_time?: string
  end_time?: string
  notes?: string
}

// 全時刻の配列 (10分刻み)
const timeOptions = Array.from({ length: 24 }).flatMap((_, hour) =>
  [0, 10, 20, 30, 40, 50].map((minute) => {
    const hh = String(hour).padStart(2, '0')
    const mm = String(minute).padStart(2, '0')
    return `${hh}:${mm}`
  })
)

// "HH:mm" 形式を分に変換
const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export default function MyExceptionScheduleForm() {
  const { tenantId, orgId, staffId } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const t = useTranslations('staff.myPage.exceptionSchedule')
  const locale = useLocale()
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [isAllDay, setIsAllDay] = useState<{ [key: string]: boolean }>({})
  // 日付と時間情報を保持する状態
  const [dateTimeSettings, setDateTimeSettings] = useState<DateWithTimes[]>([])

  const upsertSchedules = useMutation(api.staff.exception_schedule.mutation.upsertSchedules)

  // 時間設定を含めたスケジュール保存処理
  const handleUpsertSchedules = async (): Promise<void> => {
    // 終日でない場合、開始時間と終了時間の設定を必須にする
    for (const item of dateTimeSettings) {
      const allDay = isAllDay[item.date.toISOString()]
      if (!allDay && (!item.start_time || !item.end_time)) {
        toast.error(t('timeRequiredError'))
        return
      }
    }
    try {
      await upsertSchedules({
        staff_id: staffId as Id<'staff'>,
        org_id: orgId as Id<'organization'>,
        tenant_id: tenantId as Id<'tenant'>,
        dates: dateTimeSettings.map((item) => ({
          date: format(item.date, 'yyyy-MM-dd'),
          start_time_unix: isAllDay[item.date.toISOString()]
            ? convertHourToTimestamp('00:00', item.date.toISOString())!
            : item.start_time
              ? convertHourToTimestamp(item.start_time, item.date.toISOString())!
              : 0,
          end_time_unix: isAllDay[item.date.toISOString()]
            ? convertHourToTimestamp('00:00', item.date.toISOString())!
            : item.end_time
              ? convertHourToTimestamp(item.end_time, item.date.toISOString())!
              : 0,
          notes: item.notes,
          is_all_day: isAllDay[item.date.toISOString()] ? true : false,
        })),
        type: 'holiday',
      })
      toast.success(t('saved'))
    } catch (error) {
      showErrorToast(error)
    }
  }

  const handleNoteChange = (index: number, value: string): void => {
    const newSettings = [...dateTimeSettings]
    newSettings[index].notes = value
    setDateTimeSettings(newSettings)
  }

  // 選択済みスケジュールを削除
  const handleDelete = (index: number): void => {
    // 日付・詳細設定両方から該当行を削除
    const newDateTimeSettings = [...dateTimeSettings]
    newDateTimeSettings.splice(index, 1)
    setDateTimeSettings(newDateTimeSettings)

    const newSelectedDates = [...selectedDates]
    newSelectedDates.splice(index, 1)
    setSelectedDates(newSelectedDates)
  }

  // 日付選択ごとに追加・削除を差分で反映する
  useEffect(() => {
    setIsAllDay((prev) => {
      const next = { ...prev }
      // 新しく追加された日付には false をセット
      selectedDates.forEach((date) => {
        const iso = date.toISOString()
        if (!(iso in next)) {
          next[iso] = false
        }
      })
      // 選択解除された日付のキーを削除
      Object.keys(next).forEach((key) => {
        if (!selectedDates.find((d) => d.toISOString() === key)) {
          delete next[key]
        }
      })
      return next
    })

    setDateTimeSettings((prev) => {
      const prevMap = new Map(prev.map((s) => [format(s.date, 'yyyy-MM-dd'), s]))
      const nextSettings: DateWithTimes[] = selectedDates.map((date) => {
        const key = format(date, 'yyyy-MM-dd')
        if (prevMap.has(key)) {
          return prevMap.get(key)!
        }
        // 新規日付は時間未設定で追加
        return { date, startTime: undefined, endTime: undefined, notes: undefined }
      })
      return nextSettings
    })
  }, [selectedDates])

  // 既存スケジュール取得処理
  useEffect(() => {
    if (tenantId && orgId && staffId) {
      const fetchStaffSchedule = async (): Promise<void> => {
        const staffSchedule = await fetchQuery(
          api.staff.exception_schedule.query.findByTenantOrgStaff,
          {
            tenant_id: tenantId as Id<'tenant'>,
            org_id: orgId as Id<'organization'>,
            staff_id: staffId as Id<'staff'>,
          }
        )

        // 重複する日付を排除した設定を作成
        const map = new Map<string, DateWithTimes>()
        staffSchedule.forEach((schedule) => {
          const startDate = new Date(schedule.start_time_unix!)
          const endDate = new Date(schedule.end_time_unix!)
          const iso = startDate.toISOString()
          if (!map.has(iso)) {
            map.set(iso, {
              date: startDate,
              start_time: format(startDate, 'HH:mm'),
              end_time: format(endDate, 'HH:mm'),
              notes: schedule.notes,
            })
          }
        })
        const uniqueSettings = Array.from(map.values()).sort((a, b) => compareAsc(a.date, b.date))
        // fetched schedules include isAllDay, so initialize the all-day map
        const allDayMap: { [key: string]: boolean } = {}
        staffSchedule.forEach((schedule) => {
          const iso = new Date(schedule.start_time_unix!).toISOString()
          allDayMap[iso] = !!schedule.is_all_day
        })

        setIsAllDay(allDayMap)
        setSelectedDates(uniqueSettings.map((s) => s.date))
        setDateTimeSettings(uniqueSettings)
      }

      fetchStaffSchedule()
    } else {
      setSelectedDates([])
      setDateTimeSettings([])
    }
  }, [tenantId, orgId, staffId])

  // 時間設定ハンドラ（開始時刻選択時は終了時刻を調整）
  const handleTimeChange = (
    index: number,
    field: 'start_time' | 'end_time',
    value: string
  ): void => {
    const newSettings = [...dateTimeSettings]
    if (field === 'start_time') {
      newSettings[index].start_time = value
      // 開始時刻以降の最初の時刻を終了時刻に設定
      const nextOption = timeOptions.find((t) => timeToMinutes(t) > timeToMinutes(value))
      newSettings[index].end_time = nextOption || value
    } else {
      newSettings[index].end_time = value
    }
    setDateTimeSettings(newSettings)
  }

  return (
    <Card className="admin-panel overflow-hidden">
      <CardHeader>
        <CardTitle className="text-foreground text-lg font-semibold">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <div className="flex flex-col gap-4">
          <div>
            <CalendarMultiSelect
              fromDate={new Date()}
              selectedDates={selectedDates}
              onDatesChangeAction={(dates) => {
                if (dates.length > 30) {
                  toast.error(t('maxDaysError'))
                  return
                }
                const sortedDates = [...dates].sort(compareAsc)
                setSelectedDates(sortedDates)
              }}
            />
          </div>

          {/* 選択した日付ごとの時間設定セクション */}
          {dateTimeSettings.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-base font-semibold mb-4">{t('createdSchedules')}</h3>

                <div className="space-y-4">
                  {dateTimeSettings.map((setting, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 md:grid-cols-[1fr,2fr,2fr] gap-4 items-center border-b pb-4"
                    >
                      <div className="flex gap-2 items-center">
                        <span className="text-base font-bold">
                          {locale === 'ja'
                            ? format(setting.date, 'M月d日(EEE)', { locale: ja })
                            : format(setting.date, 'd MMM (EEE)', {
                                locale: locale === 'th' ? th : enUS,
                              })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 items-start">
                        <div className="flex gap-2 items-center mb-2">
                          <Label className="text-xs font-bold">{t('allDay')}</Label>
                          <Switch
                            checked={isAllDay[setting.date.toISOString()]}
                            onCheckedChange={() =>
                              setIsAllDay({
                                ...isAllDay,
                                [setting.date.toISOString()]: !isAllDay[setting.date.toISOString()],
                              })
                            }
                          />
                        </div>

                        <div
                          className={`flex gap-2 w-full ${
                            isAllDay[setting.date.toISOString()]
                              ? 'opacity-50 pointer-events-none'
                              : ''
                          }`}
                        >
                          <div className="w-full">
                            <Label htmlFor={`start-time-${index}`} className="mb-1 block text-xs">
                              {t('startTime')}
                            </Label>

                            <Select
                              value={setting.start_time ?? undefined}
                              onValueChange={(value) =>
                                handleTimeChange(index, 'start_time', value)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('startTime')} />
                              </SelectTrigger>
                              <SelectContent>
                                {timeOptions.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-full">
                            <Label htmlFor={`end-time-${index}`} className="mb-1 block text-xs">
                              {t('endTime')}
                            </Label>
                            <Select
                              value={setting.end_time}
                              onValueChange={(value) => handleTimeChange(index, 'end_time', value)}
                              disabled={!setting.start_time}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('endTime')} />
                              </SelectTrigger>
                              <SelectContent>
                                {timeOptions
                                  .filter(
                                    (t) =>
                                      timeToMinutes(t) > timeToMinutes(setting.start_time ?? '')
                                  )
                                  .map((time) => (
                                    <SelectItem key={time} value={time}>
                                      {time}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <div className="w-full p-1">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-medium">{t('notes')}</p>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="size-11 shrink-0 rounded-lg"
                            onClick={() => handleDelete(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Textarea
                          rows={2}
                          id={`note-${index}`}
                          className="w-full"
                          value={setting.notes}
                          onChange={(e) => handleNoteChange(index, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={handleUpsertSchedules} className="w-full md:w-auto">
            {t('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
