'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, AlertTriangle, Target, Lightbulb, Star, Users, Smartphone } from 'lucide-react'

interface TrackingData {
  summary: {
    totalEvents: number
    totalSessions: number
    totalConversions: number
    conversionRate: number
  }
  dimensionData: Array<{
    value: string
    events: number
    sessions: number
    conversions: number
  }>
}

interface InsightProps {
  data: TrackingData
  dimensionType: string
}

export default function TrackingInsights({ data, dimensionType }: InsightProps) {
  // インサイト生成ロジック
  const generateInsights = () => {
    const insights: Array<{
      type: 'success' | 'warning' | 'info' | 'active'
      title: string
      description: string
      icon: React.ReactNode
      action?: string
    }> = []

    const { summary, dimensionData } = data

    // コンバージョン率の評価
    if (summary.conversionRate > 15) {
      insights.push({
        type: 'success',
        title: '優秀なコンバージョン率',
        description: `コンバージョン率${summary.conversionRate}%は業界平均を大幅に上回っています。現在の集客方法を継続しましょう。`,
        icon: <Star className="h-4 w-4" />,
        action: '成功要因を分析して他の施策にも応用',
      })
    } else if (summary.conversionRate < 5) {
      insights.push({
        type: 'warning',
        title: 'コンバージョン率の改善が必要',
        description: `コンバージョン率${summary.conversionRate}%は改善の余地があります。予約フォームの見直しや特典の追加を検討しましょう。`,
        icon: <AlertTriangle className="h-4 w-4" />,
        action: '予約フォームの簡素化や初回特典の追加',
      })
    }

    // 流入元分析（UTM Source）
    if (dimensionType === 'utm_source') {
      const topSource = dimensionData[0]
      const socialSources = dimensionData.filter((d) =>
        ['instagram', 'facebook', 'line'].includes(d.value.toLowerCase())
      )

      if (socialSources.length > 0) {
        const totalSocialConversions = socialSources.reduce((sum, s) => sum + s.conversions, 0)
        const socialConversionRate =
          (totalSocialConversions / socialSources.reduce((sum, s) => sum + s.sessions, 0)) * 100

        if (socialConversionRate > 20) {
          insights.push({
            type: 'success',
            title: 'SNSからの予約効果が高い',
            description: `Instagram・Facebook・LINEからのコンバージョン率が${socialConversionRate.toFixed(1)}%と高い結果です。`,
            icon: <Smartphone className="h-4 w-4" />,
            action: 'SNS投稿を増やして更なる集客強化',
          })
        }
      }

      if (topSource && topSource.value.toLowerCase() === 'direct') {
        insights.push({
          type: 'info',
          title: 'リピーターが多い傾向',
          description: '直接アクセスが多いのは、お客様がサロンを覚えてくださっている証拠です。',
          icon: <Users className="h-4 w-4" />,
          action: 'リピーター向けの特別メニューや会員制度の検討',
        })
      }
    }

    // 参照元サイト分析
    if (dimensionType === 'referrer_url') {
      const googleTraffic = dimensionData.find((d) => d.value.includes('google.com'))
      const instagramTraffic = dimensionData.find((d) => d.value.includes('instagram.com'))

      if (googleTraffic && googleTraffic.sessions > summary.totalSessions * 0.3) {
        insights.push({
          type: 'active',
          title: 'Google検索からの流入が多い',
          description:
            'Google検索経由の集客が効果的です。SEO対策を強化すると更なる集客が期待できます。',
          icon: <Target className="h-4 w-4" />,
          action: 'Googleマイビジネスの情報更新や口コミ対応',
        })
      }

      if (instagramTraffic) {
        const instaRate = (instagramTraffic.conversions / instagramTraffic.sessions) * 100
        if (instaRate > 15) {
          insights.push({
            type: 'success',
            title: 'Instagram集客が成功',
            description: `Instagramからのコンバージョン率が${instaRate.toFixed(1)}%と高水準です。`,
            icon: <TrendingUp className="h-4 w-4" />,
            action: 'Instagram投稿頻度を上げて更なる拡大',
          })
        }
      }
    }

    // 全般的な傾向分析
    if (summary.totalSessions < 50) {
      insights.push({
        type: 'warning',
        title: '認知度向上が必要',
        description: '訪問者数が少ない状況です。広告やSNS活動を強化して認知度を上げましょう。',
        icon: <AlertTriangle className="h-4 w-4" />,
        action: 'Instagram・LINE公式アカウントの活用強化',
      })
    } else if (summary.totalSessions > 200) {
      insights.push({
        type: 'success',
        title: '高い集客力',
        description: '多くのお客様にサロンを見つけていただけています。この調子で継続しましょう。',
        icon: <TrendingUp className="h-4 w-4" />,
        action: 'キャパシティに応じた予約枠の調整検討',
      })
    }

    // 汎用的な提案
    insights.push({
      type: 'active',
      title: '美容サロンの集客のコツ',
      description:
        'ビフォー・アフター写真やお客様の声を積極的に発信すると、信頼度が上がり予約につながりやすくなります。',
      icon: <Lightbulb className="h-4 w-4" />,
      action: '施術結果の写真投稿やお客様アンケートの実施',
    })

    return insights.slice(0, 4) // 最大4つまで表示
  }

  const insights = generateInsights()

  const getAlertVariant = (type: string) => {
    switch (type) {
      case 'success':
        return 'default'
      case 'warning':
        return 'destructive'
      default:
        return 'default'
    }
  }

  const getBadgeVariant = (type: string) => {
    switch (type) {
      case 'success':
        return 'default'
      case 'warning':
        return 'destructive'
      case 'info':
        return 'secondary'
      case 'active':
        return 'active'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Lightbulb className="h-5 w-5 mr-2" />
            戦略インサイト
          </CardTitle>
          <CardDescription>データから読み取れるサロン経営のヒントをお伝えします</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {insights.map((insight, index) => (
            <Alert key={index} variant={getAlertVariant(insight.type)} className="border-l-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">{insight.icon}</div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-medium">{insight.title}</h4>
                    <Badge variant={getBadgeVariant(insight.type)} className="text-xs">
                      {insight.type === 'success' && '成功'}
                      {insight.type === 'warning' && '要改善'}
                      {insight.type === 'info' && '情報'}
                      {insight.type === 'active' && 'ヒント'}
                    </Badge>
                  </div>
                  <AlertDescription className="text-sm">{insight.description}</AlertDescription>
                  {insight.action && (
                    <div className="mt-2 p-2 bg-muted/50 rounded-md">
                      <p className="text-xs text-muted-foreground">
                        <strong>おすすめのアクション:</strong> {insight.action}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Alert>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
