'use client'

import {
  ArrowPathIcon,
  ServerIcon,
  ClipboardDocumentListIcon,
  CalculatorIcon,
  PencilSquareIcon,
  ScissorsIcon,
} from '@heroicons/react/20/solid'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

export function FeatureSection() {
  const t = useTranslations('landing.features')
  const features = [
    {
      name: t('items.smartReservation.title'),
      description: t('items.smartReservation.description'),
      icon: ClipboardDocumentListIcon,
    },
    {
      name: t('items.optimizationAlgorithm.title'),
      description: t('items.optimizationAlgorithm.description'),
      icon: CalculatorIcon,
    },
    {
      name: t('items.digitalCarte.title'),
      description: t('items.digitalCarte.description'),
      icon: PencilSquareIcon,
    },
    {
      name: t('items.allInOne.title'),
      description: t('items.allInOne.description'),
      icon: ArrowPathIcon,
    },
    {
      name: t('items.userFriendly.title'),
      description: t('items.userFriendly.description'),
      icon: ScissorsIcon,
    },
    {
      name: t('items.support.title'),
      description: t('items.support.description'),
      icon: ServerIcon,
    },
  ]

  return (
    <section
      data-testid="feature-section"
      className="border-y border-border bg-muted py-20 text-foreground sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-balance text-[30px] font-semibold leading-[1.45] tracking-tight sm:text-[40px] sm:leading-[1.35]">
            {t('title')}
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-8 text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <div className="mt-12 grid items-center gap-10 sm:mt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="overflow-hidden rounded-2xl border border-border bg-background p-2 sm:rounded-3xl sm:p-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl sm:rounded-2xl">
              <Image
                alt={t('items.smartReservation.title')}
                src="/assets/mockup/pc/reservation_top.png"
                width={3020}
                height={1646}
                sizes="(min-width: 1280px) 580px, (min-width: 1024px) 52vw, 100vw"
                className="h-full w-full object-cover object-right"
              />
            </div>
          </div>
          <dl className="divide-y divide-border">
            {features.slice(0, 3).map((feature) => (
              <div key={feature.name} className="py-6 first:pt-0 last:pb-0">
                <dt className="flex items-start gap-3 text-lg font-semibold leading-7">
                  <feature.icon
                    aria-hidden="true"
                    className="mt-0.5 size-6 shrink-0 text-primary"
                  />
                  {feature.name}
                </dt>
                <dd className="mt-3 text-base leading-8 text-muted-foreground">
                  {feature.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <dl className="mt-12 grid gap-8 border-t border-border pt-10 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {features.slice(3).map((feature) => (
            <div key={feature.name}>
              <dt className="flex items-start gap-3 text-lg font-semibold leading-7">
                <feature.icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary" />
                {feature.name}
              </dt>
              <dd className="mt-3 text-base leading-8 text-muted-foreground">
                {feature.description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
