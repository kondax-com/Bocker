// /app/api/auth/line/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { open } from '@/lib/crypto-server'
import {
  extractState,
  validatePreAuthEnhanced,
  OAUTH_COOKIE_PREFIX,
  OAUTH_DEBUG_MODE,
  safeNext,
  debugLogger,
  type PreAuth,
  type PreAuthValidationResult,
} from '@/lib/line-oauth'
import { verifyLineIdToken, type LineIdTokenPayload } from '@/lib/verify-line-idtoken'
import { storeTokens, type LineTokens } from '@/lib/auth/token-manager'
import { getServerApiConfig } from '@/services/notifications/apiConfig'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * Compute proper redirect URL based on environment and headers
 * Fixes localhost redirect issue in development
 */
function computeRedirectUrl(request: NextRequest): string {
  // 1) 開発用の公開設定（NEXT_PUBLIC_DEVELOP_URL）を最優先
  if (process.env.NEXT_PUBLIC_DEVELOP_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_DEVELOP_URL).origin
    } catch {
      // Fall through to other methods
    }
  }

  // 2) Proxy headers from tunnels
  const xfProto = request.headers.get('x-forwarded-proto')
  const xfHost = request.headers.get('x-forwarded-host')
  if (xfProto && xfHost) {
    return `${xfProto}://${xfHost}`
  }

  // 3) Fallback to request origin
  return request.nextUrl.origin
}

/**
 * LINE OAuth 2.1 認可コールバックエンドポイント
 *
 * LINE の OAuth サーバーからのコールバックを処理：
 * - state 検証（CSRF 対策）
 * - PKCE（S256）によるコード検証
 * - 認可コードのトークン交換
 * - ID トークン検証（HS256/ES256 自動判別）
 * - AES-256-GCM による安全なトークン保存
 * - 一時 state クッキーのクリーンアップ
 */

// LINE API からのトークン交換レスポンス
interface LineTokenResponse {
  access_token: string
  expires_in: number
  id_token: string
  refresh_token: string
  scope: string
  token_type: string
}

// Note: 従来のZodスキーマは削除し、より柔軟な手動バリデーションに変更

