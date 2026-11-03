'use client'

import { Button } from '@/components/ui/button'
import { withOwnerAccess } from '@/components/common'
import { RefreshCwIcon, Loader2 } from 'lucide-react'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { subDays, format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Calendar,
  TrendingUp,
  TrendingUpDown,
  Banknote,
  Activity,
  TrendingDown,
  FileDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { DashboardSection } from '@/components/common'

import {
  LineChart,
  BarChart,
  AnalyticsFilters,
  SummaryCard,
  SummaryCardGrid,
  type FilterOptions,
} from '@/components/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { DailySalesRepository } from '@/services/supabase/repositories/analytics'
import type {
  SalesSummary,
  PeriodComparisonData,
  ChartDataPoint,
} from '@/services/supabase/repositories/analytics/types'
import { Badge } from '@/components/ui/badge'

// 初期フィルター設定（過去30日間、未来の日付は除外）
const getInitialFilters = (tenantId: string, orgId: string): FilterOptions => {
  // 日付の妥当性をチェック
  const now = new Date()
  const from = subDays(now, 29)
  const to = subDays(now, 1) // 昨日までに変更

  // 日付が有効かチェック
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new Error('初期日付の生成に失敗しました')
  }

  return {
    dateRange: {
      from,
      to,
    },
    tenantId,
    orgId,
  }
}

// 曜日別パフォーマンス分析用の型定義
type WeekdayPerformance = {
  dayOfWeek: number
  dayName: string
  totalAmount: number
  bookingCount: number
  averageAmount: number
  // 追加の分析データ
  totalAmountPercentage: number
  bookingCountPercentage: number
  averageAmountPercentage: number
  rank: number
  isHighest: boolean
  isLowest: boolean
}

// 月別データ分析用の型定義
type MonthlyData = {
  month: string
  monthName: string
  totalAmount: number
  bookingCount: number
  averageAmount: number
  // 追加の分析データ
  totalAmountPercentage: number
  bookingCountPercentage: number
  averageAmountPercentage: number
  rank: number
  isHighest: boolean
  isLowest: boolean
  growthRate?: number
}

// 基本的な売上データ型
type BasicSalesData = {
  totalAmount: number
  bookingCount: number
  averageAmount: number
  dayOfWeek?: number
  dayName?: string
  month?: string
  monthName?: string
}

// 曜日別分析サマリー用の型定義
type WeekdayAnalysisSummary = {
  totalAverage: number
  bookingAverage: number
  amountAverage: number
  bestItem: WeekdayPerformance | null
  worstItem: WeekdayPerformance | null
}

// 月別分析サマリー用の型定義
type MonthlyAnalysisSummary = {
  totalAverage: number
  bookingAverage: number
  amountAverage: number
  bestItem: MonthlyData | null
  worstItem: MonthlyData | null
}

/**
 * 日別売上分析ページ
 */
