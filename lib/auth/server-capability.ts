import CryptoJS from 'crypto-js'

const MAX_AGE_MS = 60_000
const CLOCK_SKEW_MS = 5_000

function signingSecret(): string {
  const secret = process.env.INTERNAL_NOTIFICATION_SECRET || process.env.CLERK_SECRET_KEY
  if (!secret) throw new Error('Server notification authentication is not configured')
  return secret
}

function signature(purpose: string, resource: string, issuedAt: number): string {
  return CryptoJS.HmacSHA256(
    JSON.stringify(['bocker-server-capability-v1', purpose, resource, issuedAt]),
    signingSecret()
  ).toString(CryptoJS.enc.Hex)
}

export function createServerCapability(
  purpose: string,
  resource: string,
  now = Date.now()
): string {
  return `${now}.${signature(purpose, resource, now)}`
}

export function verifyServerCapability(
  token: string | null | undefined,
  purpose: string,
  resource: string,
  now = Date.now()
): boolean {
  if (!token || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false
  const [timestamp, supplied] = token.split('.')
  const issuedAt = Number(timestamp)
  if (issuedAt > now + CLOCK_SKEW_MS || now - issuedAt > MAX_AGE_MS) return false
  const expected = signature(purpose, resource, issuedAt)
  let difference = 0
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index)
  }
  return difference === 0
}

export function organizationResource(tenantId: string, orgId: string): string {
  return JSON.stringify(['organization', tenantId, orgId])
}

export function reservationResource(reservationId: string): string {
  return JSON.stringify(['reservation', reservationId])
}
