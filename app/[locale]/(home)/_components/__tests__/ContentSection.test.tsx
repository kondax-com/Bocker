import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTranslations } from 'next-intl'
import { ContentSection } from '../ContentSection'

// Mock useTranslations to return translation keys as-is for testing
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}))

describe('ContentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('基本機能', () => {
    it('正常にレンダリングされる', () => {
      render(<ContentSection />)

      // メインセクションが表示される
      expect(screen.getByTestId('content-section')).toBeInTheDocument()
    })
  })

  describe('ベネフィットリスト', () => {
    it('ベネフィットリストが正しく表示される', () => {
      render(<ContentSection />)

      // リスト構造の確認
      const benefitsList = screen.getByRole('list')
      expect(benefitsList).toBeInTheDocument()

      // 3つのリストアイテムが存在
      const listItems = screen.getAllByRole('listitem')
      expect(listItems).toHaveLength(3)

      // 各ベネフィットの翻訳キーが存在
      expect(screen.getByText('benefits.sales.title')).toBeInTheDocument()
      expect(screen.getByText('benefits.mistakes.title')).toBeInTheDocument()
      expect(screen.getByText('benefits.efficiency.title')).toBeInTheDocument()
    })

    it('各ベネフィット項目にアイコンが表示される', () => {
      render(<ContentSection />)

      // アイコンはaria-hidden="true"属性を持つ
      const icons = document.querySelectorAll('[aria-hidden="true"]')
      expect(icons.length).toBeGreaterThanOrEqual(3) // 最低3つのアイコン
    })
  })

  describe('画像表示', () => {
    it('顧客情報を含まないポイント設定の公開モックアップ画像が表示される', () => {
      render(<ContentSection />)

      const image = screen.getByRole('img')
      expect(image).toBeInTheDocument()
      expect(image).toHaveAttribute('src', '/assets/mockup/pc/point.png')
      expect(image).toHaveAttribute('width', '3020')
      expect(image).toHaveAttribute('height', '1646')
    })

    it('画像に適切なalt属性が設定されている', () => {
      render(<ContentSection />)

      const image = screen.getByRole('img')
      expect(image).toHaveAttribute('alt', 'marketing.title')
    })
  })

  describe('ROIセクション', () => {
    it('ROI情報が正しく表示される', () => {
      render(<ContentSection />)

      // ROI翻訳キーの確認
      expect(screen.getByText('roi.title')).toBeInTheDocument()
      expect(screen.getByText('roi.description')).toBeInTheDocument()
      expect(screen.getByText('averageResults')).toBeInTheDocument()
    })
  })

  describe('アクセシビリティ', () => {
    it('適切な見出し階層が使用されている', () => {
      render(<ContentSection />)

      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('title')
      expect(screen.getByRole('heading', { level: 3, name: 'roi.title' })).toBeInTheDocument()
      for (const key of ['sales', 'mistakes', 'efficiency']) {
        expect(
          screen.getByRole('heading', { level: 3, name: `benefits.${key}.title` })
        ).toBeInTheDocument()
      }
    })

    it('リスト構造が適切にマークアップされている', () => {
      render(<ContentSection />)

      const list = screen.getByRole('list')
      expect(list).toBeInTheDocument()

      const listItems = screen.getAllByRole('listitem')
      expect(listItems).toHaveLength(3)
    })
  })

  describe('レスポンシブ対応', () => {
    it('画像の寸法とレスポンシブ表示サイズが指定されている', () => {
      render(<ContentSection />)

      const image = screen.getByRole('img')
      expect(image).toHaveAttribute('width', '3020')
      expect(image).toHaveAttribute('height', '1646')
      expect(image).toHaveAttribute('sizes')
    })
  })

  describe('エラーハンドリング', () => {
    it('useTranslationsが正しく呼び出される', () => {
      const mockUseTranslations = vi.mocked(useTranslations)

      render(<ContentSection />)

      expect(mockUseTranslations).toHaveBeenCalledWith('landing.content')
    })
  })

  describe('コンポーネント統合', () => {
    it('初期表示時にセクションと既存の説明文が表示される', () => {
      render(<ContentSection />)

      const mainContainer = screen.getByTestId('content-section')

      expect(mainContainer).toBeInTheDocument()
      for (const key of [
        'tagline',
        'mainDescription',
        'industryProblem',
        'averageResults',
        'roi.description',
      ]) {
        expect(screen.getByText(key)).toBeInTheDocument()
      }
    })

    it('Next.js Imageコンポーネントが正しくレンダリングされる', () => {
      render(<ContentSection />)

      // モックされたImageコンポーネントがimg要素として表示される
      const image = screen.getByRole('img')
      expect(image).toHaveAttribute('src', '/assets/mockup/pc/point.png')
    })
  })

  describe('多言語対応', () => {
    it('必要な翻訳キーがすべて使用されている', () => {
      const mockT = vi.fn((key: string) => key)
      vi.mocked(useTranslations).mockReturnValue(mockT as any) // eslint-disable-line @typescript-eslint/no-explicit-any

      render(<ContentSection />)

      // 重要な翻訳キーが呼び出されることを確認
      expect(mockT).toHaveBeenCalledWith('tagline')
      expect(mockT).toHaveBeenCalledWith('title')
      expect(mockT).toHaveBeenCalledWith('mainDescription')
      expect(mockT).toHaveBeenCalledWith('industryProblem')
      expect(mockT).toHaveBeenCalledWith('benefits.sales.title')
      expect(mockT).toHaveBeenCalledWith('benefits.mistakes.title')
      expect(mockT).toHaveBeenCalledWith('benefits.efficiency.title')
      expect(mockT).toHaveBeenCalledWith('roi.title')
    })
  })
})
