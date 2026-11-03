'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, Edit, Trash2, Star, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Preset, UTMParameters, DEFAULT_PRESETS, PRESET_CATEGORIES } from '@/types/tracking'

// UTMパラメータ設定情報
const UTM_PARAMETER_CONFIG = [
  {
    key: 'utm_source',
    label: '流入元 (Source)',
    description: 'どこから来たかを特定します（例：Google検索、Instagram、LINE）',
    placeholder: 'instagram',
    required: true,
    examples: [
      'instagram',
      'google',
      'facebook',
      'line',
      'twitter',
      'youtube',
      'newsletter',
      'qr-code',
    ],
  },
  {
    key: 'utm_medium',
    label: 'メディア (Medium)',
    description: 'どのような方法で宣伝したかを分類します',
    placeholder: 'social',
    required: true,
    examples: ['social', 'cpc', 'email', 'organic', 'referral', 'display', 'print', 'qr'],
  },
  {
    key: 'utm_campaign',
    label: 'キャンペーン名 (Campaign)',
    description: '具体的なキャンペーンや施策名を設定します',
    placeholder: '春の新規顧客キャンペーン',
    required: false,
    examples: [
      '新規顧客獲得',
      '春キャンペーン',
      '月末特典',
      '紹介キャンペーン',
      '季節限定',
      'グランドオープン',
    ],
  },
  {
    key: 'utm_term',
    label: 'キーワード (Term)',
    description:
      '🔍 有料検索広告のキーワードや、ターゲットとする検索語句を設定します。SNS投稿では関連するハッシュタグやキーワードも設定可能です（カンマ区切りで複数可）',
    placeholder: '美容室,カット,横浜駅',
    required: false,
    examples: [
      '美容室',
      'ヘアサロン',
      'カット',
      'カラー',
      'パーマ',
      'トリートメント',
      'ヘアケア',
      'ブリーチ',
      '縮毛矯正',
      '白髪染め',
    ],
  },
  {
    key: 'utm_content',
    label: 'コンテンツ (Content)',
    description:
      '📝 同じキャンペーンで複数の広告やコンテンツを使い分ける際に、それぞれを識別するために使用します。A/Bテストや異なる投稿タイプの効果測定に便利です',
    placeholder: 'banner-top',
    required: false,
    examples: [
      'banner-top',
      'sidebar-ad',
      'story-post',
      'feed-post',
      'header-link',
      'footer-link',
      'popup',
      'video-ad',
      'carousel-ad',
      'text-only',
    ],
  },
] as const

interface UTMPresetsProps {
  onSelectPreset?: (preset: Preset) => void
  selectedPreset?: Preset | null
}

