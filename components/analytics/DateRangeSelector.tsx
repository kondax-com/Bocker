'use client'

import React, { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { format, subDays, subMonths, startOfDay, endOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface DateRange {
  from: Date
  to: Date
}

export interface DateRangeSelectorProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
  presets?: boolean
  maxDate?: Date
  minDate?: Date
  disabled?: boolean
}

// プリセット期間の定義
const PRESET_RANGES = [
  {
    label: '今日',
    key: 'today',
    getValue: () => ({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: '昨日',
    key: 'yesterday',
    getValue: () => {
      const yesterday = subDays(new Date(), 1)
      return {
        from: startOfDay(yesterday),
        to: endOfDay(yesterday),
      }
    },
  },
  {
    label: '過去7日',
    key: 'last7days',
    getValue: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: '過去30日',
    key: 'last30days',
    getValue: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: '今週',
    key: 'thisWeek',
    getValue: () => {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const startOfWeek = subDays(today, dayOfWeek)
      return {
        from: startOfDay(startOfWeek),
        to: endOfDay(today),
      }
    },
  },
  {
    label: '先週',
    key: 'lastWeek',
    getValue: () => {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const startOfLastWeek = subDays(today, dayOfWeek + 7)
      const endOfLastWeek = subDays(today, dayOfWeek + 1)
      return {
        from: startOfDay(startOfLastWeek),
        to: endOfDay(endOfLastWeek),
      }
    },
  },
  {
    label: '今月',
    key: 'thisMonth',
    getValue: () => {
      const today = new Date()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return {
        from: startOfDay(startOfMonth),
        to: endOfDay(today),
      }
    },
  },
  {
    label: '先月',
    key: 'lastMonth',
    getValue: () => {
      const today = new Date()
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0)
      return {
        from: startOfDay(startOfLastMonth),
        to: endOfDay(endOfLastMonth),
      }
    },
  },
  {
    label: '過去3ヶ月',
    key: 'last3months',
    getValue: () => ({
      from: startOfDay(subMonths(new Date(), 3)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: '過去6ヶ月',
    key: 'last6months',
    getValue: () => ({
      from: startOfDay(subMonths(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
]

/**
 * 期間を表示用文字列にフォーマット
 */
function formatDateRange(range: DateRange): string {
  const fromStr = format(range.from, 'M/d', { locale: ja })
  const toStr = format(range.to, 'M/d', { locale: ja })

  if (fromStr === toStr) {
    return fromStr
  }

  return `${fromStr} - ${toStr}`
}

/**
 * 期間の日数を計算
 */
function calculateDayCount(range: DateRange): number {
  const diffTime = Math.abs(range.to.getTime() - range.from.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
}

/**
 * 日付範囲選択コンポーネント
 * プリセット期間とカスタム期間選択をサポート
 */
export function DateRangeSelector({
  value,
  onChange,
  className = '',
  presets = true,
  disabled = false,
}: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // プリセット選択時の処理
  const handlePresetSelect = (presetKey: string) => {
    const preset = PRESET_RANGES.find((p) => p.key === presetKey)
    if (preset) {
      const newRange = preset.getValue()
      onChange(newRange)
      setIsOpen(false)
    }
  }

  // 現在の選択がプリセットかどうか判定
  const getCurrentPreset = () => {
    for (const preset of PRESET_RANGES) {
      const presetRange = preset.getValue()
      if (
        format(value.from, 'yyyy-MM-dd') === format(presetRange.from, 'yyyy-MM-dd') &&
        format(value.to, 'yyyy-MM-dd') === format(presetRange.to, 'yyyy-MM-dd')
      ) {
        return preset
      }
    }
    return null
  }

  const currentPreset = getCurrentPreset()
  const dayCount = calculateDayCount(value)

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              'min-h-11 max-w-full justify-start rounded-lg text-left font-normal',
              !value && 'text-muted-foreground'
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {formatDateRange(value)}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            {/* プリセット期間 */}
            {presets && (
              <div className="border-r p-3 min-w-[200px]">
                <div className="text-sm font-medium mb-2">プリセット期間</div>
                <div className="space-y-1">
                  {PRESET_RANGES.map((preset) => (
                    <Button
                      key={preset.key}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'w-full justify-start text-sm',
                        currentPreset?.key === preset.key && 'bg-accent'
                      )}
                      onClick={() => handlePresetSelect(preset.key)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 期間情報の表示 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary" className="text-xs">
          {dayCount}日間
        </Badge>
        {currentPreset && (
          <Badge variant="outline" className="text-xs">
            {currentPreset.label}
          </Badge>
        )}
      </div>
    </div>
  )
}

/**
 * 期間比較選択コンポーネント
 * 前期間比較のための期間選択
 */
interface PeriodComparisonSelectorProps {
  currentRange: DateRange
  comparisonType: 'previous' | 'same_period_last_year' | 'custom'
  onComparisonTypeChange: (type: 'previous' | 'same_period_last_year' | 'custom') => void
  customComparisonRange?: DateRange
  onCustomComparisonRangeChange?: (range: DateRange) => void
  className?: string
}

export function PeriodComparisonSelector({
  currentRange,
  comparisonType,
  onComparisonTypeChange,
  customComparisonRange,
  onCustomComparisonRangeChange,
  className = '',
}: PeriodComparisonSelectorProps) {
  // 前期間を自動計算
  const getPreviousPeriod = (): DateRange => {
    const diffMs = currentRange.to.getTime() - currentRange.from.getTime()
    const fromPrevious = new Date(currentRange.from.getTime() - diffMs - 24 * 60 * 60 * 1000)
    const toPrevious = new Date(currentRange.from.getTime() - 24 * 60 * 60 * 1000)

    return {
      from: startOfDay(fromPrevious),
      to: endOfDay(toPrevious),
    }
  }

  // 前年同期間を自動計算
  const getSamePeriodLastYear = (): DateRange => {
    return {
      from: new Date(
        currentRange.from.getFullYear() - 1,
        currentRange.from.getMonth(),
        currentRange.from.getDate()
      ),
      to: new Date(
        currentRange.to.getFullYear() - 1,
        currentRange.to.getMonth(),
        currentRange.to.getDate()
      ),
    }
  }

  const getComparisonRange = (): DateRange => {
    switch (comparisonType) {
      case 'previous':
        return getPreviousPeriod()
      case 'same_period_last_year':
        return getSamePeriodLastYear()
      case 'custom':
        return customComparisonRange || getPreviousPeriod()
      default:
        return getPreviousPeriod()
    }
  }

  const comparisonRange = getComparisonRange()

  return (
    <Card className={cn('admin-panel p-5', className)}>
      <div className="space-y-3">
        <div className="text-sm font-medium">期間比較</div>

        <Select value={comparisonType} onValueChange={onComparisonTypeChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="previous">前期間と比較</SelectItem>
            <SelectItem value="same_period_last_year">前年同期と比較</SelectItem>
            <SelectItem value="custom">カスタム期間と比較</SelectItem>
          </SelectContent>
        </Select>

        {comparisonType === 'custom' && onCustomComparisonRangeChange && (
          <DateRangeSelector
            value={customComparisonRange || getPreviousPeriod()}
            onChange={onCustomComparisonRangeChange}
            presets={false}
            className="mt-2"
          />
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <div>比較期間: {formatDateRange(comparisonRange)}</div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">
              {calculateDayCount(comparisonRange)}日間
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default DateRangeSelector
