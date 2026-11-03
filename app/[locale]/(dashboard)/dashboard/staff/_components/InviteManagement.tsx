// app/(dashboard)/dashboard/staff/components/InviteManagement.tsx
// 招待管理コンポーネント - 招待状況の確認・再送・キャンセル機能
'use client'

import { useState } from 'react'
import { convertRole } from '@/convex/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Mail, Trash2, Clock, AlertCircle, Users, UserPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Role, Gender, InvitationStatus } from '@/convex/types'
import { Id } from '@/convex/_generated/dataModel'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

// 招待データの型定義（Convex + Clerkの統合データ）
interface StaffInvitation {
  // Convexデータ
  staff_id: Id<'staff'>
  name: string
  email: string
  gender: Gender
  age?: number
  tags: string[]
  created_at: number

  // Clerk招待データ
  invitation_id: string | null
  invitation_status: InvitationStatus
  invitation_created_at: number | null

  // メタデータ
  metadata: {
    tenant_id: Id<'tenant'>
    org_id: Id<'organization'>
    role: Role
    staff_id: Id<'staff'>
    extra_charge?: number
    priority?: number
    invited_by?: string
    invited_at?: string
    resent?: boolean
  } | null
}

export default function InviteManagement() {
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()

  // Convexクエリで招待中スタッフを取得
  const pendingStaff = useQuery(
    api.staff.invitation.query.listPending,
    tenantId && orgId && planName
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip'
  )

  // コンポーネントの状態管理
  const [selectedInvitation, setSelectedInvitation] = useState<StaffInvitation | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // pendingStaffをStaffInvitation型に変換
  const invitations: StaffInvitation[] =
    pendingStaff?.map((staff) => ({
      // Convexデータ
      staff_id: staff._id,
      name: staff.name,
      email: staff.invitation_email || '',
      gender: staff.config?.gender || ('unselected' as Gender),
      age: staff.config?.age,
      tags: staff.config?.tags || [],
      created_at: staff._creationTime,

      // 招待データ
      invitation_id: staff.clerk_invitation_id || null,
      invitation_status: staff.invitation_status || 'pending',
      invitation_created_at: staff._creationTime,

      // メタデータ
      metadata: {
        tenant_id: staff.tenant_id,
        org_id: staff.org_id,
        role: staff.config?.role || ('staff' as Role),
        staff_id: staff._id,
        extra_charge: staff.config?.extra_charge,
        priority: staff.config?.priority,
        resent: false,
      },
    })) || []

  const isLoading = pendingStaff === undefined

  // 招待をキャンセルする関数
  const cancelInvitation = async (invitation: StaffInvitation) => {
    setIsProcessing(true)
    try {
      // Clerk側の招待もキャンセル（APIエンドポイント経由）
      if (invitation.invitation_id) {
        const response = await fetch(
          `/api/clerk/staff/invitations/${invitation.invitation_id}?staff_id=${invitation.staff_id}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json()
            throw new Error(data.error || 'Clerk招待のキャンセルに失敗しました')
          } else {
            throw new Error('Clerk招待のキャンセルに失敗しました')
          }
        }
      } else {
        toast.error('招待IDが見つかりません')
      }

      toast.success(`${invitation.email} の招待をキャンセルしました`)
      setShowCancelDialog(false)
      setSelectedInvitation(null)
      // Convexは自動的に更新されるため、手動更新は不要
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return null
  }

  // 招待がない場合の表示
  if (!isLoading && invitations.length === 0) {
    return null
  }

  return (
    <>
      <Card className="admin-panel mb-6">
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              スタッフ招待管理
              {invitations.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {invitations.length}件
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              招待を削除後、新しい招待を作成してメールを再送できます
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-link-foreground mb-2"></div>
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {invitations.map((invitation) => (
                  <motion.div
                    key={invitation.staff_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="rounded-xl border border-border bg-muted p-4"
                  >
                    <div className="flex flex-col items-start justify-between gap-3 md:flex-row">
                      <div className="flex-1">
                        <div className="flex flex-col items-start justify-start gap-2 w-full">
                          {invitation.metadata && (
                            <Badge variant="default" className="text-xs text-nowrap">
                              {convertRole(invitation.metadata.role)}
                            </Badge>
                          )}
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-6 w-6 text-neon" />
                            <p className="min-w-0 break-all text-sm text-foreground">
                              ({invitation.email})
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {invitation.invitation_status === 'missing' && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                招待エラー
                              </Badge>
                            )}
                            {invitation.metadata?.resent && (
                              <Badge variant="outline" className="text-xs">
                                再送済
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1 text-nowrap">
                            <Clock className="h-3 w-3" />
                            登録日:{' '}
                            {formatDistanceToNow(new Date(invitation.created_at), {
                              addSuffix: true,
                              locale: ja,
                            })}
                          </div>
                          {invitation.invitation_created_at && (
                            <div className="flex items-center gap-1 text-nowrap">
                              <Mail className="h-3 w-3" />
                              招待送信:{' '}
                              {formatDistanceToNow(new Date(invitation.invitation_created_at), {
                                addSuffix: true,
                                locale: ja,
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedInvitation(invitation)
                            setShowCancelDialog(true)
                          }}
                          disabled={isProcessing}
                          className="flex min-h-11 items-center gap-1 border border-destructive bg-card text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <Trash2 className="h-3 w-3" />
                          削除
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* キャンセル確認ダイアログ */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>スタッフ招待を削除しますか？</DialogTitle>
            <DialogDescription>
              {selectedInvitation?.name} ({selectedInvitation?.email}) の招待を削除します。
              削除後、必要に応じて新しい招待を作成してください。
              この操作は元に戻すことができません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={isProcessing}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedInvitation && cancelInvitation(selectedInvitation)}
              disabled={isProcessing}
            >
              {isProcessing ? '処理中...' : 'スタッフを削除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
