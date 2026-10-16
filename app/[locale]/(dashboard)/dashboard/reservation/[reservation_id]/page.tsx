'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useReservationData } from '@/hooks/useOrganizationReservations'
import { Loading } from '@/components/common'
import { DashboardSection } from '@/components/common'
import type { RowType } from '@/services/supabase/SupabaseService'
import { format } from 'date-fns'
import type { Gender, SubscriptionPlanName } from '@/convex/types'
import { Separator } from '@/components/ui/separator'
import {
  convertReservationStatus,
  ReservationStatus,
  convertPaymentMethod,
  convertPaymentStatus,
  PaymentMethod,
  convertGender,
} from '@/convex/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { RESERVATION_STATUS_VALUES } from '@/convex/types'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { CustomerRepository } from '@/services/supabase/repositories/customer'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'

const statusColorMap = {
  confirmed: 'bg-success border border-success-foreground text-success-foreground',
  cancelled: 'bg-muted border border-muted-foreground text-muted-foreground',
  pending: 'bg-warning border border-warning-foreground text-warning-foreground',
  completed: 'bg-primary border border-primary-foreground text-primary-foreground',
  refunded: 'bg-destructive border border-destructive-foreground text-destructive-foreground',
}

const paymentStatusColorMap = {
  paid: 'bg-success-foreground !text-success border border-success',
  pending: 'bg-warning !text-warning-foreground border border-warning-foreground',
  refunded: 'bg-destructive !text-destructive-foreground border border-destructive',
  cancelled: 'bg-muted !text-muted-foreground border border-muted',
  completed: 'bg-primary !text-primary-foreground border border-primary-foreground',
}

