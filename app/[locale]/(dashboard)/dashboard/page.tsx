import { Tutorial } from '@/components/common/Tutorial'
import ReservationTimeLine from './reservation/_components/ReservationTimeLine'
import { ReservationNotificationList } from '@/components/common'
export default async function DashboardPage() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        ダッシュボード
      </h1>
      <Tutorial />
      <ReservationNotificationList />
      <div className="min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-5">
        <ReservationTimeLine />
      </div>
    </div>
  )
}
