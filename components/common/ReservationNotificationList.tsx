'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Bell, Check, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Button } from '../ui/button'
import { Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Loading } from '@/components/common'

export default function ReservationNotificationList() {
  const { tenantId, orgId, subscription } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const notifications = useQuery(
    api.reservation.notification.query.list,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip'
  )

  const killNotification = useMutation(api.reservation.notification.mutation.kill)
  const killAllNotifications = useMutation(api.reservation.notification.mutation.killAll)

  const handleKillNotification = (notificationId: Id<'reservation_notification'>) => {
    if (notificationId) {
      try {
        killNotification({
          reservation_notification_id: notificationId as Id<'reservation_notification'>,
        })
        toast.success('通知を確認しました。')
      } catch (error) {
        showErrorToast(error)
      }
    }
  }

  const handleKillAllNotifications = () => {
    try {
      killAllNotifications({
        tenant_id: tenantId as Id<'tenant'>,
        org_id: orgId as Id<'organization'>,
      })
      toast.success('通知を全て削除しました。')
    } catch (error) {
      showErrorToast(error)
    }
  }

  if (notifications === undefined) {
    return <Loading />
  }

  const isSubscriptionActive =
    subscription?.status === 'active' || subscription?.status === 'trialing'

  if (!isSubscriptionActive) {
    return null
  }
  return (
    <div className={`min-w-0 w-full ${subscription === null ? 'hidden' : ''}`}>
      {notifications?.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">新規予約通知はありません。</p>
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          className="w-full rounded-xl border border-border bg-card px-4 sm:px-5"
        >
          <AccordionItem value="notifications" className="border-b-0">
            <div className="flex items-center justify-between gap-3">
              <AccordionTrigger className="min-w-0 flex-1 gap-3 py-4 hover:no-underline">
                <span className="flex items-center gap-2.5 text-sm font-medium">
                  <Bell aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {notifications && notifications.length > 0 && (
                    <span>
                      <strong className="mr-1.5 rounded-md bg-secondary px-2 py-0.5 font-semibold tabular-nums text-secondary-foreground">
                        {notifications.length}
                      </strong>
                      件の新規予約
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <Button
                variant="outline"
                className="min-h-11 shrink-0 rounded-lg shadow-none"
                size="sm"
                onClick={() => handleKillAllNotifications()}
              >
                <Check aria-hidden="true" />
                <span className="hidden md:inline">全て確認済みにする</span>
                <span className="md:hidden">全て確認</span>
              </Button>
            </div>
            <AccordionContent className="pb-2 pt-0">
              <div className="flex flex-col divide-y divide-border border-t border-border">
                {notifications?.map((notification) => (
                  <div key={notification._id} className="flex items-center gap-4 py-4">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:items-center sm:gap-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {format(notification.start_time_unix, 'yyyy年MM月dd日(EEE)', {
                            locale: ja,
                          })}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {format(notification.start_time_unix, 'HH:mm')} ~{' '}
                          {format(notification.end_time_unix, 'HH:mm')}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1 text-sm">
                        <p className="break-words text-foreground">
                          <span className="mr-2 text-xs text-muted-foreground">顧客名</span>
                          {notification.customer_name}
                        </p>
                        <p className="break-words text-muted-foreground">
                          <span className="mr-2 text-xs">担当</span>
                          {notification.staff_name}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 rounded-lg text-primary"
                      aria-label={`${notification.customer_name}の予約通知を確認済みにする`}
                      onClick={() => handleKillNotification(notification._id)}
                    >
                      <Check aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
