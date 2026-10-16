// /lib/auth/token-manager.ts
import { seal, open, constantTimeEqual } from '@/lib/crypto-server'
import { cookies } from 'next/headers'
import { getServerApiConfig } from '@/services/notifications/apiConfig'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * LINE Token Management System
 * Implements secure token storage, automatic refresh, and lifecycle management
 * following LINE's official OAuth 2.1 standards
 */

// Token configuration constants per LINE's official recommendations
export const LINE_TOKEN_CONFIG = {
  // Access Token lifetime: 30 days (LINE official)
  ACCESS_TOKEN_LIFETIME_MS: 30 * 24 * 60 * 60 * 1000,

  // Refresh Token maximum lifetime: 90 days (LINE official limit)
  REFRESH_TOKEN_LIFETIME_MS: 90 * 24 * 60 * 60 * 1000,

  // Auto-refresh threshold: 60 seconds before AT expiration
  AUTO_REFRESH_THRESHOLD_MS: 60 * 1000,

  // Cookie names for secure storage
  COOKIES: {
    ACCESS_TOKEN: 'line_at_enc', // Encrypted Access Token
    REFRESH_TOKEN: 'line_rt_enc', // Encrypted Refresh Token
    TOKEN_EXPIRES: 'line_at_exp', // AT expiration timestamp
    TOKEN_ISSUED: 'line_at_iat', // AT issued timestamp
  } as const,
} as const

// Token validation states
export type TokenValidationState =
  | 'valid' // Token is valid and not near expiration
  | 'near_expiry' // Token will expire within threshold, needs refresh
  | 'expired' // Token has expired
  | 'missing' // No token found
  | 'invalid' // Token exists but is corrupted/invalid

/**
 * LINE token data structure
 */
export interface LineTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number // Unix timestamp (ms)
  issuedAt: number // Unix timestamp (ms)
  tokenType?: string // Usually 'Bearer'
  scope?: string // Granted scopes
}

/**
 * Token refresh response from LINE API
 */
export interface TokenRefreshResponse {
  access_token: string
  token_type: string
  expires_in: number // Seconds until expiration
  refresh_token?: string // New RT (rotation) or undefined (no rotation)
  scope?: string
}

/**
 * Securely store LINE tokens in HttpOnly cookies with AES-256-GCM encryption
 */
export async function storeTokens(tokens: LineTokens): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('storeTokens() is for server-side use only')
  }

  try {
    const cookieStore = await cookies()
    const now = Date.now()

    // Calculate expiration time (use expires_in from LINE or default 30 days)
    const expiresAt = tokens.expiresAt || now + LINE_TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME_MS

    // Encrypt tokens for secure storage
    const encryptedAT = seal(tokens.accessToken)
    const encryptedRT = tokens.refreshToken ? seal(tokens.refreshToken) : null

    // Cookie options for maximum security
    const secureCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: Math.floor(LINE_TOKEN_CONFIG.REFRESH_TOKEN_LIFETIME_MS / 1000), // 90 days in seconds
    }

    // Store encrypted tokens
    cookieStore.set(LINE_TOKEN_CONFIG.COOKIES.ACCESS_TOKEN, encryptedAT, secureCookieOptions)

    if (encryptedRT) {
      cookieStore.set(LINE_TOKEN_CONFIG.COOKIES.REFRESH_TOKEN, encryptedRT, secureCookieOptions)
    }

    // Store timestamps for expiration tracking
    cookieStore.set(
      LINE_TOKEN_CONFIG.COOKIES.TOKEN_EXPIRES,
      expiresAt.toString(),
      secureCookieOptions
    )
    cookieStore.set(
      LINE_TOKEN_CONFIG.COOKIES.TOKEN_ISSUED,
      (tokens.issuedAt || now).toString(),
      secureCookieOptions
    )

    console.log(
      `[TokenManager] Tokens stored securely (expires: ${new Date(expiresAt).toISOString()})`
    )
  } catch (error) {
    console.error('[TokenManager] Failed to store tokens:', error)
    throw new Error('Failed to store authentication tokens')
  }
}

/**
 * Retrieve and decrypt LINE tokens from HttpOnly cookies
 */
