import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeatureSection } from '../FeatureSection'
import { useTranslations } from 'next-intl'

// Mock useTranslations to return translation keys as-is for testing
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

describe('FeatureSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正常にレンダリングされる', () => {
    render(<FeatureSection />)
    expect(screen.getByTestId('feature-section')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('title')
    expect(screen.getByRole('img')).toHaveAttribute('src', '/assets/mockup/pc/reservation_top.png')
  })

  describe('画像が正しくレンダリングされる', () => {
    it('画像が正しくレンダリングされる', () => {
      render(<FeatureSection />)
      const image = screen.getByRole('img', { name: 'items.smartReservation.title' })
      expect(image).toHaveAttribute('src', '/assets/mockup/pc/reservation_top.png')
      expect(image).toHaveAttribute('width', '3020')
      expect(image).toHaveAttribute('height', '1646')
      expect(image).toHaveAttribute('sizes')
    })
  })

  describe('必要な翻訳キーがすべて使用されている', () => {
    it('必要な翻訳キーがすべて使用されている', () => {
      const mockT = vi.fn((key: string) => key)
      vi.mocked(useTranslations).mockReturnValue(mockT as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<FeatureSection />)

      expect(mockT).toHaveBeenCalledWith('title')
      expect(mockT).toHaveBeenCalledWith('subtitle')
      expect(mockT).toHaveBeenCalledWith('items.smartReservation.title')
      expect(mockT).toHaveBeenCalledWith('items.smartReservation.description')
      expect(mockT).toHaveBeenCalledWith('items.optimizationAlgorithm.title')
      expect(mockT).toHaveBeenCalledWith('items.optimizationAlgorithm.description')
      expect(mockT).toHaveBeenCalledWith('items.digitalCarte.title')
      expect(mockT).toHaveBeenCalledWith('items.digitalCarte.description')
      expect(mockT).toHaveBeenCalledWith('items.allInOne.title')
      expect(mockT).toHaveBeenCalledWith('items.allInOne.description')
      expect(mockT).toHaveBeenCalledWith('items.userFriendly.title')
      expect(mockT).toHaveBeenCalledWith('items.userFriendly.description')
      expect(mockT).toHaveBeenCalledWith('items.support.title')
      expect(mockT).toHaveBeenCalledWith('items.support.description')
    })
  })

  it('6つの既存機能の見出しと説明をすべて表示する', () => {
    render(<FeatureSection />)

    const keys = [
      'smartReservation',
      'optimizationAlgorithm',
      'digitalCarte',
      'allInOne',
      'userFriendly',
      'support',
    ]
    for (const key of keys) {
      expect(screen.getByText(`items.${key}.title`)).toBeInTheDocument()
      expect(screen.getByText(`items.${key}.description`)).toBeInTheDocument()
    }
  })
})
