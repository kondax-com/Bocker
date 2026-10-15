import { beforeEach, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as cancelReservation } from '@/app/api/customer/reservation/cancel/route'
import { POST as createReservation } from '@/app/api/customer/reservation/create/route'
import { reservationMutationResource } from '@/lib/auth/reservation-capability'
import { verifyServerCapability } from '@/lib/auth/server-capability'

const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), mutation: vi.fn() }))
vi.mock('@/lib/auth/customer', () => ({ getCustomerSession: mocks.session }))
vi.mock('convex/nextjs', () => ({ fetchQuery: mocks.query, fetchMutation: mocks.mutation }))
vi.mock('@/convex/_generated/api', () => ({
  api: {
    reservation: {
      query: { getById: 'reservation-read' },
      manage: { handleReservationManage: 'manage' },
    },
  },
}))

const session = {
  tenantId: 'tenant-a',
  orgId: 'org-a',
  customerUid: 'customer-a',
  target_type: 'first_time',
}
const reservation = {
  _id: 'reservation-a',
  tenant_id: 'tenant-a',
  org_id: 'org-a',
  customer_uid: 'customer-a',
}
const createPayload = {
  tenant_id: 'tenant-a',
  org_id: 'org-a',
  customer_uid: 'customer-a',
  customer_name: 'Guest',
  status: 'confirmed',
  date: '2030-10-15',
  start_time_unix: 1,
  end_time_unix: 2,
  total_price: 1000,
  payment_method: 'cash',
  menus: [],
  options: [],
  featured_hair_images: [],
}

function request(path: string, body: object) {
  return new NextRequest(`http://localhost:3000/api/customer/reservation/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTERNAL_NOTIFICATION_SECRET = 'customer-route-test-secret'
  mocks.session.mockResolvedValue({ ...session })
  mocks.query.mockResolvedValue({ ...reservation })
  mocks.mutation.mockResolvedValue({ reservationId: 'reservation-a' })
})

test('anonymous requests cannot create or cancel a reservation', async () => {
  mocks.session.mockResolvedValue(null)
  expect((await createReservation(request('create', createPayload))).status).toBe(401)
  expect(
    (await cancelReservation(request('cancel', { reservationId: 'reservation-a' }))).status
  ).toBe(401)
  expect(mocks.mutation).not.toHaveBeenCalled()
})

test.each([
  { tenant_id: 'other' },
  { org_id: 'other' },
  { customer_uid: 'another-customer-in-same-tenant' },
])('creation cannot select another tenant, organization, or customer: %j', async (mismatch) => {
  expect(
    (await createReservation(request('create', { ...createPayload, ...mismatch }))).status
  ).toBe(403)
  expect(mocks.mutation).not.toHaveBeenCalled()
})

test.each([
  { tenant_id: 'other' },
  { org_id: 'other' },
  { customer_uid: 'another-customer-in-same-tenant' },
])('cancellation compares the stored reservation customer and scope: %j', async (mismatch) => {
  mocks.query.mockResolvedValue({ ...reservation, ...mismatch })
  expect(
    (await cancelReservation(request('cancel', { reservationId: 'reservation-a' }))).status
  ).toBe(403)
  expect(mocks.mutation).not.toHaveBeenCalled()
})

test.each(['first_time', 'repeat', 'all'])(
  'signed %s customer sessions retain creation',
  async (target_type) => {
    mocks.session.mockResolvedValue({ ...session, target_type })
    expect((await createReservation(request('create', createPayload))).status).toBe(200)
    const [, args] = mocks.mutation.mock.calls[0]
    expect(args).toMatchObject({ mode: 'create', payload: createPayload })
    expect(
      verifyServerCapability(
        args.server_token,
        'reservation:customer-create',
        reservationMutationResource(args.payload)
      )
    ).toBe(true)
  }
)

test('customer cancellation fixes audit and deadline flags regardless of supplied controls', async () => {
  const response = await cancelReservation(
    request('cancel', {
      reservationId: 'reservation-a',
      cancelledBy: 'system',
      skipValidation: true,
      checkCancelable: false,
    })
  )
  expect(response.status).toBe(200)
  const [, args] = mocks.mutation.mock.calls[0]
  expect(args.payload).toMatchObject({
    reservationId: 'reservation-a',
    cancelledBy: 'customer',
    skipValidation: false,
    checkCancelable: true,
  })
  expect(
    verifyServerCapability(
      args.server_token,
      'reservation:customer-cancel',
      reservationMutationResource(args.payload)
    )
  ).toBe(true)
})

test('creation preserves the existing conflict error fields without exposing internal details', async () => {
  mocks.mutation.mockRejectedValue({
    data: {
      code: 'CONFLICT',
      statusCode: 409,
      message: 'この時間帯は予約済みです',
      details: { secret: 'private-internal-data' },
    },
  })
  const response = await createReservation(request('create', createPayload))
  expect(response.status).toBe(400)
  const body = await response.json()
  expect(body.data).toEqual({
    code: 'CONFLICT',
    statusCode: 409,
    message: 'この時間帯は予約済みです',
  })
  expect(JSON.stringify(body)).not.toContain('private-internal-data')
})