export async function getTokens(): Promise<LineTokens | null> {
  if (typeof window !== 'undefined') {
    throw new Error('getTokens() is for server-side use only')
  }

  try {
    const cookieStore = await cookies()

    // Get encrypted tokens from cookies
    const encryptedAT = cookieStore.get(LINE_TOKEN_CONFIG.COOKIES.ACCESS_TOKEN)?.value
    const encryptedRT = cookieStore.get(LINE_TOKEN_CONFIG.COOKIES.REFRESH_TOKEN)?.value
    const expiresAtStr = cookieStore.get(LINE_TOKEN_CONFIG.COOKIES.TOKEN_EXPIRES)?.value
    const issuedAtStr = cookieStore.get(LINE_TOKEN_CONFIG.COOKIES.TOKEN_ISSUED)?.value

    if (!encryptedAT || !expiresAtStr || !issuedAtStr) {
      console.log('[TokenManager] Missing required token cookies')
      return null
    }

    // Decrypt tokens
    const accessToken = open(encryptedAT)
    const refreshToken = encryptedRT ? open(encryptedRT) : undefined

    const expiresAt = parseInt(expiresAtStr, 10)
    const issuedAt = parseInt(issuedAtStr, 10)

    // Validate timestamp format
    if (isNaN(expiresAt) || isNaN(issuedAt)) {
      console.warn('[TokenManager] Invalid timestamp format in cookies')
      await clearTokens() // Clean up corrupted data
      return null
    }

    return {
      accessToken,
      refreshToken,
      expiresAt,
      issuedAt,
      tokenType: 'Bearer',
    }
  } catch (error) {
    console.error('[TokenManager] Failed to retrieve tokens:', error)
    // Clean up potentially corrupted cookies
    await clearTokens()
    return null
  }
}

/**
 * Clear all authentication cookies
 */
export async function clearTokens(): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('clearTokens() is for server-side use only')
  }

  try {
    const cookieStore = await cookies()

    // Attempt to revoke the access token at LINE's revoke endpoint if available
    try {
      const encryptedAT = cookieStore.get(LINE_TOKEN_CONFIG.COOKIES.ACCESS_TOKEN)?.value
      if (encryptedAT) {
        try {
          const accessToken = open(encryptedAT)
          // Resolve client credentials from stored context (if available)
          const tenantId = cookieStore.get('line_ctx_tid')?.value
          const orgId = cookieStore.get('line_ctx_oid')?.value
          if (tenantId && orgId) {
            const apiConfig = await getServerApiConfig(
              tenantId as Id<'tenant'>,
              orgId as Id<'organization'>
            )
            const clientId = apiConfig?.line_channel_id
            const clientSecret = apiConfig?.line_channel_secret
            if (clientId && clientSecret) {
              const revokeEndpoint = 'https://api.line.me/oauth2/v2.1/revoke'
              const params = new URLSearchParams({
                access_token: accessToken,
                client_id: clientId,
                client_secret: clientSecret,
              })

              // Fire and forget revoke (best-effort)
              try {
                const resp = await fetch(revokeEndpoint, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: params,
                })
                if (!resp.ok) {
                  console.warn('[TokenManager] LINE revoke returned non-OK:', resp.status)
                } else {
                  console.log('[TokenManager] LINE access token revoked successfully')
                }
              } catch (revokeError) {
                console.warn('[TokenManager] Failed to call LINE revoke endpoint:', revokeError)
              }
            }
          }
        } catch (decryptError) {
          console.warn('[TokenManager] Failed to open access token for revoke:', decryptError)
        }
      }
    } catch (e) {
      console.warn('[TokenManager] Revoke attempt failed (continuing to clear cookies):', e)
    }

    // Clear all token-related cookies
    Object.values(LINE_TOKEN_CONFIG.COOKIES).forEach((cookieName) => {
      cookieStore.delete(cookieName)
    })

    console.log('[TokenManager] All tokens cleared')
  } catch (error) {
    console.error('[TokenManager] Failed to clear tokens:', error)
    throw new Error('Failed to clear authentication tokens')
  }
}

/**
 * Validate current token state and determine if refresh is needed
 */
export async function validateTokenState(): Promise<TokenValidationState> {
  try {
    const tokens = await getTokens()

    if (!tokens) {
      return 'missing'
    }

    if (!tokens.accessToken) {
      return 'invalid'
    }

    const now = Date.now()
    const { expiresAt } = tokens

    // Check if token has expired
    if (expiresAt <= now) {
      return 'expired'
    }

    // Check if token is near expiration (within threshold)
    if (expiresAt - now <= LINE_TOKEN_CONFIG.AUTO_REFRESH_THRESHOLD_MS) {
      return 'near_expiry'
    }

    return 'valid'
  } catch (error) {
    console.error('[TokenManager] Token validation failed:', error)
    return 'invalid'
  }
}

/**
 * Check if automatic refresh should be triggered
 */
export async function shouldRefreshToken(): Promise<boolean> {
  const state = await validateTokenState()
  return state === 'near_expiry' || state === 'expired'
}

/**
 * Refresh LINE access token using refresh token
 * Implements LINE's official token refresh endpoint
 */