function DailyAnalyticsPage() {
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()

  // 状態管理
  const [filters, setFilters] = useState<FilterOptions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isInterval, setIsInterval] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [openCsvDialog, setOpenCsvDialog] = useState(false)
  const { showErrorToast } = useErrorHandler()

  // データ状態
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null)
  const [trendData, setTrendData] = useState<ChartDataPoint[]>([])
  const [weekdayPerformance, setWeekdayPerformance] = useState<WeekdayPerformance[]>([])
  const [monthlyData, setMonthlySales] = useState<MonthlyData[]>([])
  const [periodComparison, setPeriodComparison] = useState<PeriodComparisonData | null>(null)

  // リポジトリインスタンス
  const repository = useMemo(() => {
    if (!tenantId || !orgId) return null
    return new DailySalesRepository()
  }, [tenantId, orgId])

  // 曜日別分析データを計算
  const calculateWeekdayAnalysis = useCallback((data: BasicSalesData[]): WeekdayPerformance[] => {
    if (!data || data.length === 0) return []

    const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0)
    const totalBookings = data.reduce((sum, item) => sum + item.bookingCount, 0)
    const totalAverage = data.reduce((sum, item) => sum + item.averageAmount, 0) / data.length

    // ランキング付けのためのソート
    const sortedByAmount = [...data].sort((a, b) => b.totalAmount - a.totalAmount)

    return data.map((item) => ({
      dayOfWeek: item.dayOfWeek || 0,
      dayName: item.dayName || '',
      totalAmount: item.totalAmount,
      bookingCount: item.bookingCount,
      averageAmount: item.averageAmount,
      totalAmountPercentage: totalAmount > 0 ? (item.totalAmount / totalAmount) * 100 : 0,
      bookingCountPercentage: totalBookings > 0 ? (item.bookingCount / totalBookings) * 100 : 0,
      averageAmountPercentage: totalAverage > 0 ? (item.averageAmount / totalAverage) * 100 : 0,
      rank: sortedByAmount.findIndex((sorted) => sorted.dayOfWeek === item.dayOfWeek) + 1,
      isHighest:
        item.totalAmount === Math.max(...data.map((d) => d.totalAmount)) && item.totalAmount > 0,
      isLowest:
        item.totalAmount === Math.min(...data.map((d) => d.totalAmount)) &&
        data.some((d) => d.totalAmount > 0),
    }))
  }, [])

  // 月別分析データを計算
  const calculateMonthlyAnalysis = useCallback((data: BasicSalesData[]): MonthlyData[] => {
    if (!data || data.length === 0) return []

    const totalAmount = data.reduce((sum, item) => sum + item.totalAmount, 0)
    const totalBookings = data.reduce((sum, item) => sum + item.bookingCount, 0)
    const totalAverage = data.reduce((sum, item) => sum + item.averageAmount, 0) / data.length

    // ランキング付けのためのソート
    const sortedByAmount = [...data].sort((a, b) => b.totalAmount - a.totalAmount)

    return data.map((item, index) => {
      // 成長率の計算（前月比）
      const growthRate =
        index > 0
          ? ((item.totalAmount - data[index - 1].totalAmount) / data[index - 1].totalAmount) * 100
          : 0

      return {
        month: item.month || '',
        monthName: item.monthName || '',
        totalAmount: item.totalAmount,
        bookingCount: item.bookingCount,
        averageAmount: item.averageAmount,
        totalAmountPercentage: totalAmount > 0 ? (item.totalAmount / totalAmount) * 100 : 0,
        bookingCountPercentage: totalBookings > 0 ? (item.bookingCount / totalBookings) * 100 : 0,
        averageAmountPercentage: totalAverage > 0 ? (item.averageAmount / totalAverage) * 100 : 0,
        rank: sortedByAmount.findIndex((sorted) => sorted.month === item.month) + 1,
        isHighest:
          item.totalAmount === Math.max(...data.map((d) => d.totalAmount)) && item.totalAmount > 0,
        isLowest:
          item.totalAmount === Math.min(...data.map((d) => d.totalAmount)) &&
          data.some((d) => d.totalAmount > 0),
        growthRate: index > 0 ? growthRate : undefined,
      }
    })
  }, [])

  // 曜日別分析サマリーを計算
  const weekdayAnalysis = useMemo((): WeekdayAnalysisSummary => {
    if (!weekdayPerformance || weekdayPerformance.length === 0) {
      return {
        totalAverage: 0,
        bookingAverage: 0,
        amountAverage: 0,
        bestItem: null,
        worstItem: null,
      }
    }

    const totalAverage =
      weekdayPerformance.reduce((sum, item) => sum + item.totalAmount, 0) /
      weekdayPerformance.length
    const bookingAverage =
      weekdayPerformance.reduce((sum, item) => sum + item.bookingCount, 0) /
      weekdayPerformance.length
    const amountAverage =
      weekdayPerformance.reduce((sum, item) => sum + item.averageAmount, 0) /
      weekdayPerformance.length

    const bestItem = weekdayPerformance.find((item) => item.isHighest) || null
    const worstItem = weekdayPerformance.find((item) => item.isLowest) || null

    return {
      totalAverage,
      bookingAverage,
      amountAverage,
      bestItem,
      worstItem,
    }
  }, [weekdayPerformance])

  // 月別分析サマリーを計算
  const monthlyAnalysis = useMemo((): MonthlyAnalysisSummary => {
    if (!monthlyData || monthlyData.length === 0) {
      return {
        totalAverage: 0,
        bookingAverage: 0,
        amountAverage: 0,
        bestItem: null,
        worstItem: null,
      }
    }

    const totalAverage =
      monthlyData.reduce((sum, item) => sum + item.totalAmount, 0) / monthlyData.length
    const bookingAverage =
      monthlyData.reduce((sum, item) => sum + item.bookingCount, 0) / monthlyData.length
    const amountAverage =
      monthlyData.reduce((sum, item) => sum + item.averageAmount, 0) / monthlyData.length

    const bestItem = monthlyData.find((item) => item.isHighest) || null
    const worstItem = monthlyData.find((item) => item.isLowest) || null

    return {
      totalAverage,
      bookingAverage,
      amountAverage,
      bestItem,
      worstItem,
    }
  }, [monthlyData])

  // 初期フィルター設定
  useEffect(() => {
    if (tenantId && orgId && !filters) {
      try {
        setFilters(getInitialFilters(tenantId, orgId))
      } catch (err) {
        console.error('初期フィルター設定エラー:', err)
        showErrorToast(err instanceof Error ? err : new Error('フィルターの初期化に失敗しました'))
      }
    }
  }, [tenantId, orgId, filters, showErrorToast])

  // データ取得
  const fetchData = useCallback(async () => {
    if (!repository || !filters) return

    setLoading(true)
    setError(null)

    try {
      const [summaryResult, trendResult, weekdayResult, monthlyResult, comparisonResult] =
        await Promise.all([
          repository.getSalesSummary(filters),
          repository.getSalesTrend(filters),
          repository.getWeekdayPerformance(filters),
          repository.getMonthlySales(filters),
          repository.getPeriodComparison(filters),
        ])

      setSalesSummary(summaryResult)
      setTrendData(trendResult)
      setWeekdayPerformance(calculateWeekdayAnalysis(weekdayResult))
      setMonthlySales(calculateMonthlyAnalysis(monthlyResult))
      setPeriodComparison(comparisonResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析データの取得に失敗しました')
      console.error('Analytics data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [repository, filters, calculateWeekdayAnalysis, calculateMonthlyAnalysis])

  console.log('salesSummary', salesSummary)
  console.log('trendData', trendData)
  console.log('weekdayPerformance', weekdayPerformance)
  console.log('monthlyData', monthlyData)
  console.log('periodComparison', periodComparison)

  // 待機時間（ミリ秒）
  const REFRESH_INTERVAL = 5000 // 5秒

  // データ更新と待機制御
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isInterval) return

    setIsRefreshing(true)
    try {
      await fetchData()
      toast.success('データを更新しました')
    } catch (err) {
      console.error('Refresh error:', err)
      showErrorToast(err)
    } finally {
      setIsRefreshing(false)
      // 待機開始
      setIsInterval(true)
      setTimeout(() => {
        setIsInterval(false)
      }, REFRESH_INTERVAL)
    }
  }, [fetchData, isRefreshing, isInterval, showErrorToast])

  // Safe date parsing function for mobile compatibility
  const safeParseDate = useCallback((dateStr: string): Date | null => {
    if (!dateStr) return null

    // Try different parsing methods for cross-browser compatibility
    try {
      // First try: assume ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number)
        return new Date(year, month - 1, day) // month is 0-indexed
      }

      // Second try: parse as-is
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        return parsed
      }

      // Third try: add time component for Safari compatibility
      const withTime = new Date(dateStr + 'T00:00:00')
      if (!isNaN(withTime.getTime())) {
        return withTime
      }

      return null
    } catch (error) {
      console.warn('Date parsing failed for:', dateStr, error)
      return null
    }
  }, [])

  const downloadCSVFile = useCallback((csvData: string[][], fileName: string) => {
    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', fileName)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }, [])

  const handleExportCSV = useCallback(async () => {
    if (!repository || !filters || !salesSummary || !trendData) return

    // 日付範囲の妥当性チェック
    const { from, to } = filters.dateRange
    if (!from || !to || !(from instanceof Date) || !(to instanceof Date)) {
      showErrorToast(new Error('日付範囲が正しく設定されていません'))
      return
    }

    setIsExporting(true)
    try {
      const dateRange = `${format(from, 'yyyy-MM-dd')}_${format(to, 'yyyy-MM-dd')}`
      const fileName = `売上分析レポート_${dateRange}.csv`

      // Get detailed daily sales data including booking counts
      const dailySalesData = await repository.getDailySales(filters)

      const csvData = []

      // ============================================
      // 【1】レポートヘッダー
      // ============================================
      csvData.push(['売上分析レポート'])
      csvData.push(['生成日時', new Date().toLocaleString('ja-JP')])
      csvData.push([
        '分析期間',
        `${format(from, 'yyyy年MM月dd日')} 〜 ${format(to, 'yyyy年MM月dd日')}`,
      ])
      csvData.push([])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      // ============================================
      // 【2】エグゼクティブサマリー
      // ============================================
      csvData.push(['エグゼクティブサマリー'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      const totalDays = salesSummary.periodDays
      const avgDaily = salesSummary.dailyAverage
      const efficiency = Math.round((salesSummary.totalBookings / totalDays) * 100) / 100

      csvData.push(['主要指標', '数値', '評価', '前期間比較'])
      csvData.push([
        '総売上',
        `¥${salesSummary.totalAmount.toLocaleString()}`,
        avgDaily >= 100000 ? '優秀' : avgDaily >= 50000 ? '良好' : '要改善',
        periodComparison
          ? `${periodComparison.growth.amount_percentage >= 0 ? '↗' : '↘'} ${periodComparison.growth.amount_percentage.toFixed(1)}%`
          : 'N/A',
      ])
      csvData.push([
        '総予約数',
        `${salesSummary.totalBookings}件`,
        efficiency >= 10 ? '優秀' : efficiency >= 5 ? '良好' : '要改善',
        periodComparison
          ? `${periodComparison.growth.booking_percentage >= 0 ? '↗' : '↘'} ${periodComparison.growth.booking_percentage.toFixed(1)}%`
          : 'N/A',
      ])
      csvData.push([
        '平均客単価',
        `¥${salesSummary.averageAmount.toLocaleString()}`,
        salesSummary.averageAmount >= 8000
          ? '優秀'
          : salesSummary.averageAmount >= 5000
            ? '良好'
            : '要改善',
        periodComparison
          ? `${periodComparison.growth.average_percentage >= 0 ? '↗' : '↘'} ${periodComparison.growth.average_percentage.toFixed(1)}%`
          : 'N/A',
      ])
      csvData.push([
        '1日平均売上',
        `¥${avgDaily.toLocaleString()}`,
        avgDaily >= 100000 ? '優秀' : avgDaily >= 50000 ? '良好' : '要改善',
        `${totalDays}日間の平均`,
      ])
      csvData.push([])

      // ビジネス洞察
      csvData.push(['重要な洞察'])
      csvData.push(['-'.repeat(40)])
      if (periodComparison) {
        const growthTrend =
          periodComparison.growth.amount_percentage >= 5
            ? '成長トレンド'
            : periodComparison.growth.amount_percentage >= 0
              ? '安定推移'
              : '改善要'
        csvData.push(['売上トレンド', growthTrend])

        if (
          periodComparison.growth.amount_percentage > periodComparison.growth.booking_percentage
        ) {
          csvData.push(['成長要因', '客単価向上が主要因（アップセル成功）'])
        } else if (
          periodComparison.growth.booking_percentage > periodComparison.growth.amount_percentage
        ) {
          csvData.push(['成長要因', '予約数増加が主要因（新規獲得成功）'])
        }
      }

      if (weekdayAnalysis.bestItem && weekdayAnalysis.worstItem) {
        const efficiency_score = Math.round(
          (weekdayAnalysis.worstItem.totalAmount / weekdayAnalysis.bestItem.totalAmount) * 100
        )
        csvData.push([
          '曜日別効率',
          `${efficiency_score}% （${weekdayAnalysis.bestItem.dayName}が最強、${weekdayAnalysis.worstItem.dayName}が改善対象）`,
        ])
      }
      csvData.push([])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      // ============================================
      // 【3】期間比較詳細
      // ============================================
      if (periodComparison) {
        csvData.push(['期間比較詳細'])
        csvData.push(['='.repeat(14)])
        csvData.push([])
        csvData.push(['項目', '現期間', '前期間', '差額', '成長率', '評価', '戦略提案'])
        csvData.push([
          '売上',
          `¥${periodComparison.current.total_amount.toLocaleString()}`,
          `¥${periodComparison.previous.total_amount.toLocaleString()}`,
          `¥${(periodComparison.current.total_amount - periodComparison.previous.total_amount).toLocaleString()}`,
          `${periodComparison.growth.amount_percentage >= 0 ? '+' : ''}${periodComparison.growth.amount_percentage.toFixed(1)}%`,
          periodComparison.growth.amount_percentage >= 5
            ? '優秀'
            : periodComparison.growth.amount_percentage >= 0
              ? '良好'
              : '要改善',
          periodComparison.growth.amount_percentage >= 5 ? '現状維持＋拡大投資' : '改善施策実行',
        ])
        csvData.push([
          '予約数',
          `${periodComparison.current.booking_count}件`,
          `${periodComparison.previous.booking_count}件`,
          `${periodComparison.current.booking_count - periodComparison.previous.booking_count}件`,
          `${periodComparison.growth.booking_percentage >= 0 ? '+' : ''}${periodComparison.growth.booking_percentage.toFixed(1)}%`,
          periodComparison.growth.booking_percentage >= 5
            ? '優秀'
            : periodComparison.growth.booking_percentage >= 0
              ? '良好'
              : '要改善',
          periodComparison.growth.booking_percentage >= 0 ? 'リピート率向上' : '新規獲得強化',
        ])
        csvData.push([])
      }

      // ============================================
      // 【4】日別パフォーマンス（上位・下位のみ）
      // ============================================
      csvData.push(['日別パフォーマンスハイライト'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      const sortedTrend = [...trendData].sort((a, b) => b.value - a.value)
      csvData.push([
        'ランク',
        '日付',
        '曜日',
        '売上',
        '予約数',
        '客単価',
        '平均差',
        'パフォーマンス',
      ])

      // 上位5日
      csvData.push(['--- TOP 5 高売上日 ---'])
      sortedTrend.slice(0, Math.min(5, sortedTrend.length)).forEach((item, index) => {
        const diff = item.value - salesSummary.dailyAverage
        const parsedDate = safeParseDate(item.date)
        const dateStr = parsedDate ? format(parsedDate, 'yyyy-MM-dd') : item.date
        const dayData = dailySalesData.find((d) => d.sale_date === dateStr)
        const bookingCount = dayData?.booking_count || 0
        const avgAmount = bookingCount > 0 ? Math.round(item.value / bookingCount) : 0
        const weekdayName = parsedDate
          ? parsedDate.toLocaleDateString('ja-JP', { weekday: 'short' })
          : '不明'

        csvData.push([
          `${index + 1}位`,
          item.date,
          weekdayName,
          `¥${item.value.toLocaleString()}`,
          `${bookingCount}件`,
          `¥${avgAmount.toLocaleString()}`,
          `${diff >= 0 ? '+' : ''}¥${diff.toLocaleString()}`,
          diff >= salesSummary.dailyAverage * 0.5 ? '特別好調' : diff >= 0 ? '好調' : '要改善',
        ])
      })

      csvData.push([])

      // 下位3日（改善対象）
      csvData.push(['--- 改善対象日 ---'])
      sortedTrend
        .slice(-Math.min(3, sortedTrend.length))
        .reverse()
        .forEach((item, index) => {
          const diff = item.value - salesSummary.dailyAverage
          const parsedDate = safeParseDate(item.date)
          const dateStr = parsedDate ? format(parsedDate, 'yyyy-MM-dd') : item.date
          const dayData = dailySalesData.find((d) => d.sale_date === dateStr)
          const bookingCount = dayData?.booking_count || 0
          const avgAmount = bookingCount > 0 ? Math.round(item.value / bookingCount) : 0
          const weekdayName = parsedDate
            ? parsedDate.toLocaleDateString('ja-JP', { weekday: 'short' })
            : '不明'

          csvData.push([
            `下位${index + 1}`,
            item.date,
            weekdayName,
            `¥${item.value.toLocaleString()}`,
            `${bookingCount}件`,
            `¥${avgAmount.toLocaleString()}`,
            `${diff >= 0 ? '+' : ''}¥${diff.toLocaleString()}`,
            '改善対象・要因分析必要',
          ])
        })
      csvData.push([])

      // ============================================
      // 【5】曜日別戦略分析
      // ============================================
      if (weekdayPerformance.length > 0) {
        csvData.push(['曜日別戦略分析'])
        csvData.push(['='.repeat(14)])
        csvData.push([])
        csvData.push([
          '順位',
          '曜日',
          '売上',
          '売上比率',
          '予約数',
          '客単価',
          '効率スコア',
          '戦略提案',
        ])

        weekdayPerformance
          .sort((a, b) => a.rank - b.rank)
          .forEach((item) => {
            const efficiencyScore = Math.round(
              (item.totalAmount / Math.max(...weekdayPerformance.map((w) => w.totalAmount))) * 100
            )
            let strategy = ''

            if (item.rank === 1) {
              strategy = '成功パターン分析・他曜日展開'
            } else if (item.rank <= 2) {
              strategy = '更なる強化・特別メニュー'
            } else if (item.rank >= weekdayPerformance.length - 1) {
              strategy = '集中改善・キャンペーン実施'
            } else {
              strategy = '標準化・効率向上'
            }

            csvData.push([
              `${item.rank}位`,
              item.dayName,
              `¥${item.totalAmount.toLocaleString()}`,
              `${item.totalAmountPercentage.toFixed(1)}%`,
              `${item.bookingCount}件`,
              `¥${item.averageAmount.toLocaleString()}`,
              `${efficiencyScore}点`,
              strategy,
            ])
          })
        csvData.push([])

        // 曜日別改善提案
        csvData.push(['曜日別改善アクションプラン'])
        csvData.push(['-'.repeat(60)])
        if (
          weekdayAnalysis.bestItem?.dayName.includes('土') ||
          weekdayAnalysis.bestItem?.dayName.includes('日')
        ) {
          csvData.push(['週末戦略', '週末の成功を平日に展開・週末特別メニュー強化'])
        }
        if (
          weekdayAnalysis.worstItem?.dayName.includes('月') ||
          weekdayAnalysis.worstItem?.dayName.includes('火')
        ) {
          csvData.push(['平日活性化', '月火限定キャンペーン・平日割引・ランチメニュー'])
        }
        csvData.push([])
      }

      // ============================================
      // 【6】月別トレンド分析
      // ============================================
      if (monthlyData.length > 0) {
        csvData.push(['月別トレンド分析'])
        csvData.push(['='.repeat(14)])
        csvData.push([])
        csvData.push(['順位', '月', '売上', '予約数', '客単価', '前月比', 'トレンド', '季節戦略'])

        monthlyData
          .sort((a, b) => a.rank - b.rank)
          .forEach((item) => {
            let seasonStrategy = ''
            const monthNum = item.monthName

            if (monthNum.includes('12') || monthNum.includes('1')) {
              seasonStrategy = '年末年始特別メニュー・忘新年会'
            } else if (monthNum.includes('3') || monthNum.includes('4')) {
              seasonStrategy = '春の新生活・歓送迎会'
            } else if (monthNum.includes('7') || monthNum.includes('8')) {
              seasonStrategy = '夏祭り・ビアガーデン'
            } else if (monthNum.includes('10') || monthNum.includes('11')) {
              seasonStrategy = 'ハロウィン・紅葉イベント'
            } else {
              seasonStrategy = '季節限定メニュー・イベント'
            }

            csvData.push([
              `${item.rank}位`,
              item.monthName,
              `¥${item.totalAmount.toLocaleString()}`,
              `${item.bookingCount}件`,
              `¥${item.averageAmount.toLocaleString()}`,
              item.growthRate !== undefined
                ? `${item.growthRate >= 0 ? '+' : ''}${item.growthRate.toFixed(1)}%`
                : '-',
              item.growthRate !== undefined
                ? item.growthRate >= 5
                  ? '急成長'
                  : item.growthRate >= 0
                    ? '成長'
                    : '要改善'
                : '-',
              seasonStrategy,
            ])
          })
        csvData.push([])
      }

      // ============================================
      // 【7】総合戦略提案
      // ============================================
      csvData.push(['総合戦略提案・アクションプラン'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      csvData.push(['優先度', 'アクション項目', '期待効果', '実行時期'])

      // 優先度付きアクションプラン
      if (periodComparison && periodComparison.growth.amount_percentage < 0) {
        csvData.push(['緊急', '売上回復施策', '売上15%改善', '即座'])
        csvData.push(['', '・顧客アンケート実施', '', ''])
        csvData.push(['', '・価格・サービス見直し', '', ''])
        csvData.push(['', '・競合分析', '', ''])
      }

      if (weekdayAnalysis.worstItem) {
        csvData.push([
          '重要',
          `${weekdayAnalysis.worstItem.dayName}曜日強化`,
          '週売上10%向上',
          '2週間以内',
        ])
        csvData.push(['', '・限定メニュー・割引', '', ''])
        csvData.push(['', '・スタッフ配置最適化', '', ''])
      }

      if (salesSummary.averageAmount < 6000) {
        csvData.push(['推奨', '客単価向上施策', '客単価15%向上', '1ヶ月以内'])
        csvData.push(['', '・アップセル・クロスセル', '', ''])
        csvData.push(['', '・コース・セットメニュー', '', ''])
      }

      csvData.push(['継続', 'データ分析体制強化', '意思決定速度向上', '継続'])
      csvData.push(['', '・週次レビュー定例化', '', ''])
      csvData.push(['', '・KPI目標設定', '', ''])
      csvData.push([])

      // ============================================
      // 【8】付録：詳細データ
      // ============================================
      csvData.push(['付録：詳細データ'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      // 全日別データ
      csvData.push(['【日別詳細データ】'])
      csvData.push([
        '日付',
        '曜日',
        '売上',
        '予約数',
        '客単価',
        'ランク',
        '平均差',
        '予想売上',
        '達成率',
      ])
      trendData.forEach((item) => {
        const rank = trendData.filter((t) => t.value > item.value).length + 1
        const diff = item.value - salesSummary.dailyAverage
        const parsedDate = safeParseDate(item.date)
        const weekday = parsedDate
          ? parsedDate.toLocaleDateString('ja-JP', { weekday: 'short' })
          : '不明'
        const expectedSales = salesSummary.dailyAverage
        const achievementRate = ((item.value / expectedSales) * 100).toFixed(1)

        // Get booking data for this specific date
        const bookingCount = trendData.find((t) => t.date === item.date)?.bookingCount || 0
        const avgAmount = trendData.find((t) => t.date === item.date)?.averageAmount || 0

        csvData.push([
          item.date,
          weekday,
          `¥${item.value.toLocaleString()}`,
          `${bookingCount}件`,
          `¥${avgAmount.toLocaleString()}`,
          `${rank}/${trendData.length}位`,
          `${diff >= 0 ? '+' : ''}¥${diff.toLocaleString()}`,
          `¥${expectedSales.toLocaleString()}`,
          `${achievementRate}%`,
        ])
      })
      csvData.push([])

      // レポート終了
      csvData.push(['='.repeat(14)])
      csvData.push(['レポート終了'])
      csvData.push(['生成時刻', new Date().toLocaleString('ja-JP')])
      csvData.push([
        'データ期間',
        `${format(from, 'yyyy年MM月dd日')} 〜 ${format(to, 'yyyy年MM月dd日')}`,
      ])

      // CSV出力
      downloadCSVFile(csvData, fileName)
      toast.success('売上分析レポートをダウンロードしました')
    } catch (err) {
      console.error('Export CSV error:', err)
      showErrorToast(err)
    } finally {
      setIsExporting(false)
      setOpenCsvDialog(false)
    }
  }, [
    repository,
    filters,
    salesSummary,
    trendData,
    weekdayPerformance,
    monthlyData,
    periodComparison,
    showErrorToast,
    downloadCSVFile,
    weekdayAnalysis,
    safeParseDate,
  ])

  // ボタンのテキストを決定
  const buttonText = useMemo(() => {
    if (isRefreshing) return '更新中...'
    if (isInterval) return '待機中'
    return '更新'
  }, [isRefreshing, isInterval])

  // フィルター変更時のデータ再取得
  useEffect(() => {
    if (filters && repository) {
      fetchData()
    }
  }, [filters, repository, fetchData])

  // ローディング表示
  if (!isLoaded || !tenantId || !orgId) {
    return (
      <DashboardSection title="日別売上分析" backLink="/dashboard" backLinkTitle="ダッシュボード">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <SummaryCard key={i} title="" value="" loading={true} />
            ))}
          </div>
        </div>
      </DashboardSection>
    )
  }

  // フィルターがまだ設定されていない場合
  if (!filters) {
    return (
      <DashboardSection title="日別売上分析" backLink="/dashboard" backLinkTitle="ダッシュボード">
        <div>フィルターを初期化中...</div>
      </DashboardSection>
    )
  }

  // サマリーカードデータ
  const summaryCards = [
    {
      id: 'total-amount',
      title: '総売上',
      value: salesSummary?.totalAmount || 0,
      icon: <Banknote className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      change: periodComparison
        ? {
            value: periodComparison.growth.amount_percentage,
            label: '前期間比',
          }
        : undefined,
    },
    {
      id: 'total-bookings',
      title: '総予約数',
      value: salesSummary?.totalBookings || 0,
      icon: <Calendar className="w-4 h-4" />,
      change: periodComparison
        ? {
            value: periodComparison.growth.booking_percentage,
            label: '前期間比',
          }
        : undefined,
    },
    {
      id: 'average-amount',
      title: '平均客単価',
      value: salesSummary?.averageAmount || 0,
      icon: <TrendingUp className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      change: periodComparison
        ? {
            value: periodComparison.growth.average_percentage,
            label: '前期間比',
          }
        : undefined,
    },
    {
      id: 'daily-average',
      title: '1日平均売上',
      value: salesSummary?.dailyAverage || 0,
      icon: <Activity className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      subtitle: `${salesSummary?.periodDays || 0}日間の平均`,
    },
  ]

  console.log('growth', periodComparison?.growth)
  console.log('current', periodComparison?.current)
  console.log('previous', periodComparison?.previous)

  return (
    <DashboardSection title="日別売上分析" backLink="/dashboard" backLinkTitle="ダッシュボード">
      <div className="admin-analytics relative min-w-0 space-y-6">
        <Dialog open={openCsvDialog} onOpenChange={setOpenCsvDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>売り上げデータをダウンロード</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              指定期間内の売り上げデータをCSVでダウンロードします。
            </DialogDescription>
            <DialogFooter className="gap-4 mt-4">
              <Button onClick={handleExportCSV} size="sm" disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                ダウンロード
              </Button>
              <Button variant="outline" onClick={() => setOpenCsvDialog(false)}>
                閉じる
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* エラー表示 */}
        {error && (
          <Alert className="border-destructive">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        <div className="relative">
          {/* フィルター */}
          <div className="admin-toolbar mb-4 justify-end">
            <Button
              onClick={() => setOpenCsvDialog(true)}
              variant="outline"
              size="sm"
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              売り上げデータをダウンロード
            </Button>
            <Button
              onClick={handleRefresh}
              variant={!isRefreshing && !isInterval ? 'default' : 'outline'}
              size="sm"
              disabled={isRefreshing || isInterval}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isInterval ? 'animate-spin' : ''}`} />
              )}
              {buttonText}
            </Button>
          </div>
          <AnalyticsFilters
            filters={filters}
            onFiltersChange={setFilters}
            loading={loading}
            showStaffFilter={false}
            showMenuFilter={false}
          />
        </div>

        {/* サマリーカード */}
        <SummaryCardGrid cards={summaryCards} loading={loading} columns={1} />

        {/* メインコンテンツ */}
        <Tabs defaultValue="trend" className="space-y-4">
          <TabsList className="flex h-auto max-w-full flex-wrap gap-1 p-1.5">
            <TabsTrigger value="trend">売上推移</TabsTrigger>
            <TabsTrigger value="weekday">曜日別分析</TabsTrigger>
            <TabsTrigger value="monthly">月別分析</TabsTrigger>
          </TabsList>

          {/* 売上推移タブ */}
          <TabsContent value="trend" className="space-y-4">
            <LineChart
              data={trendData}
              title="日別売上推移"
              description={`${format(filters.dateRange.from, 'M月d日', { locale: ja })} 〜 ${format(filters.dateRange.to, 'M月d日', { locale: ja })} の売上トレンドを表示`}
              height={400}
              showGrid={true}
              valueFormatter={(value) => `¥${value.toLocaleString()}`}
              labelFormatter={(label) => label}
            />

            {/* 期間比較カード */}
            {periodComparison && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="relative rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">前期間との比較</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-around gap-4 tabular-nums">
                    <div className="flex flex-col justify-between items-center">
                      <span className="font-bold text-lg">
                        ¥{periodComparison.previous.total_amount.toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground">前期間売上</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <TrendingUpDown className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col justify-between items-center">
                      <span className="font-bold text-lg">
                        ¥{periodComparison.current.total_amount.toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground">現期間売上</span>
                    </div>
                  </CardContent>
                  <Badge variant="outline" className="absolute top-2 right-2">
                    <span className="text-sm ">成長率 </span>
                    <span
                      className={`font-semibold text-lg ${
                        periodComparison.growth.amount_percentage >= 0
                          ? 'text-accent-2'
                          : 'text-destructive'
                      }`}
                    >
                      {periodComparison.growth.amount_percentage >= 0 ? '+' : ''}
                      {periodComparison.growth.amount_percentage.toFixed(1)}%
                    </span>
                  </Badge>
                </Card>

                <Card className="relative rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">予約数比較</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-around gap-4 tabular-nums">
                    <div className="flex flex-col justify-between items-center">
                      <span className="font-bold text-lg">
                        {periodComparison.previous.booking_count.toLocaleString()}件
                      </span>
                      <span className="text-sm text-muted-foreground">前期間予約数</span>
                    </div>
                    <div className="flex items-center justify-center">
                      <TrendingUpDown className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col justify-between items-center">
                      <span className="font-bold text-lg">
                        {periodComparison.current.booking_count.toLocaleString()}件
                      </span>
                      <span className="text-sm text-muted-foreground">現期間予約数</span>
                    </div>
                  </CardContent>
                  <Badge variant="outline" className="absolute top-2 right-2">
                    <span className="text-sm text-muted-foreground">成長率 </span>
                    <span
                      className={`font-semibold text-lg ${
                        periodComparison.growth.booking_percentage >= 0
                          ? 'text-accent-2'
                          : 'text-destructive'
                      }`}
                    >
                      {periodComparison.growth.booking_percentage >= 0 ? '+' : ''}
                      {periodComparison.growth.booking_percentage.toFixed(1)}%
                    </span>
                  </Badge>
                </Card>
              </div>
            )}

            {/* 売上トレンド戦略インサイト */}
            {periodComparison &&
              salesSummary &&
              periodComparison.growth.amount_percentage !== 0 && (
                <Card className="rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      <TrendingUp className="w-5 h-5" />
                      売上トレンド戦略インサイト
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      期間売上パフォーマンスの最適化提案
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* 成長率分析 */}
                      <div className="p-4 bg-palette-1/10 border border-palette-1/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-palette-1 rounded-full"></div>
                          <span className="text-sm font-medium">売上成長率評価</span>
                        </div>
                        <div className="text-lg font-bold mb-1">
                          {periodComparison.growth.amount_percentage >= 0 ? '+' : ''}
                          {periodComparison.growth.amount_percentage.toFixed(1)}%
                          <span className="text-sm text-muted-foreground ml-2">前期間比</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const growth = periodComparison.growth.amount_percentage
                            if (growth >= 15) {
                              return '非常に優秀な成長率です。現在の施策を継続し、更なる拡大を目指しましょう。'
                            } else if (growth >= 5) {
                              return '良好な成長率です。安定的な成長を維持しつつ、新たな成長機会を模索してください。'
                            } else if (growth >= 0) {
                              return '横ばいの傾向です。マーケティング施策やサービス改善で成長促進を図りましょう。'
                            } else if (growth >= -10) {
                              return '軽微な減少傾向です。顧客満足度向上やリピート率改善に注力してください。'
                            } else {
                              return '大幅な減少傾向です。緊急対策として価格戦略やサービス品質の見直しが必要です。'
                            }
                          })()}
                        </p>
                      </div>
                      {/* 売上安定性指標 */}
                      <div className="p-4 bg-palette-2/10 border border-palette-2/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-palette-2 rounded-full"></div>
                          <span className="text-sm font-medium">売上安定性指標</span>
                        </div>
                        <div className="text-lg font-bold mb-1">
                          {(() => {
                            const dailyAvg = salesSummary.dailyAverage || 0
                            const totalAmount = salesSummary.totalAmount || 0
                            const days = salesSummary.periodDays || 1
                            const expectedTotal = dailyAvg * days
                            const stabilityScore =
                              expectedTotal > 0
                                ? Math.min(100, Math.round((totalAmount / expectedTotal) * 100))
                                : 0
                            return `${stabilityScore}点`
                          })()}
                          <span className="text-sm text-muted-foreground ml-1">/100点</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const dailyAvg = salesSummary.dailyAverage || 0
                            const totalAmount = salesSummary.totalAmount || 0
                            const days = salesSummary.periodDays || 1
                            const expectedTotal = dailyAvg * days
                            const stabilityScore =
                              expectedTotal > 0
                                ? Math.min(100, Math.round((totalAmount / expectedTotal) * 100))
                                : 0

                            if (stabilityScore >= 95) {
                              return '非常に安定した売上パターンです。予測可能性が高く、計画的な事業運営が可能です。'
                            } else if (stabilityScore >= 85) {
                              return '安定した売上傾向です。季節要因や曜日要因を考慮した運営最適化を検討してください。'
                            } else if (stabilityScore >= 70) {
                              return '中程度の変動があります。売上の波を平準化する施策が効果的です。'
                            } else {
                              return '売上変動が大きいです。予約管理やスタッフ配置の最適化で安定化を図りましょう。'
                            }
                          })()}
                        </p>
                      </div>
                      {/* 収益性評価 */}
                      <div className="p-4 bg-palette-3/10 border border-palette-3/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-palette-3 rounded-full"></div>
                          <span className="text-sm font-medium">収益性評価</span>
                        </div>
                        <div className="text-lg font-bold mb-1">
                          ¥{salesSummary.averageAmount?.toLocaleString() || '0'}
                          <span className="text-sm text-muted-foreground ml-1">（客単価）</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const avgAmount = salesSummary.averageAmount || 0
                            const bookingGrowth = periodComparison.growth.booking_percentage
                            const amountGrowth = periodComparison.growth.amount_percentage

                            if (avgAmount >= 10000) {
                              return 'プレミアム価格帯の維持に成功しています。高付加価値サービスの継続的な提供を心がけてください。'
                            } else if (avgAmount >= 7000) {
                              return '適正な客単価レベルです。サービス品質の向上でさらなる単価向上を目指しましょう。'
                            } else if (avgAmount >= 5000 && amountGrowth > bookingGrowth) {
                              return '客単価向上の傾向が見られます。アップセル戦略が効果的に機能しています。'
                            } else if (avgAmount >= 5000) {
                              return '標準的な客単価です。オプションメニューやパッケージ化で単価向上を図りましょう。'
                            } else {
                              return '客単価に改善余地があります。価格戦略の見直しとサービス価値の向上が必要です。'
                            }
                          })()}
                        </p>
                      </div>
                      {/* 総合戦略提案 */}
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          <strong>💼 総合戦略提案:</strong>
                          {(() => {
                            const amountGrowth = periodComparison.growth.amount_percentage
                            const bookingGrowth = periodComparison.growth.booking_percentage
                            const dailyAvg = salesSummary.dailyAverage || 0

                            if (amountGrowth >= 10 && bookingGrowth >= 5) {
                              return ' 売上・予約数ともに好調な成長を示しています。現在の成功要因を分析し、スケールアップ戦略を検討してください。'
                            } else if (amountGrowth > bookingGrowth && amountGrowth > 0) {
                              return ' 客単価向上が売上成長を牽引しています。既存顧客へのアップセル・クロスセル施策を強化し、新規顧客獲得にも注力しましょう。'
                            } else if (bookingGrowth > amountGrowth && bookingGrowth > 0) {
                              return ' 予約数増加が成長の要因です。顧客満足度向上と単価向上施策で、質的成長への転換を目指しましょう。'
                            } else if (amountGrowth < 0 && bookingGrowth < 0) {
                              return ' 全体的な減少傾向が見られます。顧客分析を実施し、サービス改善・価格見直し・マーケティング強化を包括的に進めてください。'
                            } else if (dailyAvg >= 50000) {
                              return ' 高い日別売上を維持しています。この水準を安定化させ、効率的な運営体制の構築に注力してください。'
                            } else {
                              return ' 成長機会の特定と実行が重要です。市場分析・競合調査を実施し、差別化戦略を明確にしてください。'
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
          </TabsContent>

          {/* 曜日別分析タブ */}
          <TabsContent value="weekday" className="space-y-4">
            <BarChart
              data={weekdayPerformance.map((item) => ({
                name: item.dayName,
                value: item.totalAmount,
                bookingCount: item.bookingCount,
                label: `¥${item.totalAmount.toLocaleString()}`,
              }))}
              title="曜日別売上分析"
              description={`${format(filters.dateRange.from, 'M月d日', { locale: ja })} 〜 ${format(filters.dateRange.to, 'M月d日', { locale: ja })} の曜日別売上パフォーマンス`}
              height={400}
              showGrid={true}
              valueFormatter={(value) => `¥${value.toLocaleString()}`}
              labelFormatter={(label) => label}
            />

            {/* 曜日別パフォーマンスサマリー */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="border border-border rounded-lg p-3 bg-success text-success-foreground">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <h3 className="text-lg  font-semibold">最高パフォーマンス</h3>
                </div>
                <div className="p-4">
                  {weekdayAnalysis.bestItem ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold">{weekdayAnalysis.bestItem.dayName}</p>
                      <p className="text-lg font-semibold text-success-foreground">
                        ¥{weekdayAnalysis.bestItem.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        全体の
                        <strong className="">
                          {weekdayAnalysis.bestItem.totalAmountPercentage.toFixed(1)}
                        </strong>
                        %
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">データがありません</p>
                  )}
                </div>
              </div>

              <div className="border border-border rounded-lg p-3 bg-destructive-foreground text-destructive">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                  <h3 className="text-lg font-semibold">最低パフォーマンス</h3>
                </div>
                <div className="p-4">
                  {weekdayAnalysis.worstItem ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold">{weekdayAnalysis.worstItem.dayName}</p>
                      <p className="text-lg font-semibold text-destructive">
                        ¥{weekdayAnalysis.worstItem.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        全体の
                        <strong>
                          {weekdayAnalysis.worstItem.totalAmountPercentage.toFixed(1)}
                        </strong>
                        %
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">データがありません</p>
                  )}
                </div>
              </div>

              <div className="border border-border rounded-lg p-3 bg-accent-2-foreground text-accent-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent-2" />
                  <h3 className="text-lg font-semibold">平均パフォーマンス</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    <p className="text-2xl font-bold">
                      ¥{Number(weekdayAnalysis.totalAverage.toFixed(0)).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      予約数平均:{' '}
                      <strong className="">{weekdayAnalysis.bookingAverage.toFixed(1)}</strong> 件
                    </p>
                    <p className="text-sm text-muted-foreground">
                      客単価平均: ¥
                      <strong className="">
                        {Math.floor(weekdayAnalysis.amountAverage).toLocaleString()}
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 曜日別詳細テーブル */}
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">曜日別詳細データ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-nowrap">
                        <th className="text-right p-2">ランキング</th>
                        <th className="text-left p-2">曜日</th>
                        <th className="text-right p-2">売上合計</th>
                        <th className="text-right p-2">予約数</th>
                        <th className="text-right p-2">平均売上</th>
                        <th className="text-right p-2">売上比率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekdayPerformance.map((item, index) => (
                        <tr
                          key={index}
                          className={`border-b text-nowrap ${item.isHighest ? 'bg-success' : item.isLowest ? 'bg-destructive-foreground' : ''}`}
                        >
                          <td className="p-2 w-10 text-center">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                item.rank === 1
                                  ? 'bg-success text-success-foreground font-bold'
                                  : item.rank === 2
                                    ? 'bg-link-foreground text-link font-bold'
                                    : item.rank === 3
                                      ? 'bg-warning text-warning-foreground font-bold'
                                      : item.isLowest
                                        ? 'bg-destructive-foreground text-destructive font-bold'
                                        : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {item.rank}位
                            </span>
                          </td>
                          <td
                            className={`p-2 font-medium ${item.isHighest ? 'text-success-foreground' : item.isLowest ? 'text-destructive' : ''}`}
                          >
                            {item.dayName}
                          </td>
                          <td className="p-2 text-right">¥{item.totalAmount.toLocaleString()}</td>
                          <td className="p-2 text-right">{item.bookingCount}件</td>
                          <td className="p-2 text-right">¥{item.averageAmount.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {item.totalAmountPercentage.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 曜日別運営戦略インサイト */}
            {weekdayAnalysis.bestItem && weekdayAnalysis.worstItem && (
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    <Calendar className="w-5 h-5" />
                    曜日別運営戦略インサイト
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    曜日パターンを活用した運営最適化提案
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* 最強曜日分析 */}
                    <div className="p-4 bg-palette-1/10 border border-palette-1/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-1 rounded-full"></div>
                        <span className="text-sm font-medium">売上No.1曜日</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {weekdayAnalysis.bestItem.dayName}
                        <span className="text-sm text-muted-foreground ml-2">
                          （¥{weekdayAnalysis.bestItem.totalAmount.toLocaleString()}）
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const bestDay = weekdayAnalysis.bestItem.dayName
                          const percentage = weekdayAnalysis.bestItem.totalAmountPercentage

                          if (percentage >= 20) {
                            return `${bestDay}は週売上の${percentage.toFixed(1)}%を占める主力曜日です。スタッフ配置を厚くし、特別メニューの提供を検討してください。`
                          } else if (percentage >= 15) {
                            return `${bestDay}は安定した売上を見込める重要曜日です。予約枠の拡大やプロモーション強化で更なる売上向上を目指しましょう。`
                          } else {
                            return `${bestDay}が最高パフォーマンスですが、曜日間の差は比較的小さいです。全体的な底上げ施策が効果的です。`
                          }
                        })()}
                      </p>
                    </div>

                    {/* 改善対象曜日分析 */}
                    <div className="p-4 bg-palette-2/10 border border-palette-2/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-2 rounded-full"></div>
                        <span className="text-sm font-medium">改善対象曜日</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {weekdayAnalysis.worstItem.dayName}
                        <span className="text-sm text-muted-foreground ml-2">
                          （¥{weekdayAnalysis.worstItem.totalAmount.toLocaleString()}）
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const worstDay = weekdayAnalysis.worstItem.dayName
                          const bestAmount = weekdayAnalysis.bestItem.totalAmount
                          const worstAmount = weekdayAnalysis.worstItem.totalAmount
                          const gap = ((bestAmount - worstAmount) / bestAmount) * 100

                          if (gap >= 40) {
                            return `${worstDay}は最高曜日と比べて${gap.toFixed(1)}%低い売上です。特別割引やイベント開催で集客向上を図りましょう。`
                          } else if (gap >= 20) {
                            return `${worstDay}は改善余地があります。ターゲット層に合わせたサービス提供や営業時間調整を検討してください。`
                          } else {
                            return `${worstDay}も安定した売上を確保しています。微調整により全体パフォーマンスの向上が期待できます。`
                          }
                        })()}
                      </p>
                    </div>

                    {/* 曜日別効率性スコア */}
                    <div className="p-4 bg-palette-3/10 border border-palette-3/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-3 rounded-full"></div>
                        <span className="text-sm font-medium">曜日別効率性スコア</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {(() => {
                          const bestAmount = weekdayAnalysis.bestItem.totalAmount
                          const worstAmount = weekdayAnalysis.worstItem.totalAmount
                          const avgAmount = weekdayAnalysis.totalAverage
                          const efficiencyScore =
                            avgAmount > 0 ? Math.round((worstAmount / bestAmount) * 100) : 0
                          return `${efficiencyScore}点`
                        })()}
                        <span className="text-sm text-muted-foreground ml-1">/100点</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const bestAmount = weekdayAnalysis.bestItem.totalAmount
                          const worstAmount = weekdayAnalysis.worstItem.totalAmount
                          const efficiencyScore = Math.round((worstAmount / bestAmount) * 100)

                          if (efficiencyScore >= 80) {
                            return '曜日間の売上バランスが良好です。安定した週間運営ができており、リスク分散も図れています。'
                          } else if (efficiencyScore >= 60) {
                            return '中程度の曜日格差があります。低パフォーマンス曜日の改善で全体売上の底上げが可能です。'
                          } else if (efficiencyScore >= 40) {
                            return '曜日格差が大きいです。集中的な改善施策により大幅な売上向上の機会があります。'
                          } else {
                            return '極端な曜日格差があります。運営体制の根本的見直しと戦略的な改善計画が必要です。'
                          }
                        })()}
                      </p>
                    </div>

                    {/* 総合運営提案 */}
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <strong>💼 曜日別運営提案:</strong>
                        {(() => {
                          const bestDay = weekdayAnalysis.bestItem.dayName
                          const worstDay = weekdayAnalysis.worstItem.dayName
                          const bestAmount = weekdayAnalysis.bestItem.totalAmount
                          const worstAmount = weekdayAnalysis.worstItem.totalAmount
                          const gap = ((bestAmount - worstAmount) / bestAmount) * 100

                          if (bestDay.includes('土') || bestDay.includes('日')) {
                            return ` 週末（${bestDay}）が最高パフォーマンスです。週末特別メニューの充実と平日割引キャンペーンで集客バランスを最適化しましょう。`
                          } else if (worstDay.includes('月') || worstDay.includes('火')) {
                            return ` 週初め（${worstDay}）の売上改善が重要です。月曜・火曜限定のお得なプランや、週末予約者への平日誘導施策を実施してください。`
                          } else if (gap >= 30) {
                            return ` ${bestDay}と${worstDay}の差が大きいです（${gap.toFixed(1)}%差）。${worstDay}の特別施策により週間売上の大幅改善が期待できます。`
                          } else {
                            return ` 比較的安定した曜日パターンです。${bestDay}の成功要因を他曜日にも横展開し、全体最適化を図りましょう。`
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 月別分析タブ */}
          <TabsContent value="monthly" className="space-y-4">
            <BarChart
              data={monthlyData.map((item) => ({
                name: item.monthName,
                value: item.totalAmount,
                label: `¥${item.totalAmount.toLocaleString()}`,
              }))}
              title="月別売上分析"
              description={`${format(filters.dateRange.from, 'M月d日', { locale: ja })} 〜 ${format(filters.dateRange.to, 'M月d日', { locale: ja })} の月別売上パフォーマンス`}
              height={400}
              showGrid={true}
            />

            {/* 月別パフォーマンスサマリー */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="border border-border rounded-lg p-3 bg-success text-success-foreground">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  <h3 className="text-lg font-semibold">最高パフォーマンス</h3>
                </div>
                <div className="p-4">
                  {monthlyAnalysis.bestItem ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold">{monthlyAnalysis.bestItem.monthName}</p>
                      <p className="text-lg font-semibold text-success-foreground">
                        ¥{monthlyAnalysis.bestItem.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        全体の{monthlyAnalysis.bestItem.totalAmountPercentage.toFixed(1)}%
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">データがありません</p>
                  )}
                </div>
              </div>

              <div className="border border-border rounded-lg p-3 bg-destructive-foreground text-destructive">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                  <h3 className="text-lg font-semibold">最低パフォーマンス</h3>
                </div>
                <div className="p-4">
                  {monthlyAnalysis.worstItem ? (
                    <div className="space-y-2">
                      <p className="text-2xl font-bold">{monthlyAnalysis.worstItem.monthName}</p>
                      <p className="text-lg font-semibold text-destructive">
                        ¥{monthlyAnalysis.worstItem.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        全体の{monthlyAnalysis.worstItem.totalAmountPercentage.toFixed(1)}%
                      </p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">データがありません</p>
                  )}
                </div>
              </div>

              <div className="border border-border rounded-lg p-3 bg-accent-2-foreground text-accent-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-accent-2" />
                  <h3 className="text-lg font-semibold">平均パフォーマンス</h3>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    <p className="text-2xl font-bold">
                      ¥{monthlyAnalysis.totalAverage.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      平均予約数: <strong>{monthlyAnalysis.bookingAverage.toLocaleString()}</strong>{' '}
                      件
                    </p>
                    <p className="text-sm text-muted-foreground">
                      平均客単価: <strong>¥{monthlyAnalysis.amountAverage.toLocaleString()}</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 月別詳細テーブル */}
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">月別詳細データ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-nowrap">
                        <th className="text-left p-2">月</th>
                        <th className="text-right p-2">売上合計</th>
                        <th className="text-right p-2">予約数</th>
                        <th className="text-right p-2">平均客単価</th>
                        <th className="text-right p-2">売上比率</th>
                        <th className="text-right p-2">成長率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((item, index) => (
                        <tr
                          key={index}
                          className={`border-b text-nowrap ${item.isHighest ? 'bg-success text-success-foreground' : item.isLowest ? 'bg-destructive-foreground text-destructives' : ''}`}
                        >
                          <td className="p-2 font-medium">{item.monthName}</td>
                          <td className="p-2 text-right">¥{item.totalAmount.toLocaleString()}</td>
                          <td className="p-2 text-right">{item.bookingCount}件</td>
                          <td className="p-2 text-right">¥{item.averageAmount.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {item.totalAmountPercentage.toFixed(1)}%
                          </td>
                          <td className="p-2 text-right">
                            {item.growthRate !== undefined ? (
                              <span
                                className={`${item.growthRate >= 0 ? 'text-success-foreground' : 'text-destructive'}`}
                              >
                                {item.growthRate >= 0 ? '+' : ''}
                                {item.growthRate.toFixed(1)}%
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 月別成長戦略インサイト */}
            {monthlyAnalysis.bestItem && monthlyAnalysis.worstItem && monthlyData.length > 0 && (
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    <Activity className="w-5 h-5" />
                    月別成長戦略インサイト
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    月次トレンドを活用した中長期戦略提案
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* 最高月間パフォーマンス */}
                    <div className="p-4 bg-palette-1/10 border border-palette-1/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-1 rounded-full"></div>
                        <span className="text-sm font-medium">売上No.1月</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {monthlyAnalysis.bestItem.monthName}
                        <span className="text-sm text-muted-foreground ml-2">
                          （¥{monthlyAnalysis.bestItem.totalAmount.toLocaleString()}）
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const bestMonth = monthlyAnalysis.bestItem.monthName
                          const percentage = monthlyAnalysis.bestItem.totalAmountPercentage

                          if (bestMonth.includes('12') || bestMonth.includes('11')) {
                            return `年末商戦期（${bestMonth}）が最高パフォーマンスです。次年度の年末施策を更に強化し、この成功パターンを継続しましょう。`
                          } else if (bestMonth.includes('3') || bestMonth.includes('4')) {
                            return `新年度・春シーズン（${bestMonth}）が好調です。新生活需要を捉えた春キャンペーンの拡充を検討してください。`
                          } else if (percentage >= 15) {
                            return `${bestMonth}が年間売上の${percentage.toFixed(1)}%を占める重要月です。この月の成功要因を他月にも展開しましょう。`
                          } else {
                            return `${bestMonth}が最高実績ですが、月間格差は比較的小さいです。通年での安定成長戦略が効果的です。`
                          }
                        })()}
                      </p>
                    </div>

                    {/* 改善対象月分析 */}
                    <div className="p-4 bg-palette-2/10 border border-palette-2/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-2 rounded-full"></div>
                        <span className="text-sm font-medium">強化対象月</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {monthlyAnalysis.worstItem.monthName}
                        <span className="text-sm text-muted-foreground ml-2">
                          （¥{monthlyAnalysis.worstItem.totalAmount.toLocaleString()}）
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const worstMonth = monthlyAnalysis.worstItem.monthName
                          const bestAmount = monthlyAnalysis.bestItem.totalAmount
                          const worstAmount = monthlyAnalysis.worstItem.totalAmount
                          const gap = ((bestAmount - worstAmount) / bestAmount) * 100

                          if (worstMonth.includes('1') || worstMonth.includes('2')) {
                            return `年始・冬季（${worstMonth}）の売上改善が重要です。新年キャンペーンや冬季限定メニューの導入を検討してください。`
                          } else if (worstMonth.includes('8') || worstMonth.includes('9')) {
                            return `夏季・初秋（${worstMonth}）の強化が必要です。夏休み需要の取り込みや秋の準備キャンペーンを実施しましょう。`
                          } else if (gap >= 30) {
                            return `${worstMonth}は最高月と${gap.toFixed(1)}%の差があります。季節特性を活かした特別施策で大幅改善の余地があります。`
                          } else {
                            return `${worstMonth}も一定の実績を維持しています。小幅な改善施策で全体的な売上底上げが期待できます。`
                          }
                        })()}
                      </p>
                    </div>

                    {/* 成長トレンド評価 */}
                    <div className="p-4 bg-palette-3/10 border border-palette-3/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-palette-3 rounded-full"></div>
                        <span className="text-sm font-medium">成長トレンド評価</span>
                      </div>
                      <div className="text-lg font-bold mb-1">
                        {(() => {
                          const monthsWithGrowth = monthlyData.filter(
                            (item) => item.growthRate !== undefined && item.growthRate > 0
                          ).length
                          const totalMonthsWithRate = monthlyData.filter(
                            (item) => item.growthRate !== undefined
                          ).length
                          const growthConsistency =
                            totalMonthsWithRate > 0
                              ? Math.round((monthsWithGrowth / totalMonthsWithRate) * 100)
                              : 0
                          return `${growthConsistency}%`
                        })()}
                        <span className="text-sm text-muted-foreground ml-1">成長一貫性</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => {
                          const monthsWithGrowth = monthlyData.filter(
                            (item) => item.growthRate !== undefined && item.growthRate > 0
                          ).length
                          const totalMonthsWithRate = monthlyData.filter(
                            (item) => item.growthRate !== undefined
                          ).length
                          const growthConsistency =
                            totalMonthsWithRate > 0
                              ? Math.round((monthsWithGrowth / totalMonthsWithRate) * 100)
                              : 0

                          if (growthConsistency >= 70) {
                            return '優秀な成長一貫性を示しています。現在の戦略を継続し、更なる拡大投資を検討してください。'
                          } else if (growthConsistency >= 50) {
                            return '安定した成長トレンドです。成長期の要因分析と成功パターンの横展開が効果的です。'
                          } else if (growthConsistency >= 30) {
                            return '波のある成長パターンです。成長阻害要因の特定と対策により安定化を図りましょう。'
                          } else {
                            return '成長トレンドに課題があります。市場環境・競合状況・内部要因の包括的な見直しが必要です。'
                          }
                        })()}
                      </p>
                    </div>

                    {/* 総合月次戦略 */}
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        <strong>💼 月次成長戦略:</strong>
                        {(() => {
                          const avgGrowthRate =
                            monthlyData
                              .filter((item) => item.growthRate !== undefined)
                              .reduce((sum, item) => sum + (item.growthRate || 0), 0) /
                            monthlyData.filter((item) => item.growthRate !== undefined).length

                          const bestAmount = monthlyAnalysis.bestItem.totalAmount
                          const worstAmount = monthlyAnalysis.worstItem.totalAmount
                          const seasonalVariation = ((bestAmount - worstAmount) / bestAmount) * 100

                          if (avgGrowthRate >= 5) {
                            return ` 平均成長率${avgGrowthRate.toFixed(1)}%の良好なトレンドです。この成長を持続させるため、成功要因の体系化と再現可能な仕組み作りに投資しましょう。`
                          } else if (seasonalVariation >= 40) {
                            return ` 季節変動が大きい（${seasonalVariation.toFixed(1)}%差）ビジネスパターンです。閑散期の底上げと繁忙期の最大化を両輪とした年間戦略が重要です。`
                          } else if (avgGrowthRate >= 0) {
                            return ` 安定した月次推移を示しています。既存顧客の深耕と新規開拓のバランスを取りながら、着実な成長を目指しましょう。`
                          } else {
                            return ` 月次トレンドに改善余地があります。四半期単位での短期集中施策と、年間を通じた中長期戦略の両方が必要です。`
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardSection>
  )
}

export default withOwnerAccess(DailyAnalyticsPage)
