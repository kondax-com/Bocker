'use client'

import StaffDetails from './StaffDetails'
import { DashboardSection } from '@/components/common'
import { useTranslations } from 'next-intl'

export default function StaffDetailsPage() {
  const t = useTranslations('staff')

  return (
    <DashboardSection
      title={t('details.title')}
      backLink="/dashboard/staff"
      backLinkTitle={t('list.title')}
    >
      <StaffDetails />
    </DashboardSection>
  )
}