/**
 * GET /api/auth/line/callback
 * LINE からの OAuth 認可コールバックを処理
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return await processOAuthCallback(request)
}

/**
 * POST /api/auth/line/callback
 * フロントエンドコールバックページからのトークン交換リクエストを処理
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({}))
    const { code, state } = body

    if (!code || !state) {
      return NextResponse.json(
        {
          success: false,
          error: 'missing_params',
          message: 'Authorization code and state are required',
          details:
            '認証に必要なパラメータが不足しています。もう一度LINEログインからやり直してください。',
        },
        { status: 400 }
      )
    }

    debugLogger.info('POST Callback', 'Processing frontend token exchange request', {
      hasCode: !!code,
      hasState: !!state,
      codeLength: code?.length,
      stateLength: state?.length,
      userAgent: request.headers.get('User-Agent')?.substring(0, 100),
    })

    // コードとstateをURLSearchParams形式で再構成してGET処理を再利用
    const simulatedUrl = new URL(request.url)
    simulatedUrl.searchParams.set('code', code)
    simulatedUrl.searchParams.set('state', state)

    // 内部でGET処理を呼び出すためのNextRequestを作成
    const simulatedRequest = new NextRequest(simulatedUrl, {
      method: 'GET',
      headers: request.headers,
    })

    // 既存のGET処理を呼び出し
    const getResponse = await processOAuthCallback(simulatedRequest)

    // リダイレクトレスポンスの場合、JSONレスポンスに変換
    if (getResponse.status >= 300 && getResponse.status < 400) {
      const location = getResponse.headers.get('Location')
      if (location) {
        const redirectUrl = new URL(location)
        const isSuccess = redirectUrl.searchParams.get('auth_success') === 'true'
        const errorType = redirectUrl.searchParams.get('error')
        const errorMessage = redirectUrl.searchParams.get('message')
        // Optional debug params appended by processOAuthCallback on failures
        const httpStatus = redirectUrl.searchParams.get('http_status')
        const lineError = redirectUrl.searchParams.get('line_error')
        const lineErrorDescription = redirectUrl.searchParams.get('line_error_description')
        const usedRedirectUri = redirectUrl.searchParams.get('redirect_uri')
        const usedChannelId = redirectUrl.searchParams.get('channel_id')

        if (isSuccess) {
          return NextResponse.json({
            success: true,
            message: 'Authentication successful',
            line_user_id: redirectUrl.searchParams.get('line_user_id'),
            line_name: redirectUrl.searchParams.get('line_name')
              ? decodeURIComponent(redirectUrl.searchParams.get('line_name')!)
              : undefined,
            redirectUrl: redirectUrl.pathname + redirectUrl.search,
          })
        } else {
          return NextResponse.json(
            {
              success: false,
              error: errorType || 'auth_error',
              message: errorMessage ? decodeURIComponent(errorMessage) : 'Authentication failed',
              details:
                errorType === 'invalid_params'
                  ? 'URLパラメータが不正です。もう一度ログインしてください。'
                  : undefined,
              debug: {
                http_status: httpStatus ? Number(httpStatus) : undefined,
                line_error: lineError || undefined,
                line_error_description: lineErrorDescription
                  ? decodeURIComponent(lineErrorDescription)
                  : undefined,
                redirect_uri: usedRedirectUri ? decodeURIComponent(usedRedirectUri) : undefined,
                channel_id: usedChannelId || undefined,
              },
            },
            { status: 400 }
          )
        }
      }
    }

    // その他のHTTPステータスの場合
    return NextResponse.json(
      {
        success: false,
        error: 'unexpected_response',
        message: 'Unexpected response from authentication process',
      },
      { status: 500 }
    )
  } catch (error) {
    debugLogger.error('POST Callback', 'Frontend token exchange failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : typeof error,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Internal server error',
        details: 'サーバー内部でエラーが発生しました。しばらくしてから再度お試しください。',
      },
      { status: 500 }
    )
  }
}

/**
 * メインのOAuthコールバック処理ロジックを抽出
 * GETとPOSTの両方で再利用可能にした
 */
