import { DashboardSection } from '@/components/common'
import { useTranslations } from 'next-intl'
import ReservationForm from './ReservationForm'

export default function ReservationAddPage() {
  const t = useTranslations('reservations')

  return (
    <DashboardSection
      title={t('createReservation')}
      backLink="/dashboard/reservation"
      backLinkTitle={t('backToDashboard')}
    >
      <ReservationForm />
    </DashboardSection>
  )
}
