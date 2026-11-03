'use client'

import { toast } from 'sonner'
import { withOwnerAccess } from '@/components/common'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Loader2, RefreshCwIcon, DollarSign, Package, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Award, BarChart3, HelpCircle, PieChart as PieChartIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import type {
  SalesSummary,
  RankingData,
  MenuSalesData,
} from '@/services/supabase/repositories/analytics/types'

// エンタープライズレベルの型定義
type EnterpriseMenuSummary = SalesSummary & {
  topMenu: MenuSalesData | null
  activeMenuCount: number
}

type MenuPerformanceAnalysis = {
  topPerformers: MenuSalesData[]
  averagePerformance: {
    averageAmount: number
    averageBookings: number
  }
  performanceDistribution: {
    high: number
    medium: number
    low: number
  }
  popularityTrend: {
    menu_id: string
    menu_name: string
    booking_trend: number
    revenue_trend: number
  }[]
}

type PriceTierAnalysis = {
  priceTiers: {
    tier: string
    priceRange: string
    menuCount: number
    totalAmount: number
    averageAmount: number
    bookingCount: number
  }[]
  insights: {
    mostProfitableTier: string
    mostPopularTier: string
    averageMenuPrice: number
  }
}

import { DashboardSection } from '@/components/common'
import {
  BarChart,
  PieChart,
  AnalyticsFilters,
  SummaryCard,
  SummaryCardGrid,
  type FilterOptions,
} from '@/components/analytics'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CHART_COLORS } from '@/lib/chart-colors'

import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { MenuSalesRepository } from '@/services/supabase/repositories/analytics'

// 初期フィルター設定（日本時間での現在月のデータのみ取得、月次パーティション対応）
const getInitialFilters = (tenantId: string, orgId: string): FilterOptions => {
  // 日本時間（JST: UTC+9）で現在の日時を取得
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000 // 9時間をミリ秒に変換
  const nowJST = new Date(now.getTime() + jstOffset)

  // 日付が有効かチェック
  if (isNaN(nowJST.getTime())) {
    throw new Error('日本時間の取得に失敗しました')
  }

  // 日本時間での現在月の1日を取得
  const currentMonthStart = startOfMonth(nowJST)

  // 日本時間での該当月の最終日を取得
  const currentMonthEnd = endOfMonth(nowJST)

  // 日付が有効かチェック
  if (isNaN(currentMonthStart.getTime()) || isNaN(currentMonthEnd.getTime())) {
    throw new Error('月次日付範囲の生成に失敗しました')
  }

  console.log('[Menu Analytics] Initial date range setup:', {
    nowJST: nowJST.toISOString(),
    currentMonthStart: currentMonthStart.toISOString(),
    currentMonthEnd: currentMonthEnd.toISOString(),
    timezone: 'JST (UTC+9)',
  })

  return {
    dateRange: {
      from: currentMonthStart,
      to: currentMonthEnd,
    },
    tenantId,
    orgId,
  }
}

/**
 * メニュー別売上分析ページ - エンタープライズレベル
 */
