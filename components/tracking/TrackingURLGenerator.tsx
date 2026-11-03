'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Copy, ExternalLink, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { UTMBuilder } from './UTMBuilder'
import { UTMPresets } from './UTMPresets'
import { UTMParameters, Preset, URLGeneratorConfig } from '@/types/tracking'

interface TrackingURLGeneratorProps {
  defaultBaseUrl?: string
  onURLGenerated?: (url: string, config: URLGeneratorConfig) => void
}

export function TrackingURLGenerator({
  defaultBaseUrl = '',
  onURLGenerated,
}: TrackingURLGeneratorProps) {
  const [utmParameters, setUtmParameters] = useState<UTMParameters>({})
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null)
  const [generateQR, setGenerateQR] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState('')

  // URLを生成
  const generateURL = () => {
    if (!defaultBaseUrl.trim()) {
      toast.error('ベースURLを入力してください')
      return
    }

    try {
      const url = new URL(defaultBaseUrl)

      // UTMパラメータを追加
      Object.entries(utmParameters).forEach(([key, value]) => {
        if (value && value.trim()) {
          url.searchParams.set(key, value.trim())
        }
      })

      const finalUrl = url.toString()
      setGeneratedUrl(finalUrl)

      // コールバックを呼び出し
      onURLGenerated?.(finalUrl, {
        base_url: defaultBaseUrl,
        utm_parameters: utmParameters,
        generate_qr: generateQR,
      })

      toast.success('URLを生成しました')
    } catch {
      toast.error('有効なURLを入力してください')
    }
  }

  // URLをクリップボードにコピー
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('クリップボードにコピーしました')
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  // URLを新しいタブで開く
  const openInNewTab = (url: string) => {
    window.open(url, '_blank')
  }

  // QRコードを生成（簡易版）
  const generateQRCode = () => {
    if (!generatedUrl) {
      toast.error('先にURLを生成してください')
      return
    }

    // QRコード生成サービスを使用（Google Chart API）
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(generatedUrl)}`
    window.open(qrUrl, '_blank')
    toast.success('QRコードを生成しました')
  }

  // プリセット選択時の処理
  const handlePresetSelect = (preset: Preset) => {
    setSelectedPreset(preset)
    setUtmParameters(preset.utm_parameters)
  }

  // UTMパラメータ変更時の処理
  const handleUTMChange = (params: UTMParameters) => {
    setUtmParameters(params)
    // プリセットの選択状態をクリア（手動編集された場合）
    if (selectedPreset) {
      const isPresetMatch = Object.keys(selectedPreset.utm_parameters).every(
        (key) =>
          selectedPreset.utm_parameters[key as keyof UTMParameters] ===
          params[key as keyof UTMParameters]
      )
      if (!isPresetMatch) {
        setSelectedPreset(null)
      }
    }
  }

  // 共有用のテキストを生成
  const generateShareText = () => {
    const campaignName = utmParameters.utm_campaign || 'キャンペーン'
    const source = utmParameters.utm_source || '不明'
    return `【${campaignName}】\n\n詳細はこちら👇\n${generatedUrl}\n\n#美容室 #予約 #${source}`
  }

  return (
    <div className="space-y-6">
      {/* UTMパラメータ活用ガイド */}
      <div className="p-4 border-l-4 border-l-info-foreground bg-info/60 rounded-md">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
          📚 UTMパラメータ活用ガイド
        </h4>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong>UTMパラメータ</strong>
            とは、URLに付加する特別なパラメータで、お客様がどの経路からサロンを見つけて予約したかを詳しく分析できます。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <p className="font-medium mb-1">🔍 5つのパラメータ：</p>
              <ul className="space-y-1 text-xs ml-3">
                <li>
                  • <strong>Source</strong>: 流入元（instagram, google等）
                </li>
                <li>
                  • <strong>Medium</strong>: 媒体タイプ（social, cpc等）
                </li>
                <li>
                  • <strong>Campaign</strong>: キャンペーン名
                </li>
                <li>
                  • <strong>Term</strong>: キーワード（検索語句等）
                </li>
                <li>
                  • <strong>Content</strong>: コンテンツ識別（広告バナー等）
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">💡 分析できること：</p>
              <ul className="space-y-1 text-xs ml-3">
                <li>• どのSNSから予約が多いか</li>
                <li>• どのキャンペーンが効果的か</li>
                <li>• 広告費用対効果の測定</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1.5">
          <TabsTrigger value="presets">プリセット</TabsTrigger>
          <TabsTrigger value="manual">手動設定</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="space-y-4">
          <UTMPresets onSelectPreset={handlePresetSelect} selectedPreset={selectedPreset} />
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <UTMBuilder
            initialValues={utmParameters}
            onChange={handleUTMChange}
            onReset={() => {
              setUtmParameters({})
              setSelectedPreset(null)
              setGeneratedUrl('')
            }}
          />
        </TabsContent>
      </Tabs>

      {/* 生成ボタンとオプション */}
      <Card className="rounded-2xl border-border shadow-sm">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id="generate-qr" checked={generateQR} onCheckedChange={setGenerateQR} />
                <Label htmlFor="generate-qr">QRコードも生成する</Label>
              </div>
              <Button onClick={generateURL} className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                URLを生成
              </Button>
            </div>

            {/* 生成されたURL */}
            {generatedUrl && (
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label className="text-sm font-medium">生成されたURL</Label>
                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                    <div className="break-all font-mono text-sm mb-3">{generatedUrl}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedUrl)}
                        className="flex items-center gap-2"
                      >
                        <Copy className="h-3 w-3" />
                        コピー
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openInNewTab(generatedUrl)}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-3 w-3" />
                        開く
                      </Button>
                      {generateQR && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateQRCode}
                          className="flex items-center gap-2"
                        >
                          <QrCode className="h-3 w-3" />
                          QRコード
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 共有用テキスト */}
                <div>
                  <Label className="text-sm font-medium">SNS共有用テキスト</Label>
                  <Textarea
                    value={generateShareText()}
                    readOnly
                    className="mt-2 resize-none"
                    rows={4}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 flex items-center gap-2"
                    onClick={() => copyToClipboard(generateShareText())}
                  >
                    <Copy className="h-3 w-3" />
                    テキストをコピー
                  </Button>
                </div>

                {/* UTMパラメータサマリー */}
                <div>
                  <Label className="text-sm font-medium">設定されたUTMパラメータ</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(utmParameters).map(([key, value]) => {
                      if (!value) return null
                      return (
                        <Badge key={key} variant="secondary" className="text-xs">
                          {key.replace('utm_', '')}: {value}
                        </Badge>
                      )
                    })}
                    {Object.values(utmParameters).every((v) => !v) && (
                      <p className="text-sm text-muted-foreground">
                        UTMパラメータが設定されてません
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