async function processOAuthCallback(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  let stateId: string | null = null
  try {
    // Check for OAuth error response first
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
      debugLogger.error('Callback', 'OAuth error response from LINE', {
        error,
        errorDescription,
        userAgent: request.headers.get('User-Agent')?.substring(0, 100),
        referer: request.headers.get('Referer'),
      })

      const redirectUrl = computeRedirectUrl(request)
      return NextResponse.redirect(
        new URL(
          `/?error=oauth_${error}&message=${encodeURIComponent(errorDescription || 'OAuth authorization failed')}`,
          redirectUrl
        )
      )
    }

    // Extract state from both direct and LIFF formats
    stateId = extractState(searchParams)

    if (!stateId) {
      const parameterNames = Array.from(searchParams.keys())
      const liffState = searchParams.get('liff.state')

      debugLogger.error('Callback', 'State parameter missing from URL', {
        parameterNames,
        userAgent: request.headers.get('User-Agent')?.substring(0, 100),
        stateExtractionAnalysis: {
          directState: searchParams.get('state'),
          hasLiffState: !!liffState,
        },
        environmentInfo: {
          host: request.headers.get('host'),
          origin: request.nextUrl.origin,
          referer: request.headers.get('referer'),
          userAgent: request.headers.get('user-agent')?.substring(0, 50),
        },
      })

      const userMessage = 'Missing state parameter'

      const redirectUrl = computeRedirectUrl(request)
      return NextResponse.redirect(
        new URL(`/?error=missing_state&message=${encodeURIComponent(userMessage)}`, redirectUrl)
      )
    }

    // Parse and validate callback parameters
    // Only validate required parameters for success flow
    const authCode = searchParams.get('code')
    const authError = searchParams.get('error')
    // Note: error_description is available if needed for enhanced error handling

    // Simplified validation: either we have code+state, or error
    const hasValidSuccessParams = authCode && stateId
    const hasErrorParams = authError

    if (!hasValidSuccessParams && !hasErrorParams) {
      debugLogger.error('Callback', 'Missing required parameters', {
        hasCode: !!authCode,
        hasState: !!stateId,
        hasError: !!authError,
        receivedParameterNames: Array.from(searchParams.keys()),
      })

      const userMessage = 'Invalid callback parameters'

      const redirectUrl = computeRedirectUrl(request)
      return NextResponse.redirect(
        new URL(`/?error=invalid_params&message=${encodeURIComponent(userMessage)}`, redirectUrl)
      )
    }

    debugLogger.info('Callback', 'Processing OAuth callback', {
      stateId: stateId?.substring(0, 8) + '...',
      hasCode: !!authCode,
      codeLength: authCode?.length,
      userAgent: request.headers.get('User-Agent')?.substring(0, 100),
      referer: request.headers.get('Referer'),
      timestamp: new Date().toISOString(),
    })

    // Retrieve and verify PreAuth data from cookie
    const cookieStore = await cookies()
    const cookieName = `${OAUTH_COOKIE_PREFIX}${stateId}`
    const encryptedPreAuth = cookieStore.get(cookieName)?.value

    if (!encryptedPreAuth) {
      const errorDetails = {
        stateId: stateId?.substring(0, 8) + '...',
        cookieName,
        allCookies: OAUTH_DEBUG_MODE
          ? (await cookies())
              .getAll()
              .filter((c) => c.name.startsWith(OAUTH_COOKIE_PREFIX))
              .map((c) => ({ name: c.name, hasValue: !!c.value, valueLength: c.value?.length }))
          : undefined,
      }

      debugLogger.error('Callback', 'State cookie not found or expired', errorDetails)

      // Provide user-friendly error message based on environment
      const userMessage = OAUTH_DEBUG_MODE
        ? `認証状態が見つかりません (Cookie: ${cookieName})`
        : '認証時間が切れました。もう一度ログインをお試しください。'

      return NextResponse.redirect(
        new URL(
          `/?error=state_expired&message=${encodeURIComponent(userMessage)}`,
          computeRedirectUrl(request)
        )
      )
    }

    // Decrypt and parse PreAuth data
    let preAuth: PreAuth
    try {
      const decryptedData = open(encryptedPreAuth)
      preAuth = JSON.parse(decryptedData)

      debugLogger.info('Callback', 'PreAuth data decrypted successfully', {
        hasCodeVerifier: !!preAuth.cv,
        hasNonce: !!preAuth.nonce,
        hasTenantId: !!preAuth.tenantId,
        hasOrgId: !!preAuth.orgId,
        used: preAuth.used,
        ageMinutes: Math.round((Date.now() - preAuth.ts) / (60 * 1000)),
        codeVerifierLength: preAuth.cv?.length,
        nonceLength: preAuth.nonce?.length,
      })
    } catch (error) {
      debugLogger.error('Callback', 'Failed to decrypt PreAuth data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        cookieName,
        hasEncryptedData: !!encryptedPreAuth,
        encryptedDataLength: encryptedPreAuth?.length,
        errorType: error instanceof Error ? error.name : typeof error,
      })
      return NextResponse.redirect(
        new URL(
          '/?error=state_corrupted&message=認証データが破損しています。もう一度お試しください。',
          computeRedirectUrl(request)
        )
      )
    }

    // Enhanced PreAuth validation with detailed error reporting
    const validationResult: PreAuthValidationResult = validatePreAuthEnhanced(preAuth)

    if (!validationResult.isValid) {
      const errorDetails = {
        validationError: validationResult.error,
        details: validationResult.details,
        ageMinutes: validationResult.age
          ? Math.round(validationResult.age / (60 * 1000))
          : 'unknown',
        timeRemainingMinutes: validationResult.timeRemaining
          ? Math.round(validationResult.timeRemaining / (60 * 1000))
          : 'N/A',
        stateId: stateId.substring(0, 8) + '...',
      }

      debugLogger.error('Callback', 'PreAuth validation failed', errorDetails)

      // Clean up invalid cookie
      cookieStore.delete(cookieName)

      // Provide specific error messages based on validation failure type
      let userMessage: string
      let errorCode: string

      switch (validationResult.error) {
        case 'expired':
          errorCode = 'state_expired'
          userMessage = OAUTH_DEBUG_MODE
            ? `認証が期限切れです (${errorDetails.ageMinutes}分前に作成、${Math.abs(Number(errorDetails.timeRemainingMinutes))}分前に期限切れ)`
            : 'ログイン時間が切れました。もう一度お試しください。'
          break
        case 'already_used':
          errorCode = 'state_reused'
          userMessage = OAUTH_DEBUG_MODE
            ? '認証状態が既に使用済みです (リプレイアタック防止)'
            : 'この認証は既に使用されています。新しくログインをやり直してください。'
          break
        case 'missing_fields':
        case 'invalid_format':
          errorCode = 'state_invalid'
          userMessage = OAUTH_DEBUG_MODE
            ? `認証データが不正です: ${validationResult.details}`
            : '認証データに問題があります。もう一度お試しください。'
          break
        default:
          errorCode = 'state_invalid'
          userMessage = '認証処理でエラーが発生しました。もう一度お試しください。'
      }

      return NextResponse.redirect(
        new URL(
          `/?error=${errorCode}&message=${encodeURIComponent(userMessage)}`,
          computeRedirectUrl(request)
        )
      )
    }

    // Mark state as used to prevent replay attacks
    preAuth.used = true

    // Clean up state cookie immediately (one-time use)
    cookieStore.delete(cookieName)

    debugLogger.info('Callback', 'PreAuth validation successful', {
      stateId: stateId.substring(0, 8) + '...',
      ageMinutes: Math.round(validationResult.age! / (60 * 1000)),
      remainingMinutes: Math.round(validationResult.timeRemaining! / (60 * 1000)),
      tenantId: preAuth.tenantId,
      orgId: preAuth.orgId,
    })

    // Fetch LINE channel config from Convex using tenant/org stored in PreAuth
    const apiConfig =
      preAuth.tenantId && preAuth.orgId
        ? await getServerApiConfig(
            preAuth.tenantId as Id<'tenant'>,
            preAuth.orgId as Id<'organization'>
          )
        : null

    const channelId = apiConfig?.line_channel_id
    const channelSecret = apiConfig?.line_channel_secret
    if (!channelId || !channelSecret) {
      debugLogger.error('Callback', 'Missing LINE channel configuration in database', {
        tenantId: preAuth.tenantId,
        orgId: preAuth.orgId,
        hasApiConfig: !!apiConfig,
        apiConfigKeys: apiConfig ? Object.keys(apiConfig) : [],
        hasChannelId: !!channelId,
        hasChannelSecret: !!channelSecret,
        configDetails: apiConfig
          ? {
              line_channel_id: !!apiConfig.line_channel_id,
              line_channel_secret: !!apiConfig.line_channel_secret,
              creation_time: apiConfig._creationTime,
              updated_at: apiConfig.updated_at,
              is_archive: apiConfig.is_archive,
            }
          : null,
      })

      const userMessage = OAUTH_DEBUG_MODE
        ? `LINE設定エラー - Tenant: ${preAuth.tenantId}, Org: ${preAuth.orgId}, ChannelID: ${!!channelId}, ChannelSecret: ${!!channelSecret}`
        : 'LINE設定（ClientID/Secret）が未設定です'

      return NextResponse.redirect(
        new URL(
          `/?error=config_missing&message=${encodeURIComponent(userMessage)}`,
          computeRedirectUrl(request)
        )
      )
    }

    // Ensure we have an authorization code before proceeding
    if (!authCode) {
      const redirectUrl = computeRedirectUrl(request)
      return NextResponse.redirect(
        new URL(
          `/?error=missing_code&message=${encodeURIComponent('Authorization code is missing')}`,
          redirectUrl
        )
      )
    }

    // Exchange authorization code for tokens (with detailed error reporting)
    let tokens: LineTokenResponse | null = null
    try {
      tokens = await exchangeCodeForTokens(authCode, preAuth.cv, request, channelId, channelSecret)
    } catch (e) {
      // Enhanced logging with structured error details from token exchange
      const err = e as any // eslint-disable-line @typescript-eslint/no-explicit-any
      const computedRedirectUri = new URL(
        '/ja/reservation/auth/callback',
        computeRedirectUrl(request)
      ).toString()
      debugLogger.error('Callback', 'Token exchange with LINE API failed', {
        stateId: stateId?.substring(0, 8) + '...',
        hasCode: !!authCode,
        codeLength: authCode?.length,
        hasCodeVerifier: !!preAuth.cv,
        codeVerifierLength: preAuth.cv?.length,
        channelId,
        hasChannelSecret: !!channelSecret,
        requestPath: request.nextUrl.pathname,
        computedRedirectUri,
        httpStatus: err?.status,
        httpStatusText: err?.statusText,
        lineError: err?.data?.error,
        lineErrorDescription: err?.data?.error_description,
        lineErrorUri: err?.data?.error_uri,
      })

      const userMessage = 'Failed to obtain access tokens'

      // Redirect with additional debug info (non-sensitive)
      const redirectUrl = new URL(
        `/?error=token_exchange_failed&message=${encodeURIComponent(userMessage)}`,
        computeRedirectUrl(request)
      )
      if (err?.status) redirectUrl.searchParams.set('http_status', String(err.status))
      if (err?.data?.error) redirectUrl.searchParams.set('line_error', err.data.error)
      if (err?.data?.error_description)
        redirectUrl.searchParams.set(
          'line_error_description',
          encodeURIComponent(err.data.error_description)
        )
      redirectUrl.searchParams.set('redirect_uri', encodeURIComponent(computedRedirectUri))
      redirectUrl.searchParams.set('channel_id', String(channelId))
      return NextResponse.redirect(redirectUrl)
    }

    if (!tokens) {
      const computedRedirectUri = new URL(
        '/ja/reservation/auth/callback',
        computeRedirectUrl(request)
      ).toString()
      debugLogger.error('Callback', 'Token exchange with LINE API failed (no tokens, no error)', {
        stateId: stateId?.substring(0, 8) + '...',
        hasCode: !!authCode,
        codeLength: authCode?.length,
        hasCodeVerifier: !!preAuth.cv,
        codeVerifierLength: preAuth.cv?.length,
        channelId,
        hasChannelSecret: !!channelSecret,
        requestPath: request.nextUrl.pathname,
        computedRedirectUri: computedRedirectUri,
      })

      const userMessage = 'Failed to obtain access tokens'

      return NextResponse.redirect(
        new URL(
          `/?error=token_exchange_failed&message=${encodeURIComponent(userMessage)}`,
          computeRedirectUrl(request)
        )
      )
    }

    // Verify ID token with expected nonce
    let idTokenPayload: LineIdTokenPayload
    try {
      idTokenPayload = await verifyLineIdToken(tokens.id_token, {
        channelId,
        channelSecret,
        expectedNonce: preAuth.nonce,
        clockTolerance: 60, // 60 seconds tolerance
      })

      debugLogger.info('Callback', 'LINE ID token verified successfully', {
        sub: idTokenPayload.sub,
        iss: idTokenPayload.iss,
        aud: idTokenPayload.aud,
        hasName: !!idTokenPayload.name,
        hasEmail: !!idTokenPayload.email,
        hasProfileImage: !!idTokenPayload.picture,
        exp: idTokenPayload.exp,
        iat: idTokenPayload.iat,
      })
    } catch (error) {
      debugLogger.error('Callback', 'LINE ID token verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : typeof error,
        hasIdToken: !!tokens?.id_token,
        idTokenLength: tokens?.id_token?.length,
        idTokenHeader: tokens?.id_token ? JSON.parse(atob(tokens.id_token.split('.')[0])) : null,
        channelId,
        expectedNonce: preAuth.nonce?.substring(0, 8) + '...',
        clockTolerance: 60,
        verificationContext: {
          hasChannelId: !!channelId,
          hasChannelSecret: !!channelSecret,
          hasExpectedNonce: !!preAuth.nonce,
        },
      })

      const userMessage = OAUTH_DEBUG_MODE
        ? `IDトークン検証失敗: ${error instanceof Error ? error.message : 'Unknown error'} - チャンネルID: ${channelId}`
        : 'ID token verification failed'

      return NextResponse.redirect(
        new URL(
          `/?error=id_token_invalid&message=${encodeURIComponent(userMessage)}`,
          computeRedirectUrl(request)
        )
      )
    }

    // Store tokens securely using token manager
    const now = Date.now()
    const lineTokens: LineTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: now + tokens.expires_in * 1000, // Convert seconds to milliseconds
      issuedAt: now,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    }

    await storeTokens(lineTokens)

    // Persist tenant/org context in HttpOnly cookies for future refresh calls
    try {
      const cookieStore = await cookies()
      const ctxCookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 90 * 24 * 60 * 60, // 90 days
      }
      if (preAuth.tenantId) cookieStore.set('line_ctx_tid', preAuth.tenantId, ctxCookieOptions)
      if (preAuth.orgId) cookieStore.set('line_ctx_oid', preAuth.orgId, ctxCookieOptions)
    } catch (e) {
      debugLogger.warn('Callback', 'Failed to persist LINE context cookies', {
        error: e instanceof Error ? e.message : 'Unknown error',
        errorType: e instanceof Error ? e.name : typeof e,
        tenantId: preAuth.tenantId,
        orgId: preAuth.orgId,
      })
    }

    debugLogger.info('Callback', 'LINE tokens stored successfully', {
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      hasRefreshToken: !!tokens.refresh_token,
      lineUserId: idTokenPayload.sub,
      tokenType: tokens.token_type,
      issuedAt: now,
      expiresAt: now + tokens.expires_in * 1000,
    })

    // Determine redirect URL
    const redirectPath = safeNext(preAuth.next)
    const finalRedirectUrl = new URL(redirectPath, computeRedirectUrl(request))

    // Add only generic success flag; avoid exposing user info in URL
    finalRedirectUrl.searchParams.set('auth_success', 'true')

    debugLogger.info('Callback', 'Authentication complete - redirecting user', {
      redirectTo: finalRedirectUrl.pathname,
      redirectSearch: finalRedirectUrl.search,
      lineUserId: idTokenPayload.sub,
      hasName: !!idTokenPayload.name,
      lineName: idTokenPayload.name?.substring(0, 20) + '...',
      tenantId: preAuth.tenantId,
      orgId: preAuth.orgId,
    })

    // Redirect to success page
    return NextResponse.redirect(finalRedirectUrl.toString())
  } catch (error) {
    debugLogger.error('Callback', 'Unexpected error during OAuth callback', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
      stateId: stateId?.substring(0, 8) + '...',
    })

    // Clean up state cookie if we have stateId
    if (stateId) {
      try {
        const cookieStore = await cookies()
        cookieStore.delete(`${OAUTH_COOKIE_PREFIX}${stateId}`)
      } catch (cookieError) {
        debugLogger.warn('Callback', 'Failed to clean up state cookie during error handling', {
          cookieError: cookieError instanceof Error ? cookieError.message : 'Unknown error',
          stateId: stateId?.substring(0, 8) + '...',
          cookieName: `${OAUTH_COOKIE_PREFIX}${stateId}`,
        })
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Authentication failed'

    return NextResponse.redirect(
      new URL(
        `/?error=auth_error&message=${encodeURIComponent(errorMessage)}`,
        computeRedirectUrl(request)
      )
    )
  }
}

