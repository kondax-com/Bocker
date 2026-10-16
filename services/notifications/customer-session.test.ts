import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ token: '' }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: mocks.token }) }) }))
vi.mock('@/lib/env-config', () => ({ getEnv: () => process.env.APP_JWT_SECRET }))
vi.mock('@/services/supabase/repositories/customer/CustomerRepository', () => ({
  CustomerRepository: class {},
}))
import { getCustomerSession } from '@/lib/auth/customer'

const session = {
  customerUid: 'customer-a',
  tenantId: 'tenant-a',
  orgId: 'org-a',
  target_type: 'first_time',
}

beforeEach(() => vi.stubEnv('APP_JWT_SECRET', 'session-test-secret'))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('通知で使用する顧客セッション', () => {
  it('有効なHS256セッションを受け付ける', async () => {
    mocks.token = jwt.sign(session, 'session-test-secret', { expiresIn: '1h' })
    expect(await getCustomerSession()).toMatchObject(session)
  })

  it('秘密鍵の未設定時に既知のfallback鍵を受け付けない', async () => {
    vi.stubEnv('APP_JWT_SECRET', '')
    mocks.token = jwt.sign(session, 'bocker-auth-session-secret-key', { expiresIn: '1h' })
    expect(await getCustomerSession()).toBeNull()
  })

  it('HS256以外を拒否する', async () => {
    mocks.token = jwt.sign(session, 'session-test-secret', { algorithm: 'HS384', expiresIn: '1h' })
    expect(await getCustomerSession()).toBeNull()
  })

  it.each([
    { ...session, customerUid: undefined },
    { ...session, tenantId: undefined },
    { ...session, orgId: undefined },
    { ...session, target_type: 'administrator' },
    { ...session, email: { address: 'attacker@example.com' } },
  ])('不正なペイロード形状を拒否する', async (payload) => {
    mocks.token = jwt.sign(payload, 'session-test-secret', { expiresIn: '1h' })
    expect(await getCustomerSession()).toBeNull()
  })

  it('有効期限のないtokenを拒否する', async () => {
    mocks.token = jwt.sign(session, 'session-test-secret')
    expect(await getCustomerSession()).toBeNull()
  })

  it('署名エラーでtokenや例外をログに出力しない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.token = jwt.sign(session, 'wrong-secret', { expiresIn: '1h' })
    expect(await getCustomerSession()).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })
})
