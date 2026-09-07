type EnvConfig = {
  NODE_ENV: string
  NEXT_PUBLIC_DEPLOY_URL: string
  NEXT_PUBLIC_DEVELOP_URL: string

  // Convex
  CONVEX_DEPLOYMENT: string
  NEXT_PUBLIC_CONVEX_URL: string
  NEXT_PUBLIC_CONVEX_AUD: string

  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: string
  CLERK_SECRET_KEY: string
  CLERK_WEBHOOK_SIGNING_SECRET: string
  CLERK_JWT_ISSUER_DOMAIN: string
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: string
  NEXT_PUBLIC_CLERK_SIGN_UP_REDIRECT_URL: string
  NEXT_PUBLIC_CLERK_SIGN_IN_REDIRECT_URL: string

  // Stripe
  STRIPE_SECRET_KEY: string
  STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: string
  STRIPE_CONNECT_WEBHOOK_SECRET: string
  STRIPE_CHECKOUT_WEBHOOK_SECRET?: string

  // StripeF�ID
  NEXT_PUBLIC_MICRO_PROD_ID: string
  NEXT_PUBLIC_LITE_PROD_ID: string
  NEXT_PUBLIC_PRO_PROD_ID: string

  // Stripe�<ID
  NEXT_PUBLIC_MICRO_MONTHLY_PRC_ID: string
  NEXT_PUBLIC_MICRO_YEARLY_PRC_ID: string
  NEXT_PUBLIC_LITE_MONTHLY_PRC_ID: string
  NEXT_PUBLIC_LITE_YEARLY_PRC_ID: string
  NEXT_PUBLIC_PRO_MONTHLY_PRC_ID: string
  NEXT_PUBLIC_PRO_YEARLY_PRC_ID: string

  // App Auth
  NEXT_PUBLIC_APP_COOKIE_SECRET: string
  APP_JWT_SECRET: string
  SYSMTE_COOKIE_SECRET: string
  SYSTEM_JWT_SECRET: string

  // GCP AI Studio
  GCP_AI_STUDIO_API_KEY: string

  // GCP Cloud Storage
  GCP_PROJECT: string
  GCP_CLIENT_EMAIL: string
  GCP_PRIVATE_KEY: string
  NEXT_PUBLIC_GCP_PROJECT_ID: string
  NEXT_PUBLIC_GCP_STORAGE_BUCKET_NAME: string
  NEXT_PUBLIC_CDN_DOMAIN: string

  // Cloudflare R2
  CLOUDFLARE_R2_ACCOUNT_ID: string
  CLOUDFLARE_R2_ACCESS_KEY_ID: string
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: string
  CLOUDFLARE_R2_BUCKET_NAME: string

  // LINE
  COMPANY_LINE_CHANNEL_ACCESS_TOKEN: string

  // GCS Lifecycle
  GCS_LIFECYCLE_ENABLED: string
  GCS_HOT_TIER_DAYS: string
  GCS_WARM_TIER_DAYS: string
  GCP_MONITORING_ENABLED: string

  // Session
  NEXT_PUBLIC_LOGIN_SESSION: string
  NEXT_PUBLIC_SESSION_SERCRET: string

  // Channel Talk
  NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY: string

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string

  // Resend
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL: string
}

class EnvConfigManager {
  private static instance: EnvConfigManager
  private config: Partial<EnvConfig> = {}

  private constructor() {
    this.loadConfig()
  }

  static getInstance(): EnvConfigManager {
    if (!EnvConfigManager.instance) {
      EnvConfigManager.instance = new EnvConfigManager()
    }
    return EnvConfigManager.instance
  }

