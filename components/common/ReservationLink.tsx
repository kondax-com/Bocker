'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { CopyIcon, ExternalLinkIcon } from 'lucide-react'
import { BASE_URL } from '@/lib/constants'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { TRACKING_CODE_VALUES, TrackingCode } from '@/convex/types'

export default function ReservationLink() {
  const t = useTranslations('reservationLink')
  const { tenantId, orgId, subscription } = useTenantAndOrganization()
  const [selectedTrackingType, setSelectedTrackingType] = useState<TrackingCode>('web')

  const apiConfig = useQuery(
    api.organization.api_config.query.findByTenantAndOrg,
    tenantId && orgId ? { tenant_id: tenantId, org_id: orgId } : 'skip'
  )

  if (!tenantId || !orgId || apiConfig === undefined) {
    return <Loading />
  }

  return (
    <div
      className={`${subscription && (subscription.status === 'active' || subscription.status === 'trialing') ? '' : 'bg-muted blur-sm pointer-events-none select-none'}`}
    >
      {apiConfig?.isLineConfigured ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Select
              value={selectedTrackingType}
              onValueChange={(value) => setSelectedTrackingType(value as TrackingCode)}
            >
              <SelectTrigger className="min-w-32">
                <SelectValue placeholder={t('selectLinkDestination')} />
              </SelectTrigger>
              <SelectContent>
                {TRACKING_CODE_VALUES.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${BASE_URL}/reservation/${orgId}/?code=${selectedTrackingType}`
                )
              }}
              title="URLをコピー"
            >
              <CopyIcon className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" asChild title="外部ページで開く">
              <a
                href={`${BASE_URL}/reservation/${orgId}/?code=${selectedTrackingType}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">生成されたURL</p>
                <div className="p-2 bg-muted rounded-md font-mono text-sm break-all">
                  {`${BASE_URL}/reservation/${orgId}/?code=${selectedTrackingType}`}
                </div>
              </div>
            </CardContent>
          </Card>

          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="item-1">
              <AccordionTrigger>
                <p className="text-sm font-medium">{t('aboutReservationLink')}</p>
              </AccordionTrigger>
              <AccordionContent>
                <Card>
                  <CardContent className="p-4 space-y-3 text-sm">
                    <p>{t('trackingDescription')}</p>
                    <div className="grid gap-2">
                      {[
                        { key: 'LINE', desc: t('lineDescription') },
                        { key: 'Web', desc: t('webDescription') },
                        { key: 'Instagram', desc: t('instagramDescription') },
                        { key: 'X (Twitter)', desc: t('twitterDescription') },
                        { key: 'Facebook', desc: t('facebookDescription') },
                        { key: 'YouTube', desc: t('youtubeDescription') },
                        { key: 'TikTok', desc: t('tiktokDescription') },
                        { key: 'GoogleMap', desc: t('googleMapDescription') },
                      ].map(({ key, desc }) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium min-w-fit">{key}:</span>
                          <span className="text-muted-foreground">{desc}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-accent-foreground">{t('copyInstruction')}</p>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-base font-bold text-primary">{t('lineConnectionRequired')}</p>
          <span className="text-sm text-muted-foreground">{t('lineConnectionDescription')}</span>
          <Link href={`${BASE_URL}/dashboard/setting`}>
            <Button>{t('connectWithLine')}</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
