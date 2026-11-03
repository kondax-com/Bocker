'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { DateRange } from 'react-day-picker'
import { CalendarIcon, BarChart3, TrendingUp, Users, MousePointer } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BarChart } from '@/components/analytics'
import {
  CHART_AXIS_COLOR,
  CHART_COLORS,
  CHART_GRID_COLOR,
  CHART_SURFACE_COLOR,
  CHART_SURFACE_FOREGROUND_COLOR,
} from '@/lib/chart-colors'
import { cn } from '@/lib/utils'
import { format, subDays } from 'date-fns'
import { ja } from 'date-fns/locale'
import { TrackingURLGenerator } from '@/components/tracking/TrackingURLGenerator'
import { Plus, Settings } from 'lucide-react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { DashboardSection, Loading } from '../common'
import TrackingInsights from './TrackingInsights'

interface TrackingData {
  summary: {
    totalEvents: number
    totalSessions: number
    totalConversions: number
    conversionRate: number
  }
  dailyData: Array<{
    date: string
    events: number
    sessions: number
    conversions: number
  }>
  dimensionData: Array<{
    value: string
    events: number
    sessions: number
    conversions: number
  }>
}

const dimensionTypes = [
  { value: 'utm_source', label: '流入元 (UTM Source)' },
  { value: 'utm_medium', label: 'メディア (UTM Medium)' },
  { value: 'utm_campaign', label: 'キャンペーン (UTM Campaign)' },
]

interface TrackingDashboardProps {
  orgId: string
  initialData?: TrackingData
  initialDimensionType?: string
  initialDateRange?: DateRange
}

