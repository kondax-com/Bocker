import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServerCapability, reservationResource } from '@/lib/auth/server-capability'
import { getFunctionName } from 'convex/server'
import { api } from '@/convex/_generated/api'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  customerSession: vi.fn(),
  staffSession: vi.fn(),
  staffAccess: vi.fn(),
  config: vi.fn(),
  customer: vi.fn(),
  line: vi.fn(),
  email: vi.fn(),
  confirmation: vi.fn(),
  reminder: vi.fn(),
  cancellation: vi.fn(),
  salon: vi.fn(),
  salonCancellation: vi.fn(),
}))

vi.mock('convex/nextjs', () => ({ fetchQuery: mocks.query }))
vi.mock('@/lib/auth/customer', () => ({ getCustomerSession: mocks.customerSession }))
vi.mock('@/lib/auth/getOrganizationAuth', () => ({ getOrganizationAuth: mocks.staffSession }))
vi.mock('./apiConfig', () => ({ getServerApiConfig: mocks.config }))
vi.mock('@/services/supabase/SupabaseService', () => ({
  getSupabaseAdminService: () => ({}),
}))
vi.mock('@/services/supabase/repositories/customer/CustomerRepository', () => ({
  CustomerRepository: class {
    findOne = mocks.customer
  },
}))
vi.mock('@/services/line/sendLineFlexMessageOrThrow', () => ({
  sendLineFlexMessageOrThrow: mocks.line,
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.email }
  },
}))
vi.mock('@react-email/render', () => ({ render: async () => '<p>保存済みの予約</p>' }))
vi.mock('@/services/line/message_template/reservation_flex', () => ({
  reservationFlexMessageTemplate: mocks.confirmation,
}))
vi.mock('@/services/line/message_template/reminder_flex', () => ({
  createReminderFlexMessage: mocks.reminder,
}))
vi.mock('@/services/line/message_template/cancellation_flex', () => ({
  createCustomerCancellationNotification: mocks.cancellation,
  createSalonCancellationNotification: mocks.salonCancellation,
}))
vi.mock('@/services/line/message_template/salon_reservation_notification', () => ({
  createSalonReservationNotification: mocks.salon,
}))

import { handleReservationNotification } from './reservation'
import { POST as confirmationPost } from '@/app/api/line/flex-message/route'
import { POST as emailReminderPost } from '@/app/api/resend/reminder/route'
import { POST as genericLinePost } from '@/app/api/line/message/route'

let reservation: Record<string, unknown>
let detail: Record<string, unknown>
let customer: Record<string, unknown>
let apiConfig: Record<string, unknown>

