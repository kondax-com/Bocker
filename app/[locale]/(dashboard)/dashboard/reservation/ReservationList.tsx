'use client'

import { useState, useMemo, useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useOrganizationReservations } from '@/hooks/useOrganizationReservations'
import { useReservationExport } from '@/hooks/useReservationExport'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { ja, enUS, th } from 'date-fns/locale'
import { Calendar as CalendarIcon, User, DownloadIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { Shuffle, Loader2 } from 'lucide-react'
import { Loading } from '@/components/common'
import { useErrorHandler } from '@/hooks/useErrorHandler'

// 予約ステータスの表示設定
const statusConfig = {
  confirmed: { label: '予約受付済み', color: 'bg-accent-foreground' },
  pending: { label: '保留中', color: 'bg-warning-foreground' },
  completed: { label: '完了', color: 'bg-success-foreground' },
  cancelled: { label: 'キャンセル', color: 'bg-destructive' },
  refunded: { label: '返金済み', color: 'bg-muted' },
} as const

// 支払いステータスの表示設定
const paymentStatusConfig = {
  pending: { label: '未払い', color: 'bg-warning-foreground text-warning' },
  completed: { label: '支払済み', color: 'bg-success text-success-foreground' },
  paid: { label: '支払済み', color: 'bg-success text-success-foreground' },
  failed: { label: '失敗', color: 'bg-destructive text-destructive-foreground' },
  refunded: { label: '返金済み', color: 'bg-muted text-muted-foreground' },
} as const

export default function ReservationList() {
  const locale = useLocale()
  const dateFnsLocale = locale === 'ja' ? ja : locale === 'th' ? th : enUS
  const router = useRouter()
  const { tenantId, orgId, role } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedStaff, setSelectedStaff] = useState<string>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  // CSVエクスポート用のstate
  const [csvStatus, setCsvStatus] = useState('all')
  const [openCsvDialog, setOpenCsvDialog] = useState(false)

  // データ更新の状態管理
  const [isInterval, setIsInterval] = useState(false)
  const [intervalTime, setIntervalTime] = useState(10)

  // 実際の検索で使用する日付範囲（本日から1週間）
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekLater = new Date(today)
    weekLater.setDate(weekLater.getDate() + 6) // 7日後（本日含む）
    weekLater.setHours(23, 59, 59, 999)
    return {
      from: today,
      to: weekLater,
    }
  })

  // カレンダーで選択中の一時的な日付範囲
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange)

  // カレンダーポップオーバーの開閉状態を管理
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  // 日付範囲を文字列に変換
  const startDate = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined
  const endDate = dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined

  // CSVエクスポートフック
  const { exportToCsv, isExporting } = useReservationExport({
    tenantId: tenantId || '',
    orgId: orgId || '',
    status: csvStatus,
    startDate: startDate,
    endDate: endDate,
  })

  console.log('[ReservationCollection] Date range processing:', {
    dateRange,
    startDate,
    endDate,
    fromHours: dateRange?.from?.getHours(),
    fromMinutes: dateRange?.from?.getMinutes(),
    toHours: dateRange?.to?.getHours(),
    toMinutes: dateRange?.to?.getMinutes(),
  })

  // 日付範囲適用の処理
  const handleApplyDateRange = () => {
    // 単一日付が選択された場合、endDateも同じ日付に設定
    if (tempDateRange?.from && !tempDateRange?.to) {
      setDateRange({
        from: tempDateRange.from,
        to: tempDateRange.from,
      })
    } else {
      setDateRange(tempDateRange)
    }
    setIsCalendarOpen(false)
  }

  // 日付範囲リセットの処理（本日から1週間）
  const handleResetDateRange = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekLater = new Date(today)
    weekLater.setDate(weekLater.getDate() + 6) // 7日後（本日含む）
    weekLater.setHours(23, 59, 59, 999)
    const defaultRange = {
      from: today,
      to: weekLater,
    }
    setTempDateRange(defaultRange)
    setDateRange(defaultRange)
    setIsCalendarOpen(false)
  }

  // 組織レベルの予約データを取得
  const { reservations, isLoading, loadMore, hasMore } = useOrganizationReservations({
    tenantId: tenantId || '',
    orgId: orgId || '',
    status: selectedStatus,
    startDate,
    endDate,
    pageSize: 20,
  })

  console.log('[ReservationList] Reservations:', reservations)

  // スタッフリストを予約データから抽出
  const staffList = useMemo(() => {
    const uniqueStaff = reservations
      .map((r) => ({ id: r.staffId, name: r.staffName }))
      .filter(
        (staff, index, self) => staff.id && self.findIndex((s) => s.id === staff.id) === index
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return uniqueStaff
  }, [reservations])

  // 顧客リストを予約データから抽出
  const customerList = useMemo(() => {
    // 顧客IDでグループ化して最適な名前を選択
    const customerMap = new Map<string, string>()

    reservations.forEach((r) => {
      if (!r.customerUid || !r.customerName) return

      const currentName = customerMap.get(r.customerUid)

      // まだ名前が設定されていない場合は設定
      if (!currentName) {
        customerMap.set(r.customerUid, r.customerName)
        return
      }

      // 現在の名前がEmailでない場合は変更しない
      const isCurrentEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentName)
      if (!isCurrentEmail) return

      // 新しい名前がEmailでない場合は置き換える
      const isNewEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.customerName)
      if (!isNewEmail) {
        customerMap.set(r.customerUid, currentName + ' / ' + r.customerName)
      }
    })

    const uniqueCustomers = Array.from(customerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    console.log('[ReservationList] Unique customers:', uniqueCustomers)
    return uniqueCustomers
  }, [reservations])

  console.log('[ReservationList] Customer list:', customerList)

  // スタッフと顧客フィルターを適用した予約リスト
  const filteredReservations = useMemo(() => {
    let filtered = reservations

    // スタッフフィルター
    if (selectedStaff !== 'all') {
      filtered = filtered.filter((r) => r.staffId === selectedStaff)
    }

    // 顧客フィルター
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter((r) => r.customerUid === selectedCustomer)
    }

    return filtered
  }, [reservations, selectedStaff, selectedCustomer])

  // 予約行データをフォーマット
  const formatReservationDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return format(date, 'yyyy/MM/dd', { locale: dateFnsLocale })
  }

  const formatReservationTime = (startTimestamp: number, endTimestamp: number): string => {
    const startTime = format(new Date(startTimestamp), 'HH:mm')
    const endTime = format(new Date(endTimestamp), 'HH:mm')
    return `${startTime}-${endTime}`
  }

  // インターバル時間（ミリ秒）
  const REFRESH_INTERVAL = 10000 // 20秒

  // データ更新とインターバル制御
  const handleExportToCsv = useCallback(async () => {
    if (isExporting || isInterval) return

    try {
      await exportToCsv()
    } catch (err) {
      console.error('Refresh error:', err)
      showErrorToast(err)
    } finally {
      // インターバル開始
      setIsInterval(true)
      setOpenCsvDialog(false)
      setIntervalTime(REFRESH_INTERVAL / 1000)
      const interval = setInterval(() => {
        setIntervalTime((prev) => prev - 1)
      }, 1000)
      setTimeout(() => {
        setIsInterval(false)
        clearInterval(interval)
      }, REFRESH_INTERVAL)
    }
  }, [exportToCsv, isExporting, isInterval, showErrorToast])

  // ローディング表示
  if (isLoading && reservations.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">予約一覧</h1>
        <div className="space-y-4">
          <Loading />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="admin-toolbar justify-between">
        <div className="flex w-fit gap-2 items-end">
          <CardTitle className="text-sm font-medium">予約数</CardTitle>
          <div className="flex items-end gap-2 text-2xl font-semibold tabular-nums text-primary">
            {filteredReservations.length}{' '}
            <small className="text-sm text-muted-foreground">件</small>
          </div>
        </div>

        {(role === 'admin' || role === 'owner') && (
          <Dialog open={openCsvDialog} onOpenChange={setOpenCsvDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="min-h-11 gap-2 whitespace-normal text-left">
                <DownloadIcon className="h-4 w-4" />
                予約データをダウンロード
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>予約データCSV出力</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <p className="text-sm text-muted-foreground">
                  指定期間の予約データを全件CSVファイルでダウンロードで きます
                </p>
                <div>
                  {/* 選択中の日付範囲を表示 */}
                  {tempDateRange && tempDateRange.from && (
                    <div className="text-sm text-muted-foreground mb-2 font-bold">
                      選択中の期間: {format(tempDateRange.from, 'yyyy/MM/dd')} -{' '}
                      {tempDateRange.to ? format(tempDateRange.to, 'yyyy/MM/dd') : 'なし'}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="csv-status-filter">ステータス</Label>
                  <Select value={csvStatus} onValueChange={setCsvStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="ステータスを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべて</SelectItem>
                      <SelectItem value="confirmed">予約受付済み</SelectItem>
                      <SelectItem value="pending">保留中</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                      <SelectItem value="cancelled">キャンセル</SelectItem>
                      <SelectItem value="refunded">返金済み</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleExportToCsv}
                  disabled={isExporting || !startDate || !endDate || isInterval}
                  className="w-full"
                >
                  {isExporting || isInterval ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      インターバル中 残り
                      {intervalTime === 0 ? REFRESH_INTERVAL / 1000 : intervalTime}秒
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="h-4 w-4 mr-2" />
                      予約データをCSVでダウンロード
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* フィルター */}
      <Card className="admin-panel">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <label htmlFor="reservation-date-filter" className="text-sm font-medium mb-2 block">
                期間
              </label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    id="reservation-date-filter"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dateRange && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, 'yyyy/MM/dd')} -{' '}
                          {format(dateRange.to, 'yyyy/MM/dd')}
                        </>
                      ) : (
                        format(dateRange.from, 'yyyy/MM/dd')
                      )
                    ) : (
                      <span>期間を選択</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 " align="start">
                  <div className="p-3">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={tempDateRange?.from}
                      selected={tempDateRange}
                      onSelect={setTempDateRange}
                      numberOfMonths={2}
                      locale={dateFnsLocale}
                    />
                    <div className="flex justify-between pt-3 border-t gap-2">
                      <Button variant="outline" onClick={handleResetDateRange} size="sm">
                        リセット
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsCalendarOpen(false)}
                          size="sm"
                        >
                          キャンセル
                        </Button>
                        <Button onClick={handleApplyDateRange} size="sm">
                          適用
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="min-w-0 w-full">
              <label htmlFor="reservation-status-filter" className="text-sm font-medium mb-2 block">
                ステータス
              </label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger id="reservation-status-filter">
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="confirmed">予約受付済み</SelectItem>
                  <SelectItem value="pending">保留中</SelectItem>
                  <SelectItem value="completed">完了</SelectItem>
                  <SelectItem value="cancelled">キャンセル</SelectItem>
                  <SelectItem value="refunded">返金済み</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full">
              <label htmlFor="reservation-staff-filter" className="text-sm font-medium mb-2 block">
                担当スタッフ
              </label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger id="reservation-staff-filter">
                  <SelectValue placeholder="スタッフを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {staffList.map((staff) => (
                    <SelectItem key={staff.id || 'free'} value={staff.id || 'free'}>
                      {staff.name || '指名フリー'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 w-full">
              <label
                htmlFor="reservation-customer-filter"
                className="text-sm font-medium mb-2 block"
              >
                顧客名
              </label>
              <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                <SelectTrigger id="reservation-customer-filter">
                  <SelectValue placeholder="顧客を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  {customerList.map((customer) => (
                    <SelectItem key={customer.id || 'none'} value={customer.id || 'none'}>
                      {customer.name || '名前なし'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 予約一覧 */}
      <div className="admin-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">顧客名</TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                予約日時
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                担当スタッフ
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                ステータス
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">支払い</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  該当する予約が見つかりませんでした。
                </TableCell>
              </TableRow>
            ) : (
              filteredReservations.map((reservation) => (
                <TableRow
                  key={reservation.id}
                  className="hover:bg-secondary cursor-pointer"
                  onClick={() => router.push(`/dashboard/reservation/${reservation.id}`)}
                >
                  {/* 顧客名 */}
                  <TableCell className="font-medium px-4">
                    <span className="text-nowrap">{reservation.customerName}</span>
                  </TableCell>

                  {/* 予約日時 */}
                  <TableCell className="px-4">
                    <div className="text-sm">
                      <div className="font-medium">
                        {formatReservationDate(reservation.startTimeUnix)}
                      </div>
                      <div className="text-primary tabular-nums text-sm font-medium">
                        {formatReservationTime(reservation.startTimeUnix, reservation.endTimeUnix)}
                      </div>
                    </div>
                  </TableCell>

                  {/* 担当スタッフ */}
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2 text-sm">
                      {reservation.isFreeNomination ? (
                        <Shuffle
                          size={14}
                          className="min-w-6 min-h-6 text-link-foreground bg-link rounded-full p-1"
                        />
                      ) : (
                        <User
                          size={14}
                          className="text-muted-foreground bg-muted min-w-6 min-h-6 p-1 rounded-full"
                        />
                      )}
                      <p>{reservation.staffName}</p>
                    </div>
                  </TableCell>

                  {/* ステータス */}
                  <TableCell className="px-4">
                    <Badge
                      className={`${statusConfig[reservation.status as keyof typeof statusConfig]?.color || 'bg-muted'} text-nowrap`}
                    >
                      {statusConfig[reservation.status as keyof typeof statusConfig]?.label ||
                        reservation.status}
                    </Badge>
                  </TableCell>

                  {/* 支払いステータス */}
                  <TableCell className="px-4">
                    {reservation.paymentStatus ? (
                      <Badge
                        variant="outline"
                        className={`${
                          paymentStatusConfig[
                            reservation.paymentStatus as keyof typeof paymentStatusConfig
                          ]?.color || 'bg-muted-foreground'
                        }`}
                      >
                        <span className="text-nowrap px-2">
                          {' '}
                          {paymentStatusConfig[
                            reservation.paymentStatus as keyof typeof paymentStatusConfig
                          ]?.label || reservation.paymentStatus}
                        </span>
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* もっと読み込む */}
      {hasMore && (
        <div className="text-center py-4">
          <Button onClick={loadMore} disabled={isLoading} variant="outline">
            {isLoading ? 'Loading...' : 'もっと見る'}
          </Button>
        </div>
      )}
    </div>
  )
}