export default function TrackingDashboard({
  initialData,
  initialDimensionType = 'utm_source',
  initialDateRange = { from: subDays(new Date(), 30), to: new Date() },
}: TrackingDashboardProps) {
  const [data, setData] = useState<TrackingData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [dimensionType, setDimensionType] = useState(initialDimensionType)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(initialDateRange)
  const [showURLGenerator, setShowURLGenerator] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        dimensionType,
        startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : '',
        endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : '',
      })

      const response = await fetch(`/api/tracking/summaries?${params}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      } else {
        console.error('Failed to fetch tracking data')
      }
    } catch (error) {
      console.error('Error fetching tracking data:', error)
    } finally {
      setLoading(false)
    }
  }, [dimensionType, dateRange])

  useEffect(() => {
    if (!initialData) {
      fetchData()
    }
  }, [fetchData, initialData])

  if (loading) {
    return <Loading />
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">データを取得できませんでした</p>
        <Button onClick={fetchData} className="mt-4">
          再試行
        </Button>
      </div>
    )
  }

  return (
    <DashboardSection title="集客効果分析" backLink="/dashboard" backLinkTitle="ダッシュボード">
      <div className="admin-analytics min-w-0 space-y-6">
        {/* URL生成ツールの表示切替 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mt-1">
              お客様がどこからサロンを見つけて予約に至ったかを分析します
            </p>
          </div>
          <Button
            onClick={() => setShowURLGenerator(!showURLGenerator)}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            {showURLGenerator ? 'URL生成ツールを閉じる' : 'URL生成ツール'}
          </Button>
        </div>

        {/* URL生成ツール */}
        {showURLGenerator && (
          <div className="admin-panel p-5 sm:p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Plus className="h-5 w-5" />
                トラッキングURL生成
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                UTMパラメータ付きURLを生成して、Instagram投稿や広告の効果を測定しましょう
              </p>
            </div>
            <TrackingURLGenerator
              defaultBaseUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/reservation`}
              onURLGenerated={(url, config) => {
                console.log('Generated URL:', url)
                console.log('Config:', config)
              }}
            />
          </div>
        )}

        {/* ヘッダー・フィルター */}
        <div className="admin-panel admin-toolbar justify-end p-4 sm:p-5">
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Select value={dimensionType} onValueChange={setDimensionType}>
              <SelectTrigger className="min-h-11 w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dimensionTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'min-h-11 w-full justify-start text-left font-normal sm:w-[240px]',
                    !dateRange && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'MM/dd', { locale: ja })} -{' '}
                        {format(dateRange.to, 'MM/dd', { locale: ja })}
                      </>
                    ) : (
                      format(dateRange.from, 'MM/dd', { locale: ja })
                    )
                  ) : (
                    <span>日付を選択</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="max-w-[calc(100vw-2rem)] overflow-x-auto p-0"
                align="start"
              >
                <Calendar
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ja}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">総アクション数</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.totalEvents.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">サロンページを見た回数 + 予約完了回数</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">サロンに興味を持った人数</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.summary.totalSessions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">重複を除いた実際の来訪者数</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">実際に予約した人数</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.summary.totalConversions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                サロンページから実際に予約完了した件数
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">予約成功率</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.conversionRate}%</div>
              <p className="text-xs text-muted-foreground">
                サロンを見つけた人のうち予約した人の割合
              </p>
            </CardContent>
          </Card>
        </div>

        {/* チャート */}
        <Tabs defaultValue="insights" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1.5">
            <TabsTrigger value="insights">分析結果</TabsTrigger>
            <TabsTrigger value="timeline">推移</TabsTrigger>
            <TabsTrigger value="breakdown">詳細</TabsTrigger>
            <TabsTrigger value="comparison">比較</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-4">
            <TrackingInsights data={data} dimensionType={dimensionType} />
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle>お客様の動向変化</CardTitle>
                <CardDescription>
                  日ごとの「サロンを見つけた人数」「サロンに興味を持った人数」「実際に予約した人数」の変化を表示します
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={data.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => format(new Date(value), 'MM/dd')}
                      tick={{ fill: CHART_AXIS_COLOR }}
                      axisLine={{ stroke: CHART_GRID_COLOR }}
                      tickLine={{ stroke: CHART_GRID_COLOR }}
                    />
                    <YAxis
                      tick={{ fill: CHART_AXIS_COLOR }}
                      axisLine={{ stroke: CHART_GRID_COLOR }}
                      tickLine={{ stroke: CHART_GRID_COLOR }}
                    />
                    <Tooltip
                      labelFormatter={(value) => format(new Date(value), 'yyyy/MM/dd')}
                      contentStyle={{
                        borderRadius: '10px',
                        backgroundColor: CHART_SURFACE_COLOR,
                        color: CHART_SURFACE_FOREGROUND_COLOR,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="events"
                      stroke={CHART_COLORS[0]}
                      name="イベント数"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="sessions"
                      stroke={CHART_COLORS[1]}
                      name="セッション数"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="conversions"
                      stroke={CHART_COLORS[2]}
                      name="コンバージョン数"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            <div className="space-y-4">
              {/* 分析方法の説明 */}
              <Card className="border-l-4 border-l-info-foreground">
                <CardContent className="pt-4">
                  <h3 className="font-medium mb-2">この分析で分かること</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {dimensionType === 'utm_source' &&
                      'Google検索、Instagram、LINE等、どの経路からお客様がサロンを見つけているかが分かります'}
                    {dimensionType === 'utm_medium' &&
                      'インターネット広告、SNS投稿、検索結果等、どの方法で集客できているかが分かります'}
                    {dimensionType === 'utm_campaign' &&
                      '季節のキャンペーンや特別企画等、どの施策が効果的かが分かります'}
                    {dimensionType === 'referrer_url' &&
                      'どのウェブサイトからサロンページにアクセスがあったかが分かります'}
                    {dimensionType === 'page_url' &&
                      'サロンサイト内のどのページが一番見られているかが分かります'}
                  </p>
                  <p className="text-xs text-info-foreground font-medium">
                    💡 効果の高い集客方法に注力することで、予約数アップが期待できます
                  </p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border-border shadow-sm">
                  <CardHeader>
                    <CardTitle>
                      🥧 {dimensionTypes.find((t) => t.value === dimensionType)?.label}別の割合
                    </CardTitle>
                    <CardDescription>サロンを見つけた人数の内訳（円グラフ）</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={data.dimensionData.slice(0, 6)}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill={CHART_COLORS[0]}
                          dataKey="events"
                          label={({ events }) => {
                            return `${events}回`
                          }}
                        >
                          {data.dimensionData.slice(0, 6).map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '10px',
                            backgroundColor: CHART_SURFACE_COLOR,
                            color: CHART_SURFACE_FOREGROUND_COLOR,
                          }}
                          formatter={(value) => [`${value}回`, 'イベント数']}
                          labelFormatter={(value) => {
                            const item = data.dimensionData.find((item) => item.value === value)
                            if (item) {
                              return item.value
                            }

                            console.log('item:', item)
                            return value
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <BarChart
                  title="🏆 効果的な集客方法ランキング"
                  description="サロンを見つけた人数順（実際に予約された件数も表示）"
                  data={data.dimensionData.slice(0, 10).map((item, index) => ({
                    name:
                      typeof item.value === 'string' && item.value.startsWith('https://')
                        ? item.value.replace('https://', '').replace('www.', '').split('/')[0]
                        : item.value,
                    value: item.events,
                    bookingCount:
                      ((item.conversions / item.events) * 100).toFixed(2) +
                      '%' +
                      ' - ' +
                      item.conversions,
                    fill:
                      item.conversions > 0
                        ? CHART_COLORS[index % CHART_COLORS.length]
                        : CHART_AXIS_COLOR,
                  }))}
                  height={400}
                  horizontal={true}
                  maxBars={10}
                  valueFormatter={(value) => `${value}回`}
                  labelFormatter={(label) => {
                    if (typeof label === 'string' && label.startsWith('https://')) {
                      return label.replace('https://', '').replace('www.', '')
                    }
                    return label
                  }}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <CardTitle>集客効果の詳細比較</CardTitle>
                <CardDescription>
                  「サロンを見つけた人数」「興味を持った人数」「実際に予約した人数」を同時に比較できます
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RechartsBarChart data={data.dimensionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis
                      dataKey="value"
                      tick={{ fill: CHART_AXIS_COLOR }}
                      axisLine={{ stroke: CHART_GRID_COLOR }}
                      tickLine={{ stroke: CHART_GRID_COLOR }}
                      tickFormatter={(value) => {
                        const stringValue = String(value)
                        if (stringValue.startsWith('https://')) {
                          const domain = stringValue
                            .replace('https://', '')
                            .replace('www.', '')
                            .split('/')[0]
                          return domain.length > 8 ? domain.substring(0, 8) + '...' : domain
                        }
                        return stringValue.length > 8
                          ? stringValue.substring(0, 8) + '...'
                          : stringValue
                      }}
                    />
                    <YAxis
                      tick={{ fill: CHART_AXIS_COLOR }}
                      axisLine={{ stroke: CHART_GRID_COLOR }}
                      tickLine={{ stroke: CHART_GRID_COLOR }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        backgroundColor: CHART_SURFACE_COLOR,
                        color: CHART_SURFACE_FOREGROUND_COLOR,
                      }}
                    />
                    <Bar dataKey="events" fill={CHART_COLORS[0]} name="🔍 サロンを見つけた数" />
                    <Bar dataKey="sessions" fill={CHART_COLORS[1]} name="👥 興味を持った人数" />
                    <Bar dataKey="conversions" fill={CHART_COLORS[2]} name="実際に予約した人数" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardSection>
  )
}
