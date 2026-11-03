'use client'

import { DashboardSection } from '@/components/common' // Assuming this is your layout component
import { useParams } from 'next/navigation'
import { Loading } from '@/components/common' // Assuming this is your loading component
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip' // For displaying full IDs on hover
import { ScrollArea } from '@/components/ui/scroll-area' // For potentially long notes
import {
  Phone,
  User,
  Tag,
  CalendarDays,
  Info,
  Cake,
  NotebookPen,
  History,
  Mail,
} from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import type { RowType } from '@/services/supabase/SupabaseService'
import { toast } from 'sonner'
import { useTranslations, useLocale } from 'next-intl'

// Import date formatting library
import { formatDate } from '@/lib/schedules'
import type { SupportedLocale } from '@/lib/dateLocale'

// Import point transaction repository
import { PointTransactionRepository } from '@/services/supabase/repositories/point/PointTransactionRepository'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Coins, TrendingUp, TrendingDown } from 'lucide-react'

// 完全な顧客データの型定義
type CompleteCustomerData = {
  customer: RowType<'customer'> | null
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

// ポイント取引履歴の型定義
type PointTransaction = RowType<'point_transaction'>

// Define the CustomerDetailPage component
function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { tenantId, orgId, role, isLoaded } = useTenantAndOrganization()
  const customerUid = params.customer_uid as string
  const t = useTranslations('customers')
  const tCommon = useTranslations('common')
  const locale = useLocale() as SupportedLocale

  // 状態管理
  const [completeCustomer, setCompleteCustomer] = useState<CompleteCustomerData | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [pointTransactions, setPointTransactions] = useState<PointTransaction[]>([])
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false)
  const [showTransactions, setShowTransactions] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false)
  const [selectedCustomerUid, setSelectedCustomerUid] = useState<string | null>(null)
  const customerRepo = useMemo(() => new CustomerRepository(), [])
  const pointTransactionRepo = useMemo(() => new PointTransactionRepository(), [])

  // Date formatting states
  const [formattedCreationTime, setFormattedCreationTime] = useState('')
  const [formattedBirthday, setFormattedBirthday] = useState('')
  const [formattedLastReservationDate, setFormattedLastReservationDate] = useState('')

  // 顧客データを取得
  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!tenantId || !orgId || !customerUid || !isLoaded) {
        return
      }

      try {
        setIsLoadingData(true)
        const data = await customerRepo.getCompleteCustomerData(customerUid, tenantId, orgId)
        setCompleteCustomer(data)

        if (!data.customer) {
          toast.error(t('customerNotFound'))
        }
      } catch (error) {
        console.error('顧客データの取得に失敗しました:', error)
        toast.error(t('fetchError'))
      } finally {
        setIsLoadingData(false)
      }
    }

    fetchCustomerData()
  }, [tenantId, orgId, customerUid, isLoaded, customerRepo, t])

  // ポイント取引履歴を取得
  const fetchPointTransactions = async () => {
    if (!tenantId || !orgId || !customerUid) {
      return
    }

    try {
      setIsLoadingTransactions(true)
      const { data } = await pointTransactionRepo.findByCustomer(tenantId, orgId, customerUid, {
        page: 1,
        pageSize: 50,
      })
      setPointTransactions(data)
    } catch (error) {
      console.error('ポイント取引履歴の取得に失敗しました:', error)
      toast.error(t('fetchTransactionError'))
    } finally {
      setIsLoadingTransactions(false)
    }
  }

  // 削除モーダルを表示
  const handleShowDeleteModal = (e: React.MouseEvent<HTMLButtonElement>, customerUid: string) => {
    e.preventDefault()
    setSelectedCustomerUid(customerUid)
    setShowDeleteModal(true)
  }

  // 顧客削除処理
  const handleDeleteCustomer = async (customerUid: string) => {
    try {
      await customerRepo.deleteWithRelatedData(customerUid)
      toast.success(t('customerDeleted'))
      setShowDeleteModal(false)
      setSelectedCustomerUid(null)
      router.push('/dashboard/customer')
    } catch (error) {
      console.error('Failed to delete customer:', error)
      toast.error(t('deleteError'))
    }
  }

  // ポイント履歴表示をトグル
  const toggleTransactionHistory = () => {
    if (!showTransactions && pointTransactions.length === 0) {
      fetchPointTransactions()
    }
    setShowTransactions(!showTransactions)
  }

  // Date formatting
  useEffect(() => {
    const formatDates = async () => {
      if (completeCustomer?.customer?.created_at) {
        const formatted = await formatDate(
          new Date(completeCustomer.customer.created_at),
          'PPP p',
          locale
        )
        setFormattedCreationTime(formatted)
      } else {
        setFormattedCreationTime(t('unknown'))
      }

      if (completeCustomer?.customerDetail?.birthday) {
        const formatted = await formatDate(
          new Date(completeCustomer.customerDetail.birthday),
          'PPP',
          locale
        )
        setFormattedBirthday(formatted)
      } else {
        setFormattedBirthday(t('notRegistered'))
      }

      if (completeCustomer?.customer?.last_reservation_date_unix) {
        const formatted = await formatDate(
          new Date(completeCustomer.customer.last_reservation_date_unix * 1000),
          'PPP p',
          locale
        )
        setFormattedLastReservationDate(formatted)
      } else {
        setFormattedLastReservationDate(t('noReservationHistory'))
      }
    }

    formatDates()
  }, [completeCustomer, locale, t])

  // ローディング状態の表示
  if (!isLoaded || isLoadingData || !completeCustomer || !completeCustomer.customer) {
    return <Loading />
  }

  return (
    // Use the existing DashboardSection for consistent layout
    <DashboardSection
      title={t('customerDetails')}
      backLink="/dashboard/customer"
      backLinkTitle={t('list')}
      infoBtn={
        role === 'admin' || role === 'owner' || role === 'manager'
          ? {
              text: t('edit'),
              link: `/dashboard/customer/${customerUid}/edit`,
            }
          : undefined
      }
    >
      <div className="min-w-0 pb-4">
        <div className="space-y-6">
          <div className="admin-panel overflow-hidden">
            <div className="p-4 md:p-8">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-3">
                  <div className="p-2 rounded-lg bg-primary">
                    <User className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{t('basicInfo')}</h2>
                  {completeCustomer.customer.line_user_name && (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-accent-2 text-accent-2 bg-accent-2-foreground px-3 py-1 text-sm font-medium"
                      >
                        LINE: {completeCustomer.customer.line_user_name}
                      </Badge>
                    </div>
                  )}
                </div>
                {(role === 'admin' || role === 'owner' || role === 'manager') && (
                  <div className="flex items-center justify-end w-fit gap-2">
                    <Button
                      onClick={(e) => handleShowDeleteModal(e, customerUid)}
                      variant="destructive"
                      size="sm"
                      className="text-xs"
                    >
                      {t('delete')}
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('lastName')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customer.last_name || t('notRegistered')}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('firstName')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customer.first_name || t('notRegistered')}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('phone')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customer.phone || t('notRegistered')}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('email')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customer.email || t('notRegistered')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="admin-panel overflow-hidden">
            <div className="p-4 md:p-8">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-palette-1">
                  <NotebookPen className="h-5 w-5 text-primary-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{t('additionalInfo')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <Cake className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('birthday')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {formattedBirthday}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('age')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customerDetail?.birthday
                        ? new Date().getFullYear() -
                          new Date(completeCustomer.customerDetail.birthday).getFullYear() +
                          ' ' +
                          t('age_suffix')
                        : t('notRegistered')}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('gender')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {completeCustomer.customerDetail?.gender === 'male'
                        ? t('male')
                        : completeCustomer.customerDetail?.gender === 'female'
                          ? t('female')
                          : t('unselected')}
                    </p>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2 md:space-y-3">
                  <div className="flex items-center gap-2">
                    <NotebookPen className="h-4 w-4 text-muted-foreground" />
                    <h3 className="break-words text-sm font-medium text-foreground uppercase tracking-wide">
                      {t('notes')}
                    </h3>
                  </div>
                  {completeCustomer.customerDetail?.notes ? (
                    <div className="p-4 rounded-lg bg-secondary border border-border">
                      <ScrollArea className="h-24 w-full">
                        <p className="text-sm text-primary leading-relaxed">
                          {completeCustomer.customerDetail.notes}
                        </p>
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-muted border border-border">
                      <p className="text-sm text-muted-foreground italic">{t('noNotes')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="admin-panel overflow-hidden">
            <div className="p-4 md:p-8">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-palette-2">
                  <History className="h-5 w-5 text-primary-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{t('usageInfo')}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('lastVisit')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {formattedLastReservationDate}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-4">
                  <div className="p-2 rounded-lg bg-muted">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('visitCount')}
                    </p>
                    <p className="break-words text-sm font-medium text-foreground">
                      {t('visitCountValue', {
                        count: completeCustomer.customer.total_reservation_count || 0,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-panel overflow-hidden">
            <div className="p-4 md:p-8">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-palette-4">
                  <Tag className="h-5 w-5 text-primary-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{t('tags')}</h2>
              </div>
              {completeCustomer.customer.tags && completeCustomer.customer.tags.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {completeCustomer.customer.tags.map((tag: string, index: number) => (
                    <Badge
                      key={`${tag}-${index}`}
                      variant="outline"
                      className="px-3 py-2 text-sm font-medium bg-accent-2 text-accent-2-foreground border-accent-2"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-2 md:p-4 rounded-lg bg-muted border border-border">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('noTags')}</p>
                </div>
              )}
            </div>
          </div>
          {/* --- End Tags Section --- */}

          <div className="admin-panel overflow-hidden">
            <div className="p-4 md:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-palette-5">
                      <Coins className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">{t('pointHistory')}</h2>
                  </div>
                  <div className="flex items-center justify-start  w-full">
                    <div className="text-right flex items-center gap-2">
                      <Coins className="h-6 w-6 text-palette-3-foreground" />

                      <p className="text-2xl font-bold text-palette-3-foreground">
                        {completeCustomer.customerPoints?.total_points ?? 0}
                      </p>
                      <small className="text-xs font-bold text-palette-3-foreground uppercase tracking-wide">
                        P
                      </small>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={toggleTransactionHistory}
                  disabled={isLoadingTransactions}
                  className="transition-colors duration-200"
                >
                  {showTransactions ? t('hideHistory') : t('showHistory')}
                </Button>
              </div>

              {showTransactions && (
                <div className="rounded-xl border border-border overflow-hidden">
                  {isLoadingTransactions ? (
                    <div className="p-4 md:p-6 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto md:mb-4" />
                      <p className="text-sm text-muted-foreground">{t('loadingTransactions')}</p>
                    </div>
                  ) : pointTransactions.length === 0 ? (
                    <div className="p-4 md:p-6 text-center">
                      <Coins className="h-8 md:h-12 w-8 md:w-12 text-muted-foreground mx-auto md:mb-4" />
                      <p className="text-sm text-muted-foreground">{t('noTransactions')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted">
                            <TableHead className="font-semibold text-primary">
                              {t('transactionDate')}
                            </TableHead>
                            <TableHead className="font-semibold text-primary">
                              {t('transactionType')}
                            </TableHead>
                            <TableHead className="font-semibold text-primary">
                              {t('description')}
                            </TableHead>
                            <TableHead className="text-right font-semibold text-primary">
                              {t('points')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pointTransactions.map((transaction) => (
                            <TableRow
                              key={transaction.id}
                              className="hover:bg-muted transition-colors"
                            >
                              <TableCell className="font-medium">
                                {transaction.transaction_date_unix
                                  ? new Date(
                                      transaction.transaction_date_unix * 1000
                                    ).toLocaleString(locale)
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {transaction.points && transaction.points > 0 ? (
                                    <>
                                      <div className="p-1 rounded-full bg-success">
                                        <TrendingUp className="h-3 w-3 text-success-foreground" />
                                      </div>
                                      <span className="text-success-foreground font-medium">
                                        {t('earned')}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <div className="p-1 rounded-full bg-destructive">
                                        <TrendingDown className="h-3 w-3 text-destructive-foreground" />
                                      </div>
                                      <span className="text-destructive font-medium">
                                        {transaction.transaction_type === 'manual_subtract'
                                          ? t('manualSubtract')
                                          : t('used')}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {transaction.description || '-'}
                              </TableCell>
                              <TableCell className="text-right font-bold">
                                {transaction.points && transaction.points > 0 ? (
                                  <span className="text-success-foreground text-lg">
                                    +{transaction.points}
                                  </span>
                                ) : (
                                  <span className="text-destructive text-lg">
                                    {transaction.points}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="md:px-4 space-y-6">
          <div className="p-4 md:p-6 ">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                    {t('registrationDate')}
                  </p>
                  <p className="break-words text-sm font-medium text-foreground">
                    {formattedCreationTime}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                    {t('customerId')}
                  </p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm font-mono text-primary underline cursor-help">
                          {completeCustomer.customer.uid.substring(0, 8)}...
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">{completeCustomer.customer.uid}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showDeleteModal && selectedCustomerUid && (
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('confirmDelete')}</DialogTitle>
              <DialogDescription>{t('deleteWarning')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteCustomer(selectedCustomerUid)}
              >
                {tCommon('delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardSection>
  )
}

export default CustomerDetailPage
