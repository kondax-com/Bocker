'use client'

import ReferralCard from '@/components/common/ReferralCard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useState } from 'react'
import { withOwnerAccess } from '@/components/common'
import { useTranslations } from 'next-intl'
import OrgConfigForm from './_components/OrgConfigForm'
import OrgApiConfigForm from './_components/OrgApiConfigForm'
import OrgReservationConfigForm from './_components/OrgReservationConfigForm'
import OrgExceptionScheduleForm from './_components/OrgExceptionScheduleForm'
import OrgStripeConnectStatus from './_components/OrgStripeConnectStatus'
import OrgWeekHourSchedule from './_components/OrgWeekHourSchedule'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { LinkList } from '@/components/common/LinkList'

function SettingPage() {
  const t = useTranslations('settings')
  const [currentTab, setCurrentTab] = useState('basic')

  return (
    <Tabs value={currentTab} onValueChange={setCurrentTab} className="min-w-0">
      <div className="mb-6 min-w-0 overflow-x-auto pb-1">
        <TabsList className="inline-flex h-auto min-w-max gap-1 p-1.5">
          <TabsTrigger value="basic">{t('organizationSettings')}</TabsTrigger>
          <TabsTrigger value="api">{t('apiSettings')}</TabsTrigger>
          <TabsTrigger value="reservation-setting">{t('reservationSettings')}</TabsTrigger>
          <TabsTrigger value="week-schedule">{t('businessHours.title')}</TabsTrigger>
          <TabsTrigger value="exception-schedule">{t('specialHolidays')}</TabsTrigger>
          <TabsTrigger value="payment">{t('paymentSettings')}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="basic">
        <Accordion type="single" collapsible className="admin-panel mb-6 px-4 sm:px-5">
          <AccordionItem value="referral">
            <AccordionTrigger>
              <p className="text-sm font-medium text-foreground">
                友達紹介で特典ゲット！最大2,4000円お得
              </p>
            </AccordionTrigger>
            <AccordionContent>
              <ReferralCard />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="feature-request">
            <AccordionTrigger>
              <p className="text-sm font-medium text-foreground">機能改善リクエスト</p>
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-xl bg-muted p-4">
                <p className="text-sm text-muted-foreground mb-3">
                  Bockerをより使いやすくするための機能改善やご要望をお聞かせください。
                </p>
                <a
                  href="https://forms.gle/4C7mMJPdn4axGEPY7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 min-h-11 px-4 py-2"
                >
                  機能改善リクエストフォームを開く
                </a>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <OrgConfigForm />
      </TabsContent>
      <TabsContent value="api">
        <OrgApiConfigForm />
      </TabsContent>
      <TabsContent value="reservation-setting">
        <LinkList />
        <OrgReservationConfigForm />
      </TabsContent>
      <TabsContent value="week-schedule">
        <OrgWeekHourSchedule />
      </TabsContent>
      <TabsContent value="exception-schedule">
        <OrgExceptionScheduleForm />
      </TabsContent>
      <TabsContent value="payment">
        <OrgStripeConnectStatus />
      </TabsContent>
    </Tabs>
  )
}

export default withOwnerAccess(SettingPage)
