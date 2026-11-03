'use client'

import React from 'react'
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CHART_AXIS_COLOR,
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_SURFACE_COLOR,
} from '@/lib/chart-colors'
import { ChartDataPoint } from '@/services/supabase/repositories/analytics/types'

interface LineChartProps {
  data: ChartDataPoint[]
  title?: string
  description?: string
  height?: number
  showLegend?: boolean
  showGrid?: boolean
  lineColor?: string
  className?: string
  valueFormatter?: (value: number) => string
  labelFormatter?: (label: string) => string
}

interface TooltipPayload {
  color: string
  value: number
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
  payload?: TooltipPayload[]
  label?: string | number
  valueFormatter: (value: number) => string
  labelFormatter: (label: string) => string
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-foreground mb-1">
          {labelFormatter(label as string)}
        </p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            <span className="font-medium">売上: </span>
            {valueFormatter(entry.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

/**
 * 線グラフコンポーネント
 * 時系列データやトレンド表示に使用
 */
export function LineChart({
  data,
  title,
  description,
  height = 300,
  showLegend = false,
  showGrid = true,
  lineColor,
  className = '',
  valueFormatter,
  labelFormatter,
}: LineChartProps) {
  const defaultLineColor = lineColor || CHART_COLORS[0]

  // データが空の場合の表示
  if (!data || data.length === 0) {
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
            <RechartsLineChart
              data={data}
              margin={{
                top: 10,
                right: 5,
                left: 5,
                bottom: 10,
              }}
            >
              {showGrid && (
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} opacity={0.7} />
              )}
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }}
                axisLine={{ stroke: CHART_GRID_COLOR }}
                tickLine={{ stroke: CHART_GRID_COLOR }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: CHART_AXIS_COLOR }}
                axisLine={{ stroke: CHART_GRID_COLOR }}
                tickLine={{ stroke: CHART_GRID_COLOR }}
                tickFormatter={(value) => `¥${value.toFixed(0)}`}
              />
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
                    fontSize: '10px',
                    color: 'var(--foreground)',
                  }}
                />
              )}
              <Line
                type="linear"
                dataKey="value"
                stroke={defaultLineColor}
                strokeWidth={1}
                dot={{
                  fill: defaultLineColor,
                  stroke: defaultLineColor,
                  strokeWidth: 1,
                  r: 2,
                }}
                activeDot={{
                  r: 4,
                  stroke: defaultLineColor,
                  strokeWidth: 1,
                  fill: CHART_SURFACE_COLOR,
                }}
                connectNulls={false}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default LineChart
