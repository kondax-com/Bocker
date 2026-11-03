'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useStablePaginatedQuery } from '@/hooks/useStablePaginatedQuery'
import { api } from '@/convex/_generated/api'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Doc } from '@/convex/_generated/dataModel'
import { getPlanLimits } from '@/convex/utils/helpers'
import { SubscriptionPlanName } from '@/convex/types'

import { useTranslations } from 'next-intl'

const numberOfItems = 10
export default function OptionList() {
  const t = useTranslations('options')
  const router = useRouter()
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const limits = getPlanLimits(planName as SubscriptionPlanName)
  const {
    results: options,
    loadMore,
    isLoading,
    status,
  } = useStablePaginatedQuery(
    api.option.query.list,
    tenantId && orgId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip',
    {
      initialNumItems: numberOfItems,
    }
  )

  const allOptions: Doc<'option'>[] = useMemo(() => options || [], [options]).slice(
    0,
    limits.maxOptionCount
  )

  if (isLoading) {
    return <Loading />
  }

  return (
    <div className="mt-2 flow-root">
      <div className="w-full overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="admin-panel overflow-hidden">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted text-nowrap px-2">
                <tr>
                  <th
                    scope="col"
                    className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t('list.table.status')}
                  </th>
                  <th
                    scope="col"
                    className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t('list.table.image')}
                  </th>
                  <th
                    scope="col"
                    className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-muted-foreground sm:pl-6"
                  >
                    {t('list.table.name')}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t('list.table.price')}
                  </th>

                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t('list.table.orderLimit')}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t('list.table.totalDuration')}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-sm font-semibold text-muted-foreground"
                  >
                    {t('list.table.tags')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card text-nowrap">
                {allOptions && allOptions.length > 0 ? (
                  allOptions.map((option: Doc<'option'>) => (
                    <tr
                      key={option._id}
                      onClick={() => router.push(`/dashboard/option/${option._id}`)}
                      className="cursor-pointer transition-colors hover:bg-muted"
                    >
                      <td
                        className={`py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-primary sm:pl-6 `}
                      >
                        <span
                          className={`font-bold text-xs ${option.is_archive ? 'bg-muted-foreground text-background' : 'bg-accent-2-foreground text-accent-2'} px-2 py-1 rounded-md`}
                        >
                          {option.is_archive
                            ? t('list.table.statusDeleted')
                            : t('list.table.statusActive')}
                        </span>
                      </td>
                      <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-primary sm:pl-6">
                        {option.images[0]?.thumbnail_url ? (
                          <div className="relative w-12 h-12 rounded-md overflow-hidden">
                            <Image
                              src={option.images[0].thumbnail_url as string}
                              alt={option.name}
                              width={250}
                              height={250}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-md overflow-hidden flex items-center justify-center bg-muted text-muted-foreground">
                            <p className="text-sm text-muted-foreground">
                              {option.name.slice(0, 1)}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-primary sm:pl-6">
                        {option.name}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                        {option.sale_price ? (
                          <span className="line-through text-muted-foreground text-xs">
                            ¥{option.unit_price?.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            ¥{option.unit_price?.toLocaleString()}
                          </span>
                        )}
                        {option.sale_price ? (
                          <span className="text-sm text-muted-foreground">
                            / ¥{option.sale_price.toLocaleString()}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>

                      <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                        {option.order_limit
                          ? `${option.order_limit}${t('list.table.pieces')}`
                          : t('list.table.notSet')}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                        {option.duration_min
                          ? `${option.duration_min}${t('list.table.minutes')}`
                          : t('list.table.notSet')}
                      </td>
                      <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                        {option.tags && option.tags.length > 0
                          ? option.tags.join('、')
                          : t('list.table.notSet')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                      {t('list.noOptions')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {options && options.length > 0 && status == 'CanLoadMore' && (
        <div className="flex justify-center mt-4">
          <Button variant="outline" onClick={() => loadMore(numberOfItems)}>
            {t('list.table.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
