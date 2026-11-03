'use client'

import React from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CHART_AXIS_COLOR, CHART_COLORS, CHART_GRID_COLOR } from '@/lib/chart-colors'
import { BarChartDataPoint } from '@/services/supabase/repositories/analytics/types'

interface BarChartProps {
  data: BarChartDataPoint[]
  title?: string
  description?: string
  height?: number
  showLegend?: boolean
  showGrid?: boolean
  barColors?: string[]
  className?: string
  valueFormatter?: (value: number) => string
  labelFormatter?: (label: string) => string
  horizontal?: boolean
  maxBars?: number
}

/**
 * カスタムツールチップコンポーネント
 */
const CustomTooltip = ({
  active,
  payload,
  label = '',
  valueFormatter = (value: number) => `¥${value.toLocaleString()}`,
  labelFormatter = (label: string) => label,
}: {
  active?: boolean
  payload?: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  label?: string | number
  valueFormatter: (value: number) => string
  labelFormatter: (label: string) => string
}) => {
  if (!active || !payload || !payload.length) return null

  const data = payload[0]?.payload

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 max-w-xs">
      <p className="text-sm font-medium text-foreground mb-2 break-words">
        {labelFormatter ? labelFormatter(label as string) : label}
      </p>
      <div className="space-y-1">
        <p className="text-sm" style={{ color: payload[0]?.color }}>
          <span className="font-medium">
            {valueFormatter?.toString().includes('¥') ? '売上: ' : 'イベント数: '}
          </span>
          {valueFormatter
            ? valueFormatter(payload[0]?.value)
            : `¥${payload[0]?.value.toLocaleString()}`}
        </p>
        {data?.bookingCount !== undefined && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">
              {valueFormatter?.toString().includes('¥') ? '予約数: ' : 'コンバージョン: '}
            </span>
            {data.bookingCount}
            {valueFormatter?.toString().includes('¥') ? '件' : '件'}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * 棒グラフコンポーネント
 * カテゴリ別データの比較表示に使用
 */
export function BarChart({
  data,
  title,
  description,
  height = 300,
  showLegend = false,
  showGrid = true,
  barColors,
  className = '',
  valueFormatter,
  labelFormatter,
  horizontal = false,
  maxBars = 10,
}: BarChartProps) {
  const colors = barColors || CHART_COLORS

  // データを制限（必要に応じて）
  const limitedData = maxBars ? data.slice(0, maxBars) : data

  // データが空の場合の表示
  if (!limitedData || limitedData.length === 0) {
    return (
      <Card className={`${className ?? ''} admin-panel min-w-0 shadow-sm`}>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
            {description && (
              <CardDescription className="text-sm text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </CardHeader>
        )}
        <CardContent>
          <div
            className="admin-empty-state rounded-xl bg-muted text-muted-foreground"
            style={{ height: `${height}px` }}
          >
            <p className="text-sm">データがありません</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 横向きの場合のマージン調整
  const margin = horizontal
    ? { top: 10, right: 0, left: 0, bottom: 10 }
    : { top: 0, right: 0, left: 0, bottom: 10 }

  return (
    <Card className={`${className ?? ''} admin-panel min-w-0 shadow-sm`}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
          {description && (
            <CardDescription className="text-sm text-muted-foreground">
              {description}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent>
        <div style={{ width: '100%', height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart
              data={limitedData}
              layout={horizontal ? 'vertical' : undefined}
              margin={margin}
            >
              {showGrid && (
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.7} />
              )}

              {horizontal ? (
                <>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: CHART_AXIS_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(value) => `¥${value.toFixed(0)}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    width={120}
                    tickFormatter={(value: string) => {
                      // 長いメニュー名を省略
                      if (value.length > 9) {
                        return value.substring(0, 9) + '...'
                      }
                      return value
                    }}
                  />
                </>
              ) : (
                <>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: CHART_AXIS_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    angle={limitedData.length > 5 ? -45 : 0}
                    textAnchor={limitedData.length > 5 ? 'end' : 'middle'}
                    height={limitedData.length > 5 ? 100 : 60}
                    interval={0}
                    tickFormatter={(value: string) => {
                      // 長いメニュー名を省略（縦向きの場合はより短く）
                      if (value.length > 8) {
                        return value.substring(0, 8) + '...'
                      }
                      return value
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: CHART_AXIS_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(value) => `¥${value.toFixed(0)}`}
                  />
                </>
              )}

              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    {...props}
                    valueFormatter={
                      valueFormatter || ((value: number) => `¥${value.toLocaleString()}`)
                    }
                    labelFormatter={labelFormatter || ((label: string) => label)}
                  />
                )}
              />

              {showLegend && (
                <Legend
                  wrapperStyle={{
                    fontSize: '12px',
                    color: 'var(--foreground)',
                  }}
                />
              )}

              <Bar
                dataKey="value"
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={horizontal ? 40 : 80}
              >
                {limitedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || colors[index % colors.length]} />
                ))}
              </Bar>
            </RechartsBarChart>
          </ResponsiveContainer>
        </div>

        {/* データが制限されている場合の注記 */}
        {data.length > maxBars && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            上位{maxBars}件を表示（全{data.length}件）
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default BarChart