function MenuAnalyticsPage() {
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

  // データ状態（エンタープライズレベル対応）
  const [menuSummary, setMenuSummary] = useState<EnterpriseMenuSummary | null>(null)
  const [menuRanking, setMenuRanking] = useState<RankingData[]>([])
  const [performanceAnalysis, setPerformanceAnalysis] = useState<MenuPerformanceAnalysis | null>(
    null
  )
  const [priceTierAnalysis, setPriceTierAnalysis] = useState<PriceTierAnalysis | null>(null)

  // リポジトリインスタンス
  const repository = useMemo(() => {
    if (!tenantId || !orgId) return null
    return new MenuSalesRepository()
  }, [tenantId, orgId])

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

  // エンタープライズレベルのデータ取得（3,000店舗対応）
  const fetchData = useCallback(async () => {
    if (!repository || !filters) return

    setLoading(true)
    setError(null)

    const startTime = performance.now()

    try {
      console.log('[Enterprise] Starting menu analytics data fetch for tenant:', {
        tenantId: filters.tenantId,
        orgId: filters.orgId,
        dateRange: {
          from: filters.dateRange.from.toISOString().split('T')[0],
          to: filters.dateRange.to.toISOString().split('T')[0],
        },
        menuCount: filters.menuIds?.length || 0,
      })

      // 並列実行でパフォーマンス最適化（大規模SaaS向け）
      const [summaryResult, rankingResult, performanceResult, priceTierResult] = await Promise.all([
        repository.getMenuSummary(filters).catch((err) => {
          console.error('[Enterprise] Menu summary fetch failed:', err)
          throw new Error(`売上サマリー取得エラー: ${err.message}`)
        }),
        repository.getMenuRanking(filters, 15).catch((err) => {
          console.error('[Enterprise] Menu ranking fetch failed:', err)
          throw new Error(`ランキング取得エラー: ${err.message}`)
        }),
        repository.getMenuPerformanceAnalysis(filters).catch((err) => {
          console.error('[Enterprise] Performance analysis fetch failed:', err)
          throw new Error(`パフォーマンス分析エラー: ${err.message}`)
        }),
        repository.getPriceTierAnalysis(filters).catch((err) => {
          console.error('[Enterprise] Price tier analysis fetch failed:', err)
          throw new Error(`価格帯分析エラー: ${err.message}`)
        }),
      ])

      const executionTime = performance.now() - startTime
      console.log('[Enterprise] Menu analytics data fetch completed:', {
        executionTime: Math.round(executionTime),
        summaryData: {
          totalAmount: summaryResult.totalAmount,
          totalBookings: summaryResult.totalBookings,
          activeMenuCount: summaryResult.activeMenuCount,
        },
        rankingCount: rankingResult.length,
        performanceMetrics: performanceResult,
        priceTierInsights: priceTierResult.insights,
      })

      // エンタープライズレベルのデータ検証
      if (summaryResult.totalAmount < 0 || summaryResult.totalBookings < 0) {
        throw new Error('データ整合性エラー: 負の値が検出されました')
      }

      setMenuSummary(summaryResult as EnterpriseMenuSummary)
      setMenuRanking(rankingResult)
      setPerformanceAnalysis(performanceResult)
      setPriceTierAnalysis(priceTierResult)

      // パフォーマンス監視（3,000店舗運用向け）
      if (executionTime > 5000) {
        console.warn('[Enterprise] Performance warning: Data fetch took longer than 5 seconds:', {
          executionTime,
          tenantId: filters.tenantId,
          dataSize: {
            menuCount: rankingResult.length,
            dateRange: Math.ceil(
              (filters.dateRange.to.getTime() - filters.dateRange.from.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          },
        })
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'メニュー分析データの取得に失敗しました'
      setError(errorMessage)

      // エンタープライズレベルのエラーログ
      console.error('[Enterprise] Menu analytics fetch error:', {
        error: err,
        tenantId: filters.tenantId,
        orgId: filters.orgId,
        executionTime: performance.now() - startTime,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }, [repository, filters])

  // フィルター変更時のデータ再取得
  useEffect(() => {
    if (filters && repository) {
      fetchData()
    }
  }, [filters, repository, fetchData])

  const REFRESH_INTERVAL = 5000 // 5秒
  const handleRefresh = async () => {
    if (isRefreshing || isInterval) return
    try {
      setIsRefreshing(true)
      await fetchData()
      toast.success('データを更新しました')
    } catch (err) {
      showErrorToast(err)
    } finally {
      setIsRefreshing(false)
      setIsInterval(true)
      setTimeout(() => {
        setIsInterval(false)
      }, REFRESH_INTERVAL)
    }
  }

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
    if (!repository || !filters || !menuSummary || !menuRanking) return

    // 日付範囲の妥当性チェック
    const { from, to } = filters.dateRange
    if (!from || !to || !(from instanceof Date) || !(to instanceof Date)) {
      showErrorToast(new Error('日付範囲が正しく設定されていません'))
      return
    }

    setIsExporting(true)
    try {
      const dateRange = `${format(from, 'yyyy-MM-dd')}_${format(to, 'yyyy-MM-dd')}`
      const fileName = `メニュー分析レポート_${dateRange}.csv`

      const csvData = []

      // ============================================
      // 【1】レポートヘッダー
      // ============================================
      csvData.push(['メニュー分析レポート'])
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

      const topMenu = performanceAnalysis?.topPerformers?.[0]
      const avgMenuPerformance = performanceAnalysis?.averagePerformance?.averageAmount || 0
      const activeMenus = menuSummary.activeMenuCount
      const avgPrice = priceTierAnalysis?.insights?.averageMenuPrice || 0

      csvData.push(['主要指標', '数値', '評価', '戦略提案'])
      csvData.push([
        '売上No.1メニュー',
        topMenu ? `${topMenu.menu_name} (¥${topMenu.total_amount.toLocaleString()})` : 'データなし',
        topMenu && topMenu.total_amount >= avgMenuPerformance * 2
          ? '圧倒的強者'
          : topMenu && topMenu.total_amount >= avgMenuPerformance * 1.5
            ? '優秀'
            : '標準',
        topMenu ? 'この成功要因を他メニューに展開' : 'メニュー戦略見直し必要',
      ])
      csvData.push([
        'アクティブメニュー数',
        `${activeMenus}品目`,
        activeMenus >= 20 ? '豊富' : activeMenus >= 10 ? '適正' : '少ない',
        activeMenus < 10 ? 'メニュー拡充検討' : activeMenus > 30 ? 'メニュー整理検討' : '現状維持',
      ])
      csvData.push([
        'メニュー平均売上',
        `¥${avgMenuPerformance.toLocaleString()}`,
        avgMenuPerformance >= 50000 ? '優秀' : avgMenuPerformance >= 20000 ? '良好' : '要改善',
        avgMenuPerformance < 20000 ? '価格戦略・品質向上' : '更なる差別化',
      ])
      csvData.push([
        '平均メニュー価格',
        `¥${avgPrice.toLocaleString()}`,
        avgPrice >= 5000 ? '高価格帯' : avgPrice >= 3000 ? '中価格帯' : '低価格帯',
        '価格帯に応じた戦略実行',
      ])
      csvData.push([])

      // ビジネス洞察
      csvData.push(['重要な洞察'])
      csvData.push(['-'.repeat(40)])

      if (performanceAnalysis) {
        const highPerformers = performanceAnalysis.performanceDistribution.high
        const totalMenus =
          highPerformers +
          performanceAnalysis.performanceDistribution.medium +
          performanceAnalysis.performanceDistribution.low
        const highPerformerRate =
          totalMenus > 0 ? Math.round((highPerformers / totalMenus) * 100) : 0

        csvData.push([
          '高パフォーマンス率',
          `${highPerformerRate}% (${highPerformers}/${totalMenus}品目)`,
        ])

        if (highPerformerRate >= 30) {
          csvData.push(['メニュー戦略', '優秀なポートフォリオ・更なる強化推進'])
        } else if (highPerformerRate >= 15) {
          csvData.push(['メニュー戦略', '平均的ポートフォリオ・選択と集中'])
        } else {
          csvData.push(['メニュー戦略', '要改善・大幅見直し必要'])
        }
      }

      if (priceTierAnalysis && priceTierAnalysis.insights.mostProfitableTier) {
        csvData.push(['最適価格帯', priceTierAnalysis.insights.mostProfitableTier])
        if (
          priceTierAnalysis.insights.mostProfitableTier !==
          priceTierAnalysis.insights.mostPopularTier
        ) {
          csvData.push(['価格戦略', '人気価格帯から高収益価格帯への誘導施策'])
        } else {
          csvData.push(['価格戦略', '理想的な価格設定・現状維持'])
        }
      }
      csvData.push([])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      // ============================================
      // 【3】メニューランキング詳細
      // ============================================
      csvData.push(['メニューランキング詳細'])
      csvData.push(['='.repeat(14)])
      csvData.push([])
      csvData.push([
        '順位',
        'メニュー名',
        '売上',
        '売上比率',
        '予約数',
        '客単価',
        'パフォーマンス評価',
        '改善提案',
      ])

      menuRanking.forEach((menu, index) => {
        const menuDetail = performanceAnalysis?.topPerformers?.find(
          (performer) => performer.menu_name === menu.name
        )
        const bookings = menuDetail?.booking_count || 0
        // 予約数が0の場合、このメニューはランキングに含まれるべきではない（サーバー側でフィルタ済み）
        const avgAmount = bookings > 0 ? Math.round(menu.value / bookings) : 0

        let performance = ''
        let suggestion = ''

        if (index < 3) {
          performance = '優秀'
          suggestion = '成功要因分析・他メニューへの展開'
        } else if (index < Math.ceil(menuRanking.length * 0.3)) {
          performance = '良好'
          suggestion = 'さらなる強化・プロモーション'
        } else if (index < Math.ceil(menuRanking.length * 0.7)) {
          performance = '標準'
          suggestion = '改善施策・差別化'
        } else {
          performance = '要改善'
          suggestion = '抜本的見直し・廃止検討'
        }

        csvData.push([
          `${index + 1}位`,
          menu.name,
          `¥${menu.value.toLocaleString()}`,
          `${menu.percentage.toFixed(1)}%`,
          `${bookings}件`,
          `¥${avgAmount.toLocaleString()}`,
          performance,
          suggestion,
        ])
      })
      csvData.push([])

      // ============================================
      // 【4】価格帯分析
      // ============================================
      if (priceTierAnalysis && priceTierAnalysis.priceTiers.length > 0) {
        csvData.push(['価格帯分析'])
        csvData.push(['='.repeat(14)])
        csvData.push([])
        csvData.push([
          '価格帯',
          '価格範囲',
          'メニュー数',
          '総売上',
          '予約数',
          '平均売上',
          'ROI評価',
          '戦略提案',
        ])

        priceTierAnalysis.priceTiers.forEach((tier) => {
          const roi = tier.menuCount > 0 ? Math.round(tier.totalAmount / tier.menuCount) : 0
          let roiEvaluation = ''
          let strategy = ''

          if (tier.tier === priceTierAnalysis.insights.mostProfitableTier) {
            roiEvaluation = '最高収益'
            strategy = 'この価格帯のメニュー拡充・強化'
          } else if (tier.tier === priceTierAnalysis.insights.mostPopularTier) {
            roiEvaluation = '最高人気'
            strategy = 'アップセル・価格帯向上施策'
          } else if (roi >= avgMenuPerformance) {
            roiEvaluation = '平均以上'
            strategy = '継続・微調整'
          } else {
            roiEvaluation = '要改善'
            strategy = '価格見直し・品質向上'
          }

          csvData.push([
            tier.tier,
            tier.priceRange,
            `${tier.menuCount}品目`,
            `¥${tier.totalAmount.toLocaleString()}`,
            `${tier.bookingCount}件`,
            `¥${tier.averageAmount.toLocaleString()}`,
            roiEvaluation,
            strategy,
          ])
        })
        csvData.push([])
      }

      // ============================================
      // 【5】パフォーマンス分析
      // ============================================
      if (performanceAnalysis) {
        csvData.push(['パフォーマンス分析'])
        csvData.push(['='.repeat(14)])
        csvData.push([])

        csvData.push(['分析項目', '数値', '評価'])
        csvData.push([
          '平均以上メニュー数',
          `${performanceAnalysis.performanceDistribution.high}品目`,
          performanceAnalysis.performanceDistribution.high >= activeMenus * 0.3 ? '優秀' : '要改善',
        ])
        csvData.push([
          '標準メニュー数',
          `${performanceAnalysis.performanceDistribution.medium}品目`,
          '改善余地あり',
        ])
        csvData.push([
          '低パフォーマンス数',
          `${performanceAnalysis.performanceDistribution.low}品目`,
          performanceAnalysis.performanceDistribution.low <= activeMenus * 0.2
            ? '許容範囲'
            : '要対策',
        ])
        csvData.push([
          'メニュー平均予約数',
          `${performanceAnalysis.averagePerformance.averageBookings.toFixed(1)}件`,
          performanceAnalysis.averagePerformance.averageBookings >= 5 ? '良好' : '要改善',
        ])
        csvData.push([])
      }

      // ============================================
      // 【6】総合戦略提案・アクションプラン
      // ============================================
      csvData.push(['総合戦略提案・アクションプラン'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      csvData.push(['優先度', 'アクション項目', '期待効果', '実行時期', '具体的施策'])

      // 優先度付きアクションプラン
      if (
        performanceAnalysis &&
        performanceAnalysis.performanceDistribution.low > activeMenus * 0.3
      ) {
        csvData.push([
          '緊急',
          'メニュー大幅見直し',
          '売上20%向上',
          '即座',
          '低パフォーマンスメニューの廃止・リニューアル',
        ])
      }

      if (topMenu && topMenu.total_amount >= avgMenuPerformance * 2) {
        csvData.push([
          '重要',
          '成功メニュー横展開',
          '売上15%向上',
          '1ヶ月以内',
          `${topMenu.menu_name}の成功要因分析と他メニューへの適用`,
        ])
      }

      if (
        priceTierAnalysis &&
        priceTierAnalysis.insights.mostProfitableTier !== priceTierAnalysis.insights.mostPopularTier
      ) {
        csvData.push([
          '推奨',
          '価格帯戦略実行',
          '客単価10%向上',
          '2ヶ月以内',
          '人気メニューから高収益メニューへのアップセル施策',
        ])
      }

      if (avgPrice < 3000) {
        csvData.push([
          '継続',
          '価値向上施策',
          '価格競争力強化',
          '3ヶ月以内',
          'メニュー品質向上・付加価値創出',
        ])
      }

      csvData.push([
        '継続',
        'データ分析体制強化',
        '意思決定精度向上',
        '継続',
        'メニュー別KPI設定・定期レビュー',
      ])
      csvData.push([])

      // ============================================
      // 【7】付録：詳細データ
      // ============================================
      csvData.push(['付録：詳細データ'])
      csvData.push(['='.repeat(14)])
      csvData.push([])

      // 全メニューデータ
      csvData.push(['【全メニュー詳細データ】'])
      csvData.push([
        '順位',
        'メニュー名',
        '売上',
        '売上比率',
        '予約数',
        '客単価',
        '改善度',
        '推奨アクション',
      ])

      menuRanking.forEach((menu, index) => {
        const menuDetail = performanceAnalysis?.topPerformers?.find(
          (performer) => performer.menu_name === menu.name
        )
        const bookings = menuDetail?.booking_count || 0
        // 予約数が0の場合、このメニューはランキングに含まれるべきではない（サーバー側でフィルタ済み）
        const avgAmount = bookings > 0 ? Math.round(menu.value / bookings) : 0
        const improvementPotential =
          avgMenuPerformance > 0
            ? Math.round(((avgMenuPerformance - menu.value) / avgMenuPerformance) * 100)
            : 0

        let action = ''
        if (improvementPotential > 50) {
          action = '抜本的見直し'
        } else if (improvementPotential > 20) {
          action = '改善施策実施'
        } else if (improvementPotential > 0) {
          action = '微調整'
        } else {
          action = '現状維持・強化'
        }

        csvData.push([
          `${index + 1}位`,
          menu.name,
          `¥${menu.value.toLocaleString()}`,
          `${menu.percentage.toFixed(1)}%`,
          `${bookings}件`,
          `¥${avgAmount.toLocaleString()}`,
          `${improvementPotential}%`,
          action,
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
      toast.success('メニュー分析レポートをダウンロードしました')
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
    menuSummary,
    menuRanking,
    performanceAnalysis,
    priceTierAnalysis,
    showErrorToast,
    downloadCSVFile,
  ])

  const buttonText = useMemo(() => {
    if (isRefreshing) return '更新中...'
    if (isInterval) return '待機中'
    return '更新'
  }, [isRefreshing, isInterval])

  // ローディング表示
  if (!isLoaded || !tenantId || !orgId) {
    return (
      <DashboardSection
        title="メニュー別売上分析"
        backLink="/dashboard"
        backLinkTitle="ダッシュボード"
      >
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
      <DashboardSection
        title="メニュー別売上分析"
        backLink="/dashboard"
        backLinkTitle="ダッシュボード"
      >
        <div>フィルターを初期化中...</div>
      </DashboardSection>
    )
  }

  // 重要指標のサマリーカード
  const summaryCards = [
    {
      id: 'top-menu',
      title: '売上No.1メニュー',
      value: performanceAnalysis?.topPerformers?.[0]?.total_amount || 0,
      icon: <Award className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      subtitle: `🏆 ${performanceAnalysis?.topPerformers?.[0]?.menu_name || '集計中...'}`,
    },
    {
      id: 'average-menu-amount',
      title: 'メニュー平均売上',
      value: performanceAnalysis?.averagePerformance?.averageAmount || 0,
      icon: <BarChart3 className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      subtitle: `この値を上回れば平均以上`,
    },
    {
      id: 'average-price-tier',
      title: '平均メニュー価格',
      value: priceTierAnalysis?.insights?.averageMenuPrice || 0,
      icon: <DollarSign className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `¥${Number(value).toLocaleString()}`,
      subtitle: `価格設定の基準値`,
    },
    {
      id: 'active-menu-count',
      title: 'アクティブメニュー数',
      value: menuSummary?.activeMenuCount || 0,
      icon: <Package className="w-4 h-4" />,
      valueFormatter: (value: string | number) => `${Number(value)}品目`,
      subtitle: `売上実績のあるメニュー`,
    },
  ]

  // パフォーマンス分布用のパイチャートデータ
  const performanceDistributionData = performanceAnalysis
    ? [
        {
          name: '平均以上',
          value: performanceAnalysis.performanceDistribution.high,
          fill: 'var(--success-foreground)',
          percentage:
            (performanceAnalysis.performanceDistribution.high /
              (performanceAnalysis.performanceDistribution.high +
                performanceAnalysis.performanceDistribution.medium +
                performanceAnalysis.performanceDistribution.low)) *
            100,
        },
        {
          name: '平均の50-100%',
          value: performanceAnalysis.performanceDistribution.medium,
          fill: 'var(--warning-foreground)',
          percentage:
            (performanceAnalysis.performanceDistribution.medium /
              (performanceAnalysis.performanceDistribution.high +
                performanceAnalysis.performanceDistribution.medium +
                performanceAnalysis.performanceDistribution.low)) *
            100,
        },
        {
          name: '平均の50%未満',
          value: performanceAnalysis.performanceDistribution.low,
          fill: 'var(--destructive)',
          percentage:
            (performanceAnalysis.performanceDistribution.low /
              (performanceAnalysis.performanceDistribution.high +
                performanceAnalysis.performanceDistribution.medium +
                performanceAnalysis.performanceDistribution.low)) *
            100,
        },
      ].filter((item) => item.value > 0)
    : []

  // 価格帯別パフォーマンスデータ
  const priceTierChartData =
    priceTierAnalysis?.priceTiers.map((tier, index) => ({
      name: tier.tier,
      revenue: tier.totalAmount,
      bookings: tier.bookingCount,
      menuCount: tier.menuCount,
      fill: CHART_COLORS[index] || 'var(--chart-axis)',
    })) || []

  return (
    <DashboardSection
      title="メニュー別売上分析"
      backLink="/dashboard"
      backLinkTitle="ダッシュボード"
    >
      <div className="admin-analytics relative min-w-0 space-y-6">
        <Dialog open={openCsvDialog} onOpenChange={setOpenCsvDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>メニュー売上データをダウンロード</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              指定期間内のメニュー売上データをCSVでダウンロードします。
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
        <div className="admin-toolbar justify-end">
          <div className="flex flex-wrap items-end gap-3">
            <Button
              onClick={() => setOpenCsvDialog(true)}
              variant="outline"
              size="sm"
              disabled={isExporting || loading || !menuSummary}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              {isExporting ? 'エクスポート中...' : '売上データをダウンロード'}
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
        </div>

        {/* フィルター */}
        <div className="relative">
          <AnalyticsFilters
            filters={filters}
            onFiltersChange={setFilters}
            loading={loading}
            showStaffFilter={false}
            showMenuFilter={true}
            type="monthly"
          />
        </div>

        {/* サマリーカード */}
        <SummaryCardGrid
          cards={summaryCards.map((card, index) => ({
            ...card,
            id: `summary-card-${index}`,
          }))}
          loading={loading}
          columns={1}
        />

        {/* タブ式のダッシュボード */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex h-auto max-w-full flex-wrap gap-1 p-1.5">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="pricing">価格帯分析</TabsTrigger>
            <TabsTrigger value="performance">パフォーマンス</TabsTrigger>
          </TabsList>

          {/* 概要タブ */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* メニュー売上ランキング */}
              <BarChart
                data={menuRanking.slice(0, 10).map((item) => ({
                  name: item.name,
                  value: item.value,
                  label: `¥${item.value.toLocaleString()}`,
                }))}
                title="メニュー売上ランキング（Top 10）"
                description="期間内の売上額でソートされたメニューランキング"
                height={400}
                horizontal={true}
                maxBars={10}
              />

              {/* 詳細ランキング */}

              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    <BarChart3 className="w-5 h-5" />
                    メニュー売上詳細ランキング
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">全メニューの売上実績一覧</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {menuRanking.length > 0 ? (
                      menuRanking.map((menu, index) => (
                        <div
                          key={`menu-ranking-${menu.id}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted"
                        >
                          <div className="flex items-center gap-3">
                            <Badge
                              variant={index < 3 ? 'default' : 'secondary'}
                              className={`w-8 h-8 flex items-center justify-center rounded-full ${
                                index === 0
                                  ? 'bg-info text-info-foreground'
                                  : index === 1
                                    ? 'bg-success text-success-foreground'
                                    : index === 2
                                      ? 'bg-warning text-warning-foreground'
                                      : ''
                              }`}
                            >
                              {index + 1}
                            </Badge>
                            <div>
                              <p className="font-bold">{menu.name}</p>
                              <p className="text-xs font-semibold text-accent-2">
                                {(() => {
                                  // performanceAnalysisから該当メニューの予約数を取得
                                  const menuDetail = performanceAnalysis?.topPerformers?.find(
                                    (performer) => performer.menu_name === menu.name
                                  )
                                  const bookings = menuDetail?.booking_count || 0
                                  const amount = menuDetail?.total_amount || menu.value

                                  // 予約数が0の場合はこのメニューはランキングに含まれるべきではない
                                  // （サーバー側で既にフィルタリングされているはず）
                                  if (bookings === 0) {
                                    console.warn(
                                      '[Menu Analytics] Menu with 0 bookings found in ranking:',
                                      menu.name
                                    )
                                    return `取引実績なし（データ要確認）`
                                  }

                                  // データ整合性チェック
                                  if (amount <= 0) {
                                    console.warn(
                                      '[Menu Analytics] Menu with invalid amount found:',
                                      menu.name,
                                      amount
                                    )
                                    return `データエラー`
                                  }

                                  // 平均単価を計算
                                  const avgAmount = Math.round(amount / bookings)

                                  // 異常に低い単価の場合は警告
                                  if (avgAmount < 100) {
                                    console.warn(
                                      '[Menu Analytics] Unusually low average amount:',
                                      menu.name,
                                      avgAmount
                                    )
                                  }

                                  return `${bookings}件の予約 | 平均単価 ¥${avgAmount.toLocaleString()}`
                                })()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">¥{menu.value.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">
                              売り上げ全体の<strong>{menu.percentage.toFixed(1)}%</strong>
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="min-h-96 flex items-center justify-center pt-4">
                        <div className="text-center">
                          <p className="text-muted-foreground text-sm">
                            売上実績のあるメニューがありません
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            実際の予約・取引があったメニューのみ表示されます
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          {/* 価格帯分析タブ */}
          <TabsContent value="pricing" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 価格帯別売上チャート */}
              {priceTierChartData.length > 0 && (
                <BarChart
                  data={priceTierChartData.map((tier) => ({
                    name: tier.name,
                    value: tier.revenue,
                    label: `¥${tier.revenue.toLocaleString()}`,
                  }))}
                  title="価格帯別売上実績"
                  description="価格帯ごとの売上パフォーマンス"
                  height={300}
                />
              )}

              {/* 価格戦略インサイト */}
              {priceTierAnalysis && priceTierAnalysis.insights.mostProfitableTier && (
                <Card className="rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      <PieChartIcon className="w-5 h-5" />
                      価格戦略インサイト
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">価格設定の最適化提案</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 bg-success border border-success-foreground rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-6 h-6 text-link-foreground" />{' '}
                          <span className="text-sm font-medium">売上No.1価格帯</span>
                        </div>
                        <div className="text-lg font-bold mb-1">
                          {priceTierAnalysis.insights.mostProfitableTier}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          最も高い売上を上げている価格帯です。この価格帯のメニューを増やすことを検討してください。
                        </p>
                      </div>

                      <div className="p-4 bg-neon-foreground border border-neon rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-neon rounded-full"></div>
                          <span className="text-sm font-medium">人気No.1価格帯</span>
                        </div>
                        <div className="text-lg font-bold mb-1">
                          {priceTierAnalysis.insights.mostPopularTier}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          最も予約数が多い価格帯です。お客様に受け入れられやすい価格設定の参考にしてください。
                        </p>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          <strong>💼 戦略提案:</strong>
                          {priceTierAnalysis.insights.mostProfitableTier !==
                          priceTierAnalysis.insights.mostPopularTier
                            ? ' 人気価格帯のメニューを売上の高い価格帯にアップグレードする施策を検討してみてください。'
                            : ' 売上No.1と人気No.1が一致しており、バランスの良い価格設定です。'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 価格帯詳細テーブル */}
            {priceTierAnalysis && priceTierAnalysis.priceTiers.length > 0 ? (
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">価格帯別詳細データ</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">価格帯</th>
                          <th className="text-right p-2">メニュー数</th>
                          <th className="text-right p-2">総売上</th>
                          <th className="text-right p-2">予約数</th>
                          <th className="text-right p-2">平均売上</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceTierAnalysis.priceTiers.map((tier, index) => (
                          <tr key={index} className={`border-b`}>
                            <td className="p-2">
                              <div>
                                <div
                                  className={`font-medium  ${index === 0 ? 'text-link-foreground' : index === 1 ? 'text-neon' : 'text-warning-foreground'}`}
                                >
                                  {tier.tier}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {tier.priceRange}
                                </div>
                              </div>
                            </td>
                            <td className="text-right p-2">{tier.menuCount}品目</td>
                            <td className="text-right p-2">¥{tier.totalAmount.toLocaleString()}</td>
                            <td className="text-right p-2">{tier.bookingCount}件</td>
                            <td className="text-right p-2">
                              ¥{tier.averageAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="min-h-56 flex items-center justify-center pt-4 bg-background border border-border  rounded-lg">
                <p className="text-center text-muted-foreground text-sm">データがありません</p>
              </div>
            )}
          </TabsContent>

          {/* パフォーマンス分析タブ */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* メニューパフォーマンス統計 */}
              {performanceAnalysis && performanceAnalysis.performanceDistribution.high > 0 ? (
                <Card className="rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">メニューパフォーマンス統計</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      メニュー全体の売上パフォーマンス分析
                    </p>
                  </CardHeader>
                  <CardContent>
                    <TooltipProvider>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                          <p className="text-2xl font-bold text-chart-1">
                            {performanceAnalysis.performanceDistribution.high}
                          </p>
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-sm text-muted-foreground">平均以上のメニュー</p>
                            <Tooltip>
                              <TooltipTrigger>
                                <HelpCircle className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">平均売上を上回る成績のメニュー数</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                          <p className="text-2xl font-bold text-chart-3">
                            ¥{menuSummary?.averageAmount?.toLocaleString() || '0'}
                          </p>
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-sm text-muted-foreground">平均客単価</p>
                            <Tooltip>
                              <TooltipTrigger>
                                <HelpCircle className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">全体の平均客単価（売上÷予約数）</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                          <p className="text-2xl font-bold text-chart-4">
                            {(() => {
                              const avgAmount =
                                performanceAnalysis?.averagePerformance?.averageAmount || 1
                              const topMenu =
                                performanceAnalysis?.topPerformers?.[0]?.total_amount || 0
                              const differencePercent = (
                                ((topMenu - avgAmount) / avgAmount) *
                                100
                              ).toFixed(1)
                              return `+${differencePercent}%`
                            })()}
                          </p>
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-sm text-muted-foreground">売上格差指標</p>
                            <Tooltip>
                              <TooltipTrigger>
                                <HelpCircle className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">トップメニューが平均より高い売上の割合</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        <div className="text-center p-4 bg-muted/30 rounded-lg">
                          <p className="text-2xl font-bold text-chart-5">
                            {performanceAnalysis?.averagePerformance?.averageBookings?.toFixed(1) ||
                              '0'}
                            件
                          </p>
                          <div className="flex items-center justify-center gap-1">
                            <p className="text-sm text-muted-foreground">メニュー平均予約数</p>
                            <Tooltip>
                              <TooltipTrigger>
                                <HelpCircle className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">
                                  メニュー一品あたりの平均予約数（人気度の目安）
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </TooltipProvider>
                  </CardContent>
                </Card>
              ) : (
                <div className="min-h-96 flex items-center justify-center pt-4 bg-background border border-border  rounded-lg">
                  <p className="text-center text-muted-foreground text-sm">データがありません</p>
                </div>
              )}

              {/* パフォーマンス分布 */}
              {performanceDistributionData.length > 0 && (
                <PieChart
                  data={performanceDistributionData}
                  title="メニューパフォーマンス分布"
                  description="平均売上を基準とした分布"
                  height={400}
                  innerRadius={60}
                  showLabels={true}
                  showPercentage={true}
                  valueFormatter={(value) => `${value}品目`}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardSection>
  )
}

export default withOwnerAccess(MenuAnalyticsPage)
