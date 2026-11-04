import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from 'convex/react'
import { useSearchParams } from 'next/navigation'
import CompletePage from '@/app/[locale]/(reservation)/reservation/[id]/calendar/complete/page'
import ReservationPage from '@/app/[locale]/(dashboard)/dashboard/reservation/[reservation_id]/page'
import { ReservationDetailPageClient } from '@/app/[locale]/(customer)/customer/[org_id]/[uid]/reservation/[reservation_id]/ReservationDetailPageClient'
import { useReservationData } from '@/hooks/useOrganizationReservations'
import { api } from '@/convex/_generated/api'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ reservation_id: 'k'.repeat(32) }),
  useSearchParams: vi.fn(),
}))
vi.mock('@/hooks/useTenantAndOrganization', () => ({
  useTenantAndOrganization: () => ({ planName: 'pro' }),
}))
vi.mock('@/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ showErrorToast: vi.fn() }),
}))
vi.mock('@/hooks/useOrganizationReservations', () => ({ useReservationData: vi.fn() }))
vi.mock('@/components/common', () => ({
  Loading: () => <div>読み込み中</div>,
  DashboardSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

describe('missing reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQuery).mockReturnValue(null)
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams({ reservationId: 'k'.repeat(32) }) as ReturnType<typeof useSearchParams>
    )
    vi.mocked(useReservationData).mockReturnValue({ data: null, loading: false, error: null })
  })
  afterEach(cleanup)

  it('shows a not-found message on the completion page', () => {
    render(<CompletePage />)
    expect(screen.getByText('予約が見つかりません')).toBeInTheDocument()
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument()
  })

  it('skips the completion query when the reservation ID is missing', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>
    )
    render(<CompletePage />)
    expect(useQuery).toHaveBeenCalledWith(api.reservation.query.getWithDetailById, 'skip')
    expect(screen.getByText('予約が見つかりません')).toBeInTheDocument()
  })

  it('keeps showing loading while the completion query is pending', () => {
    vi.mocked(useQuery).mockReturnValue(undefined)
    render(<CompletePage />)
    expect(screen.getByText('読み込み中')).toBeInTheDocument()
    expect(screen.queryByText('予約が見つかりません')).not.toBeInTheDocument()
  })

  it('shows a not-found message on the dashboard', () => {
    render(<ReservationPage />)
    expect(screen.getByText('予約が見つかりません')).toBeInTheDocument()
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument()
  })

  it('keeps showing loading while the dashboard query is pending', () => {
    vi.mocked(useReservationData).mockReturnValue({ data: null, loading: true, error: null })
    render(<ReservationPage />)
    expect(screen.getByText('読み込み中')).toBeInTheDocument()
  })

  it('stops loading and returns the customer to the reservation list', async () => {
    render(
      <ReservationDetailPageClient
        orgId="test-org"
        customerUid="test-customer"
        reservationId={'k'.repeat(32)}
        tenantId="test-tenant"
        sessionOrgId="test-org"
      />
    )
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/customer/test-org/test-customer/reservation')
    })
    expect(screen.getByText('予約が見つかりません')).toBeInTheDocument()
  })
})
