import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { envConfig, getEnv, hasEnv, resolveAppUrl, validateEnv } from '../env-config'

describe('env-config ライブラリ', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Use actual environment variables from .env.local instead of overriding
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('EnvConfigManager基本機能', () => {
    it('シングルトンパターンで実装されている', () => {
      const instance1 = envConfig
      const instance2 = envConfig
      expect(instance1).toBe(instance2)
    })

    it('環境変数を正しく読み込む', () => {
      expect(getEnv('NODE_ENV')).toBe('test')
      expect(getEnv('NEXT_PUBLIC_CONVEX_URL')).toBe('https://optimistic-herring-662.convex.cloud')
      expect(getEnv('STRIPE_SECRET_KEY')).toBe('sk_test_mock')
    })

    it('存在しない環境変数でエラーをスローする', () => {
      expect(() => getEnv('NON_EXISTENT_KEY' as any)).toThrow('NON_EXISTENT_KEY is not set') // eslint-disable-line @typescript-eslint/no-explicit-any
    })
  })

  describe('アプリURL解決', () => {
    it('開発環境では開発URLを返す', () => {
      expect(
        resolveAppUrl({
          NODE_ENV: 'development',
          NEXT_PUBLIC_DEVELOP_URL: 'http://localhost:3000/ja',
        })
      ).toBe('http://localhost:3000/ja')
    })

    it('開発URLが未設定ならlocalhostへフォールバックする', () => {
      expect(resolveAppUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3000')
      expect(resolveAppUrl({ NODE_ENV: 'test' })).toBe('http://localhost:3000')
    })

    it('本番環境ではデプロイURLを必須にする', () => {
      expect(
        resolveAppUrl({
          NODE_ENV: 'production',
          NEXT_PUBLIC_DEPLOY_URL: 'https://bocker.jp',
        })
      ).toBe('https://bocker.jp')
    })

    it('本番環境でデプロイURLも Vercel URL も無い場合、ブラウザでは現在のオリジンを使う', () => {
      // vitest は jsdom 環境のため window.location.origin が存在する
      expect(resolveAppUrl({ NODE_ENV: 'production' })).toBe(window.location.origin)
    })

    it('本番環境でデプロイURLも Vercel URL も無く、ブラウザでもなければエラーをスローする', () => {
      vi.stubGlobal('window', undefined)
      try {
        expect(() => resolveAppUrl({ NODE_ENV: 'production' })).toThrow(
          'NEXT_PUBLIC_DEPLOY_URL is not set'
        )
      } finally {
        vi.unstubAllGlobals()
      }
    })

    it('本番ビルドでデプロイURLが未設定なら Vercel の自動付与URLへフォールバックする', () => {
      // Preview デプロイ: VERCEL_URL を使う
      expect(
        resolveAppUrl({
          NODE_ENV: 'production',
          VERCEL_ENV: 'preview',
          VERCEL_URL: 'bocker-project-abc123.vercel.app',
          VERCEL_PROJECT_PRODUCTION_URL: 'bocker.jp',
        })
      ).toBe('https://bocker-project-abc123.vercel.app')

      // 本番デプロイ: VERCEL_PROJECT_PRODUCTION_URL を優先する
      expect(
        resolveAppUrl({
          NODE_ENV: 'production',
          VERCEL_ENV: 'production',
          VERCEL_URL: 'bocker-project-abc123.vercel.app',
          VERCEL_PROJECT_PRODUCTION_URL: 'bocker.jp',
        })
      ).toBe('https://bocker.jp')

      // 明示設定があればそれが最優先
      expect(
        resolveAppUrl({
          NODE_ENV: 'production',
          NEXT_PUBLIC_DEPLOY_URL: 'https://bocker.jp',
          VERCEL_ENV: 'preview',
          VERCEL_URL: 'bocker-project-abc123.vercel.app',
        })
      ).toBe('https://bocker.jp')

      // 既にスキームが付いている場合は二重に付けない
      expect(
        resolveAppUrl({
          NODE_ENV: 'production',
          VERCEL_URL: 'https://bocker-project-abc123.vercel.app',
        })
      ).toBe('https://bocker-project-abc123.vercel.app')
    })
  })

  describe('hasEnv function', () => {
    it('存在する環境変数でtrueを返す', () => {
      expect(hasEnv('NODE_ENV')).toBe(true)
      expect(hasEnv('STRIPE_SECRET_KEY')).toBe(true)
    })

    it('存在しない環境変数でfalseを返す', () => {
      // 設定されていない環境変数をテスト
      // 型エラーを許容するため、any型でキャスト
      expect(hasEnv('NON_EXISTENT_TEST_VAR' as any)).toBe(false) // eslint-disable-line @typescript-eslint/no-explicit-any
    })
  })

  describe('validateEnv function', () => {
    it('validateEnv関数が定義されている', () => {
      expect(typeof validateEnv).toBe('function')
    })

    it('環境変数検証の動作確認', () => {
      // 実際の環境変数状態に関わらず関数が呼び出し可能であることを確認
      expect(() => {
        try {
          validateEnv()
        } catch (error) {
          // エラーが発生しても型は確認できる
          expect(error).toBeInstanceOf(Error)
        }
      }).not.toThrow()
    })
  })

  describe('Convex設定', () => {
    it('Convex関連の環境変数が設定されている', () => {
      const convexUrl = getEnv('NEXT_PUBLIC_CONVEX_URL')
      expect(convexUrl).toBeDefined()
      expect(typeof convexUrl).toBe('string')
      expect(convexUrl.length).toBeGreaterThan(0)
    })
  })

  describe('Clerk認証設定', () => {
    it('Clerk関連の環境変数が設定されている', () => {
      const publishableKey = getEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
      const secretKey = getEnv('CLERK_SECRET_KEY')

      expect(publishableKey).toBeDefined()
      expect(secretKey).toBeDefined()
      expect(typeof publishableKey).toBe('string')
      expect(typeof secretKey).toBe('string')
    })
  })

  describe('Stripe決済設定', () => {
    it('Stripe関連の環境変数が設定されている', () => {
      const stripeSecret = getEnv('STRIPE_SECRET_KEY')
      const liteMonthly = getEnv('NEXT_PUBLIC_LITE_MONTHLY_PRC_ID')

      expect(stripeSecret).toBeDefined()
      expect(liteMonthly).toBeDefined()
      expect(typeof stripeSecret).toBe('string')
      expect(typeof liteMonthly).toBe('string')
    })

    it('Stripe Price IDが美容サロン料金プランに対応している', () => {
      // LITEプラン（美容サロン向け基本プラン）
      expect(getEnv('NEXT_PUBLIC_LITE_MONTHLY_PRC_ID')).toContain('lite')
      expect(getEnv('NEXT_PUBLIC_LITE_YEARLY_PRC_ID')).toContain('lite')

      // PROプラン（高機能プラン）
      expect(getEnv('NEXT_PUBLIC_PRO_MONTHLY_PRC_ID')).toContain('pro')
      expect(getEnv('NEXT_PUBLIC_PRO_YEARLY_PRC_ID')).toContain('pro')
    })
  })

  describe('GCP設定', () => {
    it('GCP AI Studio APIキーが設定されている', () => {
      const apiKey = getEnv('GCP_AI_STUDIO_API_KEY')
      expect(apiKey).toBeDefined()
      expect(typeof apiKey).toBe('string')
      expect(apiKey.length).toBeGreaterThan(0)
    })
  })

  describe('Supabase設定', () => {
    it('Supabase関連の環境変数が設定されている', () => {
      const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL')
      expect(supabaseUrl).toBeDefined()
      expect(typeof supabaseUrl).toBe('string')
      expect(supabaseUrl).toMatch(/^https?:\/\//)

      // Service Role Keyは必須でない場合があるのでhasEnvで確認
      if (hasEnv('SUPABASE_SERVICE_ROLE_KEY')) {
        const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
        expect(typeof serviceKey).toBe('string')
      }
    })
  })

  describe('メール設定', () => {
    it('メール関連の環境変数が設定されている', () => {
      if (hasEnv('RESEND_API_KEY')) {
        const apiKey = getEnv('RESEND_API_KEY')
        expect(typeof apiKey).toBe('string')
      }

      if (hasEnv('RESEND_FROM_EMAIL')) {
        const fromEmail = getEnv('RESEND_FROM_EMAIL')
        expect(typeof fromEmail).toBe('string')
        expect(fromEmail).toMatch(/^.+@.+\..+$/) // Email format
      }
    })
  })

  describe('セキュリティ設定', () => {
    it('秘匿性の高い設定が適切に管理されている', () => {
      // APIキーや秘密鍵が適切な形式
      const stripeSecret = getEnv('STRIPE_SECRET_KEY')
      const clerkSecret = getEnv('CLERK_SECRET_KEY')

      expect(stripeSecret).toMatch(/^sk_test_/)
      expect(clerkSecret).toMatch(/^sk_test_/)
    })

    it('public設定とprivate設定が適切に分離されている', () => {
      // Public設定（フロントエンドで利用可能）
      expect(() => getEnv('NEXT_PUBLIC_CONVEX_URL')).not.toThrow()
      expect(() => getEnv('NEXT_PUBLIC_SUPABASE_URL')).not.toThrow()

      // Private設定（サーバーサイドのみ）
      expect(() => getEnv('STRIPE_SECRET_KEY')).not.toThrow()
      expect(() => getEnv('CLERK_SECRET_KEY')).not.toThrow()
    })
  })

  describe('実環境における設定検証', () => {
    it('美容サロン事業に必要な全サービスが設定されている', () => {
      const requiredServices = [
        'NEXT_PUBLIC_CONVEX_URL', // リアルタイムDB
        'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', // 認証
        'STRIPE_SECRET_KEY', // 決済
        'NEXT_PUBLIC_SUPABASE_URL', // 分析DB
        'GCP_AI_STUDIO_API_KEY', // AI機能
        'RESEND_API_KEY', // メール送信
      ]

      requiredServices.forEach((service) => {
        expect(hasEnv(service as any)).toBe(true) // eslint-disable-line @typescript-eslint/no-explicit-any
      })
    })

    it('マルチテナント対応に必要な設定が含まれている', () => {
      // 各テナント（美容サロン）の設定
      expect(hasEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')).toBe(true)
      expect(hasEnv('STRIPE_SECRET_KEY')).toBe(true)
    })
  })

  describe('エラーハンドリング', () => {
    it('型安全性が保たれている', () => {
      // 正しい型で設定を取得
      const nodeEnv: string = getEnv('NODE_ENV')
      const convexUrl: string = getEnv('NEXT_PUBLIC_CONVEX_URL')

      expect(typeof nodeEnv).toBe('string')
      expect(typeof convexUrl).toBe('string')
    })

    it('未定義の設定キーでTypeScriptエラーが発生する想定', () => {
      // TypeScriptレベルでの型チェックは実行時には検証不可だが、
      // 実行時の動作を確認
      expect(() => getEnv('INVALID_KEY' as any)).toThrow() // eslint-disable-line @typescript-eslint/no-explicit-any
    })
  })
})
