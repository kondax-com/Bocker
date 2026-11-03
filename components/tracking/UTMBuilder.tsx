'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, RotateCcw, Lightbulb, Plus, X } from 'lucide-react'
import {
  UTMParameters,
  UTMParametersSchema,
  UTM_FIELD_CONFIG,
  UTM_SUGGESTIONS,
} from '@/types/tracking'

interface UTMBuilderProps {
  initialValues?: UTMParameters
  onChange?: (values: UTMParameters) => void
  onReset?: () => void
}

export function UTMBuilder({ initialValues = {}, onChange, onReset }: UTMBuilderProps) {
  const [showSuggestions, setShowSuggestions] = useState<string | null>(null)
  const [keywords, setKeywords] = useState<string[]>(
    initialValues.utm_term ? initialValues.utm_term.split(',').map((k) => k.trim()) : []
  )
  const [newKeyword, setNewKeyword] = useState('')

  const form = useForm<UTMParameters>({
    resolver: zodResolver(UTMParametersSchema),
    defaultValues: {
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
      ...initialValues,
    },
  })

  const watchedValues = form.watch()

  // フォーム値が変更されたときにコールバックを呼ぶ
  const handleFormChange = (values: UTMParameters) => {
    // キーワードが変更されている場合は、カンマ区切りで結合してutm_termに設定
    const updatedValues = {
      ...values,
      utm_term: keywords.length > 0 ? keywords.join(',') : values.utm_term,
    }
    onChange?.(updatedValues)
  }

  // キーワードを追加
  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      const updatedKeywords = [...keywords, newKeyword.trim()]
      setKeywords(updatedKeywords)
      setNewKeyword('')

      // utm_termフィールドを更新
      const utmTerm = updatedKeywords.join(',')
      form.setValue('utm_term', utmTerm)
      handleFormChange({ ...watchedValues, utm_term: utmTerm })
    }
  }

  // キーワードを削除
  const removeKeyword = (indexToRemove: number) => {
    const updatedKeywords = keywords.filter((_, index) => index !== indexToRemove)
    setKeywords(updatedKeywords)

    // utm_termフィールドを更新
    const utmTerm = updatedKeywords.join(',')
    form.setValue('utm_term', utmTerm)
    handleFormChange({ ...watchedValues, utm_term: utmTerm })
  }

  // フィールドをクリア
  const clearField = (fieldName: keyof UTMParameters) => {
    if (fieldName === 'utm_term') {
      setKeywords([])
    }
    form.setValue(fieldName, '')
    handleFormChange({ ...watchedValues, [fieldName]: '' })
  }

  // 全フィールドをリセット
  const resetForm = () => {
    // 各フィールドを明示的に空文字にリセット
    form.setValue('utm_source', '')
    form.setValue('utm_medium', '')
    form.setValue('utm_campaign', '')
    form.setValue('utm_term', '')
    form.setValue('utm_content', '')

    setKeywords([])
    setNewKeyword('')

    // 親コンポーネントにリセットされた値を通知
    handleFormChange({
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
    })

    onReset?.()
  }

  // 候補値を選択
  const selectSuggestion = (fieldName: keyof UTMParameters, value: string) => {
    form.setValue(fieldName, value)
    handleFormChange({ ...watchedValues, [fieldName]: value })
    setShowSuggestions(null)
  }

  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">UTMパラメータ設定</CardTitle>
            <CardDescription>トラッキング用のUTMパラメータを設定してください</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetForm}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            リセット
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6">
            {(Object.keys(UTM_FIELD_CONFIG) as Array<keyof typeof UTM_FIELD_CONFIG>).map(
              (fieldName) => {
                const config = UTM_FIELD_CONFIG[fieldName]
                const suggestions = UTM_SUGGESTIONS[fieldName] || []
                const currentValue = watchedValues[fieldName] || ''

                // utm_termフィールドの場合は専用のキーワード入力UIを表示
                if (fieldName === 'utm_term') {
                  return (
                    <FormField
                      key={fieldName}
                      control={form.control}
                      name={fieldName}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            {config.label}
                            {config.required && (
                              <Badge variant="destructive" className="text-xs">
                                必須
                              </Badge>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="space-y-3">
                              {/* キーワード追加入力 */}
                              <div className="flex flex-wrap gap-2">
                                <Input
                                  placeholder="キーワードを入力"
                                  value={newKeyword}
                                  onChange={(e) => setNewKeyword(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      addKeyword()
                                    }
                                  }}
                                  className="min-w-0 flex-1"
                                />
                                <Button
                                  type="button"
                                  onClick={addKeyword}
                                  disabled={
                                    !newKeyword.trim() || keywords.includes(newKeyword.trim())
                                  }
                                  className="flex items-center gap-2"
                                >
                                  <Plus className="h-4 w-4" />
                                  追加
                                </Button>
                              </div>

                              {/* 追加済みキーワード表示 */}
                              {keywords.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {keywords.map((keyword, index) => (
                                    <Badge
                                      key={index}
                                      className="flex items-center gap-1 px-2 py-1"
                                    >
                                      {keyword}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0 hover:bg-transparent"
                                        onClick={() => removeKeyword(index)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* 隠しフィールド（実際のフォーム値） */}
                              <Input {...field} type="hidden" value={keywords.join(',') || ''} />
                            </div>
                          </FormControl>
                          <FormDescription>{config.description}</FormDescription>
                          <FormMessage />

                          {/* 候補値の表示 */}
                          {showSuggestions === fieldName && suggestions.length > 0 && (
                            <div className="mt-2 p-3 border rounded-md bg-muted/50">
                              <p className="text-sm font-medium mb-2">よく使われるキーワード:</p>
                              <div className="flex flex-wrap gap-2">
                                {suggestions.map((suggestion) => (
                                  <Button
                                    key={suggestion}
                                    type="button"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      if (!keywords.includes(suggestion)) {
                                        const updatedKeywords = [...keywords, suggestion]
                                        setKeywords(updatedKeywords)
                                        const utmTerm = updatedKeywords.join(',')
                                        form.setValue('utm_term', utmTerm)
                                        handleFormChange({ ...watchedValues, utm_term: utmTerm })
                                      }
                                      setShowSuggestions(null)
                                    }}
                                    disabled={keywords.includes(suggestion)}
                                  >
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </FormItem>
                      )}
                    />
                  )
                }

                return (
                  <FormField
                    key={fieldName}
                    control={form.control}
                    name={fieldName}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          {config.label}
                          {config.required && (
                            <Badge variant="destructive" className="text-xs">
                              必須
                            </Badge>
                          )}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              placeholder={config.placeholder}
                              className="pr-20"
                              onChange={(e) => {
                                field.onChange(e)
                                handleFormChange({
                                  ...watchedValues,
                                  [fieldName]: e.target.value,
                                })
                              }}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              {suggestions.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() =>
                                    setShowSuggestions(
                                      showSuggestions === fieldName ? null : fieldName
                                    )
                                  }
                                  title="候補を表示"
                                >
                                  <Lightbulb className="h-3 w-3" />
                                </Button>
                              )}
                              {currentValue && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => clearField(fieldName)}
                                  title="クリア"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </FormControl>
                        <FormDescription>{config.description}</FormDescription>
                        <FormMessage />

                        {/* 候補値の表示 */}
                        {showSuggestions === fieldName && suggestions.length > 0 && (
                          <div className="mt-2 p-3 border rounded-md bg-muted/50">
                            <p className="text-sm font-medium mb-2">よく使われる値:</p>
                            <div className="flex flex-wrap gap-2">
                              {suggestions.map((suggestion) => (
                                <Button
                                  key={suggestion}
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => selectSuggestion(fieldName, suggestion)}
                                >
                                  {suggestion}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                )
              }
            )}
          </form>
        </Form>
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">設定済みパラメータ</h4>
          <div className="space-y-2">
            {(Object.keys(watchedValues) as Array<keyof UTMParameters>).map((key) => {
              let value = watchedValues[key]
              // utm_termの場合はキーワード配列から表示値を生成
              if (key === 'utm_term' && keywords.length > 0) {
                value = keywords.join(',')
              }
              if (!value) return null

              return (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground">{key}</code>
                    {key === 'utm_term' && keywords.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {keywords.map((keyword, index) => (
                          <Badge key={index} className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm">{value}</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => clearField(key)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
            {Object.values(watchedValues).every((v) => !v) && keywords.length === 0 && (
              <p className="text-sm text-muted-foreground">パラメータが設定されていません</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
