'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Separator } from '@/components/ui/separator'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { Instagram } from 'lucide-react'

type FooterProps = {
  variant?: 'default' | 'landing'
}

export function Footer({ variant = 'default' }: FooterProps = {}) {
  const t = useTranslations('landing.footer')
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  if (variant === 'landing') {
    const groups = [
      {
        title: t('sections.product'),
        links: [
          { href: '/features', label: t('links.features') },
          { href: '/pricing', label: t('links.pricing') },
          {
            href: 'https://bocker-project.vercel.app/ja/reservation/v5799kb53q14k5tyf4y0kj636d7jhz8p',
            label: t('links.demo'),
          },
        ],
      },
      {
        title: t('sections.support'),
        links: [
          { href: '/faq', label: t('links.faq') },
          { href: '/contact', label: t('links.contact') },
        ],
      },
      {
        title: t('sections.company'),
        links: [
          { href: '/about', label: t('links.about') },
          { href: '/privacy', label: t('links.privacyPolicy') },
          { href: '/terms', label: t('links.termsOfUse') },
        ],
      },
    ]
    const focusClass =
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--landing-surface)]'

    return (
      <footer
        data-testid="footer"
        className="landing-footer border-t border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-ink)]"
      >
        <div className="mx-auto max-w-7xl px-5 pb-8 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 pb-12 md:grid-cols-4 lg:gap-x-16">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5">
                <Image
                  src={
                    mounted && resolvedTheme === 'dark'
                      ? '/assets/images/logo-white.png'
                      : '/assets/images/logo-darkgreen.png'
                  }
                  alt="Bocker"
                  width={36}
                  height={36}
                  className="h-9 w-9"
                />
                <span className="text-xl font-semibold tracking-tight">Bocker</span>
              </div>
              <p className="mt-5 max-w-xs text-sm leading-7 text-[var(--landing-muted)]">
                {t('tagline')}
              </p>
            </div>
            {groups.map((group) => (
              <nav key={group.title} aria-label={group.title} className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold">{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        role="link"
                        href={link.href}
                        className={`inline-flex min-h-11 items-center rounded-sm py-2 text-sm leading-6 text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)] motion-reduce:transition-none ${focusClass}`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="flex flex-col items-start justify-between gap-5 border-t border-[var(--landing-border)] pt-6 sm:flex-row sm:items-center">
            <p className="text-xs leading-6 text-[var(--landing-muted)]">{t('copyright')}</p>
            <Link
              role="link"
              href="https://www.instagram.com/bocker_fujimoto"
              aria-label="Instagram"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--landing-border)] text-[var(--landing-muted)] transition-colors hover:bg-[var(--landing-canvas)] hover:text-[var(--landing-ink)] motion-reduce:transition-none ${focusClass}`}
            >
              <Instagram aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer data-testid="footer" className="py-12 bg-background border-t">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Image
                src={
                  mounted && resolvedTheme === 'dark'
                    ? '/assets/images/logo-white.png'
                    : '/assets/images/logo-darkgreen.png'
                }
                alt="Bocker"
                width={32}
                height={32}
              />
              <span className="text-lg font-bold">Bocker</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          <div>
            <h3 className="font-semibold mb-3">{t('sections.product')}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  role="link"
                  href="/features"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.features')}
                </Link>
              </li>
              <li>
                <Link
                  role="link"
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.pricing')}
                </Link>
              </li>
              <li>
                {/* FIXME: デモページを作成する */}
                <Link
                  role="link"
                  href="https://bocker-project.vercel.app/ja/reservation/v5799kb53q14k5tyf4y0kj636d7jhz8p"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.demo')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3">{t('sections.support')}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  role="link"
                  href="/faq"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.faq')}
                </Link>
              </li>
              <li>
                <Link
                  role="link"
                  href="/contact"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.contact')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3">{t('sections.company')}</h3>
            <ul className="space-y-2">
              <li>
                <Link
                  role="link"
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.about')}
                </Link>
              </li>
              <li>
                <Link
                  role="link"
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.privacyPolicy')}
                </Link>
              </li>
              <li>
                <Link
                  role="link"
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {t('links.termsOfUse')}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="mb-8" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{t('copyright')}</p>
          <div className="flex items-center gap-4">
            <Link
              role="link"
              href="https://www.instagram.com/bocker_fujimoto"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Instagram"
            >
              <Instagram className="size-5 text-pink-500" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
