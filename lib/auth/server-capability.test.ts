import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createServerCapability,
  organizationResource,
  reservationResource,
  verifyServerCapability,
} from './server-capability'

afterEach(() => vi.unstubAllEnvs())

describe('server notification capabilities', () => {
  const now = 1_790_000_000_000
  const resource = organizationResource('tenant-a', 'org-a')

  function configure() {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', 'test-private-notification-key')
  }

  it('accepts a valid capability only for its signed operation and resource', () => {
    configure()
    const token = createServerCapability('api-config:read', resource, now)
    expect(verifyServerCapability(token, 'api-config:read', resource, now)).toBe(true)
    expect(verifyServerCapability(token, 'api-config:write', resource, now)).toBe(false)
    expect(
      verifyServerCapability(
        token,
        'api-config:read',
        organizationResource('tenant-b', 'org-a'),
        now
      )
    ).toBe(false)
    expect(
      verifyServerCapability(
        token,
        'api-config:read',
        organizationResource('tenant-a', 'org-b'),
        now
      )
    ).toBe(false)
  })

  it('rejects altered, expired, future and malformed capabilities', () => {
    configure()
    const token = createServerCapability('api-config:read', resource, now)
    expect(verifyServerCapability(`${token.slice(0, -1)}x`, 'api-config:read', resource, now)).toBe(
      false
    )
    expect(verifyServerCapability(token, 'api-config:read', resource, now + 60_001)).toBe(false)
    expect(verifyServerCapability(token, 'api-config:read', resource, now - 5_001)).toBe(false)
    expect(verifyServerCapability(null, 'api-config:read', resource, now)).toBe(false)
    expect(verifyServerCapability('invalid', 'api-config:read', resource, now)).toBe(false)
  })

  it('cannot reuse a reminder capability for another reservation or notification type', () => {
    configure()
    const token = createServerCapability('notification:reminder', reservationResource('a'), now)
    expect(
      verifyServerCapability(token, 'notification:reminder', reservationResource('a'), now)
    ).toBe(true)
    expect(
      verifyServerCapability(token, 'notification:reminder', reservationResource('b'), now)
    ).toBe(false)
    expect(
      verifyServerCapability(token, 'notification:confirmation', reservationResource('a'), now)
    ).toBe(false)
  })

  it('uses the existing server-only Clerk key when no dedicated key is configured', () => {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', '')
    vi.stubEnv('CLERK_SECRET_KEY', 'test-server-clerk-key')
    const token = createServerCapability('api-config:read', resource, now)
    expect(verifyServerCapability(token, 'api-config:read', resource, now)).toBe(true)
    vi.stubEnv('CLERK_SECRET_KEY', 'another-key')
    expect(verifyServerCapability(token, 'api-config:read', resource, now)).toBe(false)
  })

  it('fails closed when no server secret is configured', () => {
    vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')
    expect(() => createServerCapability('api-config:read', resource, now)).toThrow('not configured')
  })
})
