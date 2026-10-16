import { NextRequest, NextResponse } from 'next/server'
import { fetchMutation } from 'convex/nextjs'
import type { FunctionArgs } from 'convex/server'
import { api } from '@/convex/_generated/api'
import { getCustomerSession } from '@/lib/auth/customer'
import { withReservationMutationCapability } from '@/lib/auth/reservation-capability'

type CreatePayload = Extract<
  FunctionArgs<typeof api.reservation.manage.handleReservationManage>['payload'],
  { tenant_id: string }
>

export async function POST(request: NextRequest) {
  const session = await getCustomerSession()
  if (!session) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  let payload: CreatePayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: '予約情報が不正です' }, { status: 400 })
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.tenant_id !== session.tenantId ||
    payload.org_id !== session.orgId ||
    payload.customer_uid !== session.customerUid
  ) {
    return NextResponse.json({ error: 'この顧客の予約を作成する権限がありません' }, { status: 403 })
  }
  try {
    const { server_token } = withReservationMutationCapability('customer-create', payload)
    const result = await fetchMutation(api.reservation.manage.handleReservationManage, {
      mode: 'create',
      payload,
      server_token,
    })
    return NextResponse.json(result)
  } catch (error) {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : undefined
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : '予約の作成に失敗しました'
    const publicData =
      data && typeof data === 'object'
        ? Object.fromEntries(
            Object.entries(data).filter(
              ([key, value]) =>
                ['code', 'statusCode', 'severity', 'callFunc', 'message'].includes(key) &&
                (typeof value === 'string' || typeof value === 'number')
            )
          )
        : undefined
    return NextResponse.json({ error: message, data: publicData }, { status: 400 })
  }
}
