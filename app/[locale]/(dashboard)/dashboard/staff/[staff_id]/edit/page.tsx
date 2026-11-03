'use client'
import StaffEditForm from './StaffEditForm'
import { DashboardSection } from '@/components/common'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useTranslations } from 'next-intl'

export default function StaffEditPage() {
  const { role } = useTenantAndOrganization()
  const t = useTranslations('staff')

  return role === 'admin' ? (
    <DashboardSection
      title={t('edit.title')}
      backLink="/dashboard/staff"
      backLinkTitle={t('list.title')}
    >
      <StaffEditForm />
    </DashboardSection>
  ) : (
    <div className="pb-20">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
        {t('edit.title')}
      </h1>
      <StaffEditForm />
    </div>
  )
}
