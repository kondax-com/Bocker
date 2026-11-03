import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/convex/_generated/api'
import StaffMyPage from '../page'

const { useAccount, useStaffQuery, fetchUserEmail } = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useStaffQuery: vi.fn(),
  fetchUserEmail: vi.fn(),
}))

vi.mock('@/hooks/useTenantAndOrganization', () => ({
  useTenantAndOrganization: useAccount,
}))

vi.mock('convex/react', () => ({
  useQuery: useStaffQuery,
  useAction: () => fetchUserEmail,
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    staff: {
      query: { getRelatedTables: 'staff:getRelatedTables' },
      action: { fetchUserEmail: 'staff:fetchUserEmail' },
    },
    menu: {
      menu_exclusion_staff: { query: { getExclusionMenus: 'menu:getExclusionMenus' } },
    },
  },
}))

vi.mock('@/components/common', () => ({
  Loading: () => <div data-testid="loading" />,
}))

vi.mock('../MyWeekScheduleForm', () => ({
  default: () => <div data-testid="week-schedule" />,
}))

vi.mock('../MyExceptionScheduleForm', () => ({
  default: () => <div data-testid="exception-schedule" />,
}))

const account = {
  tenantId: 'tenant-id',
  orgId: 'org-id',
  staffId: 'metadata-staff-id',
  isLoaded: true,
  ready: true,
}

describe('StaffMyPage account guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAccount.mockReturnValue(account)
    useStaffQuery.mockReturnValue(undefined)
  })

  afterEach(cleanup)

  it('アカウント準備前はスタッフの問い合わせを開始しない', () => {
    useAccount.mockReturnValue({ ...account, ready: false })

    render(<StaffMyPage />)

    expect(useStaffQuery).toHaveBeenCalledWith(api.staff.query.getRelatedTables, 'skip')
    expect(useStaffQuery).toHaveBeenCalledWith(
      api.menu.menu_exclusion_staff.query.getExclusionMenus,
      'skip'
    )
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    expect(screen.queryByTestId('week-schedule')).not.toBeInTheDocument()
  })

  it.each([null, undefined])('スタッフ未設定（%s）は問い合わせを省き案内を表示する', (staffId) => {
    useAccount.mockReturnValue({ ...account, staffId })

    render(<StaffMyPage />)

    expect(useStaffQuery).toHaveBeenCalledWith(api.staff.query.getRelatedTables, 'skip')
    expect(useStaffQuery).toHaveBeenCalledWith(
      api.menu.menu_exclusion_staff.query.getExclusionMenus,
      'skip'
    )
    expect(screen.getByRole('heading', { name: 'staffNotLinked.title' })).toBeInTheDocument()
    expect(screen.getByText('staffNotLinked.description')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'staffNotLinked.backToDashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('week-schedule')).not.toBeInTheDocument()
    expect(fetchUserEmail).not.toHaveBeenCalled()
  })

  it('スタッフ設定済みは従来のmetadata由来IDで読み込み勤務設定を表示する', () => {
    useStaffQuery.mockImplementation((query) =>
      query === api.staff.query.getRelatedTables
        ? {
            name: 'テストスタッフ',
            role: 'staff',
            is_active: true,
            images: [],
            tags: [],
            _creationTime: 1,
          }
        : []
    )

    render(<StaffMyPage />)

    const expectedArgs = {
      tenant_id: account.tenantId,
      org_id: account.orgId,
      staff_id: account.staffId,
    }
    expect(useStaffQuery).toHaveBeenCalledWith(api.staff.query.getRelatedTables, expectedArgs)
    expect(useStaffQuery).toHaveBeenCalledWith(
      api.menu.menu_exclusion_staff.query.getExclusionMenus,
      expectedArgs
    )
    expect(screen.getByRole('heading', { name: 'テストスタッフ' })).toBeInTheDocument()
    expect(screen.getByTestId('week-schedule')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'edit' })).toHaveAttribute(
      'href',
      `/dashboard/staff/${account.staffId}/edit`
    )
    expect(screen.queryByText('staffNotLinked.title')).not.toBeInTheDocument()
  })
})
