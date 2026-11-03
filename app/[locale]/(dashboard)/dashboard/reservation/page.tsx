import ReservationList from './ReservationList'
import { DashboardSection } from '@/components/common'
import { useTranslations } from 'next-intl'

export default function ReservationPage() {
  const t = useTranslations('reservations')
  const tNav = useTranslations('navigation')
  return (
    <DashboardSection
      title={t('timelineTitle')}
      backLink="/dashboard"
      backLinkTitle={tNav('dashboard')}
    >
      <p className="text-sm text-muted-foreground">{t('timelineDescription')}</p>
      <ReservationList />
    </DashboardSection>
  )
}
