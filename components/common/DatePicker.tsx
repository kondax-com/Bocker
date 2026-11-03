'use client'

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations, useLocale } from 'next-intl'
import { getDateFnsLocale, type SupportedLocale } from '@/lib/dateLocale'

interface DatePickerProps {
  id?: string
  /**
   * 選択された日付
   */
  value?: Date

  /**
   * 日付変更時のコールバック
   */
  onChange?: (date: Date | undefined) => void

  /**
   * プレースホルダーテキスト
   */
  placeholder?: string

  /**
   * 無効化フラグ
   */
  disabled?: boolean

  /**
   * 最小選択可能日付
   */
  fromDate?: Date

  /**
   * 最大選択可能日付
   */
  toDate?: Date

  /**
   * 追加のクラス名
   */
  className?: string

  /**
   * エラー状態
   */
  error?: boolean

  /**
   * 誕生日選択モードかどうか（デフォルト: true）
   * true: 過去120年まで選択可能（誕生日用）
   * false: 現在から未来100年まで選択可能（予約日等用）
   */
  isBirthday?: boolean
}

/**
 * ローカライズ対応の日付選択コンポーネント
 * Next.jsのi18n設定と連動してdate-fnsロケールを使用
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  fromDate,
  toDate,
  className,
  error = false,
  isBirthday = true,
}: DatePickerProps) {
  const currentLocale = useLocale() as SupportedLocale
  const t = useTranslations('common.datePicker')
  const [dateFnsLocale, setDateFnsLocale] = useState<Locale | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState<Date>(value || new Date())

  // 年のリスト生成用の基準年（固定値として現在の年を使用）
  const baseYear = new Date().getFullYear()

  // 現在のロケールに基づいてdate-fnsロケールを動的に読み込み
  useEffect(() => {
    const loadLocale = async () => {
      const locale = await getDateFnsLocale(currentLocale)
      setDateFnsLocale(locale)
    }
    loadLocale()
  }, [currentLocale])

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // UTCの日付をローカルタイムゾーンの日付に変換
      const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      onChange?.(localDate)
    } else {
      onChange?.(undefined)
    }
    setIsOpen(false)
  }

  // カスタムカレンダーナビゲーション用の年月選択（表示用）
  const currentYear = displayMonth.getFullYear()
  const currentMonth = displayMonth.getMonth()

  // 年のリスト生成（固定の基準年を使用して範囲が変動しないようにする）
  const years = isBirthday
    ? Array.from({ length: 121 }, (_, i) => baseYear - i) // 誕生日用：現在の年から120年前まで
    : Array.from({ length: 101 }, (_, i) => baseYear + i) // 予約日等用：現在の年から100年先まで

  // 月のリスト（0-11）。date-fns のロケールから日本語・英語・タイ語名を生成する。
  const months = dateFnsLocale
    ? Array.from({ length: 12 }, (_, month) =>
        format(new Date(2024, month, 1), 'LLL', { locale: dateFnsLocale })
      )
    : []

  const handleYearChange = (year: string) => {
    const newDate = new Date(displayMonth)
    newDate.setFullYear(parseInt(year))
    setDisplayMonth(newDate)

    // 年を変更した場合、現在選択されている日付の年も更新
    if (value) {
      const updatedDate = new Date(value)
      updatedDate.setFullYear(parseInt(year))
      onChange?.(updatedDate)
    }
  }

  const handleMonthChange = (month: string) => {
    const newDate = new Date(displayMonth)
    newDate.setMonth(parseInt(month))
    setDisplayMonth(newDate)

    // 月を変更した場合、現在選択されている日付の月も更新
    if (value) {
      const updatedDate = new Date(value)
      updatedDate.setMonth(parseInt(month))
      onChange?.(updatedDate)
    }
  }

  const handlePreviousMonth = () => {
    const newDate = new Date(displayMonth)
    newDate.setMonth(newDate.getMonth() - 1)
    setDisplayMonth(newDate)
  }

  const handleNextMonth = () => {
    const newDate = new Date(displayMonth)
    newDate.setMonth(newDate.getMonth() + 1)
    setDisplayMonth(newDate)
  }

  // ロケールが読み込まれていない場合は標準のinput type="date"にフォールバック
  if (!dateFnsLocale) {
    return (
      <input
        id={id}
        type="date"
        value={value ? format(value, 'yyyy-MM-dd') : ''}
        onChange={(e) => onChange?.(e.target.value ? new Date(e.target.value) : undefined)}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full rounded-md bg-input border px-3 py-1 text-base shadow-sm transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm hover:border-ring',
          error && 'border-destructive',
          className
        )}
      />
    )
  }

  // ロケールに応じた表示フォーマット
  const displayFormat = currentLocale === 'ja' ? 'yyyy年MM月dd日' : 'PPP'

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal h-9 bg-input',
            !value && 'text-muted-foreground',
            error && 'border-destructive',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, displayFormat, { locale: dateFnsLocale })
          ) : (
            <span>{placeholder || t('selectDate')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          {/* カスタムナビゲーションヘッダー */}
          <div className="flex items-center justify-between space-x-2 mb-4">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handlePreviousMonth}
              disabled={disabled}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center space-x-2">
              <Select value={currentMonth.toString()} onValueChange={handleMonthChange}>
                <SelectTrigger className="h-7 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={currentYear.toString()} onValueChange={handleYearChange}>
                <SelectTrigger className="h-7 w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handleNextMonth}
              disabled={disabled}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* カレンダー本体 */}
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
            disabled={disabled}
            fromDate={fromDate}
            toDate={toDate}
            locale={dateFnsLocale}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            initialFocus
            components={{
              IconLeft: () => <div />,
              IconRight: () => <div />,
            }}
            classNames={{
              caption: 'hidden',
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
