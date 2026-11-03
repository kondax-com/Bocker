'use client'

import { CloudArrowUpIcon, LockClosedIcon, ServerIcon } from '@heroicons/react/20/solid'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

export function ContentSection() {
  const t = useTranslations('landing.content')
  const tFeatures = useTranslations('landing.features.items')
  const benefits = [
    { key: 'sales', icon: CloudArrowUpIcon },
    { key: 'mistakes', icon: LockClosedIcon },
    { key: 'efficiency', icon: ServerIcon },
  ] as const

  return (
    <section
      data-testid="content-section"
      className="bg-background py-20 text-foreground sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <p className="text-base font-medium leading-7 text-primary">{t('tagline')}</p>
            <h2 className="mt-4 text-balance text-[30px] font-semibold leading-[1.45] tracking-tight sm:text-[40px] sm:leading-[1.35]">
              {t('title')}
            </h2>
            <p className="mt-6 text-pretty text-base leading-8 text-muted-foreground">
              {t('mainDescription')}
            </p>
            <p className="mt-6 text-base leading-8 text-muted-foreground">{t('industryProblem')}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-muted p-3 sm:rounded-3xl sm:p-5">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-background sm:rounded-2xl">
              <Image
                alt={tFeatures('marketing.title')}
                src="/assets/mockup/pc/point.png"
                width={3020}
                height={1646}
                sizes="(min-width: 1280px) 520px, (min-width: 1024px) 46vw, 100vw"
                className="h-full w-full object-cover object-right"
              />
            </div>
          </div>
        </div>
        <ul
          role="list"
          className="mt-12 grid gap-8 border-t border-border pt-10 sm:mt-16 lg:grid-cols-3 lg:gap-10"
        >
          {benefits.map((benefit) => (
            <li key={benefit.key}>
              <div className="flex items-start gap-3">
                <benefit.icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
                <h3 className="text-lg font-semibold leading-7">
                  {t(`benefits.${benefit.key}.title`)}
                </h3>
              </div>
              <p className="mt-3 text-base leading-8 text-muted-foreground">
                {t(`benefits.${benefit.key}.description`)}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-4xl text-base leading-8 text-muted-foreground">
          {t('averageResults')}
        </p>
        <div className="mt-12 grid gap-4 rounded-2xl bg-muted px-6 py-8 sm:px-8 lg:mt-16 lg:grid-cols-[0.7fr_1.3fr] lg:gap-10">
          <h3 className="text-2xl font-semibold leading-9 tracking-tight text-foreground">
            {t('roi.title')}
          </h3>
          <p className="text-base leading-8 text-muted-foreground">{t('roi.description')}</p>
        </div>
      </div>
    </section>
  )
}
