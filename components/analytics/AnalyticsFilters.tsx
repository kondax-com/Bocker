'use client'

import React, { useState, useCallback } from 'react'
import { CalendarIcon } from 'lucide-react'
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { DateRange as DayPickerDateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { FilterOptions, SelectOption } from '@/services/supabase/repositories/analytics/types'

interface AnalyticsFiltersProps {
  filters: FilterOptions
  onFiltersChange: (filters: FilterOptions) => void
  staffOptions?: SelectOption[]
  menuOptions?: SelectOption[]
  loading?: boolean
  className?: string
  showStaffFilter?: boolean
  showMenuFilter?: boolean
  showPresetRanges?: boolean
  type?: 'daily' | 'monthly'
}

/**
 * プリセット日付範囲
 */
const DAILY_PRESET_RANGES = [
  {
    label: '今日',
    getValue: () => ({ from: new Date(), to: new Date() }),
  },
  {
    label: '昨日',
    getValue: () => {
      const yesterday = subDays(new Date(), 1)
      return { from: yesterday, to: yesterday }
    },
  },
  {
    label: '過去7日間',
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: '過去30日間',
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: '今月',
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: '先月',
    getValue: () => {
      const lastMonth = subDays(startOfMonth(new Date()), 1)
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
    },
  },
  {
    label: '先々月',
    getValue: () => {
      const twoMonthsAgo = subDays(startOfMonth(subDays(startOfMonth(new Date()), 1)), 1)
      return { from: startOfMonth(twoMonthsAgo), to: endOfMonth(twoMonthsAgo) }
    },
  },
  {
    label: '過去3ヶ月',
    getValue: () => {
      // 90日前から現在まで（3ヶ月 = 90日）
      return { from: subDays(new Date(), 89), to: new Date() }
    },
  },
  {
    label: '過去6ヶ月',
    getValue: () => {
      // 180日前から現在まで（6ヶ月 = 180日）
      return { from: subDays(new Date(), 179), to: new Date() }
    },
  },
  {
    label: (() => {
      const currentDate = new Date()
      const quarter = Math.floor(currentDate.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => ({ from: startOfQuarter(new Date()), to: endOfQuarter(new Date()) }),
  },
  {
    label: (() => {
      const lastQuarter = subQuarters(new Date(), 1)
      const quarter = Math.floor(lastQuarter.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => {
      const lastQuarter = subQuarters(new Date(), 1)
      return { from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) }
    },
  },
  {
    label: (() => {
      const twoQuartersAgo = subQuarters(new Date(), 2)
      const quarter = Math.floor(twoQuartersAgo.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => {
      const twoQuartersAgo = subQuarters(new Date(), 2)
      return { from: startOfQuarter(twoQuartersAgo), to: endOfQuarter(twoQuartersAgo) }
    },
  },
  {
    label: '過去4四半期',
    getValue: () => {
      // 365日前から現在まで（4四半期 = 1年 = 365日）
      return { from: subDays(new Date(), 364), to: new Date() }
    },
  },
  {
    label: '今年',
    getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
  },
]
const MONTHLY_PRESET_RANGES = [
  {
    label: '今月',
    getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: '先月',
    getValue: () => {
      const lastMonth = subDays(startOfMonth(new Date()), 1)
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
    },
  },
  {
    label: '先々月',
    getValue: () => {
      const twoMonthsAgo = subDays(startOfMonth(subDays(startOfMonth(new Date()), 1)), 1)
      return { from: startOfMonth(twoMonthsAgo), to: endOfMonth(twoMonthsAgo) }
    },
  },
  {
    label: '過去3ヶ月',
    getValue: () => {
      // 90日前から現在まで（3ヶ月 = 90日）
      return { from: subDays(new Date(), 89), to: new Date() }
    },
  },
  {
    label: '過去6ヶ月',
    getValue: () => {
      // 180日前から現在まで（6ヶ月 = 180日）
      return { from: subDays(new Date(), 179), to: new Date() }
    },
  },
  {
    label: (() => {
      const currentDate = new Date()
      const quarter = Math.floor(currentDate.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => ({ from: startOfQuarter(new Date()), to: endOfQuarter(new Date()) }),
  },
  {
    label: (() => {
      const lastQuarter = subQuarters(new Date(), 1)
      const quarter = Math.floor(lastQuarter.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => {
      const lastQuarter = subQuarters(new Date(), 1)
      return { from: startOfQuarter(lastQuarter), to: endOfQuarter(lastQuarter) }
    },
  },
  {
    label: (() => {
      const twoQuartersAgo = subQuarters(new Date(), 2)
      const quarter = Math.floor(twoQuartersAgo.getMonth() / 3) + 1
      const quarterRanges = ['1~3月', '4~6月', '7~9月', '10~12月']
      return quarterRanges[quarter - 1]
    })(),
    getValue: () => {
      const twoQuartersAgo = subQuarters(new Date(), 2)
      return { from: startOfQuarter(twoQuartersAgo), to: endOfQuarter(twoQuartersAgo) }
    },
  },
  {
    label: '今年',
    getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
  },
]

/**
 * 分析フィルターコンポーネント
 * 日付範囲、スタッフ、メニューの選択機能を提供
 */
export function AnalyticsFilters({
  filters,
  onFiltersChange,
  loading = false,
  className = '',
  showPresetRanges = true,
  type = 'daily',
}: AnalyticsFiltersProps) {
  const [isOpen, setIsOpen] = useState(false)

  /**
   * 日付範囲を更新
   */
  const handleDateRangeChange = useCallback(
    (dateRange: DayPickerDateRange | undefined) => {
      if (dateRange?.from && dateRange?.to) {
        onFiltersChange({
          ...filters,
          dateRange: {
            from: dateRange.from,
            to: dateRange.to,
          },
        })
      }
    },
    [filters, onFiltersChange]
  )

  const PRESET_RANGES = type === 'daily' ? DAILY_PRESET_RANGES : MONTHLY_PRESET_RANGES

  /**
   * プリセット範囲を選択
   */
  const handlePresetRangeSelect = useCallback(
    (preset: (typeof PRESET_RANGES)[0]) => {
      const range = preset.getValue()
      handleDateRangeChange(range)
    },
    [handleDateRangeChange]
  )

  return (
    <Card className={`${className ?? ''} admin-panel min-w-0 shadow-none`}>
      <CardContent className="space-y-4 p-5 sm:p-6">
        {/* 日付範囲選択 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">期間</label>
          <div className="flex flex-col gap-2">
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'min-h-11 w-full justify-start rounded-lg text-left font-normal',
                    !filters.dateRange && 'text-muted-foreground'
                  )}
                  disabled={loading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateRange?.from ? (
                    filters.dateRange.to ? (
                      <>
                        {format(filters.dateRange.from, 'M月d日', { locale: ja })} -{' '}
                        {format(filters.dateRange.to, 'M月d日', { locale: ja })}
                      </>
                    ) : (
                      format(filters.dateRange.from, 'M月d日', { locale: ja })
                    )
                  ) : (
                    '期間を選択'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start">
                <div className="flex">
                  {/* プリセット範囲 */}
                  {showPresetRanges && (
                    <div className=" p-3 grid grid-cols-2 gap-3 w-full">
                      <h4 className="text-sm font-semibold col-span-2 border-b border-border pb-2">
                        期間絞り込み
                      </h4>
                      {PRESET_RANGES.map((preset, index) => (
                        <button
                          key={`preset-${preset.label}-${index}`}
                          className="justify-start font-semibold w-full text-sm h-10 p-2 bg-muted text-center hover:bg-accent hover:text-accent-foreground rounded-md"
                          onClick={() => {
                            handlePresetRangeSelect(preset)
                            setIsOpen(false)
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* カレンダー */}
                  {/* <div className="p-3">
                    <Calendar
                      mode="range"
                      defaultMonth={filters.dateRange?.from}
                      selected={filters.dateRange}
                      onSelect={handleDateRangeChange}
                      numberOfMonths={2}
                      locale={ja}
                    />
                  </div> */}
                </div>
              </PopoverContent>
            </Popover>

            {/* 選択した期間の表示 */}
            {filters.dateRange?.from && filters.dateRange?.to && (
              <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>
                  {Math.ceil(
                    (filters.dateRange.to.getTime() - filters.dateRange.from.getTime()) /
                      (1000 * 60 * 60 * 24)
                  ) + 1}
                  日間
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default AnalyticsFilters