export function UTMPresets({ onSelectPreset, selectedPreset }: UTMPresetsProps) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [newPreset, setNewPreset] = useState<Partial<Preset>>({
    name: '',
    description: '',
    category: 'custom',
    utm_parameters: {},
  })

  // デフォルトプリセットの初期化
  const initializeDefaultPresets = useCallback(() => {
    const defaultPresetsWithIds: Preset[] = DEFAULT_PRESETS.map((preset) => ({
      ...preset,
      id: `default-${preset.name.toLowerCase().replace(/\s+/g, '-')}`,
      created_at: new Date(),
      is_saved: true,
    }))
    setPresets(defaultPresetsWithIds)
    savePresets(defaultPresetsWithIds)
  }, [])

  // ローカルストレージからプリセットを読み込み
  useEffect(() => {
    const savedPresets = localStorage.getItem('utm-presets')
    if (savedPresets) {
      try {
        const parsed = JSON.parse(savedPresets) as Preset[]
        setPresets(parsed)
      } catch (error) {
        console.error('Failed to parse saved presets:', error)
        initializeDefaultPresets()
      }
    } else {
      initializeDefaultPresets()
    }
  }, [initializeDefaultPresets])

  // プリセットをローカルストレージに保存
  const savePresets = (presetsToSave: Preset[]) => {
    localStorage.setItem('utm-presets', JSON.stringify(presetsToSave))
  }

  // 新しいプリセットを作成
  const createPreset = () => {
    if (!newPreset.name?.trim()) {
      toast.error('プリセット名を入力してください')
      return
    }

    const preset: Preset = {
      id: `custom-${Date.now()}`,
      name: newPreset.name,
      description: newPreset.description || '',
      category: newPreset.category as 'social' | 'ads' | 'email' | 'custom',
      utm_parameters: newPreset.utm_parameters || {},
      created_at: new Date(),
      is_default: false,
      is_saved: true,
    }

    const updatedPresets = [...presets, preset]
    setPresets(updatedPresets)
    savePresets(updatedPresets)

    setNewPreset({
      name: '',
      description: '',
      category: 'custom',
      utm_parameters: {},
    })
    setIsDialogOpen(false)
    toast.success('プリセットを作成しました')
  }

  // プリセットを編集
  const updatePreset = () => {
    if (!editingPreset || !editingPreset.name?.trim()) {
      toast.error('プリセット名を入力してください')
      return
    }

    const updatedPresets = presets.map((preset) =>
      preset.id === editingPreset.id ? editingPreset : preset
    )
    setPresets(updatedPresets)
    savePresets(updatedPresets)
    setEditingPreset(null)
    setIsDialogOpen(false)
    toast.success('プリセットを更新しました')
  }

  // プリセットを削除
  const deletePreset = (presetId: string) => {
    const updatedPresets = presets.filter((preset) => preset.id !== presetId)
    setPresets(updatedPresets)
    savePresets(updatedPresets)
    toast.success('プリセットを削除しました')
  }

  // プリセットを複製
  const duplicatePreset = (preset: Preset) => {
    const duplicated: Preset = {
      ...preset,
      id: `custom-${Date.now()}`,
      name: `${preset.name} (コピー)`,
      is_default: false,
      created_at: new Date(),
    }

    const updatedPresets = [...presets, duplicated]
    setPresets(updatedPresets)
    savePresets(updatedPresets)
    toast.success('プリセットを複製しました')
  }

  // ダイアログを開く
  const openDialog = (preset?: Preset) => {
    if (preset) {
      setEditingPreset({ ...preset })
    } else {
      setNewPreset({
        name: '',
        description: '',
        category: 'custom',
        utm_parameters: {},
      })
      setEditingPreset(null)
    }
    setIsDialogOpen(true)
  }

  // カテゴリ別にプリセットをグループ化
  const groupedPresets = presets.reduce(
    (acc, preset) => {
      if (!acc[preset.category]) {
        acc[preset.category] = []
      }
      acc[preset.category].push(preset)
      return acc
    },
    {} as Record<string, Preset[]>
  )

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>プリセット管理</CardTitle>
            <CardDescription>よく使うUTMパラメータの組み合わせを保存・管理できます</CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDialog()}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                新規作成
              </Button>
            </DialogTrigger>
            <PresetDialog
              preset={editingPreset || newPreset}
              isEditing={!!editingPreset}
              onChange={(preset) => {
                if (editingPreset) {
                  setEditingPreset(preset as Preset)
                } else {
                  setNewPreset(preset)
                }
              }}
              onSave={editingPreset ? updatePreset : createPreset}
              onCancel={() => setIsDialogOpen(false)}
            />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {Object.entries(groupedPresets).map(([category, categoryPresets]) => (
            <div key={category}>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                {PRESET_CATEGORIES[category as keyof typeof PRESET_CATEGORIES]}
                <Badge variant="secondary" className="text-xs">
                  {categoryPresets.length}
                </Badge>
              </h4>
              <div className="grid gap-3">
                {categoryPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedPreset?.id === preset.id
                        ? 'border-neon bg-neon-foreground'
                        : 'border-border'
                    }`}
                    onClick={() => onSelectPreset?.(preset)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium text-sm">{preset.name}</h5>
                          {preset.is_default && (
                            <Star className="h-3 w-3 text-accent-2 fill-current" />
                          )}
                        </div>
                        {preset.description && (
                          <p className="text-xs text-muted-foreground mb-2">{preset.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(preset.utm_parameters).map(([key, value]) => {
                            if (!value) return null
                            return (
                              <Badge key={key} variant="outline" className="text-xs">
                                {key.replace('utm_', '')}: {value}
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-11 shrink-0 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            duplicatePreset(preset)
                          }}
                          title="複製"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        {!preset.is_default && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-11 shrink-0 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                openDialog(preset)
                              }}
                              title="編集"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-11 shrink-0 p-0 text-destructive hover:text-destructive"
                                  onClick={(e) => e.stopPropagation()}
                                  title="削除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>プリセットを削除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    「{preset.name}」を削除してもよろしいですか？
                                    この操作は取り消せません。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deletePreset(preset.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    削除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {presets.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">プリセットがありません</p>
              <Button variant="outline" className="mt-2" onClick={() => openDialog()}>
                最初のプリセットを作成
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// プリセット編集ダイアログ
interface PresetDialogProps {
  preset: Partial<Preset>
  isEditing: boolean
  onChange: (preset: Partial<Preset>) => void
  onSave: () => void
  onCancel: () => void
}

function PresetDialog({ preset, isEditing, onChange, onSave, onCancel }: PresetDialogProps) {
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? 'プリセットを編集' : 'プリセットを作成'}</DialogTitle>
        <DialogDescription>UTMパラメータの組み合わせに名前を付けて保存できます</DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="grid gap-2">
          <Label htmlFor="name">プリセット名</Label>
          <Input
            id="name"
            value={preset.name || ''}
            onChange={(e) => onChange({ ...preset, name: e.target.value })}
            placeholder="Instagram投稿"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">説明（任意）</Label>
          <Textarea
            id="description"
            value={preset.description || ''}
            onChange={(e) => onChange({ ...preset, description: e.target.value })}
            placeholder="このプリセットの用途を説明してください"
            rows={2}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="category">カテゴリ</Label>
          <Select
            value={preset.category || 'custom'}
            onValueChange={(value) =>
              onChange({ ...preset, category: value as 'social' | 'ads' | 'email' | 'custom' })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRESET_CATEGORIES).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-8">
          <div className="space-y-2">
            <Label>UTMパラメータ</Label>
            <div className="p-3 bg-muted/30 rounded-md text-sm">
              <p className="text-muted-foreground mb-2">
                💡 <strong>UTMパラメータの活用例</strong>
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>
                  • <strong>Instagram投稿</strong>: source=instagram, medium=social,
                  campaign=春キャンペーン
                </li>
                <li>
                  • <strong>Google広告</strong>: source=google, medium=cpc, campaign=新規顧客獲得
                </li>
                <li>
                  • <strong>メール配信</strong>: source=newsletter, medium=email, campaign=月末特典
                </li>
              </ul>
            </div>
          </div>

          {UTM_PARAMETER_CONFIG.map((config) => (
            <div key={config.key} className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor={config.key} className="text-sm font-medium">
                  {config.label}
                </Label>
                <Badge className="text-xs">{config.key}</Badge>
                {config.required && (
                  <Badge variant="destructive" className="text-xs">
                    必須
                  </Badge>
                )}
              </div>
              <Input
                id={config.key}
                value={preset.utm_parameters?.[config.key as keyof UTMParameters] || ''}
                onChange={(e) =>
                  onChange({
                    ...preset,
                    utm_parameters: {
                      ...preset.utm_parameters,
                      [config.key]: e.target.value,
                    },
                  })
                }
                placeholder={config.placeholder}
              />
              <p className="text-xs text-muted-foreground">{config.description}</p>
              {config.examples.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">よく使われる例:</p>
                  <div className="flex flex-wrap gap-1">
                    {config.examples.map((example) => (
                      <Badge
                        key={example}
                        className="text-xs cursor-pointer hover:bg-secondary/80"
                        onClick={() =>
                          onChange({
                            ...preset,
                            utm_parameters: {
                              ...preset.utm_parameters,
                              [config.key]: example,
                            },
                          })
                        }
                      >
                        {example}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button onClick={onSave}>{isEditing ? '更新' : '作成'}</Button>
      </DialogFooter>
    </DialogContent>
  )
}
