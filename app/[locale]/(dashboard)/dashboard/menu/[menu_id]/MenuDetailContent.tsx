// この行を追加: React Hooks の依存関係を修正したファイル
// /components/menu/MenuDetailContent.tsx
'use client'

import Image from 'next/image'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  FileText,
  CreditCard,
  PiggyBank,
  Clock,
  Tag,
  Users,
  Edit,
  ChevronDown,
  ChevronUp,
  Trash,
  Info,
  Crosshair,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Doc } from '@/convex/_generated/dataModel'
import { Link } from '@/i18n/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { convertGender } from '@/convex/types'
import { useErrorHandler } from '@/hooks/useErrorHandler'

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'

interface MenuDetailContentProps {
  menu: Doc<'menu'> | null
}

export function MenuDetailContent({ menu }: MenuDetailContentProps) {
  const router = useRouter()
  const t = useTranslations('menus.detail')
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [showFullWarningMessage, setShowFullWarningMessage] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const deleteMenu = useMutation(api.menu.mutation.kill)
  const { showErrorToast } = useErrorHandler()

  // ADDED START: State and effect for Carousel
  const [mainCarouselApi, setMainCarouselApi] = useState<CarouselApi>()
  const [currentMainImageIndex, setCurrentMainImageIndex] = useState(0)

  useEffect(() => {
    if (!mainCarouselApi) {
      return
    }
    // Set initial snap a soon as API is ready
    setCurrentMainImageIndex(mainCarouselApi.selectedScrollSnap())

    const onSelect = () => {
      if (mainCarouselApi) {
        // Check if api is still valid
        setCurrentMainImageIndex(mainCarouselApi.selectedScrollSnap())
      }
    }
    mainCarouselApi.on('select', onSelect)

    // Clean up listener on component unmount or when api changes
    return () => {
      mainCarouselApi.off('select', onSelect)
    }
  }, [mainCarouselApi])

  const handleThumbnailClick = (index: number) => {
    mainCarouselApi?.scrollTo(index)
  }
  // ADDED END

  // メモ化によるパフォーマンス最適化
  const formattedPrice = useMemo(() => {
    if (!menu) return ''
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(menu.unit_price || 0)
  }, [menu])

  const formattedSalePrice = useMemo(() => {
    if (!menu || !menu.sale_price) return null
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(menu.sale_price || 0)
  }, [menu])

  const getTargetTypeLabel = (type: string): string => {
    const labels = {
      targetType: {
        repeat: t('labels.targetType.repeat'),
        first: t('labels.targetType.first'),
        all: t('labels.targetType.all'),
      },
    }
    return labels.targetType[type as keyof typeof labels.targetType] || type
  }

  const getPaymentMethodLabel = (method: string): string => {
    const labels = {
      paymentMethod: {
        cash: t('labels.paymentMethod.cash'),
        credit_card: t('labels.paymentMethod.credit_card'),
        all: t('labels.paymentMethod.all'),
      },
    }
    return labels.paymentMethod[method as keyof typeof labels.paymentMethod] || method
  }

  // 説明文の処理
  const shortenedDescription = useMemo(() => {
    if (!menu?.description) return ''
    if (menu.description.length <= 150 || showFullDescription) return menu.description
    return `${menu.description.substring(0, 150)}...`
  }, [menu, showFullDescription])

  const shortenedWarningMessage = useMemo(() => {
    if (!menu?.warning_message) return ''
    if (menu.warning_message.length <= 150 || showFullWarningMessage) return menu.warning_message
    return `${menu.warning_message.substring(0, 150)}...`
  }, [menu, showFullWarningMessage])

  const toggleDescription = () => {
    setShowFullDescription(!showFullDescription)
  }

  const toggleWarningMessage = () => {
    setShowFullWarningMessage(!showFullWarningMessage)
  }

  const handleDeleteMenu = async () => {
    if (!menu) {
      toast.error(t('messages.notFound'))
      return
    }

    try {
      await deleteMenu({ menu_id: menu._id })

      // 画像削除処理をPromiseとして配列に格納
      const deleteImagePromises = menu.images
        ?.filter((image) => image.original_url) // imgPath が存在する画像のみを対象にする
        .map(async (image) => {
          try {
            const response = await fetch('/api/storage', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json', // JSON形式で送信することを指定
              },
              body: JSON.stringify({
                originalUrl: image.original_url,
                withThumbnail: true,
              }),
            })

            if (!response.ok) {
              // HTTPステータスコードが200番台でない場合にエラーを投げる
              const errorBody = await response.text() // エラーレスポンスの内容を取得
              throw new Error(
                t('messages.imageDeleteError', {
                  status: response.status,
                  statusText: response.statusText,
                  error: errorBody,
                })
              )
            }

            // 成功した場合のレスポンスを返す（必要であれば）
            // return await response.json();
            console.log(`画像削除成功: ${image.original_url}`)
            return { status: 'fulfilled', value: response.status } // Promise.allSettled の結果形式に合わせる
          } catch (error) {
            // エラーが発生した場合
            console.error(`画像削除失敗: ${image.original_url}`, error)
            // Promise.allSettled の結果形式に合わせる
            // reject ではなく catch ブロックでエラーを処理し、resolved with status:'rejected' のようなオブジェクトを返すことで、
            // Promise.allSettled が 'rejected' ステータスとして扱えるようにする
            // または、単に catch の中でログを出力し、throw error で reject させることも可能
            throw error // re-throw the error so Promise.allSettled catches it as 'rejected'
          }
        })

      // Promise.allSettled を使って全ての画像削除Promiseが完了するのを待つ
      if (deleteImagePromises && deleteImagePromises.length > 0) {
        const results = await Promise.allSettled(deleteImagePromises)

        // 各画像削除の結果を確認（オプション）
        results.forEach((result, index) => {
          // results のインデックスは deleteImagePromises のインデックスに対応します
          // どの画像かが分かりやすいように、元の画像の imgPath などを使用すると良いでしょう
          const originalImage = menu.images?.filter((img) => img.original_url)[index] // 対応する元の画像オブェクトを取得
          if (result.status === 'fulfilled') {
            console.log(`画像削除 (${originalImage?.original_url || '不明'}) 成功:`, result.value)
          } else {
            console.error(
              `画像削除 (${originalImage?.original_url || '不明'}) 失敗:`,
              result.reason
            )
          }
        })
      }

      router.push('/dashboard/menu')
      toast.success(t('messages.deleteSuccess'))
    } catch (error) {
      showErrorToast(error)
    }
  }

  if (!menu) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-8">
      <div className="space-y-6">
        {/* メニュー基本情報ヘッダー - Uber風デザイン */}
        <div className="admin-panel overflow-hidden">
          <div className="bg-muted p-3 md:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-start md:items-center gap-4 w-full">
                <div className="p-2 bg-primary rounded-full">
                  <FileText className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="w-full">
                  <h1 className="text-xl font-bold ">{menu.name}</h1>
                  <p className="text-sm">
                    {Array.isArray(menu.categories) && menu.categories.length > 0
                      ? menu.categories.join(' • ')
                      : t('fields.noCategory')}
                  </p>
                </div>
              </div>
              <div className="w-full flex justify-end gap-3">
                <Link href={`/dashboard/menu/${menu._id}/edit`}>
                  <Button variant="edit" size="sm" className="group">
                    <Edit className="w-4 h-4 mr-2" /> {t('edit')}
                  </Button>
                </Link>
                <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
                  <Trash className="w-4 h-4 mr-2" /> {t('delete')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="admin-panel overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* メニュー画像セクション */}
            <div className="lg:w-1/2 p-6">
              {menu.images && menu.images.length > 0 ? (
                <div className="space-y-4">
                  <Carousel
                    setApi={setMainCarouselApi}
                    className="w-full max-w-lg mx-auto"
                    opts={{
                      loop: menu.images.length > 1,
                      align: 'start',
                    }}
                  >
                    <CarouselContent>
                      {menu.images.map((image, index) => (
                        <CarouselItem key={`main-${index}`}>
                          <div className="relative w-full aspect-[4/3] bg-muted group rounded-xl overflow-hidden shadow-lg">
                            <Image
                              src={image.original_url || ''}
                              alt={`${menu.name || t('image.alt')} ${index + 1}`}
                              className="w-full h-full object-cover"
                              fill
                              sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, (max-width: 1200px) 50vw, 33vw"
                              priority={index === currentMainImageIndex}
                              loading={index === currentMainImageIndex ? 'eager' : 'lazy'}
                            />
                            {menu.images && menu.images.length > 1 && (
                              <>
                                <CarouselPrevious className="absolute left-3 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background backdrop-blur-sm" />
                                <CarouselNext className="absolute right-3 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background backdrop-blur-sm" />
                              </>
                            )}
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                  </Carousel>

                  {menu.images && menu.images[0].thumbnail_url && menu.images.length > 1 && (
                    <div className="flex space-x-2 justify-center overflow-x-auto py-2">
                      {menu.images.map((image, index) => (
                        <button
                          key={`thumb-${index}`}
                          onClick={() => handleThumbnailClick(index)}
                          className={`flex-shrink-0 w-16 h-16 relative rounded-lg border-2 overflow-hidden transition-all duration-200
                                      ${
                                        currentMainImageIndex === index
                                          ? 'border-primary ring-primary ring-2 ring-offset-2 shadow-lg'
                                          : 'border-border opacity-70 hover:opacity-100 hover:border-primary/50'
                                      }`}
                          aria-label={t('image.show', { index: index + 1 })}
                        >
                          <Image
                            src={image.thumbnail_url || ''}
                            alt={`${t('image.thumbnail')} ${index + 1}`}
                            className="w-full h-full object-cover"
                            fill
                            sizes="64px"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center w-full aspect-[4/3] bg-muted text-muted-foreground rounded-xl border border-border">
                  <Info className="w-12 h-12 mb-3 opacity-30" />
                  <span className="text-sm font-medium">{t('image.noImage')}</span>
                </div>
              )}
            </div>

            {/* メニュー詳細情報セクション */}
            <div className="lg:w-1/2 p-6 border-l border-border">
              <div className="space-y-6">
                {/* カテゴリバッジ */}
                {Array.isArray(menu.categories) && menu.categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {menu.categories.map((cat, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="px-3 py-1 text-xs font-medium bg-accent-2 text-accent-2-foreground border-accent-2"
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}

                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-12 bg-secondary border border-border rounded-xl">
                    <TabsTrigger
                      value="basic"
                      className="min-h-11 rounded-lg px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                    >
                      <Info className="w-4 h-4 mr-2" />
                      {t('tabs.basic')}
                    </TabsTrigger>
                    <TabsTrigger
                      value="details"
                      className="min-h-11 rounded-lg px-3 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {t('tabs.details')}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      {/* 料金情報 */}
                      <div className="group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-palette-1 to-palette-1 rounded-xl" />
                        <div className="relative rounded-xl border border-border bg-card p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-palette-1">
                              <PiggyBank className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <p className="text-xs text-primary leading-relaxed font-medium">
                              {t('fields.price')}
                            </p>
                          </div>
                          <div className="flex items-baseline">
                            {formattedSalePrice ? (
                              <div className="flex flex-col">
                                <span className="text-lg font-semibold text-foreground">
                                  {formattedSalePrice}
                                </span>
                                <span className="text-sm text-primary/70 line-through">
                                  {formattedPrice}
                                </span>
                              </div>
                            ) : (
                              <span className="text-lg font-semibold text-foreground">
                                {formattedPrice}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 所要時間 */}
                      <div className="group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-palette-2 to-palette-2 rounded-xl" />
                        <div className="relative rounded-xl border border-border bg-card p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-palette-2">
                              <Clock className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <p className="text-xs text-primary leading-relaxed font-medium">
                              {t('fields.totalDuration')}
                            </p>
                          </div>
                          <p className="text-lg font-bold text-primary">
                            {menu.duration_min || 0}
                            {t('fields.minutes')}
                          </p>
                        </div>
                      </div>

                      {/* 対象性別・ターゲット */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="group relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-palette-3 to-palette-3 rounded-xl" />
                          <div className="relative rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2 rounded-lg bg-palette-3">
                                <Users className="w-4 h-4 text-primary-foreground" />
                              </div>
                              <p className="text-xs text-primary leading-relaxed font-medium">
                                {t('fields.target')}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-primary">
                              {menu.target_gender && menu.target_gender !== 'unselected'
                                ? convertGender(
                                    menu.target_gender as 'unselected' | 'male' | 'female'
                                  )
                                : t('labels.gender.all')}
                            </p>
                          </div>
                        </div>

                        <div className="group relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-palette-4 to-palette-4 rounded-xl" />
                          <div className="relative rounded-xl border border-border bg-card p-4">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="p-2 rounded-lg bg-palette-4">
                                <Crosshair className="w-4 h-4 text-primary-foreground" />
                              </div>
                              <p className="text-xs text-primary leading-relaxed font-medium">
                                {t('fields.targetType')}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-primary">
                              {getTargetTypeLabel(menu.target_type || '')}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 支払い方法 */}
                      <div className="group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-palette-5 to-palette-5 rounded-xl" />
                        <div className="relative rounded-xl border border-border bg-card p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 rounded-lg bg-palette-5">
                              <CreditCard className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <p className="text-xs text-primary leading-relaxed font-medium">
                              {t('fields.paymentMethod')}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-primary">
                            {getPaymentMethodLabel(menu.payment_method || '')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="details" className="mt-6 space-y-6">
                    {/* 説明文 */}
                    {menu.description && (
                      <div className="relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-secondary to-secondary rounded-xl" />
                        <div className="relative rounded-xl border border-border bg-card p-5 sm:p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-primary">
                              <FileText className="w-4 h-4 text-primary-foreground" />
                            </div>
                            <h3 className="text-sm font-medium text-primary leading-relaxed">
                              {t('fields.description')}
                            </h3>
                          </div>
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={showFullDescription ? 'full' : 'short'}
                              initial={{ opacity: 0, height: 'auto' }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-primary leading-relaxed whitespace-pre-wrap"
                            >
                              {shortenedDescription}
                            </motion.div>
                          </AnimatePresence>

                          {menu.description && menu.description.length > 150 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-4 text-primary hover:bg-primary/10 transition-all duration-200"
                              onClick={toggleDescription}
                            >
                              {showFullDescription ? (
                                <>
                                  <ChevronUp className="w-4 h-4 mr-2" /> {t('showLess')}
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-2" /> {t('showMore')}
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 警告メッセージ */}
                    {menu.warning_message && menu.warning_message.length > 0 && (
                      <div className="relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-warning to-warning rounded-xl" />
                        <div className="relative p-6 rounded-xl border border-warning bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-lg group-hover:border-warning">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 rounded-lg bg-warning">
                              <FileText className="w-4 h-4 text-warning-foreground" />
                            </div>
                            <h3 className="text-sm font-medium text-warning-foreground leading-relaxed">
                              {t('fields.warningMessage')}
                            </h3>
                          </div>
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={showFullWarningMessage ? 'full' : 'short'}
                              initial={{ opacity: 0, height: 'auto' }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-warning-foreground leading-relaxed whitespace-pre-wrap font-medium"
                            >
                              {shortenedWarningMessage}
                            </motion.div>
                          </AnimatePresence>

                          {menu.warning_message && menu.warning_message.length > 150 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-4 text-warning-foreground hover:bg-warning-foreground/10 transition-all duration-200"
                              onClick={toggleWarningMessage}
                            >
                              {showFullWarningMessage ? (
                                <>
                                  <ChevronUp className="w-4 h-4 mr-2" /> {t('showLess')}
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4 mr-2" /> {t('showMore')}
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* タグ */}
                    <div className="relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-palette-3/20 to-palette-3/30 rounded-xl" />
                      <div className="relative p-6 rounded-xl border border-palette-3/20 bg-card backdrop-blur-sm transition-all duration-300 hover:shadow-md group-hover:border-palette-3/40">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg bg-palette-3">
                            <Tag className="w-4 h-4 text-primary-foreground" />
                          </div>
                          <h3 className="text-sm font-medium text-primary leading-relaxed">
                            {t('fields.tags')}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {menu.tags && menu.tags.length > 0 ? (
                            menu.tags.map((tag, index) => (
                              <Badge
                                key={index}
                                variant="outline"
                                className="px-3 py-1 text-xs font-medium bg-palette-3 text-primary border-palette-3"
                              >
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-muted-foreground text-sm italic">
                              {t('fields.noTags')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* システム情報 */}
                    <div className="relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-r from-muted to-muted rounded-xl" />
                      <div className="relative rounded-xl border border-border bg-card p-5 sm:p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 rounded-lg bg-muted">
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium text-primary leading-relaxed">
                            {t('fields.systemInfo')}
                          </h3>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium">
                            {t('fields.createdAt')}:{' '}
                            <span className="text-primary">
                              {new Date(menu._creationTime).toLocaleString('ja-JP')}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
        </div>
        {/* 削除確認ダイアログ */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => setIsDeleteDialogOpen(open)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-destructive/10 rounded-full">
                  <Trash className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-primary">
                    {t('confirmDeleteDialog.title')}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground mt-1">
                    {t('confirmDeleteDialog.description')}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="flex gap-3 sm:gap-3">
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="flex-1"
              >
                {t('confirmDeleteDialog.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => handleDeleteMenu()} className="flex-1">
                <Trash className="w-4 h-4 mr-2" />
                {t('confirmDeleteDialog.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
