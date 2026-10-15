import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/auth/session/route'
import { LOGIN_SESSION_KEY } from '@/services/line/constants'

const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  setCookie: vi.fn(),
  findCustomer: vi.fn(),
  verifyPassword: vi.fn(),
  createCustomer: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    getAll: () => [...mocks.cookies].map(([name, value]) => ({ name, value })),
    set: mocks.setCookie,
  }),
}))
vi.mock('@/lib/env-config', () => ({
  getEnv: (name: string) => (name === 'APP_JWT_SECRET' ? 'transition-test-secret' : 'test'),
}))
vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verifyPassword }))
vi.mock('@/services/supabase/repositories/customer', () => ({
  CustomerRepository: class {
    findByTenantAndOrgAndCustomerEmail = mocks.findCustomer
    findByTenantAndOrgAndCustomerLineId = mocks.findCustomer
    createCustomerWithDetailsAndPoints = mocks.createCustomer
  },
}))
vi.mock('@/services/supabase/repositories/customer/CustomerRepository', () => ({
  CustomerRepository: class {},
}))

const sessionA = {
  customerUid: 'customer-a',
  tenantId: 'tenant-a',
  orgId: 'org-a',
  email: 'shared@example.test',
  target_type: 'first_time',
}
function getSession(tenantId: string, orgId: string) {
  return GET(
    new NextRequest(`https://example.test/api/auth/session?tenantId=${tenantId}&orgId=${orgId}`)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookies.clear()
  mocks.cookies.set(
    LOGIN_SESSION_KEY,
    jwt.sign(sessionA, 'transition-test-secret', { expiresIn: '1h' })
  )
  mocks.setCookie.mockImplementation((name: string, value: string) =>
    mocks.cookies.set(name, value)
  )
  mocks.findCustomer.mockResolvedValue({
    uid: 'victim-in-b',
    email: sessionA.email,
    customer_type: 'first_time',
    password_hash: 'b-password-hash',
  })
  mocks.verifyPassword.mockResolvedValue(true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('customer session store boundary', () => {
  it('keeps the signed tenant, organization, and customer UID unchanged in the same store', async () => {
    const response = await getSession('tenant-a', 'org-a')
    expect(response.status).toBe(200)
    expect((await response.json()).session).toMatchObject(sessionA)
    expect(mocks.setCookie).not.toHaveBeenCalled()
    expect(mocks.findCustomer).not.toHaveBeenCalled()
  })

  it('does not turn a shared email in another store into a signed session for another customer', async () => {
    const originalToken = mocks.cookies.get(LOGIN_SESSION_KEY)
    expect((await getSession('tenant-b', 'org-b')).status).toBe(401)
    expect(mocks.findCustomer).not.toHaveBeenCalled()
    expect(mocks.createCustomer).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
    expect(mocks.cookies.get(LOGIN_SESSION_KEY)).toBe(originalToken)
  })

  it('also requires a new login before moving a LINE customer to another store', async () => {
    mocks.cookies.set(
      LOGIN_SESSION_KEY,
      jwt.sign({ ...sessionA, lineUserId: 'line-user-a' }, 'transition-test-secret', {
        expiresIn: '1h',
      })
    )
    expect((await getSession('tenant-b', 'org-b')).status).toBe(401)
    expect(mocks.findCustomer).not.toHaveBeenCalled()
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it('allows the other store after its own password login succeeds', async () => {
    const login = await POST(
      new NextRequest('https://example.test/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-b',
          orgId: 'org-b',
          email: sessionA.email,
          password: 'b-password',
        }),
      })
    )
    expect(login.status).toBe(200)
    expect(mocks.verifyPassword).toHaveBeenCalledWith('b-password', 'b-password-hash')
    const response = await getSession('tenant-b', 'org-b')
    expect(response.status).toBe(200)
    expect((await response.json()).session).toMatchObject({
      tenantId: 'tenant-b',
      orgId: 'org-b',
      customerUid: 'victim-in-b',
    })
  })
})
