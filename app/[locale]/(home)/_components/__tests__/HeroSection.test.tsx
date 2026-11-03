import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTranslations } from 'next-intl'
import { HeroSection } from '../HeroSection'
import type { ImgHTMLAttributes } from 'react'

vi.mock('next/image', () => ({
  default: ({
    priority,
    alt,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    void priority
    // eslint-disable-next-line @next/next/no-img-element -- Keep the image contract visible in jsdom.
    return <img alt={alt} {...props} />
  },
}))

// Mock useTranslations to return translation keys as-is for testing
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

describe('HeroSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('基本機能', () => {
    it('正常にレンダリングされる', () => {
      render(<HeroSection />)

      // メインセクションが表示される (note: component uses data-testid instead of data-test-id)
      const container = document.querySelector('[data-testid="hero-section"]')
      expect(container).toBeInTheDocument()
    })

    it('メインタイトルが表示される', () => {
      render(<HeroSection />)

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toBeInTheDocument()
      expect(heading).toHaveTextContent('title')
    })

    it('サブタイトルが表示される', () => {
      render(<HeroSection />)

      expect(screen.getByText('subtitle')).toBeInTheDocument()
    })
  })

  describe('CTAボタン', () => {
    it('デモボタンが表示される', () => {
      render(<HeroSection />)

      const demoButton = screen.getByText('cta.demo')
      expect(demoButton).toBeInTheDocument()

      const demoLink = demoButton.closest('a')
      expect(demoLink).toHaveAttribute(
        'href',
        'https://bocker-project.vercel.app/ja/reservation/v5799kb53q14k5tyf4y0kj636d7jhz8p'
      )
    })

    it('トライアルリンクが表示される', () => {
      render(<HeroSection />)

      const trialLink = screen.getByText('cta.trial')
      expect(trialLink).toBeInTheDocument()
      expect(trialLink.closest('a')).toHaveAttribute('href', '/sign-up')
    })

    it('資料請求ボタンが表示される', () => {
      render(<HeroSection />)

      const materialButton = screen.getByText('cta.requestMaterial')
      expect(materialButton).toBeInTheDocument()
      expect(materialButton.closest('a')).toHaveAttribute('href', '/contact')
    })

    it('CTAリンクがクリック可能で、操作要素が入れ子になっていない', () => {
      render(<HeroSection />)

      const links = screen.getAllByRole('link')
      expect(links).toHaveLength(3)
      expect(screen.getByTestId('hero-cta')).toHaveAttribute('href', '/contact')
      expect(document.querySelector('a button, button a')).not.toBeInTheDocument()
      links.forEach((link) => {
        const onClick = vi.fn((event: Event) => event.preventDefault())
        link.addEventListener('click', onClick)
        fireEvent.click(link)
        expect(onClick).toHaveBeenCalledOnce()
      })
    })
  })

  describe('製品プレビュー', () => {
    it('顧客情報を含まない公開モックアップを使用し、画像サイズと代替テキストを指定する', () => {
      render(<HeroSection />)

      const menuPreview = screen.getByRole('img', { name: 'menuManagement.title' })
      expect(menuPreview).toHaveAttribute('src', '/assets/mockup/pc/menu.png')
      expect(menuPreview).toHaveAttribute('width', '3020')
      expect(menuPreview).toHaveAttribute('height', '1646')
      expect(menuPreview).toHaveAttribute('sizes')

      const bookingPreview = screen.getByRole('img', { name: 'smartReservation.title' })
      expect(bookingPreview).toHaveAttribute('src', '/assets/mockup/sp/reservation_calendar.jpg')
      expect(bookingPreview).toHaveAttribute('width', '1125')
      expect(bookingPreview).toHaveAttribute('height', '1876')
      expect(bookingPreview).toHaveAttribute('sizes')
    })
  })

  describe('多言語対応', () => {
    it('必要な翻訳キーがすべて使用されている', () => {
      const mockT = vi.fn((key: string) => key)
      vi.mocked(useTranslations).mockReturnValue(mockT as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<HeroSection />)

      // 重要な翻訳キーが呼び出されることを確認
      expect(mockT).toHaveBeenCalledWith('title')
      expect(mockT).toHaveBeenCalledWith('subtitle')
      expect(mockT).toHaveBeenCalledWith('cta.demo')
      expect(mockT).toHaveBeenCalledWith('cta.trial')
      expect(mockT).toHaveBeenCalledWith('cta.requestMaterial')
    })
  })
})
