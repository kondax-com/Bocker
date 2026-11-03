'use client'

import React from 'react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  PieLabelRenderProps,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CHART_AXIS_COLOR,
  CHART_COLORS,
  CHART_LABEL_COLOR,
  CHART_SURFACE_COLOR,
} from '@/lib/chart-colors'
import { PieChartDataPoint } from '@/services/supabase/repositories/analytics/types'

interface PieChartProps {
  data: PieChartDataPoint[]
  title?: string
  description?: string
  height?: number
  showLegend?: boolean
  showLabels?: boolean
  colors?: string[]
  className?: string
  valueFormatter?: (value: number) => string
  innerRadius?: number
  outerRadius?: number
  showPercentage?: boolean
}

interface TooltipPayload {
  payload: PieChartDataPoint & {
    percentage: number
  }
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayload[]
  valueFormatter?: (value: number) => string
}

// CustomLabelPropsをPieLabelRenderPropsを継承するように修正
interface CustomLabelProps extends PieLabelRenderProps {
  showPercentage?: boolean
}

/**
 * カスタムツールチップコンポーネント
 */
const CustomTooltip = ({ active, payload, valueFormatter }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-foreground mb-1">{data.name}</p>
        <p className="text-sm" style={{ color: payload[0].color }}>
          <span className="font-medium">売上: </span>
          {valueFormatter ? valueFormatter(data.value) : `¥${data.value.toLocaleString()}`}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">割合: </span>
          {data.percentage.toFixed(1)}%
        </p>
      </div>
    )
  }
  return null
}

/**
 * カスタムラベルコンポーネント
 */
const CustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  name,
  percent,
  showPercentage,
}: CustomLabelProps) => {
  // 必要なプロパティが欠けている場合は表示しない
  if (
    typeof cx !== 'number' ||
    typeof cy !== 'number' ||
    typeof midAngle !== 'number' ||
    typeof innerRadius !== 'number' ||
    typeof outerRadius !== 'number' ||
    typeof percent !== 'number'
  ) {
    return null
  }

  // 小さすぎる場合はラベルを表示しない
  if (percent < 0.05) return null

  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill={CHART_LABEL_COLOR}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      fontWeight="medium"
    >
      {showPercentage ? `${(percent * 100).toFixed(0)}%` : name}
    </text>
  )
}

/**
 * 円グラフコンポーネント
 * 割合や構成比の表示に使用
 */
export function PieChart({
  data,
  title,
  description,
  height = 300,
  showLegend = true,
  showLabels = true,
  colors,
  className = '',
  valueFormatter,
  innerRadius = 0,
  outerRadius,
  showPercentage = true,
}: PieChartProps) {
  const pieColors = colors || CHART_COLORS

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

  // 自動的に外半径を計算
  const autoOuterRadius = outerRadius || Math.min(height * 0.35, 120)

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
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={
                  showLabels
                    ? (props) => <CustomLabel {...props} showPercentage={showPercentage} />
                    : false
                }
                outerRadius={autoOuterRadius}
                innerRadius={innerRadius}
                fill={CHART_COLORS[0]}
                dataKey="value"
                stroke={CHART_SURFACE_COLOR}
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill || pieColors[index % pieColors.length]}
                  />
                ))}
              </Pie>

              <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />

              {showLegend && (
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{
                    fontSize: '12px',
                    color: CHART_AXIS_COLOR,
                    paddingTop: '10px',
                  }}
                  formatter={(value, entry) => {
                    const dataPoint = entry.payload as PieChartDataPoint & { percentage: number }
                    if (!dataPoint?.percentage) return value
                    return (
                      <span style={{ color: entry.color }}>
                        {value} ({dataPoint.percentage.toFixed(1)}%)
                      </span>
                    )
                  }}
                />
              )}
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>

        {/* 合計値の表示（ドーナツグラフの場合） */}
        {innerRadius > 0 && (
          <div className="text-center mt-2">
            <p className="text-sm text-muted-foreground">合計</p>
            <p className="text-lg font-semibold">
              {valueFormatter
                ? valueFormatter(data.reduce((sum, item) => sum + item.value, 0))
                : `¥${data.reduce((sum, item) => sum + item.value, 0).toLocaleString()}`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default PieChart
