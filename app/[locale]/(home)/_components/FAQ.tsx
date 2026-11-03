'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { motion } from 'framer-motion'

export function FAQ({ variant = 'default' }: { variant?: 'default' | 'landing' }) {
  const t = useTranslations('landing.faq')

  const faqs = [
    {
      question: t('items.0.question'),
      answer: t('items.0.answer'),
    },
    {
      question: t('items.1.question'),
      answer: t('items.1.answer'),
    },
    {
      question: t('items.2.question'),
      answer: t('items.2.answer'),
    },
    {
      question: t('items.3.question'),
      answer: t('items.3.answer'),
    },
    {
      question: t('items.4.question'),
      answer: t('items.4.answer'),
    },
  ]

  if (variant === 'landing') {
    return (
      <section data-testid="faq-section" id="faq" className="landing-section landing-faq">
        <div className="landing-container landing-faq-layout">
          <div>
            <h2 className="landing-heading">{t('title')}</h2>
            <p className="landing-description mt-5">
              {t('subtitle')}{' '}
              <Link
                role="link"
                href="/contact"
                className="font-semibold text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                {t('cta')}
              </Link>
            </p>
          </div>
          <dl className="landing-faq-list">
            {faqs.map((faq) => (
              <div key={faq.question} className="landing-faq-item">
                <dt className="text-base font-semibold leading-relaxed text-foreground">
                  {faq.question}
                </dt>
                <dd className="mt-3 text-base leading-8 text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    )
  }

  return (
    <div data-testid="faq-section" className="bg-background">
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
            viewport={{ once: true, amount: 0.2 }}
            className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            {t('title')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
            viewport={{ once: true, amount: 0.2 }}
            className="mt-6 text-base/7 text-muted-foreground"
          >
            {t('subtitle')}
            <Link
              role="link"
              href="/contact"
              className="mx-3 font-semibold text-link-foreground hover:text-link-foreground/80 underline underline-offset-4"
            >
              {t('cta')}
            </Link>
          </motion.p>
        </div>
        <div className="mt-20">
          <dl className="space-y-16 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-16 lg:gap-x-10">
            {faqs.map((faq, index) => (
              <div key={index}>
                <motion.dt
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 + index * 0.1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  className="text-base/7 font-semibold text-foreground"
                >
                  {faq.question}
                </motion.dt>
                <motion.dd
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.5 + index * 0.1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  className="mt-2 text-base/7 text-muted-foreground"
                >
                  {faq.answer}
                </motion.dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
