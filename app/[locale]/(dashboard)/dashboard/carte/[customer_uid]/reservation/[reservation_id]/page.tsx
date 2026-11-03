'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { DashboardSection, Loading, MultiImageDrop } from '@/components/common'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import { CarteRepository, CarteDetailRepository } from '@/services/supabase/repositories'
import type { RowType } from '@/services/supabase/SupabaseService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  CalendarDays,
  User,
  FileText,
  Camera,
  Save,
  ChevronLeft,
  ImageIcon,
  Loader2,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import { format } from 'date-fns'
import { ja, enUS, th } from 'date-fns/locale'
import { toast } from 'sonner'
import type { SupportedLocale } from '@/lib/dateLocale'
import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'
import { ImageType, ReservationMenu, ReservationOption } from '@/convex/types'
import Uploader from '@/components/common/Uploader'
import { VoiceInputButton } from '@/components/common/VoiceInputButton'

type CarteDetailPageProps = {
  params: Promise<{
    customer_uid: string
    reservation_id: string
  }>
}

type CustomerWithDetails = {
  customer: RowType<'customer'> | null
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

type CarteData = {
  carte: RowType<'carte'> | null
  carteDetail: RowType<'carte_detail'> | null
}

export default function CarteDetailPage({ params: paramsPromise }: CarteDetailPageProps) {
  const locale = useLocale() as SupportedLocale
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const { tenantId, orgId, isLoaded, subscription } = useTenantAndOrganization()

  const [customerUid, setCustomerUid] = useState<string | null>(null)
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [customerData, setCustomerData] = useState<CustomerWithDetails | null>(null)
  const [carteData, setCarteData] = useState<CarteData | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Carousel state
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  // 編集可能フィールド
  const [notes, setNotes] = useState('')
  const [customerRequests, setCustomerRequests] = useState('')
  const [currentFiles, setCurrentFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<ImageType[]>([])

  // 初期値を保存（変更検知用）
  const [initialNotes, setInitialNotes] = useState('')
  const [initialCustomerRequests, setInitialCustomerRequests] = useState('')
  const [initialImages, setInitialImages] = useState<ImageType[]>([])

  const customerRepo = useMemo(() => new CustomerRepository(), [])
  const carteRepo = useMemo(() => new CarteRepository(), [])
  const carteDetailRepo = useMemo(() => new CarteDetailRepository(), [])

  // Carousel effect
  useEffect(() => {
    if (!carouselApi) {
      return
    }
    // Set initial snap as soon as API is ready
    setCurrentImageIndex(carouselApi.selectedScrollSnap())

    const onSelect = () => {
      if (carouselApi) {
        // Check if api is still valid
        setCurrentImageIndex(carouselApi.selectedScrollSnap())
      }
    }
    carouselApi.on('select', onSelect)

    // Clean up listener on component unmount or when api changes
    return () => {
      carouselApi.off('select', onSelect)
    }
  }, [carouselApi])

  const handleThumbnailClick = (index: number) => {
    carouselApi?.scrollTo(index)
  }

  // paramsの解決
  useEffect(() => {
    paramsPromise.then((params) => {
      setCustomerUid(params.customer_uid)
      setReservationId(params.reservation_id)
    })
  }, [paramsPromise])

  // データの取得
  const fetchData = useCallback(async () => {
    if (!tenantId || !orgId || !customerUid || !reservationId || !isLoaded) return

    setIsLoadingData(true)
    try {
      // 顧客情報の取得
      const completeData = await customerRepo.getCompleteCustomerData(customerUid, tenantId, orgId)

      if (!completeData.customer) {
        toast.error('顧客情報が見つかりません')
        return
      }

      setCustomerData(completeData)

      // カルテ情報の取得
      const carte = await carteRepo.findByCustomer(tenantId, orgId, customerUid)

      // カルテ詳細の取得 // FIXME: 予約を完了にしてSupabaseに予約を移動した際にカルテ詳細の取得ができていない
      const carteDetail = await carteDetailRepo.findByReservation(tenantId, orgId, reservationId)

      setCarteData({
        carte,
        carteDetail,
      })

      // 編集フィールドの初期化
      if (carteDetail) {
        const notesValue = carteDetail.notes || ''
        const customerRequestsValue = carteDetail.customer_requests || ''
        const imagesValue =
          carteDetail.after_images && Array.isArray(carteDetail.after_images)
            ? (carteDetail.after_images as ImageType[])
            : []

        // 現在値を設定
        setNotes(notesValue)
        setCustomerRequests(customerRequestsValue)
        setExistingImages(imagesValue)

        // 初期値を保存
        setInitialNotes(notesValue)
        setInitialCustomerRequests(customerRequestsValue)
        setInitialImages(imagesValue)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('データの取得に失敗しました')
    } finally {
      setIsLoadingData(false)
    }
  }, [
    tenantId,
    orgId,
    customerUid,
    reservationId,
    isLoaded,
    customerRepo,
    carteRepo,
    carteDetailRepo,
  ])

  // データ保存
  const handleSave = useCallback(async () => {
    if (!carteData?.carteDetail || !orgId) {
      toast.error('カルテ詳細が見つかりません')
      return
    }

    setIsSaving(true)
    let newUploadedImageUrls: ImageType[] = [...existingImages]

    try {
      // 新しい画像のアップロード処理
      if (currentFiles.length > 0) {
        setIsUploading(true)
        try {
          // Promise.allを使って複数の画像を並列アップロード
          const uploadPromises = currentFiles.map(async (file) => {
            return uploadImage(file, orgId, 'carte', 'mobile', 'medium')
          })

          const uploadResults = await Promise.all(uploadPromises)
          const newImages = uploadResults.map((result) => ({
            original_url: result.originalUrl,
            thumbnail_url: result.thumbnailUrl,
          }))

          // 既存の画像と新しい画像を結合（最大4枚）
          newUploadedImageUrls = [...existingImages, ...newImages].slice(0, 4)
          setIsUploading(false)
        } catch (err) {
          setIsUploading(false)
          setIsSaving(false)
          console.error('Image upload failed:', err)
          toast.error('画像のアップロードに失敗しました')
          return
        }
      }

      // 削除された画像の処理
      const originalImages = (carteData.carteDetail.after_images as ImageType[]) || []
      const imagesToDelete: ImageType[] = []

      originalImages.forEach((originalImage) => {
        if (
          originalImage.original_url &&
          !newUploadedImageUrls.some((img) => img.original_url === originalImage.original_url)
        ) {
          imagesToDelete.push({
            original_url: originalImage.original_url,
            thumbnail_url: originalImage.thumbnail_url || '',
          })
        }
      })

      // 削除対象がある場合は削除処理を実行
      if (imagesToDelete.length > 0) {
        try {
          console.log('削除対象の画像:', imagesToDelete)
          const deleteApiPayload = {
            originalUrls: imagesToDelete.map((img) => img.original_url),
            withThumbnail: true,
          }

          const deleteResponse = await fetch('/api/storage', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deleteApiPayload),
          })

          if (!deleteResponse.ok) {
            let errorMessage = `画像の削除に失敗しました: ${deleteResponse.status}`
            try {
              const errorData = await deleteResponse.json()
              console.error('画像削除APIエラー詳細:', {
                status: deleteResponse.status,
                statusText: deleteResponse.statusText,
                error: errorData.error,
                details: errorData.details,
                payload: deleteApiPayload,
              })
              if (errorData.error) {
                errorMessage = errorData.error
              }
            } catch (parseErr) {
              // JSONパースに失敗した場合はテキストを表示
              const errorText = await deleteResponse.text()
              console.error('画像削除APIエラー (テキスト):', errorText + ' ' + parseErr)
            }
            toast.error(errorMessage)
          } else {
            console.log(`${imagesToDelete.length}枚の画像を削除しました`)
          }
        } catch (err) {
          console.error('画像削除中にエラーが発生しました:', err)
          toast.error('画像の削除中にエラーが発生しました')
        }
      }

      // カルテ詳細の更新
      await carteDetailRepo.updateCarteDetail(carteData.carteDetail.id, {
        notes,
        customer_requests: customerRequests,
        after_images: newUploadedImageUrls.length > 0 ? newUploadedImageUrls : null,
      })

      // 成功後の処理
      setExistingImages(newUploadedImageUrls)
      setCurrentFiles([])

      // 初期値を更新（保存後の値を新しい初期値として設定）
      setInitialNotes(notes)
      setInitialCustomerRequests(customerRequests)
      setInitialImages(newUploadedImageUrls)

      toast.success('カルテを更新しました')
    } catch (error) {
      console.error('Failed to save carte detail:', error)
      toast.error('カルテの更新に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }, [
    carteData?.carteDetail,
    notes,
    customerRequests,
    carteDetailRepo,
    orgId,
    currentFiles,
    existingImages,
  ])

  // 初回データ取得
  useEffect(() => {
    if (customerUid && reservationId && tenantId && orgId && isLoaded) {
      fetchData()
    }
  }, [customerUid, reservationId, tenantId, orgId, isLoaded, fetchData])

  // 金額フォーマット
  const formatPrice = (price: number | null) => {
    if (!price) return '¥0'
    return `¥${price.toLocaleString()}`
  }

  // 日付フォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return format(new Date(dateString), locale === 'ja' ? 'yyyy年MM月dd日 HH:mm' : 'PPP p', {
      locale: locale === 'ja' ? ja : locale === 'th' ? th : enUS,
    })
  }

  // 変更検知のためのヘルパー関数
  const hasChanges = useMemo(() => {
    // テキストフィールドの変更チェック
    if (notes !== initialNotes || customerRequests !== initialCustomerRequests) {
      return true
    }

    // 新しいファイルの追加チェック
    if (currentFiles.length > 0) {
      return true
    }

    // 画像の削除チェック（初期画像数と現在の画像数の比較）
    if (existingImages.length !== initialImages.length) {
      return true
    }

    // 画像の内容が変更されているかチェック（URLで比較）
    const existingUrls = existingImages.map((img) => img.original_url).sort()
    const initialUrls = initialImages.map((img) => img.original_url).sort()

    if (existingUrls.length !== initialUrls.length) {
      return true
    }

    for (let i = 0; i < existingUrls.length; i++) {
      if (existingUrls[i] !== initialUrls[i]) {
        return true
      }
    }

    return false
  }, [
    notes,
    initialNotes,
    customerRequests,
    initialCustomerRequests,
    currentFiles,
    existingImages,
    initialImages,
  ])

  if (!isLoaded || isLoadingData) {
    return <Loading />
  }

  if (isUploading) {
    return <Uploader />
  }

  if (!customerData || !carteData) {
    return (
      <DashboardSection
        title="カルテ詳細"
        backLink={`/dashboard/carte/${customerUid}`}
        backLinkTitle="カルテに戻る"
      >
        <div className="text-center py-8 text-muted-foreground">データが見つかりません</div>
      </DashboardSection>
    )
  }

  console.log('[CarteDetailPage] carteData:', carteData)

  const firstName = customerData.customer?.first_name ?? null
  const lastName = customerData.customer?.last_name ?? null
  const customerName = firstName && lastName ? `${lastName} ${firstName}` : null
  const finalCustomerName = customerName
    ? `${customerName}`
    : customerData.customer?.email
      ? `${customerData.customer.email}`
      : customerData.customer?.line_user_name
        ? `${customerData.customer.line_user_name}`
        : null

  return (
    <DashboardSection
      title="カルテ詳細"
      backLink={`/dashboard/carte/${customerUid}`}
      backLinkTitle="カルテに戻る"
    >
      <div className="space-y-5">
        {/* ヘッダー情報 */}
        <Card>
          <CardHeader className="py-5 ">
            <CardTitle className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {finalCustomerName} 様
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="text-base text-muted-foreground">施術日時</span>
                </div>
                <p className="font-semibold text-foreground">
                  {formatDate(
                    carteData.carteDetail?.service_start_time ||
                      carteData.carteDetail?.created_at ||
                      null
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">担当スタッフ</span>
                </div>
                <p className="font-bold text-foreground">
                  {carteData.carteDetail?.staff_name || '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* アコーディオンセクション */}
        <Accordion
          type="multiple"
          defaultValue={
            subscription?.plan_name === 'LITE'
              ? ['treatment', 'notes']
              : ['photos', 'treatment', 'notes']
          }
          className="space-y-5"
        >
          {/* 施術後写真 */}
          <AccordionItem
            value="photos"
            className={`admin-panel py-2 ${subscription?.plan_name === 'LITE' ? 'pointer-events-none opacity-50' : ''}`}
          >
            <AccordionTrigger className="hover:no-underline py-3 px-4">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span className="font-semibold">施術後の写真</span>
                {subscription?.plan_name === 'LITE' && (
                  <span className="text-xs text-muted-foreground">
                    (PROプランからご利用できます)
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1 px-4">
              {/* 既存の画像管理 */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="w-full mb-12 md:mb-0">
                  {existingImages.length > 0 ? (
                    <div className="w-full">
                      <h4 className="text-sm font-medium text-muted-foreground mb-2  flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        登録済みの写真 ({existingImages.length}枚)
                      </h4>
                      <div className="grid grid-cols-4 gap-2 md:gap-4 max-w-[400px] mx-auto py-4">
                        {existingImages.map((image, index) => (
                          <div
                            key={index}
                            className="relative aspect-[3/4] bg-muted group rounded-xl overflow-hidden border border-border"
                          >
                            <Image
                              src={image.thumbnail_url}
                              alt={`施術後写真 ${index + 1}`}
                              width={150}
                              height={150}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute right-1 top-1 size-11 opacity-100 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                              onClick={() => {
                                const newImages = existingImages.filter((_, i) => i !== index)
                                setExistingImages(newImages)
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-5">
                        <Button onClick={() => setIsDialogOpen(true)}>
                          <ImageIcon className="w-4 h-4 mr-1" />
                          写真を拡大表示する
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted border-2 border-dashed border-muted-foreground rounded-lg p-4 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="p-2 bg-muted rounded-full">
                          <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            施術後の写真が登録されていません
                          </p>
                          <p className="text-xs text-muted-foreground">
                            下記から写真を追加してください
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {/* 画像アップロード */}
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold flex items-center gap-1 mb-1">
                      <ImageIcon className="w-4 h-4" />
                      新しい写真を追加
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      最大4枚までアップロード可能 ・ 現在:{' '}
                      {existingImages.length + currentFiles.length}/4枚
                    </p>
                  </div>
                  <MultiImageDrop
                    currentFiles={currentFiles}
                    onFilesSelect={(newFiles) => {
                      setCurrentFiles(newFiles as File[])
                    }}
                    maxSizeMB={6}
                    limitFiles={4}
                    hasSelected={existingImages.length}
                  />
                  {existingImages.length + currentFiles.length > 4 && (
                    <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                      <p className="text-xs text-destructive font-medium">
                        ⚠️ 写真は合計4枚までアップロード可能です
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* 施術内容 */}
          <AccordionItem value="treatment" className="admin-panel py-2">
            <AccordionTrigger className="hover:no-underline py-3 px-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-semibold">施術内容</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1 px-4">
              {/* メニュー詳細 */}
              {carteData.carteDetail?.menu_details && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    施術メニュー
                  </h4>
                  <div className="space-y-2">
                    {(carteData.carteDetail.menu_details as ReservationMenu[]).map(
                      (menu, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/10"
                        >
                          <div className="flex items-center gap-2">
                            <Badge className="text-balance">{menu.name}</Badge>
                            <span className="text-sm text-muted-foreground">x{menu.quantity}</span>
                          </div>
                          <span className="font-semibold text-primary">
                            {formatPrice(menu.price * menu.quantity)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* オプション詳細 */}
              {carteData.carteDetail?.option_details &&
                Array.isArray(carteData.carteDetail.option_details) &&
                (carteData.carteDetail.option_details as ReservationOption[]).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      オプションサービス
                    </h4>
                    <div className="space-y-2">
                      {(carteData.carteDetail.option_details as ReservationOption[]).map(
                        (option, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-accent/10 rounded-lg border border-accent/20"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{option.name}</Badge>
                              <span className="text-sm text-muted-foreground font-medium">
                                x{option.quantity}
                              </span>
                            </div>
                            <span className="font-semibold text-accent">
                              {formatPrice(option.price * option.quantity)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </AccordionContent>
          </AccordionItem>

          {/* 顧客要望・メモ */}
          <AccordionItem value="notes" className="admin-panel py-2">
            <AccordionTrigger className="hover:no-underline py-3 px-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-semibold">顧客要望・メモ</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-1 px-4">
              <div className="bg-secondary border border-secondary rounded-lg p-3">
                <div className="mb-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Label
                      htmlFor="customer-requests"
                      className="text-sm font-semibold text-primary"
                    >
                      お客様のご要望
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      サービス提供前に伺ったリクエストを記録
                    </p>
                  </div>
                  <div
                    className={`shrink-0 ${subscription?.plan_name === 'LITE' ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    {subscription?.plan_name === 'LITE' && (
                      <span className="text-xs text-muted-foreground mr-2 bg-muted px-2 py-1 rounded">
                        PROプラン専用
                      </span>
                    )}
                    <div className="pr-2">
                      <VoiceInputButton
                        onResult={(transcript) => {
                          const newText = customerRequests
                            ? `${customerRequests}\n${transcript}`
                            : transcript
                          setCustomerRequests(newText)
                        }}
                        disabled={isSaving || isUploading}
                      />
                    </div>
                  </div>
                </div>
                <Textarea
                  id="customer-requests"
                  value={customerRequests}
                  onChange={(e) => setCustomerRequests(e.target.value)}
                  placeholder="お客様からのご要望を詳細に記録してください..."
                  className="min-h-[100px] bg-background border border-border text-foreground resize-none"
                  rows={6}
                />
              </div>
              <div className="bg-secondary border border-secondary rounded-lg p-3">
                <div className="mb-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="staff-notes" className="text-sm font-semibold">
                      スタッフメモ
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      施術中の気づきや次回への申し送りを記録
                    </p>
                  </div>
                  <div
                    className={`shrink-0 ${subscription?.plan_name === 'LITE' ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    {subscription?.plan_name === 'LITE' && (
                      <span className="text-xs text-muted-foreground mr-2 bg-muted px-2 py-1 rounded">
                        PROプラン専用
                      </span>
                    )}
                    <div className="pr-2">
                      <VoiceInputButton
                        onResult={(transcript) => {
                          const newText = notes ? `${notes}\n${transcript}` : transcript
                          setNotes(newText)
                        }}
                        disabled={isSaving || isUploading}
                      />
                    </div>
                  </div>
                </div>
                <Textarea
                  id="staff-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="施術の仕上がり、髪質・肌質の特徴、次回の提案等を記録..."
                  className="min-h-[120px] bg-background border border-border text-foreground resize-none"
                  rows={8}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* 保存ボタン */}
        <div className="admin-panel p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div
                className={`w-3 h-3 rounded-full ${hasChanges ? 'bg-warning-foreground animate-pulse' : 'bg-success'}`}
              ></div>
              {hasChanges ? '未保存の変更があります' : '保存済み'}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild>
                <Link href={`/dashboard/carte/${customerUid}`}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  戻る
                </Link>
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || isUploading || !hasChanges}
                size="sm"
                className={`flex-1 sm:flex-none ${hasChanges ? 'bg-primary hover:bg-primary/90' : ''}`}
              >
                {isSaving || isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    保存する
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl w-full">
            <DialogHeader className="pb-4">
              <DialogTitle className="text-xl flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                施術後の完成写真
                <span className="text-sm text-muted-foreground">({existingImages.length}枚)</span>
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col h-full space-y-6">
              {existingImages.length > 0 && (
                <>
                  <Carousel
                    setApi={setCarouselApi}
                    className="w-full flex-1"
                    opts={{
                      loop: existingImages.length > 1,
                      align: 'center',
                    }}
                  >
                    <CarouselContent>
                      {existingImages.map((image, index) => (
                        <CarouselItem key={`main-${index}`}>
                          <div className="relative aspect-[3/4] max-h-[60vh] bg-muted group rounded-xl overflow-hidden mx-auto border-2 border-border shadow-lg">
                            <Image
                              src={image.original_url}
                              alt={`施術後写真 ${index + 1}`}
                              className="w-full h-full object-contain"
                              fill
                              sizes="(max-width: 640px) 100vw, 500px"
                              priority={index === currentImageIndex}
                              loading={index === currentImageIndex ? 'eager' : 'lazy'}
                            />
                            {existingImages.length > 1 && (
                              <>
                                <CarouselPrevious className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 bg-background hover:bg-muted p-1 rounded-full text-muted-foreground" />
                                <CarouselNext className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 bg-background hover:bg-muted p-1 rounded-full text-muted-foreground" />
                              </>
                            )}
                          </div>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                  </Carousel>

                  {existingImages.length > 1 && (
                    <div>
                      <div className="flex gap-2 justify-center overflow-x-auto py-2">
                        {existingImages.map((image, index) => (
                          <button
                            key={`thumb-${index}`}
                            onClick={() => handleThumbnailClick(index)}
                            className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 relative rounded-xl border-2 overflow-hidden transition-all duration-200 hover:scale-105
                                        ${
                                          currentImageIndex === index
                                            ? 'border-success ring-2 ring-success ring-offset-2 shadow-lg'
                                            : 'border-border opacity-70 hover:opacity-100 hover:border-muted-foreground'
                                        } focus:outline-none`}
                            aria-label={`写真 ${index + 1} を表示`}
                          >
                            <Image
                              src={image.thumbnail_url}
                              alt={`サムネイル ${index + 1}`}
                              className="w-full h-full object-cover"
                              fill
                              sizes="80px"
                              loading="lazy"
                            />
                            {currentImageIndex === index && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-3 h-3 bg-success rounded-full"></div>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardSection>
  )
}