/**
 * Exchange authorization code for access and refresh tokens using PKCE
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  request: NextRequest,
  channelId: string,
  channelSecret: string
): Promise<LineTokenResponse | null> {
  try {
    // Use the same redirect URI computation logic as the start endpoint
    const baseOrigin = computeRedirectUrl(request)
    const locale = 'ja' // Default locale for LINE auth
    const redirectUri = new URL(`/${locale}/reservation/auth/callback`, baseOrigin).toString()

    debugLogger.info('TokenExchange', 'Using consistent redirect URI calculation', {
      baseOrigin,
      redirectUri,
      requestPath: request.nextUrl.pathname,
      headers: {
        host: request.headers.get('host'),
        xForwardedHost: request.headers.get('x-forwarded-host'),
        xForwardedProto: request.headers.get('x-forwarded-proto'),
      },
    })

    // Prepare token exchange request per LINE OAuth 2.1 spec
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
      code_verifier: codeVerifier, // PKCE verification
    })

    debugLogger.info('TokenExchange', 'Requesting tokens from LINE API', {
      endpoint: 'https://api.line.me/oauth2/v2.1/token',
      redirectUri,
      codeVerifierLength: codeVerifier.length,
      codeLength: code.length,
      channelId,
      hasChannelSecret: !!channelSecret,
      grantType: 'authorization_code',
    })

    const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Bocker-LINE-OAuth/1.0',
      },
      body: tokenParams,
    })

    if (!response.ok) {
      const raw = await response.text().catch(() => '')
      let errorData: Record<string, unknown> = {}
      try {
        errorData = raw ? JSON.parse(raw) : {}
      } catch {
        // keep raw as-is if JSON parse fails
      }
      debugLogger.error('TokenExchange', 'LINE API token exchange failed', {
        status: response.status,
        statusText: response.statusText,
        endpoint: 'https://api.line.me/oauth2/v2.1/token',
        codeVerifierLength: codeVerifier.length,
        redirectUri,
        channelId,
        errorDetails: {
          errorCode: errorData?.error || 'unknown',
          errorDescription: errorData?.error_description || 'No description provided',
          errorUri: errorData?.error_uri || null,
        },
      })
      const err: any = new Error('LINE token exchange failed') // eslint-disable-line @typescript-eslint/no-explicit-any
      err.name = 'TokenExchangeHTTPError'
      err.status = response.status
      err.statusText = response.statusText
      err.data = errorData
      err.raw = raw
      err.redirectUri = redirectUri
      err.channelId = channelId
      err.codeVerifierLength = codeVerifier.length
      throw err
    }

    const tokenResponse: LineTokenResponse = await response.json()

    // Validate response structure
    if (!tokenResponse.access_token || !tokenResponse.id_token) {
      debugLogger.error('TokenExchange', 'Invalid token response from LINE API', {
        hasAccessToken: !!tokenResponse.access_token,
        hasIdToken: !!tokenResponse.id_token,
        hasRefreshToken: !!tokenResponse.refresh_token,
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        scope: tokenResponse.scope,
      })
      return null
    }

    debugLogger.info('TokenExchange', 'LINE API token exchange successful', {
      tokenType: tokenResponse.token_type,
      expiresIn: tokenResponse.expires_in,
      scope: tokenResponse.scope,
      hasRefreshToken: !!tokenResponse.refresh_token,
      accessTokenLength: tokenResponse.access_token?.length,
      idTokenLength: tokenResponse.id_token?.length,
    })

    return tokenResponse
  } catch (error) {
    const err = error as any // eslint-disable-line @typescript-eslint/no-explicit-any
    debugLogger.error('TokenExchange', 'Unexpected error during token exchange', {
      error: err instanceof Error ? err.message : 'Unknown error',
      errorType: err instanceof Error ? err.name : typeof err,
      httpStatus: err?.status,
      httpStatusText: err?.statusText,
      lineError: err?.data?.error,
      lineErrorDescription: err?.data?.error_description,
      codeVerifierLength: codeVerifier?.length,
      channelId,
    })
    throw error
  }
}