function request(body: Record<string, unknown> = {}, capability?: string) {
  return new Request('http://localhost/api/line/flex-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(capability ? { 'x-notification-authorization': capability } : {}),
    },
    body: JSON.stringify({ reservationId: 'reservation-a', ...body }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('INTERNAL_NOTIFICATION_SECRET', 'test-notification-secret')
  reservation = {
    _id: 'reservation-a',
    tenant_id: 'tenant-a',
    org_id: 'org-a',
    customer_uid: 'customer-a',
    customer_name: '保存済み顧客',
    staff_name: '保存済み担当',
    date: '2027-01-01',
    start_time_unix: Date.now() + 4 * 60 * 60 * 1000,
    end_time_unix: Date.now() + 5 * 60 * 60 * 1000,
    status: 'confirmed',
    payment_status: 'pending',
    reminder_sent: false,
  }
  detail = {
    reservation_id: 'reservation-a',
    tenant_id: 'tenant-a',
    org_id: 'org-a',
    payment_method: 'cash',
    menus: [{ id: 'menu-a', name: '保存済みメニュー', price: 3000, quantity: 1 }],
    options: [],
    total_price: 3000,
  }
  customer = {
    uid: 'customer-a',
    tenant_id: 'tenant-a',
    org_id: 'org-a',
    line_id: 'stored-customer-line',
    email: 'stored@example.com',
    is_archive: false,
  }
  apiConfig = {
    tenant_id: 'tenant-a',
    org_id: 'org-a',
    line_access_token: 'stored-tenant-token',
    org_line_id: 'stored-salon-line',
  }
  mocks.query.mockImplementation(async (reference, args) =>
    getFunctionName(reference) === 'reservation/notification/query:authorize'
      ? mocks.staffAccess(args)
      : args.id
        ? { reservation, reservationDetail: detail }
        : {
            organization: { _id: 'org-a', tenant_id: 'tenant-a', org_name: '保存済み店舗' },
            config: { tenant_id: 'tenant-a', org_id: 'org-a', phone: '0123456789' },
            reservationConfig: { available_cancel_days: 3 },
          }
  )
  mocks.customerSession.mockResolvedValue({
    customerUid: 'customer-a',
    tenantId: 'tenant-a',
    orgId: 'org-a',
    target_type: 'first_time',
  })
  mocks.staffSession.mockRejectedValue(new Error('Unauthenticated'))
  mocks.staffAccess.mockResolvedValue({ authorized: true, role: 'staff' })
  mocks.config.mockImplementation(async () => apiConfig)
  mocks.customer.mockImplementation(async () => customer)
  mocks.line.mockResolvedValue(undefined)
  mocks.email.mockResolvedValue({ data: { id: 'message-id' }, error: null })
  for (const template of [mocks.confirmation, mocks.reminder, mocks.cancellation]) {
    template.mockReturnValue([{ type: 'text', text: '保存済みの予約通知' }])
  }
  mocks.salon.mockReturnValue({ type: 'text', text: '保存済み店舗通知' })
  mocks.salonCancellation.mockReturnValue({ type: 'text', text: '保存済みキャンセル通知' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('予約通知の認証境界', () => {
  it('他テナント顧客は送信できず、秘密設定・宛先も取得しない', async () => {
    mocks.customerSession.mockResolvedValue({
      customerUid: 'customer-a',
      tenantId: 'tenant-b',
      orgId: 'org-a',
    })
    const response = await confirmationPost(request())
    expect(response.status).toBe(403)
    expect(mocks.config).not.toHaveBeenCalled()
    expect(mocks.customer).not.toHaveBeenCalled()
    expect(mocks.line).not.toHaveBeenCalled()
    expect(mocks.email).not.toHaveBeenCalled()
  })

  it('本人の予約確認では偽装宛先・本文・tokenを使用しない', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await confirmationPost(
      request({
        lineId: 'attacker-line',
        accessToken: 'attacker-secret',
        messages: [{ type: 'text', text: 'attacker-message' }],
        to: 'attacker@example.com',
        subject: 'attacker-subject',
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.line).toHaveBeenCalledWith({
      lineId: 'stored-customer-line',
      accessToken: 'stored-tenant-token',
      messages: [{ type: 'text', text: '保存済みの予約通知' }],
    })
    expect(mocks.confirmation.mock.calls[0][2]).toBe('保存済み顧客')
    expect(JSON.stringify(mocks.confirmation.mock.calls)).not.toContain('attacker')
    expect(mocks.email).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('予約IDに束縛された内部リマインダーを許可する', async () => {
    const capability = createServerCapability(
      'notification:reminder',
      reservationResource('reservation-a')
    )
    const response = await emailReminderPost(request({}, capability))
    expect(response.status).toBe(200)
    expect(mocks.reminder).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationData: expect.objectContaining({ id: 'reservation-a', totalPrice: 3000 }),
      })
    )
    expect(mocks.customerSession).not.toHaveBeenCalled()
    expect(mocks.line).toHaveBeenCalledOnce()
  })

  it.each([
    ['notification:confirmation', 'reservation-a'],
    ['notification:reminder', 'reservation-b'],
  ])('別purpose/resourceの内部tokenを拒否する: %s %s', async (purpose, id) => {
    const capability = createServerCapability(purpose, reservationResource(id))
    const response = await handleReservationNotification(request({}, capability), 'reminder')
    expect(response.status).toBe(401)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('内部tokenが正しくても偽装した店舗指定を拒否する', async () => {
    const capability = createServerCapability(
      'notification:reminder',
      reservationResource('reservation-a')
    )
    const response = await handleReservationNotification(
      request({ org_id: 'org-b' }, capability),
      'reminder'
    )
    expect(response.status).toBe(403)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('顧客セッションだけではリマインダーを送信できない', async () => {
    const response = await handleReservationNotification(request(), 'reminder')
    expect(response.status).toBe(401)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('送信済みリマインダーを再送しない', async () => {
    reservation.reminder_sent = true
    const capability = createServerCapability(
      'notification:reminder',
      reservationResource('reservation-a')
    )
    const response = await handleReservationNotification(request({}, capability), 'reminder')
    expect(response.status).toBe(409)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('店舗のスタッフによる確認通知を許可する', async () => {
    mocks.customerSession.mockResolvedValue(null)
    mocks.staffSession.mockResolvedValue({
      tenantId: 'tenant-a',
      orgId: 'org-a',
      role: 'staff',
      token: 'staff-jwt',
    })
    expect((await confirmationPost(request())).status).toBe(200)
    expect(mocks.query).toHaveBeenCalledWith(
      api.reservation.notification.query.authorize,
      { tenant_id: 'tenant-a', org_id: 'org-a' },
      { token: 'staff-jwt' }
    )
  })

  it.each(['inactive', 'archived', 'disconnected'])(
    'Clerk metadataが残っていてもDBで%sのスタッフは送信できない',
    async () => {
      mocks.customerSession.mockResolvedValue(null)
      mocks.staffSession.mockResolvedValue({
        tenantId: 'tenant-a',
        orgId: 'org-a',
        role: 'admin',
        token: 'old-staff-jwt',
      })
      mocks.staffAccess.mockRejectedValue(new Error('アクセス権限がありません'))
      expect((await confirmationPost(request())).status).toBe(403)
      expect(mocks.staffAccess).toHaveBeenCalledOnce()
      expect(mocks.config).not.toHaveBeenCalled()
      expect(mocks.customer).not.toHaveBeenCalled()
      expect(mocks.line).not.toHaveBeenCalled()
      expect(mocks.email).not.toHaveBeenCalled()
    }
  )

  it('現在のDBが許可したロールを使用し古いmetadataロールで拒否しない', async () => {
    mocks.customerSession.mockResolvedValue(null)
    mocks.staffSession.mockResolvedValue({
      tenantId: 'tenant-a',
      orgId: 'org-a',
      role: 'outdated-role',
      token: 'staff-jwt',
    })
    mocks.staffAccess.mockResolvedValue({ authorized: true, role: 'staff' })
    expect((await confirmationPost(request())).status).toBe(200)
  })

  it('オーナーも現在のDB認可を通過して通知できる', async () => {
    mocks.customerSession.mockResolvedValue(null)
    mocks.staffSession.mockResolvedValue({
      tenantId: 'tenant-a',
      orgId: 'org-a',
      role: 'owner',
      token: 'owner-jwt',
    })
    mocks.staffAccess.mockResolvedValue({ authorized: true, role: 'owner' })
    expect((await confirmationPost(request())).status).toBe(200)
    expect(mocks.staffAccess).toHaveBeenCalledOnce()
  })

  it('別店舗スタッフは通知を送信できない', async () => {
    mocks.customerSession.mockResolvedValue(null)
    mocks.staffSession.mockResolvedValue({ tenantId: 'tenant-a', orgId: 'org-b', role: 'owner' })
    expect((await confirmationPost(request())).status).toBe(403)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('顧客取得結果の実際の所属が違う場合は送信しない', async () => {
    customer.tenant_id = 'tenant-b'
    expect((await confirmationPost(request())).status).toBe(404)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('別店舗の予約詳細を参照する不整合レコードを拒否する', async () => {
    detail.org_id = 'org-b'
    expect((await confirmationPost(request())).status).toBe(404)
    expect(mocks.config).not.toHaveBeenCalled()
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('店舗tokenが未設定でも会社tokenへフォールバックしない', async () => {
    apiConfig.line_access_token = undefined
    expect((await confirmationPost(request())).status).toBe(503)
    expect(mocks.line).not.toHaveBeenCalled()
    expect(mocks.email).not.toHaveBeenCalled()
  })

  it('旧予約で合計金額が未設定なら0として通知する', async () => {
    detail.total_price = undefined
    expect((await confirmationPost(request())).status).toBe(200)
    expect(mocks.confirmation.mock.calls[0][12]).toBe(0)
  })

  it('LINE未登録なら保存済みメールアドレスへ確認を送る', async () => {
    customer.line_id = null
    const response = await confirmationPost(request({ to: 'attacker@example.com' }))
    expect(response.status).toBe(200)
    expect(mocks.email).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['stored@example.com'],
        subject: '【保存済み店舗】ご予約内容の確認',
      })
    )
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('未決済カード予約の確認通知は拒否する', async () => {
    detail.payment_method = 'credit_card'
    expect((await confirmationPost(request())).status).toBe(409)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('キャンセル通知には更新後予約・詳細を使用する', async () => {
    reservation.status = 'cancelled'
    reservation.cancelled_by = 'staff'
    reservation.cancel_reason = '保存済みキャンセル理由'
    const response = await handleReservationNotification(
      request({ cancelData: { totalPrice: 1 } }),
      'cancellation'
    )
    expect(response.status).toBe(200)
    expect(mocks.cancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationData: expect.objectContaining({
          totalPrice: 3000,
          cancelReason: '保存済みキャンセル理由',
        }),
      })
    )
  })

  it('未キャンセル予約のキャンセル通知は拒否する', async () => {
    expect((await handleReservationNotification(request(), 'cancellation')).status).toBe(409)
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('サロン通知は顧客の宛先取得失敗に依存しない', async () => {
    mocks.customer.mockRejectedValue(new Error('Customer DB unavailable'))
    const response = await handleReservationNotification(request(), 'confirmation', 'salon')
    expect(response.status).toBe(200)
    expect(mocks.customer).not.toHaveBeenCalled()
    expect(mocks.line).toHaveBeenCalledWith(
      expect.objectContaining({ lineId: 'stored-salon-line' })
    )
  })

  it('サロン送信先の未設定時は会社チャンネルへ送らずスキップする', async () => {
    apiConfig.org_line_id = undefined
    const response = await handleReservationNotification(request(), 'confirmation', 'salon')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, skipped: true })
    expect(mocks.line).not.toHaveBeenCalled()
  })

  it('LINE送信例外に含まれるtokenや宛先をログ・レスポンスへ出さない', async () => {
    mocks.line.mockRejectedValue(new Error('stored-tenant-token stored-customer-line'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await confirmationPost(request())
    expect(response.status).toBe(500)
    expect(await response.text()).not.toMatch(/stored-tenant-token|stored-customer-line/)
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('汎用LINE送信APIは送信を実行しない', async () => {
    expect((await genericLinePost()).status).toBe(410)
    expect(mocks.line).not.toHaveBeenCalled()
  })
})
