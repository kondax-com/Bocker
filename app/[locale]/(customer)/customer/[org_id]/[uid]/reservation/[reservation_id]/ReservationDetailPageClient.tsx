'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Calendar, Clock, User, Receipt, Loader2, Phone, X } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import type { IntegratedReservation } from '@/hooks/useIntegratedReservations'
import { toast } from 'sonner'
import { cancelableDeadline } from '@/convex/reservation/reservation.helpers'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type {
  ReservationMenu,
  ReservationOption,
  ReservationStatus,
  ReservationPaymentStatus,
  PaymentMethod,
} from '@/convex/types'

interface ReservationDetailPageClientProps {
  orgId: string
  customerUid: string
  reservationId: string
  tenantId: string
  sessionOrgId: string
}

export function ReservationDetailPageClient({
  orgId,
  customerUid,
  reservationId,
}: ReservationDetailPageClientProps) {
  const router = useRouter()
  const [reservationData, setReservationData] = useState<IntegratedReservation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  // Convexから予約データを取得（IDがk...の形式の場合）
  const isConvexId = reservationId.startsWith('k')
  const convexData = useQuery(
    api.reservation.query.getWithDetailById,
    isConvexId
      ? {
          id: reservationId as Id<'reservation'>,
        }
      : 'skip'
  )

  // 予約設定を取得（キャンセル可能日数の確認用）
  const reservationConfig = useQuery(
    api.organization.reservation_config.query.findByTenantAndOrg,
    reservationData
      ? {
          tenant_id: reservationData.tenantId as Id<'tenant'>,
          org_id: reservationData.orgId as Id<'organization'>,
        }
      : 'skip'
  )

  // 組織設定を取得（電話番号の確認用）
  const orgConfig = useQuery(
    api.organization.config.query.findByTenantAndOrg,
    reservationData
      ? {
          tenant_id: reservationData.tenantId as Id<'tenant'>,
          org_id: reservationData.orgId as Id<'organization'>,
        }
      : 'skip'
  )

  // SupabaseまたはConvexからデータを取得
  useEffect(() => {
    async function fetchReservationData() {
      // Convexデータがある場合
      if (isConvexId && convexData) {
        if (!convexData.reservation) {
          toast.error('予約が見つかりません')
          router.push(`/customer/${orgId}/${customerUid}/reservation`)
          return
        }

        // 顧客IDの確認
        if (convexData.reservation.customer_uid !== customerUid) {
          toast.error('この予約にアクセスする権限がありません')
          router.push(`/customer/${orgId}/${customerUid}/reservation`)
          return
        }

        const res = convexData.reservation
        const detail = convexData.reservationDetail

        setReservationData({
          id: res._id,
          _convex_id: res._id,
          source: 'convex',
          tenantId: res.tenant_id,
          orgId: res.org_id,
          customerUid: res.customer_uid || '',
          staffId: res.staff_id || '',
          customerName: res.customer_name,
          staffName: res.staff_name || '',
          isFreeNomination: res.is_free_nomination || false,
          status: res.status,
          paymentStatus: res.payment_status,
          date: res.date,
          startTimeUnix: res.start_time_unix,
          endTimeUnix: res.end_time_unix,
          createdAt: new Date(res._creationTime),
          detail: detail
            ? {
                menus: detail.menus || undefined,
                options: detail.options || undefined,
                totalPrice: detail.total_price || undefined,
                extraCharge: detail.extra_charge || undefined,
                paymentMethod: detail.payment_method,
                couponId: detail.coupon_id || undefined,
                couponDiscount: detail.coupon_discount || undefined,
                usePoints: detail.use_points || undefined,
                notes: detail.notes || undefined,
              }
            : undefined,
          convexData: res,
        })
        setIsLoading(false)
        return
      }

      // SupabaseのUUID形式の場合（クライアントからはAPI経由で取得）
      if (!isConvexId) {
        try {
          const res = await fetch(`/api/customer/reservations/${reservationId}`)
          if (!res.ok) {
            if (res.status === 404) {
              toast.error('予約が見つかりません')
            } else if (res.status === 403) {
              toast.error('この予約にアクセスする権限がありません')
            } else if (res.status === 401) {
              toast.error('認証が必要です')
            } else {
              toast.error('予約の取得に失敗しました')
            }
            router.push(`/customer/${orgId}/${customerUid}/reservation`)
            return
          }

          const { reservation, detail } = await res.json()

          setReservationData({
            id: reservation.uid,
            _convex_id: reservation._convex_id,
            source: 'supabase',
            tenantId: reservation.tenant_id,
            orgId: reservation.org_id,
            customerUid: reservation.customer_uid || '',
            staffId: reservation.staff_id,
            customerName: reservation.customer_name,
            staffName: reservation.staff_name,
            status: reservation.status,
            paymentStatus: reservation.payment_status,
            date: reservation.date,
            startTimeUnix: Number(reservation.start_time_unix),
            endTimeUnix: Number(reservation.end_time_unix),
            createdAt: new Date(reservation.created_at),
            isFreeNomination: reservation.is_free_nomination || false,
            detail: detail
              ? {
                  menus: (detail.menus as ReservationMenu[]) || undefined,
                  options: (detail.options as ReservationOption[]) || undefined,
                  totalPrice: detail.total_price || undefined,
                  paymentMethod: detail.payment_method,
                  couponId: detail.coupon_id || undefined,
                  couponDiscount: detail.coupon_discount || undefined,
                  usePoints: detail.use_points || undefined,
                  notes: detail.notes || undefined,
                }
              : undefined,
            supabaseData: {
              reservation,
              detail,
            },
          })
        } catch (error) {
          console.error('[ReservationDetailPageClient] Error fetching reservation:', error)
          toast.error('予約の取得に失敗しました')
          router.push(`/customer/${orgId}/${customerUid}/reservation`)
        } finally {
          setIsLoading(false)
        }
      }
    }

    if (!isConvexId) {
      fetchReservationData()
    } else if (isConvexId && convexData !== undefined) {
      fetchReservationData()
    }
  }, [reservationId, customerUid, orgId, router, isConvexId, convexData])

  // ステータスの表示
  const getStatusDisplay = (
    status: ReservationStatus
  ): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
    switch (status) {
      case 'confirmed':
        return { label: '予約受付済み', variant: 'default' }
      case 'pending':
        return { label: '保留', variant: 'secondary' }
      case 'completed':
        return { label: '完了', variant: 'outline' }
      case 'cancelled':
        return { label: 'キャンセル', variant: 'destructive' }
      default:
        return { label: '不明', variant: 'outline' }
    }
  }

  // 支払いステータスの表示
  const getPaymentStatusDisplay = (
    status: ReservationPaymentStatus
  ): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
    switch (status) {
      case 'paid':
        return { label: '支払済', variant: 'default' }
      case 'pending':
        return { label: '未払', variant: 'secondary' }
      case 'cancelled':
        return { label: '返金済', variant: 'outline' }
      case 'failed':
        return { label: '失敗', variant: 'destructive' }
      default:
        return { label: '未設定', variant: 'outline' }
    }
  }

  // 支払い方法の表示
  const getPaymentMethodDisplay = (method: PaymentMethod): string => {
    switch (method) {
      case 'cash':
        return '現金'
      case 'credit_card':
        return 'クレジットカード'
      case 'all':
        return '店舗支払いのみ・クレジットカード'
      default:
        return '未設定'
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!reservationData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">予約が見つかりません</p>
        <Link href={`/customer/${orgId}/${customerUid}/reservation`}>
          <Button variant="outline" className="mt-4">
            予約一覧に戻る
          </Button>
        </Link>
      </div>
    )
  }

  const statusDisplay = getStatusDisplay(reservationData.status as ReservationStatus)
  const paymentStatusDisplay = getPaymentStatusDisplay(
    reservationData.paymentStatus as ReservationPaymentStatus
  )
  const totalPrice = reservationData.detail?.totalPrice || 0
  const couponDiscount = reservationData.detail?.couponDiscount || 0
  const usePoints = reservationData.detail?.usePoints || 0

  // キャンセル可能かどうかを判定
  const checkCancellable = () => {
    if (!reservationData || reservationData.status !== 'confirmed') {
      return { cancellable: false, reason: '予約受付済みの予約のみキャンセル可能です' }
    }

    const now = Date.now()
    const availableCancelDays = reservationConfig?.available_cancel_days || 1
    const cancelDeadline = cancelableDeadline(availableCancelDays, reservationData.startTimeUnix)

    if (now > cancelDeadline) {
      return {
        cancellable: false,
        reason: `キャンセルは予約日の${availableCancelDays}日前までとなります`,
        showPhone: true,
      }
    }

    return { cancellable: true }
  }

  const cancellability = checkCancellable()

  // キャンセル処理
  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      const response = await fetch('/api/customer/reservation/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservationId: reservationData.id,
          cancelReason: 'お客様都合によるキャンセル',
        }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'キャンセルに失敗しました')
      }

      toast.success('予約をキャンセルしました')
      setShowCancelDialog(false)

      // 予約一覧へ戻る
      router.push(`/customer/${orgId}/${customerUid}/reservation`)
    } catch (error) {
      console.error('Cancel error:', error)
      toast.error(error instanceof Error ? error.message : 'キャンセルに失敗しました')
    } finally {
      setIsCancelling(false)
    }
  }

  const menuPrice =
    reservationData.detail?.menus?.reduce((acc, menu) => acc + menu.price * menu.quantity, 0) || 0
  const optionPrice =
    reservationData.detail?.options?.reduce(
      (acc, option) => acc + option.price * option.quantity,
      0
    ) || 0
  const extraCharge = reservationData.isFreeNomination
    ? 0
    : reservationData.detail?.extraCharge || 0
  const subTotalPrice = menuPrice + optionPrice + extraCharge

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center space-x-4">
        <Link href={`/customer/${orgId}/${customerUid}/reservation`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-2xl font-bold text-primary">予約詳細</h2>
      </div>

      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>予約情報</span>
            <div className="flex items-center space-x-2">
              <Badge variant={statusDisplay.variant}>{statusDisplay.label}</Badge>
              <Badge variant={paymentStatusDisplay.variant}>{paymentStatusDisplay.label}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 日時 */}
          <div className="flex items-start space-x-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">予約日時</p>
              <p className="font-medium">
                {format(new Date(reservationData.startTimeUnix), 'yyyy年M月d日 (E)', {
                  locale: ja,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(reservationData.startTimeUnix), 'HH:mm')} -
                {format(new Date(reservationData.endTimeUnix), 'HH:mm')}
              </p>
            </div>
          </div>

          {/* スタッフ */}
          <div className="flex items-start space-x-3">
            <User className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">担当スタッフ</p>
              <p className="font-medium">
                {reservationData.isFreeNomination ? '指名フリー' : reservationData.staffName}
              </p>
            </div>
          </div>

          {/* 作成日時 */}
          <div className="flex items-start space-x-3">
            <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">予約作成日時</p>
              <p className="text-xs text-secondary-foreground">
                {format(reservationData.createdAt, 'yyyy年M月d日 HH:mm', { locale: ja })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* メニュー・オプション情報 */}
      {reservationData.detail && (
        <Card>
          <CardHeader>
            <CardTitle>施術内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* メニュー */}
            {reservationData.detail.menus && reservationData.detail.menus.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">メニュー</p>
                <div className="space-y-2">
                  {reservationData.detail.menus.map((menu, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>
                        {menu.name} × {menu.quantity}
                      </span>
                      <span>¥{(menu.price * menu.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* オプション */}
            {reservationData.detail.options && reservationData.detail.options.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">オプション</p>
                <div className="space-y-2">
                  {reservationData.detail.options.map((option, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span>
                        {option.name} × {option.quantity}
                      </span>
                      <span>¥{(option.price * option.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 備考 */}
            {reservationData.detail.notes && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">備考</p>
                <p className="text-primary">{reservationData.detail.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 料金情報 */}
      {reservationData.detail && totalPrice > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Receipt className="h-5 w-5" />
              <span>料金詳細</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">メニュー</span>
                  <span className="text-sm text-primary">¥{menuPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">オプション</span>
                  <span className="text-sm text-primary">¥{optionPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">指名料</span>
                  <span className="text-sm text-primary">
                    ¥{reservationData.isFreeNomination ? 0 : (extraCharge || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <span>小計</span>
                <span>¥{subTotalPrice.toLocaleString()}</span>
              </div>

              {couponDiscount > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>クーポン割引</span>
                  <span>-¥{couponDiscount.toLocaleString()}</span>
                </div>
              )}

              {usePoints > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>ポイント利用</span>
                  <span>-¥{usePoints.toLocaleString()}</span>
                </div>
              )}

              <Separator />

              <div className="flex justify-between font-bold text-lg">
                <span>合計</span>
                <span>¥{reservationData.detail?.totalPrice?.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>支払い方法</span>
                <span>
                  {getPaymentMethodDisplay(reservationData.detail.paymentMethod as PaymentMethod)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* キャンセルボタンまたは電話番号表示 */}
      {reservationData.status === 'confirmed' && (
        <Card>
          <CardContent className="pt-6">
            {cancellability.cancellable ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  予約日の{reservationConfig?.available_cancel_days || 1}日前までキャンセル可能です
                </p>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowCancelDialog(true)}
                >
                  予約をキャンセル
                  <X className="h-4 w-4 mr-2" />
                </Button>
              </div>
            ) : cancellability.showPhone ? (
              <div className="space-y-4">
                <div className="bg-destructive/10 rounded-lg p-4">
                  <p className="text-sm text-destructive font-medium mb-2">
                    {cancellability.reason}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    キャンセルをご希望の場合は、お電話にてご連絡ください。
                  </p>
                </div>
                {orgConfig?.config?.phone && (
                  <div className="flex items-center space-x-3 bg-muted rounded-lg p-4">
                    <Phone className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">お問い合わせ先</p>
                      <a
                        href={`tel:${orgConfig.config.phone}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {orgConfig.config.phone}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* キャンセル確認ダイアログ */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>以下の予約をキャンセルします。この操作は取り消せません。</p>
              <div className="bg-muted rounded-lg p-3 mt-3 space-y-1">
                <p className="font-medium">
                  {format(new Date(reservationData.startTimeUnix), 'yyyy年M月d日 (E)', {
                    locale: ja,
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(reservationData.startTimeUnix), 'HH:mm')} -
                  {format(new Date(reservationData.endTimeUnix), 'HH:mm')}
                </p>
                <p className="text-sm text-muted-foreground">担当: {reservationData.staffName}</p>
              </div>
              {(reservationData.detail?.paymentMethod === 'credit_card' || usePoints > 0) && (
                <div className="text-sm text-muted-foreground mt-3">
                  {reservationData.detail?.paymentMethod === 'credit_card' && (
                    <p>• クレジットカード決済の返金は3-5営業日かかります</p>
                  )}
                  {usePoints > 0 && <p>• 使用したポイント（{usePoints}pt）は返還されます</p>}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>いいえ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              disabled={isCancelling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isCancelling ? (
                <>
                  キャンセル中...
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                </>
              ) : (
                'キャンセル'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
