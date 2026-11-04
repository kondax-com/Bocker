'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from 'convex/react'
import { Id } from '@/convex/_generated/dataModel'
import { api } from '@/convex/_generated/api'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CheckCircle2,
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  CalendarCheck,
  Scissors,
  CreditCard,
  Share2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Loading } from '@/components/common'

export default function CompletePage() {
  const searchParams = useSearchParams()
  const reservationId = searchParams.get('reservationId') as string
  const [progress, setProgress] = useState(0)
  const [showConfetti, setShowConfetti] = useState(true)

  const reservationWithDetail = useQuery(
    api.reservation.query.getWithDetailById,
    reservationId ? { id: reservationId as Id<'reservation'> } : 'skip'
  )
  const organizationConfig = useQuery(
    api.organization.config.query.findByTenantAndOrg,
    reservationWithDetail?.reservation?.org_id && reservationWithDetail?.reservation?.tenant_id
      ? {
          tenant_id: reservationWithDetail?.reservation?.tenant_id,
          org_id: reservationWithDetail?.reservation?.org_id,
        }
      : 'skip'
  )

  const reservationItems = useQuery(
    api.menu.query.getDisplayByIds,
    reservationWithDetail?.reservationDetail?.menus &&
      reservationWithDetail?.reservationDetail?.options
      ? {
          menu_ids: reservationWithDetail?.reservationDetail?.menus.map((menu) => menu.id),
          option_ids: reservationWithDetail?.reservationDetail?.options.map((option) => option.id),
        }
      : 'skip'
  )

  const staff = useQuery(
    api.staff.config.query.findByStaffId,
    reservationWithDetail?.reservation?.staff_id
      ? {
          tenant_id: reservationWithDetail?.reservation?.tenant_id,
          org_id: reservationWithDetail?.reservation?.org_id,
          staff_id: reservationWithDetail?.reservation?.staff_id as Id<'staff'>,
          skip_check: true,
        }
      : 'skip'
  )

  // プログレスバーのアニメーション
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(100)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  // 紙吹雪アニメーションを一定時間後に非表示
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowConfetti(false)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // カレンダーに追加する機能
  const addToCalendar = () => {
    if (!reservationWithDetail?.reservation) return

    const startDateTime = new Date(reservationWithDetail?.reservation?.start_time_unix ?? 0)
    const endDateTime = new Date(reservationWithDetail?.reservation?.end_time_unix ?? 0)

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      console.error(
        'Failed to create valid Date objects from timestamps for addToCalendar:',
        reservationWithDetail?.reservation?.start_time_unix,
        reservationWithDetail?.reservation?.end_time_unix
      )
      alert('日時の変換に失敗したため、カレンダーに追加できませんでした。')
      return
    }

    // Google カレンダー用のリンクを作成
    const text = `${reservationItems?.menus.map((menu) => menu.name).join(', ')} / ${organizationConfig?.org.org_name ?? ''}`
    const details = `予約ID: ${reservationWithDetail?.reservation?._id}\nメニュー: ${reservationItems?.menus.map((menu) => menu.name).join(', ')}\n料金: ${reservationWithDetail?.reservationDetail?.total_price ? reservationWithDetail?.reservationDetail?.total_price.toLocaleString() : '0円'}\nスタッフ: ${reservationWithDetail?.reservation?.staff_name}\n開始時間: ${formatTimeJP(reservationWithDetail?.reservation?.start_time_unix)}\n終了時間: ${formatTimeJP(reservationWithDetail?.reservation?.end_time_unix)}`

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      text
    )}&dates=${format(startDateTime, "yyyyMMdd'T'HHmmss")}/${format(
      endDateTime,
      "yyyyMMdd'T'HHmmss"
    )}&details=${encodeURIComponent(details)}&sf=true&output=xml`

    window.open(googleCalendarUrl, '_blank')
  }

  // 予約詳細のシェア機能
  const shareReservation = () => {
    if (!reservationWithDetail?.reservation) return

    const shareText = `${organizationConfig?.org.org_name}に${reservationWithDetail?.reservation?.start_time_unix ? format(new Date(reservationWithDetail.reservation.start_time_unix), 'M月d日', { locale: ja }) : '未定'}の${reservationWithDetail?.reservation?.end_time_unix ? format(new Date(reservationWithDetail?.reservation?.end_time_unix), 'HH:mm', { locale: ja }) : '不明'}から予約しました！!\nメニューは${reservationItems?.menus.map((menu) => menu.name).join(', ')}です。${reservationWithDetail?.reservation?.staff_name}が担当します。料金は${reservationWithDetail?.reservationDetail?.total_price ? reservationWithDetail?.reservationDetail?.total_price.toLocaleString() : '0'}円です。`

    if (navigator.share) {
      navigator
        .share({
          title: `${organizationConfig?.org.org_name}の予約完了`,
          text: shareText,
        })
        .catch(console.error)
    } else {
      // モバイルの場合はコピーする
      navigator.clipboard
        .writeText(shareText)
        .then(() => alert('予約情報をクリップボードにコピーしました'))
        .catch(console.error)
    }
  }

  // 紙吹雪アニメーションの粒子
  const Confetti = () => {
    return (
      <div className="fixed inset-0 pointer-events-none z-50">
        {Array.from({ length: 100 }).map((_, i) => {
          const size = Math.random() * 8 + 5
          const colors = ['hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--destructive))']
          const color = colors[Math.floor(Math.random() * colors.length)]
          const left = Math.random() * 100
          const animationDuration = Math.random() * 3 + 2
          const delay = Math.random() * 0.5

          return (
            <motion.div
              key={i}
              className="fixed rounded-full"
              style={{
                width: size,
                height: size,
                top: -20,
                left: `${left}%`,
                backgroundColor: color,
              }}
              initial={{ y: -20, opacity: 1 }}
              animate={{
                y: window.innerHeight + 20,
                opacity: 0,
                rotate: Math.random() * 360,
              }}
              transition={{
                duration: animationDuration,
                delay: delay,
                ease: [0.1, 0.25, 0.75, 1],
              }}
            />
          )
        })}
      </div>
    )
  }

  // 日付フォーマット関数
  const formatDateJP = (timestamp: number | undefined | null) => {
    if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
      return '日付不明' // または適切なエラーメッセージ、空文字など
    }
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      // new Date(timestamp) が Invalid Date を返した場合のチェック
      return '日付形式エラー'
    }
    return format(date, 'yyyy年MM月dd日(E)', { locale: ja })
  }

  // 時間フォーマット関数 (新規追加)
  const formatTimeJP = (timestamp: number | undefined | null) => {
    if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
      return '時間不明'
    }
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return '時間形式エラー'
    }
    return format(date, 'HH:mm', { locale: ja })
  }

  // メインのアニメーション定義
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  }

  if (!reservationId || reservationWithDetail === null) {
    return (
      <div className="container mx-auto px-4 py-12 text-center" role="status">
        <p>予約が見つかりません</p>
      </div>
    )
  }

  // reservationデータがロードされるまでローディング表示
  // フリー指名の場合はstaffチェックを無視
  const isStaffLoading = reservationWithDetail?.reservation?.staff_id && !staff
  if (!reservationWithDetail || !organizationConfig || !reservationItems || isStaffLoading) {
    return <Loading />
  }

  const menuTotal = reservationItems?.menus.reduce(
    (acc, menu) => acc + (menu.sale_price ?? menu.unit_price ?? 0),
    0
  )
  const optionTotal = reservationItems?.options.reduce(
    (acc, option) => acc + (option.sale_price ?? option.unit_price ?? 0),
    0
  )
  const staffTotal = reservationWithDetail?.reservation?.is_free_nomination
    ? 0
    : (staff?.extra_charge ?? 0)
  const subTotal = menuTotal + optionTotal + staffTotal

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      {/* 紙吹雪アニメーション */}
      <AnimatePresence>{showConfetti && <Confetti />}</AnimatePresence>

      <motion.div
        className="w-full max-w-2xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* 成功メッセージカード */}
        <motion.div>
          <Card className="mb-6 bg-background shadow-lg border-border overflow-hidden">
            <CardHeader className="bg-neon-foreground pb-4">
              <div className="flex justify-center mb-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 260,
                    damping: 20,
                    delay: 0.2,
                  }}
                  className="bg-neon-foreground p-3 rounded-full"
                >
                  <CheckCircle2 className="h-10 w-10 text-accent-2" />
                </motion.div>
              </div>
              <CardTitle className="text-center text-xl sm:text-2xl text-primary">
                予約が完了しました
              </CardTitle>
              <CardDescription className="text-center text-muted-foreground">
                メールアドレスまたはLine宛に予約完了のメッセージを送信しましたのでご確認ください。
              </CardDescription>
              <div className="mt-4">
                <Progress value={progress} className="h-2" />
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* 日時情報 */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="bg-neon-foreground py-3 px-4 rounded-t-xl">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    予約日時
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">予約日</span>
                    </div>
                    <span className="font-medium text-accent-2">
                      {formatDateJP(reservationWithDetail?.reservation?.start_time_unix)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">時間</span>
                    </div>
                    <span className="font-medium text-accent-2">
                      {formatTimeJP(reservationWithDetail?.reservation?.start_time_unix)} 〜{' '}
                      {formatTimeJP(reservationWithDetail?.reservation?.end_time_unix)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* メニュー・担当者情報 */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="bg-neon-foreground py-3 px-4 rounded-t-xl">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <Scissors className="h-4 w-4" />
                    予約内容
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {/* メニュー表示 */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Scissors className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-muted-foreground">メニュー</span>
                    </div>
                    {reservationItems?.menus && reservationItems.menus.length > 0 ? (
                      reservationItems.menus.map((menu, index) => (
                        <div
                          key={`menu-${index}`}
                          className="flex justify-between items-start w-full"
                        >
                          <span className="text-sm text-primary flex-1 w-3/5 text-clip">
                            {menu.name}
                          </span>
                          <span className="text-sm text-muted-foreground w-2/5 text-right text-clip">
                            ¥
                            {typeof (menu.sale_price ?? menu.unit_price) === 'number'
                              ? (menu.sale_price ?? menu.unit_price)?.toLocaleString()
                              : '価格未定'}
                            {menu.duration_min != null && ` / ${menu.duration_min}分`}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">メニュー情報なし</p>
                    )}
                  </div>

                  {/* オプション表示 */}
                  {reservationItems?.options && reservationItems.options.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <div className="flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted-foreground">
                          オプション
                        </span>
                      </div>
                      {reservationItems.options.map((option, index) => (
                        <div
                          key={`option-${index}`}
                          className="flex justify-between items-start w-full"
                        >
                          <span className="text-sm text-primary flex-1 mr-2 text-clip w-3/5">
                            {option.name}
                          </span>
                          <span className="text-sm text-muted-foreground w-2/5 text-right text-clip">
                            ¥
                            {typeof (option.sale_price ?? option.unit_price) === 'number'
                              ? (option.sale_price ?? option.unit_price)?.toLocaleString()
                              : '価格未定'}
                            {option.duration_min != null &&
                              option.duration_min !== 0 &&
                              ` / ${option.duration_min}分`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 担当スタッフ */}
                  <div className="pt-2">
                    {' '}
                    {/* Added pt-2 for spacing */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted-foreground">
                          担当スタッフ
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center w-full space-y-2">
                      <span className="text-clip text-sm w-3/5">
                        {reservationWithDetail?.reservation?.is_free_nomination
                          ? '指名フリー'
                          : (reservationWithDetail?.reservation?.staff_name ?? '未指定')}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground text-right w-2/5 text-clip">
                        <span className="text-xs">指名料</span> /
                        {reservationWithDetail?.reservation?.is_free_nomination
                          ? '0円'
                          : staff?.extra_charge
                            ? `¥${staff.extra_charge.toLocaleString()}`
                            : '0円'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 料金情報 */}
              <Card className="border border-accent-2 shadow-sm">
                <CardHeader className="bg-accent-2-foreground py-3 px-4 rounded-t-xl">
                  <CardTitle className="text-sm flex items-center gap-2 text-accent-2">
                    <CreditCard className="h-4 w-4" />
                    料金
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">メニュー料金</span>
                    <span className="font-medium text-primary">¥{menuTotal.toLocaleString()}</span>
                  </div>
                  {reservationItems?.options && reservationItems.options.length > 0 && (
                    <>
                      <Separator className="my-2" />
                      {reservationItems.options.map((option, index) => (
                        <div key={index} className="flex justify-between items-center mt-2">
                          <span className="text-sm text-muted-foreground">オプション</span>
                          <span className="font-medium text-primary">
                            ¥{optionTotal.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {!reservationWithDetail?.reservation?.is_free_nomination &&
                  staff?.extra_charge &&
                  staff.extra_charge > 0 ? (
                    <div>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-muted-foreground">指名料金</span>
                        <span className="font-medium text-primary">
                          ¥{staff.extra_charge.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-muted-foreground">小計</span>
                      <span className="text-muted-foreground">¥{subTotal.toLocaleString()}</span>
                    </div>
                  </div>
                  {typeof reservationWithDetail?.reservationDetail?.use_points === 'number' &&
                  reservationWithDetail?.reservationDetail?.use_points > 0 ? (
                    <>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-accent-2">ポイント使用</span>
                        <span className="font-medium text-accent-2">
                          - ¥{reservationWithDetail?.reservationDetail?.use_points.toLocaleString()}
                        </span>
                      </div>
                    </>
                  ) : null}
                  {typeof reservationWithDetail?.reservationDetail?.coupon_discount === 'number' &&
                  reservationWithDetail?.reservationDetail?.coupon_discount > 0 ? (
                    <>
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-accent-2">クーポン割引</span>
                        <span className="font-medium text-accent-2">
                          - ¥
                          {reservationWithDetail?.reservationDetail?.coupon_discount.toLocaleString()}
                        </span>
                      </div>
                    </>
                  ) : null}

                  <div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-muted-foreground">合計</span>
                      <span className="font-bold text-xl text-accent-2">
                        ¥{reservationWithDetail?.reservationDetail?.total_price?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* サロン情報 */}
              <Accordion type="multiple" className="border rounded-lg">
                <AccordionItem value="salon-info">
                  <AccordionTrigger className="px-4 py-3">
                    <div className="flex items-baseline gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">
                        {organizationConfig?.org.org_name}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm text-muted-foreground">
                          {organizationConfig?.config?.address}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`tel:${organizationConfig?.config?.phone}`}
                          className="text-sm text-link-foreground hover:underline"
                        >
                          {organizationConfig?.config?.phone}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={`mailto:${organizationConfig?.org?.org_email}`}
                          className="text-sm text-link-foreground hover:underline"
                        >
                          {organizationConfig?.org?.org_email}
                        </a>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>

            <CardFooter className="p-6 pt-2 gap-3 flex-col sm:flex-row">
              <Button
                className="w-full"
                onClick={addToCalendar}
                disabled={!reservationWithDetail?.reservation}
              >
                <CalendarCheck className="mr-2 h-4 w-4" />
                Googleカレンダーに追加
              </Button>
              <div className="flex gap-2 w-full">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={shareReservation}
                        disabled={!reservationWithDetail?.reservation}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>予約を共有</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  )
}
