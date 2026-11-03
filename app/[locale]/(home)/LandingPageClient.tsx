'use client'

import { useEffect, useState } from 'react'
import { ChannelTalkLoader } from '@/components/common/ChannelTalkLoader'
import './landing.css'
import {
  HeroSection,
  FeatureSection,
  Pricing,
  HeaderSection,
  ContentSection,
  CTASection,
  FAQ,
  SplashScreen,
  Header,
  Footer,
} from './_components'

export function LandingPageClient() {
  const [showSplash, setShowSplash] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // ハイドレーション完了を検知
  useEffect(() => {
    setIsHydrated(true)

    // 1時間でリフレッシュする初回表示制御
    try {
      const lastShown = localStorage.getItem('bockerLastSplash')
      const now = Date.now()
      const oneHour = 60 * 60 * 1000

      if (!lastShown || now - parseInt(lastShown) > oneHour) {
        setShowSplash(true)
        localStorage.setItem('bockerLastSplash', now.toString())
        // 初期表示時にスクロールを無効化
        document.body.style.overflow = 'hidden'
      }
    } catch (error) {
      // LocalStorageエラー時はスプラッシュスクリーンを表示しない
      console.error('LocalStorage error:', error)
    }
  }, [])

  // Fix for scroll issue - prevent overflow on body
  useEffect(() => {
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  // スプラッシュスクリーン表示中はスクロールを防ぐ
  useEffect(() => {
    if (showSplash) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [showSplash])

  const handleSplashComplete = () => {
    setShowSplash(false)
  }

  // ハイドレーション前は何も表示しない
  if (!isHydrated) {
    return <div className="fixed inset-0 z-50 bg-background" />
  }

  return (
    <div data-testid="landing-page-client" className="landing-shell">
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      <div
        style={{
          display: showSplash ? 'none' : 'block',
          visibility: showSplash ? 'hidden' : 'visible',
        }}
      >
        <Header variant="landing" />
        <main
          id="landing-main"
          data-testid="main"
          className="landing-main flex min-h-screen flex-col bg-background text-foreground"
        >
          <HeroSection />
          <FeatureSection />
          <Pricing variant="landing" />
          <ContentSection />
          <CTASection variant="landing" />
          <FAQ variant="landing" />
          <HeaderSection variant="landing" />
        </main>

        <Footer variant="landing" />
      </div>
      <ChannelTalkLoader />
    </div>
  )
}