export default function ReservationPage() {
  const { reservation_id } = useParams()
  const { showErrorToast } = useErrorHandler()
  const router = useRouter()
  const t = useTranslations('reservationDetail')
  const { planName } = useTenantAndOrganization()
  const commonT = useTranslations('common')
  const [isUpdateStatusModalOpen, setIsUpdateStatusModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isStaffChangeModalOpen, setIsStaffChangeModalOpen] = useState(false)
  const [selectedNewStaffId, setSelectedNewStaffId] = useState<Id<'staff'> | null>(null)
  const [isChangingStaff, setIsChangingStaff] = useState(false)

  const [customerData, setCustomerData] = useState<{
    customer: RowType<'customer'> | null
    customerDetail: RowType<'customer_detail'> | null
    customerPoints: RowType<'customer_points'> | null
  } | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)

  const { data: reservationData, loading: reservationLoading } = useReservationData(
    reservation_id as string
  )

  const [status, setStatus] = useState<ReservationStatus>(
    reservationData?.status as ReservationStatus
  )
  const [isStatusInitialized, setIsStatusInitialized] = useState(false)
  const manageReservation = useMutation(api.reservation.manage.handleReservationManage)
  const deleteReservation = useMutation(api.reservation.mutation.kill)
  const changeStaff = useMutation(api.reservation.mutation.changeStaffForFreeNomination)

  const reservationMenuDetails = useQuery(
    api.menu.query.getDisplayByIds,
    reservationData && reservationData.detail && reservationData.source === 'convex'
      ? {
          menu_ids: (reservationData.detail.menus?.map((menu) => menu.id) as Id<'menu'>[]) || [],
          option_ids:
            (reservationData.detail.options?.map((option) => option.id) as Id<'option'>[]) || [],
        }
      : 'skip'
  )

  // 利用可能なスタッフ一覧を取得（スタッフ変更用）
  const availableStaffsData = useQuery(
    api.staff.query.list,
    reservationData?.isFreeNomination &&
      reservationData.source === 'convex' &&
      reservationData.convexData
      ? {
          tenant_id: reservationData.convexData.tenant_id as Id<'tenant'>,
          org_id: reservationData.convexData.org_id as Id<'organization'>,
          planName: planName as SubscriptionPlanName,
        }
      : 'skip'
  )

  const availableStaffs = availableStaffsData || []

  // 通常の指名スタッフ情報を取得（指名フリーでstaff_idが設定されている場合も含む）
  const staff = useQuery(
    api.staff.query.getRelatedTables,
    reservationData?.staffId &&
      reservationData.source === 'convex' &&
      reservationData.convexData &&
      (!reservationData?.isFreeNomination ||
        (reservationData?.isFreeNomination && !reservationData?.convexData?.assigned_staff_id))
      ? {
          tenant_id: reservationData.convexData.tenant_id as Id<'tenant'>,
          org_id: reservationData.convexData.org_id as Id<'organization'>,
          staff_id: reservationData.convexData.staff_id as Id<'staff'>,
        }
      : 'skip'
  )

  // 指名フリーの場合の割り当てスタッフ情報を取得
  const assignedStaff = useQuery(
    api.staff.query.getRelatedTables,
    reservationData?.isFreeNomination &&
      reservationData.source === 'convex' &&
      reservationData.convexData?.assigned_staff_id
      ? {
          tenant_id: reservationData.convexData.tenant_id as Id<'tenant'>,
          org_id: reservationData.convexData.org_id as Id<'organization'>,
          staff_id: reservationData.convexData.assigned_staff_id as Id<'staff'>,
        }
      : 'skip'
  )

  useEffect(() => {
    if (reservationData && !isStatusInitialized) {
      setStatus(reservationData.status as ReservationStatus)
      setIsStatusInitialized(true)
    }
  }, [reservationData, isStatusInitialized])

  useEffect(() => {
    async function fetchCustomerData() {
      if (!reservationData?.customerUid) {
        return
      }

      setCustomerLoading(true)
      setCustomerError(null)

      try {
        const customerRepository = new CustomerRepository()
        const data = await customerRepository.getCompleteCustomerData(
          reservationData.customerUid,
          reservationData.tenantId,
          reservationData.orgId
        )
        setCustomerData(data)
      } catch (error) {
        console.error('Failed to fetch customer data:', error)
        setCustomerError(t('errors.fetchCustomerData'))
      } finally {
        setCustomerLoading(false)
      }
    }

    fetchCustomerData()
  }, [reservationData?.customerUid, reservationData?.tenantId, reservationData?.orgId, t])

  // ローディング条件を指名フリー予約に対応
  const shouldShowLoading = () => {
    // 基本データがない場合
    if (reservationLoading || !reservationData) {
      return true
    }

    // Convexデータの場合のみメニュー詳細を待つ
    if (reservationData.source === 'convex' && !reservationMenuDetails) {
      return true
    }

    // 指名フリー予約の場合
    if (reservationData.isFreeNomination && reservationData.source === 'convex') {
      // assigned_staff_idがある場合はassignedStaffのデータを待つ
      if (reservationData.convexData?.assigned_staff_id && !assignedStaff) {
        return true
      }
      // staff_idがあるがassigned_staff_idがない場合は、staffデータを確認
      if (
        !reservationData.convexData?.assigned_staff_id &&
        reservationData.convexData?.staff_id &&
        !staff
      ) {
        return true
      }
      // どちらもない場合はスタッフ未割り当てなのでLoading不要
      return false
    }

    // 通常の指名予約の場合
    if (reservationData.source === 'convex' && reservationData.staffId && !staff) {
      return true
    }

    return false
  }

  if (shouldShowLoading()) {
    return <Loading />
  }

  const formatUnixTimestamp = (unixTimestamp: number) => {
    return format(new Date(unixTimestamp), 'yyyy年MM月dd日 HH:mm')
  }

  const handleShowUpdateStatusModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsUpdateStatusModalOpen(true)
  }

  const handleUpdateStatus = async () => {
    try {
      if (!reservationData || reservationData.source !== 'convex' || !reservationData.convexData)
        return

      await manageReservation({
        mode: 'status',
        payload: {
          reservationId: reservationData.convexData._id,
          status: status,
        },
      })

      toast.success(t('statusUpdated'))
      router.push('/dashboard/reservation')
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsUpdateStatusModalOpen(false)
    }
  }

  const handleDeleteReservation = async () => {
    try {
      if (!reservationData || reservationData.source !== 'convex' || !reservationData.convexData)
        return
      await deleteReservation({
        reservation_id: reservationData.convexData._id,
        tenant_id: reservationData.convexData.tenant_id,
        org_id: reservationData.convexData.org_id,
      })
      toast.success(t('reservationDeleted'))
      router.push('/dashboard/reservation')
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsDeleteModalOpen(false)
    }
  }

  const handleStaffChange = async () => {
    if (
      !selectedNewStaffId ||
      !reservationData ||
      reservationData.source !== 'convex' ||
      !reservationData.convexData
    )
      return

    try {
      setIsChangingStaff(true)
      const result = await changeStaff({
        reservation_id: reservationData.convexData._id,
        new_staff_id: selectedNewStaffId,
        changed_by: 'admin', // 管理画面からの変更
      })

      // 入れ替えが発生した場合の特別なメッセージ
      if (result.wasSwapped && result.swappedReservation) {
        toast.success(
          `スタッフを変更しました。同時間帯の指名フリー予約も「${result.swappedReservation.newStaffName}」に変更されました。`
        )
      } else {
        toast.success('スタッフを変更しました')
      }

      setIsStaffChangeModalOpen(false)
      // ページをリロードして最新データを取得
      router.refresh()
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsChangingStaff(false)
    }
  }

  if (!reservationData) return <Loading />

  return (
    <DashboardSection
      title={t('title')}
      backLink="/dashboard"
      backLinkTitle={t('backToDashboard')}
      infoBtn={{
        text: '予約一覧へ',
        link: `/dashboard/reservation`,
      }}
    >
      <div className="flex flex-col gap-4 bg-background">
        <div className="border-b pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <p
                  className={`w-fit px-3 py-1 my-2 rounded-md font-bold text-xs ${statusColorMap[reservationData.status as ReservationStatus]}`}
                >
                  {convertReservationStatus(reservationData.status as ReservationStatus)}
                </p>
              </div>

              <div
                className={`text-primary text-xs font-bold px-3 py-1 rounded-md ${
                  paymentStatusColorMap[
                    reservationData.paymentStatus as keyof typeof paymentStatusColorMap
                  ]
                }`}
              >
                {convertPaymentStatus(reservationData.paymentStatus)}
              </div>
            </div>
            {reservationData.isFreeNomination && (
              <div className="mb-4 px-2 py-1.5 bg-link-foreground rounded-md w-fit">
                <p className="text-xs font-medium text-primary-foreground">🎯 指名フリー予約</p>
              </div>
            )}

            <div>
              <p className="text-muted-foreground text-sm">{t('dateTime')}:</p>
              <p className="font-medium text-base">
                {formatUnixTimestamp(reservationData.startTimeUnix ?? 0)} -{' '}
                {format(new Date(reservationData.endTimeUnix ?? 0), 'HH:mm')}
              </p>
              <Separator className="my-6 mx-auto w-1/2" />
              <div
                className={`flex flex-col justify-start bg-neon-foreground border border-neon rounded-md shadow-sm my-3 p-5 w-full ${
                  reservationData.status === 'completed' ||
                  reservationData.status === 'cancelled' ||
                  reservationData.status === 'refunded'
                    ? 'hidden'
                    : ''
                }`}
              >
                <p className=" text-xs font-bold text-neon mb-2">予約ステータスを更新する</p>
                <div className="flex gap-4">
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ReservationStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                      {RESERVATION_STATUS_VALUES.map((status, index) => (
                        <SelectItem key={index} value={status}>
                          {convertReservationStatus(status as ReservationStatus)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="default"
                    disabled={reservationData.status === status}
                    onClick={(e) => handleShowUpdateStatusModal(e)}
                  >
                    {t('changeStatus')}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium mr-2">メニュー</span> ¥
                  {reservationData.detail?.menus
                    ?.reduce((acc, menu) => acc + menu.quantity * (menu.price ?? 0), 0)
                    .toLocaleString()}{' '}
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium mr-2">オプション</span> ¥
                  {reservationData.detail?.options
                    ?.reduce((acc, option) => acc + option.quantity * (option.price ?? 0), 0)
                    .toLocaleString()}
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium mr-2">指名料</span>
                  {reservationData.isFreeNomination
                    ? ' フリー指名(無料)'
                    : ` ¥${reservationData.detail?.extraCharge?.toLocaleString() ?? 0}`}
                </p>
                <p className="font-bold  text-sm">
                  <span className=" mr-2">小計</span> ¥
                  {reservationData.detail?.menus &&
                  reservationData.detail?.options &&
                  reservationData.detail?.extraCharge
                    ? reservationData.detail?.menus?.reduce(
                        (acc, menu) => acc + menu.quantity * (menu.price ?? 0),
                        0
                      ) +
                      reservationData.detail?.options?.reduce(
                        (acc, option) => acc + option.quantity * (option.price ?? 0),
                        0
                      ) +
                      (reservationData.isFreeNomination
                        ? 0
                        : (reservationData.detail?.extraCharge ?? 0))
                    : 0}
                </p>
                <Separator className="my-2 mx-end w-1/2" />
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium mr-2">クーポン利用</span>- ¥
                  {reservationData.detail?.couponDiscount?.toLocaleString() ?? 0}
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-medium mr-2">ポイント利用</span>- ¥
                  {reservationData.detail?.usePoints ?? 0}
                </p>
                <Separator className="my-2 mx-end w-1/2" />
                <div className="flex items-center mt-3">
                  <p className="text-primary text-base font-bold">
                    <span className="font-medium mr-2">{t('totalAmount')}</span> ¥
                    {reservationData.detail?.totalPrice?.toLocaleString() ?? 0}
                  </p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">{t('paymentMethod')}:</p>
              <p className="font-medium text-base">
                {convertPaymentMethod(reservationData.detail?.paymentMethod as PaymentMethod)}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold mb-3">{t('customerInfo')}</h2>
          {reservationData?.customerUid ? (
            <>
              {customerLoading && (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-border"></div>
                  <span className="text-muted-foreground">{t('loadingCustomerData')}...</span>
                </div>
              )}

              {customerError && <p className="text-destructive">{customerError}</p>}

              {customerData && !customerLoading && (
                <div className="space-y-3">
                  <Link
                    href={`${customerData.customer ? `/dashboard/customer/${customerData.customer?.uid}` : '#'}`}
                  >
                    <div>
                      <p className="text-muted-foreground">{t('customerName')}:</p>
                      <p className="font-medium text-lg underline hover:text-primary cursor-pointer">
                        {customerData.customer?.line_user_name
                          ? customerData.customer?.line_user_name
                          : customerData.customer?.last_name && customerData.customer?.first_name
                            ? `${customerData.customer?.last_name} ${customerData.customer?.first_name}`
                            : t('notSet')}
                      </p>
                    </div>
                  </Link>
                  {customerData.customer?.phone && (
                    <div>
                      <p className="text-muted-foreground">{t('phoneNumber')}:</p>
                      <p className="font-medium">{customerData.customer?.phone}</p>
                    </div>
                  )}
                  {customerData.customer?.email && (
                    <div>
                      <p className="text-muted-foreground">{t('email')}:</p>
                      <p className="font-medium">{customerData.customer?.email}</p>
                    </div>
                  )}
                  {customerData.customerDetail && (
                    <>
                      {customerData.customerDetail.gender && (
                        <div>
                          <p className="text-muted-foreground">{t('gender')}:</p>
                          <p className="font-medium">
                            {convertGender(customerData.customerDetail.gender as Gender, true)}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {customerData.customerPoints && (
                    <div>
                      <p className="text-muted-foreground">{t('points')}:</p>
                      <p className="font-medium">
                        {t('pointsCount', { count: customerData.customerPoints.total_points || 0 })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{t('noCustomerLinked')}</p>
          )}
        </div>
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold mb-3">{t('assignedStaff')}</h2>

          {staff || assignedStaff ? (
            <div className="flex items-start gap-4">
              <div>
                <p className="font-medium text-lg">
                  {reservationData.isFreeNomination && assignedStaff
                    ? `${assignedStaff.name} (自動割り当て)`
                    : (staff || assignedStaff)?.name}
                </p>
                {(staff || assignedStaff)?.description && (
                  <p className="text-muted-foreground text-sm mt-1">
                    {(staff || assignedStaff)?.description}
                  </p>
                )}
                {((staff || assignedStaff)?.tags?.length ?? 0) > 0 && (
                  <div className="mt-2">
                    {(staff || assignedStaff)?.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-block bg-muted rounded-full px-3 py-1 text-sm font-semibold text-muted-foreground mr-2 mb-2"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* スタッフ変更は指名フリー予約（is_free_nomination: true）の場合のみ可能 */}
                {reservationData.isFreeNomination && (
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={() => setIsStaffChangeModalOpen(true)}
                      disabled={
                        reservationData.status === 'completed' ||
                        reservationData.status === 'cancelled' ||
                        reservationData.status === 'refunded'
                      }
                    >
                      スタッフを変更
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <p>スタッフ未割り当て</p>
              {/* スタッフ割り当ては指名フリー予約（is_free_nomination: true）の場合のみ可能 */}
              {reservationData.isFreeNomination && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setIsStaffChangeModalOpen(true)}
                  disabled={
                    reservationData.status === 'completed' ||
                    reservationData.status === 'cancelled' ||
                    reservationData.status === 'refunded'
                  }
                >
                  スタッフを割り当て
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold mb-3">{t('reservationContent')}</h2>
          {reservationMenuDetails?.menus?.length && reservationMenuDetails?.menus?.length > 0 && (
            <div className="flex flex-col gap-3">
              {reservationData.detail?.menus?.map((reservationMenuItem, index) => {
                const menuDetail = reservationMenuDetails.menus.find(
                  (detail) => detail._id === reservationMenuItem.id
                )

                if (!menuDetail) return null

                return (
                  <div key={index} className="border rounded-lg p-3">
                    <p className="font-medium text-lg">{menuDetail.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {t('quantity')}: {reservationMenuItem.quantity}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {t('duration')}: {menuDetail.duration_min} {t('minutes')}
                    </p>
                    <p className="font-semibold text-md mt-1">
                      {t('price')}: ¥
                      {(menuDetail.sale_price ?? menuDetail.unit_price ?? 0).toLocaleString()}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {reservationMenuDetails?.options && reservationMenuDetails?.options?.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">{t('options')}</h3>
              <ul className="list-disc list-inside">
                {reservationMenuDetails.options &&
                  reservationMenuDetails.options.length > 0 &&
                  reservationMenuDetails.options.map((option, index) => (
                    <li key={index} className="text-muted-foreground">
                      {option.name} - ¥{option.unit_price?.toLocaleString()} x{' '}
                      {reservationData.detail?.options?.find((o) => o.id === option._id)
                        ?.quantity ?? 0}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {reservationMenuDetails?.menus?.length && reservationMenuDetails?.menus?.length === 0 && (
            <p className="text-muted-foreground">{t('noMenuReserved')}</p>
          )}
        </div>
        {reservationData.detail?.notes && reservationData.detail?.notes.trim() !== '' && (
          <div>
            <h2 className="text-xl font-semibold mb-3">{t('notes')}</h2>
            <div className="bg-muted p-3 rounded-lg text-muted-foreground">
              {reservationData.detail?.notes}
            </div>
          </div>
        )}
      </div>
      <Dialog open={isStaffChangeModalOpen} onOpenChange={setIsStaffChangeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>スタッフを変更</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              指名フリー予約のスタッフを変更します。新しいスタッフを選択してください。
            </p>
            <Select
              value={selectedNewStaffId || undefined}
              onValueChange={(value) => setSelectedNewStaffId(value as Id<'staff'>)}
            >
              <SelectTrigger>
                <SelectValue placeholder="スタッフを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableStaffs
                  ?.filter((staff) => {
                    // 現在割り当てられているスタッフを除外
                    const currentAssignedStaffId =
                      reservationData?.assignedStaffId || reservationData?.staffId
                    return staff._id !== currentAssignedStaffId
                  })
                  ?.map((staff) => (
                    <SelectItem key={staff._id} value={staff._id}>
                      {staff.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStaffChangeModalOpen(false)}>
              {commonT('cancel')}
            </Button>
            <Button onClick={handleStaffChange} disabled={!selectedNewStaffId || isChangingStaff}>
              {isChangingStaff ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  変更中...
                </>
              ) : (
                '変更する'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isUpdateStatusModalOpen} onOpenChange={() => setIsUpdateStatusModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('changeStatusDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg bg-warning p-3 border border-warning">
            <p className="text-sm font-medium text-warning-foreground mb-1">
              ⚠️ ステータス変更の制限
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>完了・キャンセル・返金済み</strong>の予約は、ステータスを変更できません。
              再予約が必要な場合は、新規で予約を作成してください。
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-warning-foreground mt-1.5 flex-shrink-0"></div>
              <div>
                <p className="text-sm font-medium">保留中</p>
                <p className="text-xs text-muted-foreground">
                  予約枠に含まれません。他のお客様がこの時間帯を予約できます。ステータスを変更できます。
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-success mt-1.5 flex-shrink-0"></div>
              <div>
                <p className="text-sm font-medium">予約受付済み</p>
                <p className="text-xs text-muted-foreground">
                  予約枠に含まれます。この時間帯は他の予約を受け付けません。ステータスを変更できます。
                </p>
              </div>
            </div>
          </div>
          <DialogDescription className="text-sm text-success-foreground bg-success p-4 rounded-lg mt-4">
            <strong>{convertReservationStatus(reservationData.status)}</strong>
            {'から'}
            <strong>{convertReservationStatus(status)}</strong>へ変更する。
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateStatusModalOpen(false)}>
              {commonT('cancel')}
            </Button>
            <Button variant="default" onClick={handleUpdateStatus}>
              {commonT('update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              {commonT('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteReservation}>
              {commonT('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardSection>
  )
}
