'use client'

import React, { useMemo } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_COLORS, CHART_GRID_COLOR } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

export interface ChartDataPoint {
  date?: string
  name: string
  value: number
  label?: string
  category?: string
  percentage?: number
  change?: number
  previous?: number
}

export interface SalesChartProps {
  data: ChartDataPoint[]
  title: string
  type: 'area' | 'bar' | 'line' | 'pie'
  className?: string
  loading?: boolean
  height?: number
  showComparison?: boolean
  comparisonData?: ChartDataPoint[]
  valueFormatter?: (value: number) => string
  dateFormatter?: (date: string) => string
  showTrend?: boolean
  gridLines?: boolean
  showLegend?: boolean
  color?: string
  fillOpacity?: number
}

/**
 * 値を通貨形式でフォーマット
 */
const defaultValueFormatter = (value: number): string => {
  return `¥${value.toLocaleString()}`
}

/**
 * 日付をフォーマット
 */
const defaultDateFormatter = (date: string): string => {
  try {
    return format(parseISO(date), 'M/d', { locale: ja })
  } catch {
    return date
  }
}

/**
 * カスタムツールチップコンポーネント
 */
interface CustomTooltipProps {
  active?: boolean
  payload?: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  label?: string
  valueFormatter?: (value: number) => string
  dateFormatter?: (date: string) => string
}

function CustomTooltip({
  active,
  payload,
  label,
  valueFormatter = defaultValueFormatter,
  dateFormatter = defaultDateFormatter,
}: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-foreground mb-2">
          {label ? dateFormatter(label) : ''}
        </p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.dataKey}:</span>
            <span className="font-medium text-foreground">{valueFormatter(entry.value)}</span>
            {entry.payload?.change && (
              <Badge
                variant={entry.payload.change > 0 ? 'default' : 'destructive'}
                className="text-xs ml-1"
              >
                {entry.payload.change > 0 ? '+' : ''}
                {entry.payload.change.toFixed(1)}%
              </Badge>
            )}
          </div>
        ))}
      </div>
    )
  }
  return null
}

/**
 * 売上チャートコンポーネント
 * 期間絞り込みに対応したレスポンシブチャート
 */
