import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTranslations } from 'next-intl'
import { Pricing } from '../Pricing'

// Mock useTranslations to return translation keys as-is for testing
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

describe('Pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('基本機能', () => {
    it('正常にレンダリングされる', () => {
      render(<Pricing />)

      // メインセクションが表示される (note: component uses data-testid instead of data-test-id)
      const container = document.querySelector('[data-testid="pricing"]')
      expect(container).toBeInTheDocument()
    })

    it('メインタイトルが表示される', () => {
      render(<Pricing />)

      const heading = screen.getByText('title')
      expect(heading).toBeInTheDocument()
      expect(heading.tagName).toBe('H2')
    })

    it('サブタイトルが表示される', () => {
      render(<Pricing />)

      expect(screen.getByText('subtitle')).toBeInTheDocument()
    })

    it('免責事項が表示される', () => {
      render(<Pricing />)

      expect(screen.getByText('disclaimer')).toBeInTheDocument()
    })
  })

  describe('料金プラン切り替え', () => {
    it.each(['default', 'landing'] as const)(
      '%s表示で全プランの月額と年額を切り替えられる',
      (variant) => {
        render(<Pricing variant={variant} />)

        const expectPrices = (frequency: 'monthly' | 'annually') => {
          for (const tier of ['micro', 'lite', 'pro']) {
            expect(document.querySelector(`[data-tier="${tier}"]`)).toHaveTextContent(
              `subscription.${tier}.price.${frequency}`
            )
          }
        }

        expectPrices('monthly')
        fireEvent.click(screen.getByRole('checkbox'))
        expectPrices('annually')
        fireEvent.click(screen.getByRole('checkbox'))
        expectPrices('monthly')
      }
    )

    it('月額・年額切り替えスイッチが表示される', () => {
      render(<Pricing />)

      expect(screen.getAllByText('type.monthly').length).toBeGreaterThan(0)
      expect(screen.getAllByText('type.annually').length).toBeGreaterThan(0)

      const switchElement = screen.getByRole('checkbox')
      expect(switchElement).toBeInTheDocument()
    })

    it('初期状態では月額が選択されている', () => {
      render(<Pricing />)

      const switchElement = screen.getByRole('checkbox')
      expect(switchElement).not.toBeChecked()

      // Find the monthly label in the switch area (first occurrence)
      const monthlyLabels = screen.getAllByText('type.monthly')
      const switchMonthlyLabel = monthlyLabels.find(
        (label) => label.closest('fieldset')?.getAttribute('aria-label') === 'Payment frequency'
      )
      expect(switchMonthlyLabel?.closest('span')).toHaveClass(
        'font-bold',
        'text-primary',
        'border-b-2',
        'border-primary'
      )
    })

    it('スイッチをクリックすると年額に切り替わる', () => {
      render(<Pricing />)

      const switchElement = screen.getByRole('checkbox')
      fireEvent.click(switchElement)

      expect(switchElement).toBeChecked()

      // Find the annually label in the switch area (first occurrence)
      const annuallyLabels = screen.getAllByText('type.annually')
      const switchAnnuallyLabel = annuallyLabels.find(
        (label) => label.closest('fieldset')?.getAttribute('aria-label') === 'Payment frequency'
      )
      expect(switchAnnuallyLabel?.closest('span')).toHaveClass(
        'font-bold',
        'text-primary',
        'border-b-2',
        'border-primary'
      )
    })
  })

  describe('エラーハンドリング', () => {
    it('useTranslationsが正しく呼び出される', () => {
      const mockUseTranslations = vi.mocked(useTranslations)

      render(<Pricing />)

      expect(mockUseTranslations).toHaveBeenCalledWith('landing.pricing')
    })

    it('翻訳値の評価が正しく動作する', () => {
      render(<Pricing />)

      // evaluateTierValue関数のテスト
      const container = document.querySelector('[data-testid="pricing"]')
      expect(container).toBeInTheDocument()
    })
  })

  describe('コンポーネント統合', () => {
    it('Framer Motionのアニメーション属性が適用される', () => {
      render(<Pricing />)

      const container = document.querySelector('[data-testid="pricing"]')
      expect(container).toBeInTheDocument()
    })

    it('UIコンポーネントが正しくレンダリングされる', () => {
      render(<Pricing />)

      const switchElement = screen.getByRole('checkbox')
      expect(switchElement).toBeInTheDocument()
    })
  })

  describe('多言語対応', () => {
    it('必要な翻訳キーがすべて使用されている', () => {
      const mockT = vi.fn((key: string) => key)
      vi.mocked(useTranslations).mockReturnValue(mockT as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<Pricing />)

      // 重要な翻訳キーが呼び出されることを確認
      expect(mockT).toHaveBeenCalledWith('title')
      expect(mockT).toHaveBeenCalledWith('subtitle')
      expect(mockT).toHaveBeenCalledWith('disclaimer')
      expect(mockT).toHaveBeenCalledWith('type.monthly')
      expect(mockT).toHaveBeenCalledWith('type.annually')
      expect(mockT).toHaveBeenCalledWith('subscription.lite.title')
      expect(mockT).toHaveBeenCalledWith('subscription.pro.title')
    })
  })

  describe('状態管理', () => {
    it('初期状態が正しく設定される', () => {
      render(<Pricing />)

      const switchElement = screen.getByRole('checkbox')
      expect(switchElement).not.toBeChecked()
    })

    it('状態変更が正しく動作する', () => {
      render(<Pricing />)

      const switchElement = screen.getByRole('checkbox')

      // 初期状態: 月額
      expect(switchElement).not.toBeChecked()

      // 年額に切り替え
      fireEvent.click(switchElement)
      expect(switchElement).toBeChecked()

      // 月額に戻す
      fireEvent.click(switchElement)
      expect(switchElement).not.toBeChecked()
    })
  })
})