  private loadConfig(): void {
    this.config = {
      NODE_ENV: process.env.NODE_ENV || 'development',

      NEXT_PUBLIC_DEPLOY_URL: process.env.NEXT_PUBLIC_DEPLOY_URL!,
      NEXT_PUBLIC_DEVELOP_URL: process.env.NEXT_PUBLIC_DEVELOP_URL!,

      // Convex
      CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT!,
      NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL!,
      NEXT_PUBLIC_CONVEX_AUD: process.env.NEXT_PUBLIC_CONVEX_AUD!,

      // Clerk
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
      CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET!,
      CLERK_JWT_ISSUER_DOMAIN: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL!,
      NEXT_PUBLIC_CLERK_SIGN_UP_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_REDIRECT_URL!,
      NEXT_PUBLIC_CLERK_SIGN_IN_REDIRECT_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_REDIRECT_URL!,

      // Stripe
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
      STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET!,
      STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,
      STRIPE_CHECKOUT_WEBHOOK_SECRET: process.env.STRIPE_CHECKOUT_WEBHOOK_SECRET,

      // Stripe Products
      NEXT_PUBLIC_MICRO_PROD_ID: process.env.NEXT_PUBLIC_MICRO_PROD_ID!,
      NEXT_PUBLIC_LITE_PROD_ID: process.env.NEXT_PUBLIC_LITE_PROD_ID!,
      NEXT_PUBLIC_PRO_PROD_ID: process.env.NEXT_PUBLIC_PRO_PROD_ID!,

      // Stripe Prices
      NEXT_PUBLIC_MICRO_MONTHLY_PRC_ID: process.env.NEXT_PUBLIC_MICRO_MONTHLY_PRC_ID!,
      NEXT_PUBLIC_MICRO_YEARLY_PRC_ID: process.env.NEXT_PUBLIC_MICRO_YEARLY_PRC_ID!,
      NEXT_PUBLIC_LITE_MONTHLY_PRC_ID: process.env.NEXT_PUBLIC_LITE_MONTHLY_PRC_ID!,
      NEXT_PUBLIC_LITE_YEARLY_PRC_ID: process.env.NEXT_PUBLIC_LITE_YEARLY_PRC_ID!,
      NEXT_PUBLIC_PRO_MONTHLY_PRC_ID: process.env.NEXT_PUBLIC_PRO_MONTHLY_PRC_ID!,
      NEXT_PUBLIC_PRO_YEARLY_PRC_ID: process.env.NEXT_PUBLIC_PRO_YEARLY_PRC_ID!,

      // App Auth
      NEXT_PUBLIC_APP_COOKIE_SECRET: process.env.NEXT_PUBLIC_APP_COOKIE_SECRET!,
      APP_JWT_SECRET: process.env.APP_JWT_SECRET!,
      SYSMTE_COOKIE_SECRET: process.env.SYSMTE_COOKIE_SECRET!,
      SYSTEM_JWT_SECRET: process.env.SYSTEM_JWT_SECRET!,

      // GCP
      GCP_AI_STUDIO_API_KEY: process.env.GCP_AI_STUDIO_API_KEY!,
      GCP_PROJECT: process.env.GCP_PROJECT!,
      GCP_CLIENT_EMAIL: process.env.GCP_CLIENT_EMAIL!,
      GCP_PRIVATE_KEY: process.env.GCP_PRIVATE_KEY!,
      NEXT_PUBLIC_GCP_PROJECT_ID: process.env.NEXT_PUBLIC_GCP_PROJECT_ID!,
      NEXT_PUBLIC_GCP_STORAGE_BUCKET_NAME: process.env.NEXT_PUBLIC_GCP_STORAGE_BUCKET_NAME!,
      NEXT_PUBLIC_CDN_DOMAIN: process.env.NEXT_PUBLIC_CDN_DOMAIN!,

      // Cloudflare R2
      CLOUDFLARE_R2_ACCOUNT_ID: process.env.CLOUDFLARE_R2_ACCOUNT_ID!,
      CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME!,

      // LINE
      COMPANY_LINE_CHANNEL_ACCESS_TOKEN: process.env.COMPANY_LINE_CHANNEL_ACCESS_TOKEN!,

      // GCS Lifecycle
      GCS_LIFECYCLE_ENABLED: process.env.GCS_LIFECYCLE_ENABLED!,
      GCS_HOT_TIER_DAYS: process.env.GCS_HOT_TIER_DAYS!,
      GCS_WARM_TIER_DAYS: process.env.GCS_WARM_TIER_DAYS!,
      GCP_MONITORING_ENABLED: process.env.GCP_MONITORING_ENABLED!,

      // Session
      NEXT_PUBLIC_LOGIN_SESSION: process.env.NEXT_PUBLIC_LOGIN_SESSION!,
      NEXT_PUBLIC_SESSION_SERCRET: process.env.NEXT_PUBLIC_SESSION_SERCRET!,

      // Channel Talk
      NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY: process.env.NEXT_PUBLIC_CHANNEL_TALK_PLUGIN_KEY!,

      // Supabase
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,

      // Resend
      RESEND_API_KEY: process.env.RESEND_API_KEY!,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL!,
    }
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    const value = this.config[key]

    if (value === undefined || value.trim() === '') {
      throw new Error(`${key} is not set`)
    }

    return value as EnvConfig[K]
  }

