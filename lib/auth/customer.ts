import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { SessionPayload } from '@/lib/types'
import { LOGIN_SESSION_KEY } from '@/services/line/constants'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import { getEnv } from '@/lib/env-config'
import { ACTIVE_CUSTOMER_TYPE_VALUES } from '@/convex/types'

/**
 * 顧客セッションを取得・検証する
 * サーバーコンポーネントで使用
 */
export async function getCustomerSession(): Promise<SessionPayload | null> {
  try {
    const secret = getEnv('APP_JWT_SECRET')
    if (!secret) return null
    const cookieStore = await cookies()
    const token = cookieStore.get(LOGIN_SESSION_KEY)?.value

    if (!token) {
      return null
    }

    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (
      typeof payload === 'string' ||
      typeof payload.customerUid !== 'string' ||
      !payload.customerUid ||
      typeof payload.tenantId !== 'string' ||
      !payload.tenantId ||
      typeof payload.orgId !== 'string' ||
      !payload.orgId ||
      typeof payload.exp !== 'number' ||
      !ACTIVE_CUSTOMER_TYPE_VALUES.includes(payload.target_type) ||
      ['email', 'customerName', 'lineUserId', 'lineUserName'].some(
        (key) => payload[key] !== undefined && typeof payload[key] !== 'string'
      )
    ) {
      return null
    }
    return payload as SessionPayload
  } catch {
    return null
  }
}

/**
 * URLパラメータと認証済みユーザーの検証
 * 顧客は自分の情報のみアクセス可能
 */
export async function validateCustomerAccess(
  customerUidFromUrl: string,
  orgIdFromUrl: string
): Promise<{ isValid: boolean; session?: SessionPayload; error?: string }> {
  try {
    const session = await getCustomerSession()

    if (!session) {
      return { isValid: false, error: '認証が必要です' }
    }

    // 組織IDの検証
    if (session.orgId !== orgIdFromUrl) {
      return { isValid: false, error: '不正なアクセスです' }
    }

    // 顧客UIDの検証
    if (session.customerUid !== customerUidFromUrl) {
      return { isValid: false, error: '他の顧客の情報にはアクセスできません' }
    }

    return { isValid: true, session }
  } catch (error) {
    console.error('[validateCustomerAccess] Error:', error)
    return { isValid: false, error: 'エラーが発生しました' }
  }
}

/**
 * 顧客の完全な情報を取得
 */
export async function getCustomerWithDetails(customerUid: string, orgId: string, tenantId: string) {
  try {
    const customerRepo = new CustomerRepository()

    const customer = await customerRepo.getCompleteCustomerData(customerUid, tenantId, orgId)

    if (!customer) {
      throw new Error('顧客情報が見つかりません')
    }

    return customer
  } catch (error) {
    console.error('[getCustomerWithDetails] Error:', error)
    throw error
  }
}