export function SalesChart({
  data,
  title,
  type,
  className = '',
  loading = false,
  height = 300,
  showComparison = false,
  comparisonData = [],
  valueFormatter = defaultValueFormatter,
  dateFormatter = defaultDateFormatter,
  showTrend = false,
  gridLines = true,
  showLegend = false,
  color = CHART_COLORS[0],
  fillOpacity = 0.6,
}: SalesChartProps) {
  // データの前処理
  const processedData = useMemo(() => {
    if (!showComparison || !comparisonData.length) {
      return data
    }

    // 比較データとマージ
    return data.map((item, index) => {
      const comparisonItem = comparisonData[index]
      return {
        ...item,
        previous: comparisonItem?.value || 0,
        change: comparisonItem?.value
          ? ((item.value - comparisonItem.value) / comparisonItem.value) * 100
          : 0,
      }
    })
  }, [data, comparisonData, showComparison])

  // トレンド計算
  const trendData = useMemo(() => {
    if (!showTrend || processedData.length < 2) return null

    const firstValue = processedData[0]?.value || 0
    const lastValue = processedData[processedData.length - 1]?.value || 0
    const change = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0

    return {
      change,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    }
  }, [processedData, showTrend])

  if (loading) {
    return (
      <Card className={cn('admin-panel w-full min-w-0 shadow-sm', className)}>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className={`w-full h-[${height}px]`} />
        </CardContent>
      </Card>
    )
  }

  const renderChart = () => {
    const commonProps = {
      data: processedData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    }

    switch (type) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            {gridLines && <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />}
            <XAxis
              dataKey="date"
              tickFormatter={dateFormatter}
              className="text-xs text-muted-foreground"
            />
            <YAxis
              tickFormatter={(value) => valueFormatter(value).replace('¥', '')}
              className="text-xs text-muted-foreground"
            />
            <Tooltip
              content={
                <CustomTooltip valueFormatter={valueFormatter} dateFormatter={dateFormatter} />
              }
            />
            {showComparison && (
              <Area
                type="monotone"
                dataKey="previous"
                stackId="1"
                stroke={CHART_COLORS[1]}
                fill={CHART_COLORS[1]}
                fillOpacity={0.3}
                name="前期間"
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stackId="1"
              stroke={color}
              fill={color}
              fillOpacity={fillOpacity}
              name="売上"
            />
            {showLegend && <Legend />}
          </AreaChart>
        )

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {gridLines && <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />}
            <XAxis dataKey="name" className="text-xs text-muted-foreground" />
            <YAxis
              tickFormatter={(value) => valueFormatter(value).replace('¥', '')}
              className="text-xs text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />
            {showComparison && <Bar dataKey="previous" fill={CHART_COLORS[1]} name="前期間" />}
            <Bar dataKey="value" fill={color} name="売上" />
            {showLegend && <Legend />}
          </BarChart>
        )

      case 'line':
        return (
          <LineChart {...commonProps}>
            {gridLines && <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />}
            <XAxis
              dataKey="date"
              tickFormatter={dateFormatter}
              className="text-xs text-muted-foreground"
            />
            <YAxis
              tickFormatter={(value) => valueFormatter(value).replace('¥', '')}
              className="text-xs text-muted-foreground"
            />
            <Tooltip
              content={
                <CustomTooltip valueFormatter={valueFormatter} dateFormatter={dateFormatter} />
              }
            />
            {showComparison && (
              <Line
                type="monotone"
                dataKey="previous"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 4 }}
                name="前期間"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4 }}
              name="売上"
            />
            {showLegend && <Legend />}
          </LineChart>
        )

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={processedData}
              cx="50%"
              cy="50%"
              outerRadius={Math.min(height * 0.35, 120)}
              fill={color}
              dataKey="value"
              label={({ name, percentage }) => `${name} ${percentage}%`}
            >
              {processedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />
            {showLegend && <Legend />}
          </PieChart>
        )

      default:
        return null
    }
  }

  return (
    <Card className={cn('admin-panel w-full min-w-0 shadow-sm', className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {trendData && (
            <Badge
              variant={
                trendData.direction === 'up'
                  ? 'default'
                  : trendData.direction === 'down'
                    ? 'destructive'
                    : 'secondary'
              }
              className="text-xs"
            >
              {trendData.change > 0 ? '+' : ''}
              {trendData.change.toFixed(1)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {renderChart() as React.ReactElement}
        </ResponsiveContainer>

        {/* データサマリー */}
        {processedData.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">合計:</span>
                <span className="ml-2 font-medium">
                  {valueFormatter(processedData.reduce((sum, item) => sum + item.value, 0))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">平均:</span>
                <span className="ml-2 font-medium">
                  {valueFormatter(
                    Math.round(
                      processedData.reduce((sum, item) => sum + item.value, 0) /
                        processedData.length
                    )
                  )}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">最大:</span>
                <span className="ml-2 font-medium">
                  {valueFormatter(Math.max(...processedData.map((item) => item.value)))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">最小:</span>
                <span className="ml-2 font-medium">
                  {valueFormatter(Math.min(...processedData.map((item) => item.value)))}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * チャートグリッドコンポーネント
 * 複数のチャートをグリッド表示
 */
export interface ChartGridProps {
  charts: Array<SalesChartProps & { id: string }>
  loading?: boolean
  className?: string
  columns?: 1 | 2
}

export function ChartGrid({
  charts,
  loading = false,
  className = '',
  columns = 2,
}: ChartGridProps) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
  }

  return (
    <div className={cn('grid gap-6', gridCols[columns], className)}>
      {charts.map((chart) => (
        <SalesChart key={chart.id} {...chart} loading={loading} />
      ))}
    </div>
  )
}

export default SalesChart