  has(key: keyof EnvConfig): boolean {
    const value = this.config[key]
    return value !== undefined && value.trim() !== ''
  }

  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development'
  }

  isLocal(): boolean {
    return this.config.NODE_ENV === 'local'
  }

  isProduction(): boolean {
    return this.config.NODE_ENV === 'production'
  }

  getAppUrl(): string {
    return resolveAppUrl({
      ...this.config,
      // Vercel が自動付与するシステム環境変数（NEXT_PUBLIC_ 版はクライアントバンドルにも埋め込まれる）
      VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV,
      VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL,
      VERCEL_PROJECT_PRODUCTION_URL:
        process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
    })
  }

  validateRequired(): void {
    const requiredKeys: (keyof EnvConfig)[] = [
      'NEXT_PUBLIC_CONVEX_URL',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_MICRO_PROD_ID',
      'NEXT_PUBLIC_LITE_PROD_ID',
      'NEXT_PUBLIC_PRO_PROD_ID',
      'NEXT_PUBLIC_MICRO_MONTHLY_PRC_ID',
      'NEXT_PUBLIC_MICRO_YEARLY_PRC_ID',
      'NEXT_PUBLIC_LITE_MONTHLY_PRC_ID',
      'NEXT_PUBLIC_LITE_YEARLY_PRC_ID',
      'NEXT_PUBLIC_PRO_MONTHLY_PRC_ID',
      'NEXT_PUBLIC_PRO_YEARLY_PRC_ID',
      'CLOUDFLARE_R2_ACCOUNT_ID',
      'CLOUDFLARE_R2_ACCESS_KEY_ID',
      'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      'CLOUDFLARE_R2_BUCKET_NAME',
      'NEXT_PUBLIC_CDN_DOMAIN',
      ...(this.isProduction() ? (['NEXT_PUBLIC_DEPLOY_URL'] as const) : []),
    ]

    const missing = requiredKeys.filter((key) => !this.has(key))

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
    }
  }
}

type AppUrlConfig = Partial<
  Pick<EnvConfig, 'NODE_ENV' | 'NEXT_PUBLIC_DEPLOY_URL' | 'NEXT_PUBLIC_DEVELOP_URL'>
> & {
  /** Vercel の VERCEL_ENV（'production' | 'preview' | 'development'） */
  VERCEL_ENV?: string
  /** Vercel が各デプロイに自動付与するホスト名（例: bocker-project-xxxx.vercel.app） */
  VERCEL_URL?: string
  /** Vercel の本番ドメイン（カスタムドメインがあればそれ） */
  VERCEL_PROJECT_PRODUCTION_URL?: string
}

const withHttps = (host: string): string =>
  /^https?:\/\//i.test(host) ? host : `https://${host}`

/**
 * アプリの公開URLを解決する。
 *
 * 本番ビルド（NODE_ENV=production）では以下の優先順位で解決する:
 *   1. NEXT_PUBLIC_DEPLOY_URL（明示設定。本番環境では必ず設定すること）
 *   2. Vercel 本番デプロイなら VERCEL_PROJECT_PRODUCTION_URL
 *   3. Vercel の Preview / Development デプロイなら VERCEL_URL
 *   4. ブラウザ上なら現在のオリジン
 *
 * 2〜4 のフォールバックは、Vercel の Preview 環境など NEXT_PUBLIC_DEPLOY_URL を
 * 環境ごとに設定していないデプロイで `next build` が
 * "NEXT_PUBLIC_DEPLOY_URL is not set" で失敗するのを防ぐためのもの。
 * いずれも解決できない場合のみエラーを投げる。
 */
export const resolveAppUrl = (config: AppUrlConfig): string => {
  if (config.NODE_ENV === 'production') {
    const deployUrl = config.NEXT_PUBLIC_DEPLOY_URL?.trim()
    if (deployUrl) {
      return deployUrl
    }

    const productionUrl = config.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    if (config.VERCEL_ENV === 'production' && productionUrl) {
      return withHttps(productionUrl)
    }

    const vercelUrl = config.VERCEL_URL?.trim()
    if (vercelUrl) {
      return withHttps(vercelUrl)
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }

    throw new Error('NEXT_PUBLIC_DEPLOY_URL is not set')
  }

  return config.NEXT_PUBLIC_DEVELOP_URL?.trim() || 'http://localhost:3000'
}

export const envConfig = EnvConfigManager.getInstance()

export type { EnvConfig }

export const getEnv = <K extends keyof EnvConfig>(key: K) => envConfig.get(key)
export const hasEnv = (key: keyof EnvConfig) => envConfig.has(key)
export const isDevelopment = () => envConfig.isDevelopment()
export const isProduction = () => envConfig.isProduction()
export const getAppUrl = () => envConfig.getAppUrl()

export const validateEnv = () => envConfig.validateRequired()
