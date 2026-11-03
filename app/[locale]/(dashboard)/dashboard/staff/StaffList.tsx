'use client'

import Image from 'next/image'
import { api } from '@/convex/_generated/api'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import InviteManagement from './_components/InviteManagement'
import { useQueryWithStatus } from '@/hooks/useQueryWithStatus'
import { CheckCircleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { SubscriptionPlanName } from '@/convex/types'

export default function StaffList() {
  const t = useTranslations('staff')
  const { tenantId, orgId, planName } = useTenantAndOrganization()

  const router = useRouter()
  // 招待状態を含むスタッフ一覧を取得
  const { data: staffsWithInvitation, isPending } = useQueryWithStatus(
    api.staff.invitation.query.getStaffWithInvitationStatus,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          includeInactive: false,
          planName: planName as SubscriptionPlanName,
          sort: 'asc',
        }
      : 'skip'
  )

  if (isPending || !staffsWithInvitation) {
    return <Loading />
  }

  return (
    <div className="space-y-6">
      {/* 招待管理コンポーネント */}
      <InviteManagement />

      {/* スタッフ一覧テーブル */}
      <div className="mt-2 flow-root">
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted text-nowrap px-2">
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-medium text-muted-foreground sm:pl-6"
                    >
                      {t('list.status')}
                    </th>

                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-medium text-muted-foreground sm:pl-6"
                    >
                      {t('list.image')}
                    </th>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-medium text-muted-foreground sm:pl-6"
                    >
                      {t('list.name')}
                    </th>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-medium text-muted-foreground sm:pl-6"
                    >
                      {t('list.description')}
                    </th>
                    <th
                      scope="col"
                      className="py-3.5 pr-3 pl-4 text-left text-sm font-medium text-muted-foreground sm:pl-6"
                    >
                      {t('list.connectClerk')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card text-nowrap">
                  {staffsWithInvitation && staffsWithInvitation.length > 0 ? (
                    staffsWithInvitation.map((staff, index: number) => (
                      <tr
                        key={index}
                        className="cursor-pointer hover:bg-secondary"
                        onClick={() => router.push(`/dashboard/staff/${staff._id}`)}
                      >
                        <td className="py-4 pr-3 pl-4 text-xs font-medium whitespace-nowrap text-muted-foreground sm:pl-6">
                          {staff.is_active ? (
                            <Badge variant="outline" className="bg-success-foreground text-success">
                              {t('active')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted  text-muted-foreground">
                              {t('inactive')}
                            </Badge>
                          )}
                        </td>

                        <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                          {staff.images && staff.images.length > 0 ? (
                            <div className="relative w-12 h-12  flex items-center justify-center">
                              <Image
                                src={staff.images[0].thumbnail_url}
                                alt={staff.name ?? ''}
                                layout="fill"
                                objectFit="cover"
                                className="object-cover rounded-xl"
                              />
                              {staff.connect_clerk ? (
                                <div className="bg-success-foreground text-success border-success p-1 rounded-full absolute -top-2 -right-2">
                                  <CheckCircleIcon className="h-3 w-3" />
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="w-10 h-10  bg-muted rounded-full text-center flex items-center justify-center ">
                              <span className="uppercase font-bold text-muted-foreground">
                                {staff.name?.charAt(0)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                          {staff.name ?? t('list.notSet')}
                        </td>

                        <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                          {staff.description && staff.description.length > 20 ? (
                            <div className="line-clamp-2">{staff.description.slice(0, 20)}...</div>
                          ) : (
                            <div className="text-muted-foreground">{staff.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                          {staff.connect_clerk && staff.clerk_user_id ? (
                            <Badge className="bg-success-foreground text-success">
                              {t('list.clerkStatus.connect')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted  text-muted-foreground">
                              {t('list.clerkStatus.notSet')}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="h-36 text-center">
                      <td colSpan={12} className="text-sm text-muted-foreground">
                        {t('list.noStaff')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
