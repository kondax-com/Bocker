// /app/api/auth/line/start/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  createPreAuth,
  ccFromVerifier,
  OAUTH_COOKIE_PREFIX,
  OAUTH_TTL_MS,
  OAUTH_DEBUG_MODE,
  getOptimalCookieConfig,
  getOAuthConfigSummary,
  debugLogger,
} from '@/lib/line-oauth'
import { getServerApiConfig } from '@/services/notifications/apiConfig'
import type { Id } from '@/convex/_generated/dataModel'
import { seal } from '@/lib/crypto-server'
import { z } from 'zod'

/**
 * LINE OAuth 2.1 認可開始エンドポイント
 *
 * セキュアな認可開始を以下で実現：
 * - PKCE（S256）によるコード検証
 * - CSRF対策のための state パラメータ
 * - リプレイ攻撃対策の nonce
 * - 短期の HttpOnly クッキー保存
 */

// リクエストのバリデーションスキーマ
const StartAuthSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
  orgId: z.string().min(1, 'Organization ID is required'),
  isCustomerLogin: z.boolean().optional().default(false),
  redirectUri: z.string().url('Valid redirect URI is required'),
  scope: z.string().optional().default('profile openid'),
  next: z.string().optional(), // Safe redirect path after successful auth
})

/**
 * POST /api/auth/line/start
 * LINE OAuth 認可フローの初期化
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    debugLogger.info('Start', 'LINE OAuth authorization flow initiated', {
      userAgent: request.headers.get('User-Agent')?.substring(0, 100),
      referer: request.headers.get('Referer'),
      timestamp: new Date().toISOString(),
    })

    // リクエストボディを解析・検証
    const body = await request.json().catch(() => ({}))
    const validation = StartAuthSchema.safeParse(body)

    if (!validation.success) {
      debugLogger.error('Start', 'Request validation failed', {
        body,
        errors: validation.error.flatten(),
      })

      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          message: 'Invalid request parameters',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { tenantId, orgId, redirectUri: clientRedirectUri, scope, next } = validation.data

    // Convex(DB) からテナント/組織の LINE チャンネル設定を取得
    const apiConfig = await getServerApiConfig(
      tenantId as Id<'tenant'>,
      orgId as Id<'organization'>
    )
    const channelId = apiConfig?.line_channel_id
    if (!channelId) {
      debugLogger.error('Start', 'LINE channel configuration not found', {
        tenantId,
        orgId,
        hasApiConfig: !!apiConfig,
        apiConfigKeys: apiConfig ? Object.keys(apiConfig) : [],
      })

      // 実際に使用されている組織IDをコンソールに表示
      console.error('🔍 [DEBUG] LINE authentication failed - org_id/tenant_id mismatch:', {
        requestedTenantId: tenantId,
        requestedOrgId: orgId,
        foundApiConfig: !!apiConfig,
        configuredOrgId: 'v5799kb53q14k5tyf4y0kj636d7jhz8p',
        configuredTenantId: 'vn77xjxw2gn456tc2a1dnrh0rd7jggc4',
        message: 'URLで指定された組織IDがLINE設定を持たない組織を参照しています'
      })

      return NextResponse.json(
        {
          error: 'LINE authentication not configured',
          message: `LINEログイン設定が見つかりません（org_id: ${orgId}）`,
          debug: {
            requestedOrgId: orgId,
            configuredOrgId: 'v5799kb53q14k5tyf4y0kj636d7jhz8p'
          }
        },
        { status: 500 }
      )
    }

    debugLogger.info('Start', 'LINE channel configuration retrieved', {
      tenantId,
      orgId,
      hasChannelId: !!channelId,
      hasChannelSecret: !!apiConfig?.line_channel_secret,
    })

    // Compute effective redirect URI (frontend callback page)
    const computeBaseOrigin = (): string => {
      // 1) 開発用の公開設定（NEXT_PUBLIC_DEVELOP_URL）を最優先
      try {
        if (process.env.NEXT_PUBLIC_DEVELOP_URL) {
          return new URL(process.env.NEXT_PUBLIC_DEVELOP_URL).origin
        }
      } catch {}
      // 2) 代理ヘッダ（トンネルが Host を保持している場合）
      const xfProto = request.headers.get('x-forwarded-proto')
      const xfHost = request.headers.get('x-forwarded-host')
      if (xfProto && xfHost) {
        return `${xfProto}://${xfHost}`
      }
      // 3) フォールバック: 現在のオリジン
      return request.nextUrl.origin
    }

    const baseOrigin = computeBaseOrigin()
    // Use frontend callback page instead of API endpoint
    const locale = 'ja' // Default locale for LINE auth
    const effectiveRedirectUri = new URL(
      `/${locale}/reservation/auth/callback`,
      baseOrigin
    ).toString()
    // 影響のないトレースログ（redirect_uri 決定経路の可視化）
    try {
      console.log('[LineAuth:Start][TRACE] redirect base resolution', {
        env_NEXT_PUBLIC_DEVELOP_URL: process.env.NEXT_PUBLIC_DEVELOP_URL,
        headers: {
          host: request.headers.get('host'),
          x_forwarded_host: request.headers.get('x-forwarded-host'),
          x_forwarded_proto: request.headers.get('x-forwarded-proto'),
          referer: request.headers.get('referer'),
        },
        computed: { baseOrigin, effectiveRedirectUri, redirectType: 'frontend-page' },
      })
    } catch {}

    // セキュアな認証パラメータを生成
    const { stateId, preAuth } = createPreAuth({
      tenantId,
      orgId,
      next,
    })

    debugLogger.info('Start', 'Authentication state created', {
      stateId: stateId.substring(0, 8) + '...',
      hasCodeVerifier: !!preAuth.cv,
      hasNonce: !!preAuth.nonce,
      codeVerifierLength: preAuth.cv?.length,
      nonceLength: preAuth.nonce?.length,
      timestamp: preAuth.ts,
      ttlMs: OAUTH_TTL_MS,
    })

    // PKCE S256 で code_challenge を算出
    const codeChallenge = ccFromVerifier(preAuth.cv)

    // PreAuth を暗号化して HttpOnly クッキーに保存
    const cookieStore = await cookies()
    const cookieName = `${OAUTH_COOKIE_PREFIX}${stateId}`
    const encryptedPreAuth = seal(JSON.stringify(preAuth))

    // 環境に応じた最適なクッキー設定を取得
    const cookieOptions = getOptimalCookieConfig()

    debugLogger.info('Start', 'State cookie created', {
      cookieName,
      cookieOptions: {
        ...cookieOptions,
        maxAgeMinutes: Math.round(cookieOptions.maxAge / 60),
      },
      encryptedLength: encryptedPreAuth.length,
      expiresAt: new Date(Date.now() + OAUTH_TTL_MS).toISOString(),
    })

    cookieStore.set(cookieName, encryptedPreAuth, cookieOptions)

    // OAuth 2.1 仕様に沿って LINE 認可URLを作成
    const authUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')

    const authParams = {
      response_type: 'code',
      client_id: channelId,
      // Use server-computed redirect_uri to avoid client-origin mismatches
      redirect_uri: effectiveRedirectUri,
      state: stateId,
      scope: scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce: preAuth.nonce,
    }

    // URL にパラメータを付与
    Object.entries(authParams).forEach(([key, value]) => {
      if (value) {
        authUrl.searchParams.set(key, value)
      }
    })

    const finalAuthUrl = authUrl.toString()
    // 認可URLに含まれる redirect_uri を明示ログ
    try {
      const parsedAuthUrl = new URL(finalAuthUrl)
      const ru = parsedAuthUrl.searchParams.get('redirect_uri')
      console.log('[LineAuth:Start][AUTH_URL]', {
        redirect_uri: ru,
        url: finalAuthUrl,
      })
    } catch {}

    if (OAUTH_DEBUG_MODE) {
      console.log('[LineAuth:Start] Authorization URL generated:', {
        url: finalAuthUrl.replace(/[?&](state|nonce|code_challenge)=[^&]+/g, (match) =>
          match.replace(/=([^&]+)/, `=${match.split('=')[1].substring(0, 8)}...`)
        ),
        effectiveRedirectUri,
        clientRedirectUri,
        baseOrigin,
        headers: {
          host: request.headers.get('host'),
          xfHost: request.headers.get('x-forwarded-host'),
          xfProto: request.headers.get('x-forwarded-proto'),
          referer: request.headers.get('referer'),
          userAgent: request.headers.get('user-agent'),
        },
        cookieSet: cookieName,
        cookieOptions: {
          ...cookieOptions,
          maxAgeMinutes: Math.round(cookieOptions.maxAge / 60),
        },
        expiresIn: `${Math.round(OAUTH_TTL_MS / (60 * 1000))}min`,
        expiresAt: new Date(Date.now() + OAUTH_TTL_MS).toISOString(),
      })
    }

    // 認可URLを返却（クライアントでリダイレクト）
    return NextResponse.json({
      success: true,
      authorizationUrl: finalAuthUrl,
      stateId, // Client may need this for debugging
      expiresAt: Date.now() + OAUTH_TTL_MS,
    })
  } catch (error) {
    console.error('[LineAuth:Start] Unexpected error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/line/start (for debug/health check)
 * Returns configuration status without sensitive data
 */
export async function GET(): Promise<NextResponse> {
  try {
    const channelId = process.env.LINE_CHANNEL_ID
    const channelSecret = process.env.LINE_CHANNEL_SECRET

    return NextResponse.json({
      configured: {
        channelId: !!channelId,
        channelSecret: !!channelSecret,
      },
      endpoints: {
        authorize: 'https://access.line.me/oauth2/v2.1/authorize',
        token: 'https://api.line.me/oauth2/v2.1/token',
        verify: 'https://api.line.me/oauth2/v2.1/verify',
        revoke: 'https://api.line.me/oauth2/v2.1/revoke',
      },
      cookieConfig: {
        prefix: OAUTH_COOKIE_PREFIX,
        ...getOAuthConfigSummary(),
      },
    })
  } catch (error) {
    console.error('[LineAuth:Start] Health check failed:', error)

    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}

/**
 * OPTIONS method for CORS preflight (if needed)
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.NODE_ENV === 'development' ? '*' : process.env.NEXT_PUBLIC_DEPLOY_URL || 'https://bocker.jp',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  })
}
