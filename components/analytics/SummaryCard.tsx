'use client'

import React, { useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface SummaryCardProps {
  title: string
  value: string | number
  subtitle?: string
  change?: {
    value: number
    label?: string
    period?: string
  }
  icon?: React.ReactNode
  loading?: boolean
  className?: string
  valueFormatter?: (value: number | string) => string
  trend?: 'up' | 'down' | 'neutral'
  variant?: 'default' | 'compact' | 'single-staff' | 'multi-staff'
  showComparison?: boolean
  details?: Array<{
    label: string
    value: string
    trend?: 'up' | 'down' | 'neutral'
  }>
  chart?: {
    type?: 'progress' | 'distribution' | 'comparison'
    value?: number
    current?: number
    previous?: number
    trend?: 'up' | 'down'
    percentage?: number
    average?: number
    median?: number
    benchmark?: number
    goal?: number
  }
  // 新機能
  expandable?: boolean
  staffInfo?: {
    name: string
    rank?: number
    totalStaff?: number
    isTopPerformer?: boolean
  }
  insights?: Array<{
    type: 'positive' | 'negative' | 'neutral'
    message: string
    icon?: React.ReactNode
  }>
  actionable?: {
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }
}

/**
 * トレンドアイコンを取得
 */
function getTrendIcon(trend: 'up' | 'down' | 'neutral', changeValue?: number) {
  if (trend === 'neutral' || changeValue === 0) {
    return <Minus className="w-3 h-3" />
  }

  if (trend === 'up' || (changeValue && changeValue > 0)) {
    return <TrendingUp className="w-3 h-3" />
  }

  return <TrendingDown className="w-3 h-3" />
}

/**
 * トレンドカラーを取得
 */
function getTrendColor(trend: 'up' | 'down' | 'neutral', changeValue?: number) {
  if (trend === 'neutral' || changeValue === 0) {
    return 'text-muted-foreground'
  }

  if (trend === 'up' || (changeValue && changeValue > 0)) {
    return 'text-success-foreground'
  }

  return 'text-destructive'
}

/**
 * 変化率を表示用にフォーマット
 */
function formatChangeValue(value: number): string {
  const absValue = Math.abs(value)
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${absValue.toFixed(1)}%`
}

/**
 * サマリーカードコンポーネント
 * 分析ダッシュボードの主要指標表示に使用
 */
export function SummaryCard({
  title,
  value,
  subtitle,
  change,
  icon,
  loading = false,
  className = '',
  valueFormatter,
  trend,
  variant = 'default',
  showComparison = true,
  details,
  chart,
  expandable = false,
  staffInfo,
  insights,
  actionable,
}: SummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  // トレンドを自動判定（changeがある場合）
  const determinedTrend =
    trend ||
    (change?.value ? (change.value > 0 ? 'up' : change.value < 0 ? 'down' : 'neutral') : 'neutral')

  // 値をフォーマット
  const formattedValue = valueFormatter
    ? valueFormatter(value)
    : typeof value === 'number'
      ? value.toLocaleString()
      : value

  if (loading) {
    return (
      <Card className={cn('admin-panel h-full shadow-sm', className)}>
        <CardHeader
          className={cn(
            'flex flex-row items-center justify-between space-y-0 pb-3 px-4 sm:px-6',
            variant === 'compact' ? 'pb-2' : 'pb-3'
          )}
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 sm:w-24" />
            <Skeleton className="h-2 w-16 sm:w-20" />
          </div>
          {icon && <Skeleton className="h-5 w-5 rounded-full" />}
        </CardHeader>
        <CardContent className={cn('px-4 sm:px-6', variant === 'compact' ? 'pt-0' : '')}>
          <div className="space-y-3">
            <Skeleton className="h-8 sm:h-10 w-32 sm:w-40" />
            {showComparison && (
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // バリアント固有のスタイリング
  const isSingleStaff = variant === 'single-staff'
  const isMultiStaff = variant === 'multi-staff'
  const isCompact = variant === 'compact'

  return (
    <Card
      className={cn(
        'group relative w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        'text-card-foreground',
        isSingleStaff && 'border-l-primary',
        isMultiStaff && 'border-l-success-foreground',
        expandable && '',
        className
      )}
    >
      {/* Subtle animated background effect */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border"
      />

      <CardHeader
        className={cn(
          'relative flex flex-row items-center justify-between space-y-0 px-4 sm:px-6 py-4 sm:py-5',
          isCompact ? 'pb-2 py-3' : 'pb-3'
        )}
        onClick={expandable ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
              isSingleStaff && 'bg-primary/10 text-primary group-hover:bg-primary/20',
              isMultiStaff && 'bg-success text-success-foreground group-hover:bg-success/70',
              !isSingleStaff &&
                !isMultiStaff &&
                'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
            )}
          >
            {icon ||
              (isSingleStaff ? (
                <User className="w-5 h-5" />
              ) : isMultiStaff ? (
                <Users className="w-5 h-5" />
              ) : (
                <BarChart3 className="w-5 h-5" />
              ))}
          </div>

          <div className="min-w-0 flex-1">
            <CardTitle
              className={cn(
                'break-words font-medium leading-relaxed text-foreground',
                isCompact ? 'text-sm' : 'text-base',
                isSingleStaff
                  ? 'text-primary'
                  : isMultiStaff
                    ? 'text-success-foreground'
                    : 'text-foreground group-hover:text-primary'
              )}
            >
              {title}
            </CardTitle>
            {subtitle && (
              <p
                className={cn(
                  'mt-1 break-words text-xs leading-relaxed text-muted-foreground',
                  isSingleStaff && 'text-primary/60',
                  isMultiStaff && 'text-success-foreground/70'
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {expandable && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={isExpanded ? '詳細を折りたたむ' : '詳細を表示'}
              aria-expanded={isExpanded}
              className={cn(
                'h-8 w-8 p-0 rounded-full transition-all duration-200 hover:bg-primary/10',
                isSingleStaff && 'hover:bg-primary/20 text-primary',
                isMultiStaff && 'hover:bg-success text-success-foreground'
              )}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent
        className={cn('relative px-4 sm:px-6 pb-4 sm:pb-6', isCompact ? 'pt-0' : 'pt-2')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 mb-2">
              <div
                className={cn(
                  'break-words font-semibold tracking-tight tabular-nums',
                  isCompact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl',
                  isSingleStaff && 'text-primary',
                  isMultiStaff && 'text-success-foreground',
                  !isSingleStaff && !isMultiStaff && 'text-foreground'
                )}
              >
                {formattedValue}
              </div>

              {/* 成長トレンドアイコン */}
              {change && (
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200',
                    change.value > 0
                      ? 'bg-success text-success-foreground'
                      : change.value < 0
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {change.value > 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : change.value < 0 ? (
                    <ArrowDownRight className="w-3 h-3" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )}
                </div>
              )}
            </div>

            {staffInfo?.name && (
              <p
                className={cn(
                  'text-sm font-semibold mb-1 truncate',
                  isSingleStaff
                    ? 'text-primary'
                    : isMultiStaff
                      ? 'text-success-foreground'
                      : 'text-foreground'
                )}
              >
                {staffInfo.name}
              </p>
            )}
          </div>

          {staffInfo && (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {staffInfo.rank && staffInfo.totalStaff && (
                <Badge
                  variant={staffInfo.isTopPerformer ? 'default' : 'secondary'}
                  className={cn(
                    'text-xs font-semibold px-2 py-1 transition-all duration-200',
                    staffInfo.isTopPerformer &&
                      'border-0 bg-accent-2 text-accent-2-foreground shadow-sm'
                  )}
                >
                  <div className="flex items-center gap-1">
                    {staffInfo.isTopPerformer && <Zap className="w-3 h-3" />}
                    {staffInfo.rank}/{staffInfo.totalStaff}位
                  </div>
                </Badge>
              )}
              {staffInfo.isTopPerformer && (
                <span className="text-xs text-accent-foreground font-medium">
                  🏆 トップパフォーマー
                </span>
              )}
            </div>
          )}
        </div>

        {showComparison && change && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-muted/50">
            <Badge
              variant="outline"
              className={cn(
                'text-xs font-semibold px-3 py-1.5 border-0 shadow-sm transition-all duration-200',
                change.value > 0
                  ? 'bg-success text-success-foreground'
                  : change.value < 0
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              <span className="flex items-center gap-1.5">
                {getTrendIcon(determinedTrend, change.value)}
                <span className="font-bold">{formatChangeValue(change.value)}</span>
              </span>
            </Badge>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {change.label && <span className="font-medium">{change.label}</span>}
              {change.period && (
                <span className="text-muted-foreground/70">vs {change.period}</span>
              )}
            </div>
          </div>
        )}

        {/* 詳細情報の表示 */}
        {details && details.length > 0 && (
          <div className="mt-4 pt-4 border-t border-muted/50">
            <div className="grid gap-3">
              {details.map((detail, index) => (
                <div key={index} className="flex justify-between items-center group/detail">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-medium text-muted-foreground group-hover/detail:text-foreground transition-colors truncate">
                      {detail.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-semibold text-foreground">{detail.value}</span>
                    {detail.trend && (
                      <div
                        className={cn(
                          'flex items-center justify-center w-5 h-5 rounded-full transition-all duration-200',
                          detail.trend === 'up'
                            ? `bg-success text-success-foreground ${getTrendColor(detail.trend)}`
                            : detail.trend === 'down'
                              ? `bg-destructive/10 text-destructive ${getTrendColor(detail.trend)}`
                              : `bg-muted text-muted-foreground ${getTrendColor(detail.trend)}`
                        )}
                      >
                        {getTrendIcon(detail.trend)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* インサイト表示 */}
        {insights && insights.length > 0 && (isExpanded || !expandable) && (
          <div className="mt-3 space-y-2 pt-3 border-t">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">📊 分析結果</h4>
            {insights.map((insight, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-md text-xs',
                  insight.type === 'positive' && 'bg-success text-success-foreground',
                  insight.type === 'negative' && 'bg-destructive/10 text-destructive',
                  insight.type === 'neutral' && 'bg-info text-info-foreground'
                )}
              >
                {insight.icon || (
                  <Target
                    className={cn(
                      'w-3 h-3 mt-0.5 flex-shrink-0',
                      insight.type === 'positive' && 'text-success-foreground',
                      insight.type === 'negative' && 'text-destructive',
                      insight.type === 'neutral' && 'text-info-foreground'
                    )}
                  />
                )}
                <span>{insight.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* アクション提案 */}
        {actionable && (isExpanded || !expandable) && (
          <div className="mt-3 pt-3 border-t">
            <div
              className={cn(
                'p-3 rounded-lg border-l-4',
                actionable.priority === 'high' && 'bg-destructive/10 border-l-destructive',
                actionable.priority === 'medium' && 'bg-warning border-l-warning-foreground',
                actionable.priority === 'low' && 'bg-info border-l-info-foreground'
              )}
            >
              <div className="flex items-start gap-2">
                <Target
                  className={cn(
                    'w-4 h-4 mt-0.5 flex-shrink-0',
                    actionable.priority === 'high' && 'text-destructive',
                    actionable.priority === 'medium' && 'text-warning-foreground',
                    actionable.priority === 'low' && 'text-info-foreground'
                  )}
                />
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">改善提案</p>
                  <p className="text-xs text-muted-foreground">{actionable.suggestion}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* チャートの表示 */}
        {chart && (
          <div className="mt-3 pt-3 border-t">
            {chart.type === 'progress' && (
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neon transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, chart.value || 0))}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  {Math.round(chart.value || 0)}%
                </p>
              </div>
            )}
            {chart.type === 'comparison' && chart.current && chart.benchmark && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">現在値</span>
                    <span className="font-medium">{chart.current.toLocaleString()}</span>
                  </div>
                  <Progress value={(chart.current / chart.benchmark) * 100} className="h-2" />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">目標値</span>
                  <span className="font-medium">{chart.benchmark.toLocaleString()}</span>
                </div>
                {chart.goal && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">ゴール</span>
                    <span className="font-medium text-primary">{chart.goal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
            {chart.type === 'distribution' && chart.current && chart.average && (
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full w-0.5 bg-success"
                    style={{ left: `${Math.min(100, (chart.current / chart.average) * 50)}%` }}
                  />
                  {chart.median && (
                    <div
                      className="absolute h-full w-0.5 bg-primary"
                      style={{ left: `${Math.min(100, (chart.median / chart.average) * 50)}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span>平均値</span>
                  <span>{Math.round(chart.average).toLocaleString()}</span>
                </div>
              </div>
            )}
            {!chart.type && chart.current && chart.previous && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-muted-foreground">
                  前期間: ¥{chart.previous.toLocaleString()}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs border-0 px-2 py-0.5 font-medium',
                    chart.trend === 'up' ? 'text-success-foreground' : 'text-destructive'
                  )}
                >
                  {chart.trend === 'up' ? '+' : '-'}
                  {chart.percentage?.toFixed(1)}%
                </Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * サマリーカードグリッドコンポーネント
 * 複数のSummaryCardをグリッド表示
 */
interface SummaryCardGridProps {
  cards: (Omit<SummaryCardProps, 'className'> & { id: string })[]
  loading?: boolean
  className?: string
  columns?: 1 | 2 | 3 | 4
  staffSelectionMode?: 'single' | 'multiple' | 'auto'
}

export function SummaryCardGrid({
  cards,
  loading = false,
  className = '',
  columns = 4,
  staffSelectionMode = 'auto',
}: SummaryCardGridProps) {
  const gridCols = {
    1: 'w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
    2: 'grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4',
  }

  return (
    <div className={cn('grid', gridCols[columns], className)}>
      {cards.map((card) => {
        // スタッフ選択モードに基づいてvariantを決定
        let variant = card.variant || 'compact'
        if (staffSelectionMode === 'single') {
          variant = 'single-staff'
        } else if (staffSelectionMode === 'multiple') {
          variant = 'multi-staff'
        }

        return (
          <div key={card.id} className={cn(columns === 1 && 'min-w-0')}>
            <SummaryCard
              {...card}
              loading={loading}
              variant={variant}
              expandable={staffSelectionMode === 'single' ? true : card.expandable}
              className="h-full"
            />
          </div>
        )
      })}
    </div>
  )
}

export default SummaryCard
