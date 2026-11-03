'use client'

import { Switch } from '@/components/ui/switch'
import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}

export function Pricing({ variant = 'default' }: { variant?: 'default' | 'landing' }) {
  const [isAnnual, setIsAnnual] = useState(false)
  const t = useTranslations('landing.pricing')
  const tSubscription = useTranslations('subscription')
  const tCommon = useTranslations('common')

  const tiers = [
    {
      id: 'micro',
      name: t('subscription.micro.title'),
      description: t('subscription.micro.description'),
      price: {
        monthly: t('subscription.micro.price.monthly'),
        annually: t('subscription.micro.price.annually'),
      },
      highlights: [
        t('subscription.micro.features.1'),
        t('subscription.micro.features.2'),
        t('subscription.micro.features.3'),
        t('subscription.micro.features.4'),
        t('subscription.micro.features.5'),
        t('subscription.micro.features.6'),
        t('subscription.micro.features.7'),
        t('subscription.micro.features.8'),
      ],
      featured: true,
    },
    {
      id: 'lite',
      name: t('subscription.lite.title'),
      description: t('subscription.lite.description'),
      price: {
        monthly: t('subscription.lite.price.monthly'),
        annually: t('subscription.lite.price.annually'),
      },
      highlights: [
        t('subscription.lite.features.1'),
        t('subscription.lite.features.2'),
        t('subscription.lite.features.3'),
        t('subscription.lite.features.4'),
        t('subscription.lite.features.5'),
        t('subscription.lite.features.6'),
        t('subscription.lite.features.7'),
        t('subscription.lite.features.8'),
        t('subscription.lite.features.9'),
      ],
      featured: false,
    },
    {
      id: 'pro',
      name: t('subscription.pro.title'),
      description: t('subscription.pro.description'),
      price: {
        monthly: t('subscription.pro.price.monthly'),
        annually: t('subscription.pro.price.annually'),
      },
      highlights: [t('subscription.pro.features.1'), t('subscription.pro.features.2')],
      featured: false,
    },
  ]

  const sections = [
    {
      name: t('section.basic.title'),
      features: [
        {
          name: t('section.basic.features.0.name'),
          tiers: {
            MICRO: t('section.basic.features.0.tiers.MICRO'),
            LITE: t('section.basic.features.0.tiers.LITE'),
            PRO: t('section.basic.features.0.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.1.name'),
          tiers: {
            MICRO: t('section.basic.features.1.tiers.MICRO'),
            LITE: t('section.basic.features.1.tiers.LITE'),
            PRO: t('section.basic.features.1.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.2.name'),
          tiers: {
            MICRO: t('section.basic.features.2.tiers.MICRO'),
            LITE: t('section.basic.features.2.tiers.LITE'),
            PRO: t('section.basic.features.2.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.3.name'),
          tiers: {
            MICRO: t('section.basic.features.3.tiers.MICRO'),
            LITE: t('section.basic.features.3.tiers.LITE'),
            PRO: t('section.basic.features.3.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.4.name'),
          tiers: {
            MICRO: t('section.basic.features.4.tiers.MICRO'),
            LITE: t('section.basic.features.4.tiers.LITE'),
            PRO: t('section.basic.features.4.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.5.name'),
          tiers: {
            MICRO: t('section.basic.features.5.tiers.MICRO'),
            LITE: t('section.basic.features.5.tiers.LITE'),
            PRO: t('section.basic.features.5.tiers.PRO'),
          },
        },
        {
          name: t('section.basic.features.6.name'),
          tiers: {
            MICRO: t('section.basic.features.6.tiers.MICRO'),
            LITE: t('section.basic.features.6.tiers.LITE'),
            PRO: t('section.basic.features.6.tiers.PRO'),
          },
        },
      ],
    },
    {
      name: t('section.customer.title'),
      features: [
        {
          name: t('section.customer.features.0.name'),
          tiers: {
            MICRO: t('section.customer.features.0.tiers.MICRO'),
            LITE: t('section.customer.features.0.tiers.LITE'),
            PRO: t('section.customer.features.0.tiers.PRO'),
          },
        },
        {
          name: t('section.customer.features.1.name'),
          tiers: {
            MICRO: t('section.customer.features.1.tiers.MICRO'),
            LITE: t('section.customer.features.1.tiers.LITE'),
            PRO: t('section.customer.features.1.tiers.PRO'),
          },
        },
      ],
    },
    {
      name: t('section.support.title'),
      features: [
        {
          name: t('section.support.features.0.name'),
          tiers: {
            MICRO: t('section.support.features.0.tiers.MICRO'),
            LITE: t('section.support.features.0.tiers.LITE'),
            PRO: t('section.support.features.0.tiers.PRO'),
          },
        },
      ],
    },
  ]

  // tiersの値を適切に評価するヘルパー関数
  const evaluateTierValue = (value: string) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  }

  if (variant === 'landing') {
    return (
      <section data-testid="pricing" id="pricing" className="landing-section landing-pricing">
        <div className="landing-container">
          <div className="landing-pricing-heading">
            <div className="max-w-2xl">
              <h2 className="landing-heading">{t('title')}</h2>
              <p className="landing-description mt-5">{t('subtitle')}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {t('disclaimer')}
              </p>
            </div>
            <fieldset
              aria-label={`${t('type.monthly')} / ${t('type.annually')}`}
              className="landing-billing-toggle"
            >
              <span className={!isAnnual ? 'font-semibold' : ''}>{t('type.monthly')}</span>
              <label htmlFor="frequency">
                <Switch
                  role="checkbox"
                  id="frequency"
                  name="frequency"
                  value="monthly"
                  checked={isAnnual}
                  aria-label={`${t('type.monthly')} / ${t('type.annually')}`}
                  className="shrink-0 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground"
                  onCheckedChange={setIsAnnual}
                />
              </label>
              <span className={isAnnual ? 'font-semibold' : ''}>{t('type.annually')}</span>
            </fieldset>
          </div>

          <div className="landing-price-grid">
            {tiers.map((tier) => (
              <article
                key={tier.id}
                className={classNames(
                  'landing-price-plan',
                  tier.featured && 'landing-price-plan-featured'
                )}
              >
                <div className="landing-price-plan-header">
                  <h3 className="text-xl font-semibold text-foreground">{tier.name}</h3>
                  <p className="mt-3 min-h-12 text-sm leading-relaxed text-muted-foreground">
                    {tier.description}
                  </p>
                  <div data-tier={tier.id} className="landing-price-value">
                    <span>{isAnnual ? tier.price.annually : tier.price.monthly}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {isAnnual ? tSubscription('annual') : tSubscription('monthly')}
                    </span>
                  </div>
                </div>

                {sections.map((section) => (
                  <div key={section.name} className="landing-price-feature-group">
                    <h4 className="text-sm font-semibold text-foreground">{section.name}</h4>
                    <dl className="mt-3">
                      {section.features.map((feature) => {
                        const tierKey = tier.id.toUpperCase() as keyof typeof feature.tiers
                        const value = evaluateTierValue(feature.tiers[tierKey])

                        return (
                          <div key={feature.name} className="landing-price-feature">
                            <dt>{feature.name}</dt>
                            <dd>
                              {typeof value === 'boolean' ? (
                                <>
                                  {value ? (
                                    <CheckIcon aria-hidden="true" className="size-5 text-primary" />
                                  ) : (
                                    <XMarkIcon
                                      aria-hidden="true"
                                      className="size-5 text-muted-foreground"
                                    />
                                  )}
                                  <span className="sr-only">{tCommon(value ? 'yes' : 'no')}</span>
                                </>
                              ) : (
                                value
                              )}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                  </div>
                ))}
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {t('section.feature.title')}：{t('section.feature.description')}
          </p>
        </div>
      </section>
    )
  }

  return (
    <form data-testid="pricing" className="group/tiers isolate overflow-hidden">
      <div className="flow-root bg-background pt-12 pb-8 sm:pt-24 sm:pb-16 md:pt-32 lg:pb-0">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="relative z-10">
            <motion.h2
              role="heading"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
              viewport={{ once: true, amount: 0.2 }}
              className="mx-auto max-w-4xl text-center text-5xl font-semibold tracking-tight text-balance text-primary sm:text-5xl"
            >
              {t('title')}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
              viewport={{ once: true, amount: 0.2 }}
              className="mx-auto mt-6 max-w-2xl text-center text-lg font-medium text-pretty  sm:text-xl/8"
            >
              {t('subtitle')}
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
              viewport={{ once: true, amount: 0.2 }}
              className="mx-auto mt-6 max-w-2xl text-center text-base font-medium text-pretty text-muted-foreground sm:text-base"
            >
              {t('disclaimer')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.5 }}
              viewport={{ once: true, amount: 0.2 }}
              className="mt-16 flex justify-end"
            >
              <fieldset aria-label="Payment frequency" className="transition-all duration-300">
                <div className="flex items-center gap-8">
                  <span
                    className={
                      !isAnnual
                        ? 'font-bold text-base text-primary border-b-2 border-primary'
                        : 'text-muted-foreground'
                    }
                  >
                    {t('type.monthly')}
                  </span>
                  <Switch
                    role="checkbox"
                    id="frequency"
                    name="frequency"
                    value="monthly"
                    checked={isAnnual}
                    className="data-[state=checked]:bg-foreground data-[state=unchecked]:bg-accent scale-110"
                    onCheckedChange={setIsAnnual}
                  />
                  <span
                    className={
                      isAnnual
                        ? 'font-bold text-base text-primary border-b-2 border-primary'
                        : 'text-muted-foreground'
                    }
                  >
                    {t('type.annually')}
                  </span>
                </div>
              </fieldset>
            </motion.div>
          </div>
        </div>
      </div>
      <div className="relative bg-background">
        <div className="mx-auto max-w-7xl px-6 py-12  md:py-16 lg:px-8">
          <section>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4 md:gap-x-8">
              <div className="col-span-1 space-y-0">
                <div className="-mt-px w-full md:border-t-4 pt-12 md:pt-14">
                  <h3 className="text-sm md:text-lg font-semibold text-foreground">
                    {t('section.feature.title')}
                  </h3>
                  <p className="mt-2 text-xs md:text-sm text-muted-foreground text-nowrap mb-2">
                    {t('section.feature.description')}
                  </p>
                </div>
                {sections.map((section) => (
                  <div key={section.name} className="w-full">
                    <div className="border-t border-border pt-4 md:pt-8 pb-2">
                      <h4 className="text-xs md:text-sm font-semibold text-foreground mb-4">
                        {section.name}
                      </h4>
                    </div>
                    <div className="space-y-0">
                      {section.features.map((feature) => (
                        <div
                          key={feature.name}
                          className="w-full py-2 md:py-4 border-b border-border/30"
                        >
                          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed text-nowrap ">
                            {feature.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {tiers.map((tier, index) => (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.6 + index * 0.15 }}
                  viewport={{ once: true, amount: 0.2 }}
                  key={tier.id}
                >
                  <div
                    className={classNames(
                      tier.featured ? 'border-neon' : 'border-border',
                      '-mt-px w-full md:border-t-4 pt-12 md:pt-14'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <h3
                        className={classNames(
                          tier.featured ? 'text-primary' : 'text-foreground',
                          'text-base md:text-lg font-semibold'
                        )}
                      >
                        {tier.name}
                      </h3>
                      <div data-tier={tier.id}>
                        {isAnnual ? (
                          <p className="text-xl font-semibold text-link-foreground">
                            {tier.price.annually}{' '}
                            <span className="text-muted-foreground text-xs font-normal">
                              {tSubscription('annual')}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xl font-semibold text-link-foreground">
                            {tier.price.monthly}{' '}
                            <span className="text-muted-foreground text-xs font-normal">
                              {tSubscription('monthly')}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="mt-2 text-xs md:text-sm text-muted-foreground text-nowrap mb-2">
                      {tier.description}
                    </p>
                  </div>
                  <div className="space-y-0">
                    {sections.map((section) => (
                      <div key={section.name}>
                        <div className="border-t border-border pt-2 md:pt-4 lg:pt-8 pb-2 hidden md:block">
                          <h4 className="text-xs md:text-sm font-semibold text-foreground opacity-0 mb-4">
                            {section.name}
                          </h4>
                        </div>
                        <div className="space-y-0">
                          {section.features.map((feature) => {
                            const tierKey = tier.id.toUpperCase() as keyof typeof feature.tiers
                            const value = feature.tiers[tierKey]
                            const evaluatedValue = evaluateTierValue(value)

                            return (
                              <div
                                key={feature.name}
                                className="flex items-center md:justify-center py-2 md:py-4 border-b border-border/30"
                              >
                                <div className="flex items-center  w-full">
                                  {typeof evaluatedValue === 'boolean' ? (
                                    evaluatedValue ? (
                                      <div className="flex items-center gap-2 w-full">
                                        <p className="text-xs md:text-sm text-center md:text-nowrap pr-4 md:hidden">
                                          {feature.name}
                                        </p>
                                        <CheckIcon className="h-5 w-5 text-success-foreground" />
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs md:text-sm text-center md:text-nowrap pr-4 md:hidden">
                                          {feature.name}
                                        </p>
                                        <XMarkIcon className="h-5 w-5 text-destructive" />
                                      </div>
                                    )
                                  ) : (
                                    <>
                                      <span className="text-xs md:text-sm text-center md:text-nowrap pr-4 md:hidden">
                                        {feature.name}
                                      </span>

                                      <span
                                        className={classNames(
                                          'text-xs md:text-sm text-center text-nowrap font-semibold',
                                          tier.featured ? 'text-neon' : 'text-foreground'
                                        )}
                                      >
                                        {evaluatedValue}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </form>
  )
}
