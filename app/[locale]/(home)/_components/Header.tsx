'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { MenuIcon, XIcon } from 'lucide-react'
import { ModeToggle } from '@/components/common'
import { LanguageSwitcher } from '@/components/common'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'

type HeaderProps = {
  variant?: 'default' | 'landing'
}

function LandingSkipLink() {
  const t = useTranslations('sidebar')

  return (
    <a href="#landing-main" className="landing-skip-link">
      {t('skipToContent')}
    </a>
  )
}

export function Header({ variant = 'default' }: HeaderProps = {}) {
  const t = useTranslations('landing')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()
  const mobileNavigationId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (variant !== 'landing' || !menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [variant, menuOpen])

  if (variant === 'landing') {
    const navigation = [
      { href: '/features', label: t('nav.features') },
      { href: '/pricing', label: t('nav.pricing') },
      { href: '/about', label: t('nav.about') },
      { href: '/faq', label: t('nav.faq') },
      { href: '/contact', label: t('nav.contact') },
    ]
    const focusClass =
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--landing-surface)]'
    const primaryClass = `inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--landing-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--landing-on-accent)] transition-colors hover:opacity-90 motion-reduce:transition-none ${focusClass}`
    const loginClass = `inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--landing-ink)] transition-colors hover:bg-[var(--landing-canvas)] motion-reduce:transition-none ${focusClass}`

    return (
      <header
        data-testid="header"
        className="landing-header sticky top-0 z-50 w-full border-b border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-ink)]"
      >
        <LandingSkipLink />
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-5 sm:px-6 lg:px-8">
          <Link
            role="link"
            href="/"
            className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-md ${focusClass}`}
          >
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
            <span className="flex flex-col">
              <span className="text-xl font-semibold tracking-tight">Bocker</span>
              <span className="hidden text-[10px] leading-5 text-[var(--landing-muted)] sm:block">
                {t('hero.tagline')}
              </span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 xl:flex">
            {navigation.map((item) => (
              <Link
                key={item.href}
                role="link"
                href={item.href}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink)] motion-reduce:transition-none ${focusClass}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 xl:flex">
            <div className="mr-2 flex items-center gap-1 border-r border-[var(--landing-border)] pr-3 [&_button]:min-h-11 [&_button]:min-w-11">
              <LanguageSwitcher />
              <ModeToggle />
            </div>
            <Link role="link" href="/sign-in" className={loginClass}>
              {t('nav.login')}
            </Link>
            <Link role="link" href="/sign-up" className={primaryClass}>
              {t('nav.signUp')}
            </Link>
          </div>

          <div className="flex items-center gap-2 xl:hidden [&_button]:min-h-11 [&_button]:min-w-11">
            <ModeToggle />
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              className={`h-11 w-11 text-[var(--landing-ink)] hover:bg-[var(--landing-canvas)] ${focusClass}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              aria-controls={mobileNavigationId}
            >
              {menuOpen ? (
                <XIcon aria-hidden="true" className="h-5 w-5" />
              ) : (
                <MenuIcon aria-hidden="true" className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <div
            id={mobileNavigationId}
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-[var(--landing-border)] bg-[var(--landing-surface)] shadow-sm duration-150 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none xl:hidden"
          >
            <div className="mx-auto max-w-7xl px-5 pb-6 pt-3 sm:px-6">
              <nav aria-label="Main navigation" className="grid gap-1">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    role="link"
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-base font-medium text-[var(--landing-ink)] hover:bg-[var(--landing-canvas)] ${focusClass}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--landing-border)] pt-4 [&_button]:min-h-11 [&_button]:min-w-11">
                <LanguageSwitcher />
                <Link
                  role="link"
                  href="/sign-in"
                  onClick={() => setMenuOpen(false)}
                  className={loginClass}
                >
                  {t('nav.login')}
                </Link>
              </div>
              <Link
                role="link"
                href="/sign-up"
                onClick={() => setMenuOpen(false)}
                className={`${primaryClass} mt-3 w-full`}
              >
                {t('nav.signUp')}
              </Link>
            </div>
          </div>
        )}
      </header>
    )
  }

  return (
    <header
      data-testid="header"
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background"
    >
      <div className="container mx-auto px-4 md:px-6 flex h-16 items-center justify-between">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 w-fit"
        >
          <Link role="link" href="/" className="flex flex-col items-start space-x-2">
            <div className="flex items-center">
              <Image
                src={
                  mounted && resolvedTheme === 'dark'
                    ? '/assets/images/logo-white.png'
                    : '/assets/images/logo-darkgreen.png'
                }
                alt="Bocker"
                width={40}
                height={40}
                className="h-10 w-10"
              />

              <span className="text-xl font-bold">Bocker</span>
            </div>
            <span className="text-xs text-muted-foreground -mt-1 scale-75 text-nowrap -translate-x-5">
              {t('hero.tagline')}
            </span>
          </Link>
        </motion.div>

        {/* Desktop Navigation */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="hidden md:flex items-center gap-6"
        >
          <Link
            role="link"
            href="/features"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {t('nav.features')}
          </Link>
          <Link
            role="link"
            href="/pricing"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {t('nav.pricing')}
          </Link>
          <Link
            role="link"
            href="/about"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {t('nav.about')}
          </Link>
          <Link
            role="link"
            href="/faq"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {t('nav.faq')}
          </Link>
          <Link
            role="link"
            href="/contact"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            {t('nav.contact')}
          </Link>
          <LanguageSwitcher />
          <ModeToggle />
          <Link role="link" href="/sign-up">
            <Button size="sm">{t('nav.signUp')}</Button>
          </Link>
          <Link role="link" href="/sign-in">
            <Button size="sm">{t('nav.login')}</Button>
          </Link>
        </motion.nav>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 md:hidden">
          <ModeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t md:hidden"
          >
            <div className="flex items-center justify-end p-2">
              <LanguageSwitcher />
            </div>
            <nav className="container py-4 px-4 space-y-3">
              <Link
                role="link"
                href="/features"
                className="block text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {t('nav.features')}
              </Link>
              <Link
                role="link"
                href="/pricing"
                className="block text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {t('nav.pricing')}
              </Link>
              <Link
                role="link"
                href="/about"
                className="block text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {t('nav.about')}
              </Link>
              <Link
                role="link"
                href="/faq"
                className="block text-sm font-medium text-muted-foreground hover:text-primary"
                onClick={() => setMenuOpen(false)}
              >
                {t('nav.faq')}
              </Link>
              <Link
                role="link"
                className="inline-block w-full mt-4"
                href="/sign-up"
                onClick={() => setMenuOpen(false)}
              >
                <Button className="w-full" size="sm">
                  {t('nav.signUp')}
                </Button>
              </Link>
              <Link
                role="link"
                className="inline-block w-full mt-4"
                href="/sign-in"
                onClick={() => setMenuOpen(false)}
              >
                <Button className="w-full" size="sm">
                  {t('nav.login')}
                </Button>
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
