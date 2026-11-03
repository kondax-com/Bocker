'use client'

import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  const t = useTranslations('landing.hero')
  const tFeatures = useTranslations('landing.features.items')

  return (
    <section data-testid="hero-section" className="bg-background text-foreground">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-32 sm:gap-16 sm:px-8 sm:pb-24 sm:pt-40 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:py-36">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-balance text-[34px] font-semibold leading-[1.4] tracking-tight sm:text-5xl sm:leading-[1.3]">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-base leading-8 text-muted-foreground">
            {t('subtitle')}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-auto min-h-12 whitespace-normal rounded-xl border-border bg-background px-5 py-3 text-center text-base font-semibold text-foreground hover:bg-muted motion-reduce:transition-none"
            >
              <Link href="https://bocker-project.vercel.app/ja/reservation/v5799kb53q14k5tyf4y0kj636d7jhz8p">
                {t('cta.demo')}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="h-auto min-h-12 whitespace-normal rounded-xl px-5 py-3 text-center text-base font-semibold motion-reduce:transition-none"
            >
              <Link data-testid="hero-cta" href="/contact">
                {t('cta.requestMaterial')}
              </Link>
            </Button>
          </div>
          <Link
            href="/sign-up"
            className="mt-3 inline-flex min-h-11 items-center rounded-md text-base font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
          >
            {t('cta.trial')}
          </Link>
        </div>
        <div className="relative mx-auto w-full min-w-0 max-w-2xl pb-12 pr-10 sm:pb-16 sm:pr-14 lg:pr-10">
          <div className="overflow-hidden rounded-2xl border border-border bg-background p-1.5 shadow-xl sm:rounded-3xl sm:p-2">
            <Image
              alt={tFeatures('menuManagement.title')}
              width={3020}
              height={1646}
              src="/assets/mockup/pc/menu.png"
              sizes="(min-width: 1280px) 560px, (min-width: 1024px) 48vw, (min-width: 640px) 620px, 100vw"
              priority
              className="h-auto w-full rounded-xl sm:rounded-2xl"
            />
          </div>
          <div className="absolute bottom-0 right-0 w-[29%] min-w-[104px] overflow-hidden rounded-2xl border-[5px] border-background bg-background shadow-lg sm:rounded-3xl">
            <Image
              alt={tFeatures('smartReservation.title')}
              width={1125}
              height={1876}
              src="/assets/mockup/sp/reservation_calendar.jpg"
              sizes="(min-width: 1024px) 180px, (min-width: 640px) 190px, 110px"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
