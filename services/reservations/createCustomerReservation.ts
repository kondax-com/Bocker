import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import type { api } from '@/convex/_generated/api'

type Manage = typeof api.reservation.manage.handleReservationManage
type CreatePayload = Extract<FunctionArgs<Manage>['payload'], { tenant_id: string }>

export async function createCustomerReservation(
  payload: CreatePayload
): Promise<FunctionReturnType<Manage>> {
  const response = await fetch('/api/customer/reservation/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json()
  if (!response.ok) {
    const error = new Error(result.error || '予約の作成に失敗しました')
    Object.assign(error, { data: result.data })
    throw error
  }
  return result
}
