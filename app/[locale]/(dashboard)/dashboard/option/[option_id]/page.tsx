'use client'

import Image from 'next/image'
import { useState, useMemo, useEffect, use } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  FileText,
  PiggyBank,
  Clock,
  Tag,
  Edit,
  ChevronDown,
  ChevronUp,
  Trash,
  Info,
  Package,
  Hash,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Link } from '@/i18n/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { DashboardSection, withManagerAccess } from '@/components/common'

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'

interface OptionDetailPageProps {
  params: Promise<{
    option_id: Id<'option'>
  }>
}

function OptionDetailPage({ params }: OptionDetailPageProps) {
  const router = useRouter()
  const t = useTranslations('options.detail')
  const { option_id } = use(params)
  const [showFullDescription, setShowFullDescription] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const deleteOption = useMutation(api.option.mutation.kill)
  const { showErrorToast } = useErrorHandler()

  // オプション詳細データの取得
  const option = useQuery(api.option.query.findById, {
    option_id: option_id,
  })

  // カルーセルの状態管理
  const [mainCarouselApi, setMainCarouselApi] = useState<CarouselApi>()
  const [currentMainImageIndex, setCurrentMainImageIndex] = useState(0)

  useEffect(() => {
    if (!mainCarouselApi) {
      return
    }
    setCurrentMainImageIndex(mainCarouselApi.selectedScrollSnap())

    const onSelect = () => {
      if (mainCarouselApi) {
        setCurrentMainImageIndex(mainCarouselApi.selectedScrollSnap())
      }
    }
    mainCarouselApi.on('select', onSelect)

    return () => {
      mainCarouselApi.off('select', onSelect)
    }
  }, [mainCarouselApi])

  const handleThumbnailClick = (index: number) => {
    mainCarouselApi?.scrollTo(index)
  }

  // 価格のフォーマット
  const formattedPrice = useMemo(() => {
    if (!option) return ''
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(option.unit_price || 0)
  }, [option])

  const formattedSalePrice = useMemo(() => {
    if (!option || !option.sale_price) return null
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(option.sale_price || 0)
  }, [option])

  // 説明文の処理
  const shortenedDescription = useMemo(() => {
    if (!option?.description) return ''
    if (option.description.length <= 150 || showFullDescription) return option.description
    return `${option.description.substring(0, 150)}...`
  }, [option, showFullDescription])

  const toggleDescription = () => {
    setShowFullDescription(!showFullDescription)
  }

  const handleDeleteOption = async () => {
    if (!option) {
      toast.error(t('messages.notFound'))
      return
    }

    try {
      await deleteOption({ option_id: option._id })

      // 画像削除処理
      if (option.images && option.images.length > 0) {
        const deleteImagePromises = option.images
          .filter((image) => image.original_url)
          .map(async (image) => {
            try {
              const response = await fetch('/api/storage', {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  originalUrl: image.original_url,
                  withThumbnail: true,
                }),
              })

              if (!response.ok) {
                const errorBody = await response.text()
                throw new Error(
                  t('messages.imageDeleteError', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorBody,
                  })
                )
              }

              console.log(`画像削除成功: ${image.original_url}`)
              return { status: 'fulfilled', value: response.status }
            } catch (error) {
              console.error(`画像削除失敗: ${image.original_url}`, error)
              throw error
            }
          })

        await Promise.allSettled(deleteImagePromises)
      }

      router.push('/dashboard/option')
      toast.success(t('messages.deleteSuccess'))
    } catch (error) {
      showErrorToast(error)
    }
  }

  if (!option) {
    return (
      <DashboardSection
        title={t('title')}
        backLink="/dashboard/option"
        backLinkTitle={t('list.title')}
      >
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
      </DashboardSection>
    )
  }

  return (
    <DashboardSection
      title={option?.name || t('title')}
      backLink="/dashboard/option"
      backLinkTitle={t('list.title')}
    >
      <div className="min-h-screen pb-8">
        <div className="space-y-6">
          {/* オプション基本情報ヘッダー */}
          <div className="admin-panel overflow-hidden">
            <div className="bg-muted p-3 md:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-start md:items-center gap-4 w-full">
                  <div className="p-2 bg-primary rounded-full">
                    <Package className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="w-full">
                    <h1 className="text-xl font-bold">{option.name}</h1>
                    <p className="text-sm">
                      在庫: {option.in_stock}
                      {t('fields.pieces')} • 最大注文数: {option.order_limit}
                      {t('fields.pieces')}
                    </p>
                  </div>
                </div>
                <div className="w-full flex justify-end gap-3">
                  <Link href={`/dashboard/option/${option._id}/edit`}>
                    <Button variant="edit" size="sm" className="group">
                      <Edit className="w-4 h-4 mr-2" /> {t('edit')}
                    </Button>
                  </Link>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash className="w-4 h-4 mr-2" /> {t('delete')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* メインコンテンツエリア */}
          <div className="admin-panel overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              {/* オプション画像セクション */}
              <div className="lg:w-1/2 p-6">
                {option.images && option.images.length > 0 ? (
                  <div className="space-y-4">
                    <Carousel
                      setApi={setMainCarouselApi}
                      className="w-full max-w-lg mx-auto"
                      opts={{
                        loop: option.images.length > 1,
                        align: 'start',
                      }}
                    >
                      <CarouselContent>
                        {option.images.map((image, index) => (
                          <CarouselItem key={`main-${index}`}>
                            <div className="relative w-full aspect-[4/3] bg-muted group rounded-xl overflow-hidden shadow-lg">
                              <Image
                                src={image.original_url || ''}
                                alt={`${option.name || t('image.alt')} ${index + 1}`}
                                className="w-full h-full object-cover"
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, (max-width: 1200px) 50vw, 33vw"
                                priority={index === currentMainImageIndex}
                                loading={index === currentMainImageIndex ? 'eager' : 'lazy'}
                              />
                              {option.images && option.images.length > 1 && (
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

                    {option.images &&
                      option.images[0].thumbnail_url &&
                      option.images.length > 1 && (
                        <div className="flex space-x-2 justify-center overflow-x-auto py-2">
                          {option.images.map((image, index) => (
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

              {/* オプション詳細情報セクション */}
              <div className="lg:w-1/2 p-6 border-l border-border">
                <div className="space-y-6">
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
                                <span className="text-xl font-bold text-palette-1-foreground">
                                  {formattedPrice}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 所要時間 */}
                        {option.duration_min &&
                        option.duration_min > 0 &&
                        option.duration_min !== 0 ? (
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
                                {option.duration_min}
                                {t('fields.minutes')}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {/* 在庫・注文制限 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-palette-3 to-palette-3 rounded-xl" />
                            <div className="relative rounded-xl border border-border bg-card p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 rounded-lg bg-palette-3">
                                  <Package className="w-4 h-4 text-primary-foreground" />
                                </div>
                                <p className="text-xs text-primary leading-relaxed font-medium">
                                  {t('fields.stock')}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-primary">
                                {option.in_stock}
                                {t('fields.pieces')}
                              </p>
                            </div>
                          </div>

                          <div className="group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-palette-4 to-palette-4 rounded-xl" />
                            <div className="relative rounded-xl border border-border bg-card p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 rounded-lg bg-palette-4">
                                  <Hash className="w-4 h-4 text-primary-foreground" />
                                </div>
                                <p className="text-xs text-primary leading-relaxed font-medium">
                                  {t('fields.orderLimit')}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-primary">
                                {option.order_limit}
                                {t('fields.pieces')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="details" className="mt-6 space-y-6">
                      {/* 説明文 */}
                      {option.description && (
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

                            {option.description && option.description.length > 150 && (
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
                            {option.tags && option.tags.length > 0 ? (
                              option.tags.map((tag, index) => (
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
                                {new Date(option._creationTime).toLocaleString('ja-JP')}
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
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteOption()}
                  className="flex-1"
                >
                  <Trash className="w-4 h-4 mr-2" />
                  {t('confirmDeleteDialog.delete')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </DashboardSection>
  )
}

export default withManagerAccess(OptionDetailPage)