export async function refreshLineToken(): Promise<LineTokens | null> {
  if (typeof window !== 'undefined') {
    throw new Error('refreshLineToken() is for server-side use only')
  }

  try {
    const currentTokens = await getTokens()

    if (!currentTokens?.refreshToken) {
      console.warn('[TokenManager] No refresh token available for refresh')
      await clearTokens()
      return null
    }

    // LINE official token refresh endpoint
    const LINE_TOKEN_ENDPOINT = 'https://api.line.me/oauth2/v2.1/token'

    // Resolve tenant/org context from cookies to load LINE client credentials from DB
    const cookieStore = await cookies()
    const tenantId = cookieStore.get('line_ctx_tid')?.value
    const orgId = cookieStore.get('line_ctx_oid')?.value
    if (!tenantId || !orgId) {
      throw new Error('LINE context not found (tenant/org). Please re-authenticate.')
    }
    const apiConfig = await getServerApiConfig(
      tenantId as Id<'tenant'>,
      orgId as Id<'organization'>
    )
    const clientId = apiConfig?.line_channel_id
    const clientSecret = apiConfig?.line_channel_secret
    if (!clientId || !clientSecret) {
      throw new Error('LINE client credentials not configured in DB')
    }

    // Prepare refresh request per LINE OAuth 2.1 spec
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentTokens.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })

    console.log('[TokenManager] Attempting token refresh...')

    const response = await fetch(LINE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Bocker-LINE-OAuth/1.0',
      },
      body: params,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[TokenManager] Token refresh failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      })

      // If refresh token is invalid/expired, clear all tokens
      if (response.status === 400 || response.status === 401) {
        console.log('[TokenManager] Refresh token expired, clearing all tokens')
        await clearTokens()
      }

      return null
    }

    const refreshResponse: TokenRefreshResponse = await response.json()

    if (!refreshResponse.access_token) {
      throw new Error('Invalid refresh response: missing access_token')
    }

    // Calculate new expiration time
    const now = Date.now()
    const expiresIn = refreshResponse.expires_in || 30 * 24 * 60 * 60 // Default 30 days if not provided
    const expiresAt = now + expiresIn * 1000 // Convert seconds to milliseconds

    // Create new token set
    const newTokens: LineTokens = {
      accessToken: refreshResponse.access_token,
      refreshToken: refreshResponse.refresh_token || currentTokens.refreshToken, // Use new RT if provided, fallback to current
      expiresAt,
      issuedAt: now,
      tokenType: refreshResponse.token_type || 'Bearer',
      scope: refreshResponse.scope,
    }

    // Store refreshed tokens
    await storeTokens(newTokens)

    console.log(
      `[TokenManager] Token refresh successful (new expiry: ${new Date(expiresAt).toISOString()})`
    )

    return newTokens
  } catch (error) {
    console.error('[TokenManager] Token refresh failed:', error)
    // On refresh failure, clear tokens to force re-authentication
    await clearTokens()
    return null
  }
}

/**
 * Get valid access token with automatic refresh if needed
 * This is the main function to call when you need a valid access token
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const state = await validateTokenState()

    switch (state) {
      case 'valid':
        // Token is valid, return it
        const tokens = await getTokens()
        return tokens?.accessToken || null

      case 'near_expiry':
      case 'expired':
        // Try to refresh token
        console.log(`[TokenManager] Token state: ${state}, attempting refresh`)
        const refreshedTokens = await refreshLineToken()
        return refreshedTokens?.accessToken || null

      case 'missing':
      case 'invalid':
        // No valid tokens available
        console.log(`[TokenManager] Token state: ${state}, authentication required`)
        return null

      default:
        return null
    }
  } catch (error) {
    console.error('[TokenManager] Failed to get valid access token:', error)
    return null
  }
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const accessToken = await getValidAccessToken()
  return accessToken !== null
}

/**
 * Get token expiration info for debugging/monitoring
 */
export async function getTokenExpirationInfo(): Promise<{
  isValid: boolean
  expiresAt?: Date
  expiresInMs?: number
  state: TokenValidationState
} | null> {
  try {
    const tokens = await getTokens()
    const state = await validateTokenState()

    if (!tokens) {
      return { isValid: false, state }
    }

    const now = Date.now()
    const expiresAt = new Date(tokens.expiresAt)
    const expiresInMs = tokens.expiresAt - now

    return {
      isValid: state === 'valid',
      expiresAt,
      expiresInMs,
      state,
    }
  } catch (error) {
    console.error('[TokenManager] Failed to get expiration info:', error)
    return null
  }
}

/**
 * Force token refresh (for testing or manual refresh)
 */
export async function forceTokenRefresh(): Promise<boolean> {
  try {
    const refreshedTokens = await refreshLineToken()
    return refreshedTokens !== null
  } catch (error) {
    console.error('[TokenManager] Force refresh failed:', error)
    return false
  }
}

/**
 * Securely compare two access tokens in constant time
 */
export async function compareAccessTokens(token1: string, token2: string): Promise<boolean> {
  try {
    return constantTimeEqual(token1, token2)
  } catch (error) {
    console.error('[TokenManager] Token comparison failed:', error)
    return false
  }
}
