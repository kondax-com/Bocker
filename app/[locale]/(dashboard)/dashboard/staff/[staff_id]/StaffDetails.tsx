'use client'

import { Link } from '@/i18n/navigation'
import Image from 'next/image'
import React from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Loading } from '@/components/common'
import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Instagram } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTranslations } from 'next-intl'
import { CalendarDays, PiggyBank } from 'lucide-react'

// アイコン
import { User, Trash, Star, Tag, Mail, Calendar, FileEdit } from 'lucide-react'
import { MAX_PRIORITY } from '@/convex/constants'

export default function StaffDetails() {
  const { staff_id } = useParams()
  const { tenantId, orgId } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const t = useTranslations()

  // メモ化されたクエリを使用してパフォーマンス向上
  const staffAllData = useQuery(
    api.staff.query.getRelatedTables,
    tenantId && orgId && staff_id && !isDeleting
      ? { tenant_id: tenantId, org_id: orgId, staff_id: staff_id as Id<'staff'> }
      : 'skip'
  )

  // 招待状態を含むスタッフ情報を取得
  const staffWithInvitation = useQuery(
    api.staff.invitation.query.getStaffWithInvitation,
    staff_id && !isDeleting ? { staff_id: staff_id as Id<'staff'> } : 'skip'
  )

  const exclusionMenus = useQuery(
    api.menu.menu_exclusion_staff.query.listBySalonAndStaffId,
    tenantId && orgId && staff_id
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: staff_id as Id<'staff'>,
        }
      : 'skip'
  )

  const deleteImage = useAction(api.storage.action.killWithThumbnail)
  const fetchUserEmail = useAction(api.staff.action.fetchUserEmail)

  // メールアドレス取得処理をuseCallbackで安定化
  const getEmailAddress = useCallback(
    async (clerkUserId: string) => {
      try {
        const email = await fetchUserEmail({
          clerk_user_id: clerkUserId,
        })
        console.log('取得したメール:', email)
        setUserEmail(email)
      } catch (error) {
        // エラーハンドリング：メール取得に失敗した場合はコンソールに出力
        console.error('メールアドレス取得エラー:', error)
        // UIには影響させず、メールリンクを非表示にする
        setUserEmail(null)
      }
    },
    [fetchUserEmail]
  )

  // メールアドレス取得のuseEffect
  useEffect(() => {
    // スタッフデータとclerk_user_idが存在する場合のみ処理を実行
    if (staffAllData && staffAllData.clerk_user_id !== undefined) {
      // useCallbackで安定化された関数を呼び出し
      getEmailAddress(staffAllData.clerk_user_id)
    }
  }, [staffAllData, getEmailAddress]) // getEmailAddressを依存配列に追加

  if (!staffAllData) return <Loading />

  // アバターの頭文字を取得
  const getInitials = (name: string) => {
    return name ? name.substring(0, 2).toUpperCase() : 'ST'
  }

  // 性別を日本語で表示
  const getGenderText = (gender: string) => {
    return gender === 'male'
      ? t('staff.add.male')
      : gender === 'female'
        ? t('staff.add.female')
        : t('staff.add.unselected')
  }

  // roleをわかりやすい表示に変換
  const getRoleDisplay = (role: string) => {
    return t(`staff.roles.${role}`)
  }

  const handleShowDeleteDialog = () => {
    setIsDeleteDialogOpen(true)
  }

  const handleDeleteStaff = async () => {
    try {
      // 削除処理中フラグを立てて、クエリの実行を停止
      setIsDeleting(true)

      // 1. 画像ファイルの削除
      if (staffAllData?.images[0]?.original_url) {
        await deleteImage({
          originalUrl: staffAllData.images[0].original_url,
        })
      }

      // 2. 削除APIを呼び出し（招待状態を考慮した削除）
      if (staffAllData && tenantId && orgId) {
        try {
          const deleteResponse = await fetch('/api/clerk/staff/delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              staff_id: staff_id,
              tenant_id: tenantId,
              org_id: orgId,
              staff_config_id: staffAllData.staff_config_id,
            }),
          })

          const deleteData = await deleteResponse.json()

          if (deleteResponse.ok) {
            console.log('スタッフ削除成功:', deleteData)
          } else {
            throw new Error(deleteData.error || 'スタッフ削除に失敗しました')
          }
        } catch (deleteError) {
          console.error('スタッフ削除エラー:', deleteError)
          throw deleteError
        }
      }

      // 3. データベースからの削除は削除APIで処理済みのため不要

      toast.success('スタッフを削除しました')
      router.push('/dashboard/staff')
    } catch (error) {
      // エラーが発生した場合は削除処理中フラグを元に戻す
      setIsDeleting(false)
      showErrorToast(error)
    }
  }

  return (
    <div className="min-w-0 pb-8">
      {/* スタッフヘッダーカード - 改良版 */}
      <div className="mx-auto w-full min-w-0">
        <div className="mb-8">
          <div className="admin-panel overflow-hidden">
            <div className="flex flex-col lg:flex-row">
              {/* サムネイル部分 - スタイル改良 */}
              <div className="lg:w-1/3 flex md:items-start md:mt-4 justify-center p-4">
                {staffAllData.images && staffAllData.images.length > 0 ? (
                  <div className="relative w-full max-w-sm aspect-square">
                    <Image
                      src={staffAllData.images[0].original_url}
                      alt={staffAllData.name || ''}
                      width={400}
                      height={400}
                      className="object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent rounded-2xl" />
                  </div>
                ) : (
                  <div className="w-full max-w-sm aspect-square rounded-xl flex items-center justify-center border border-border bg-muted">
                    <div className="text-4xl font-bold text-primary/40">
                      {getInitials(staffAllData.name || '')}
                    </div>
                  </div>
                )}
              </div>

              {/* 情報部分 - レイアウト改良 */}
              <div className="min-w-0 flex-1 p-4 md:p-8 space-y-6">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                  <div className="space-y-4">
                    <div>
                      <h2 className="break-words text-2xl font-semibold text-foreground mb-2">
                        {staffAllData.name}
                      </h2>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge variant={staffAllData.is_active ? 'default' : 'outline'}>
                          {staffAllData.is_active ? t('common.active') : t('common.inactive')}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-accent-2 text-accent-2 bg-accent-2-foreground px-3 py-1 text-sm font-medium"
                        >
                          {getRoleDisplay(staffAllData.role || '')}
                        </Badge>
                        {staffWithInvitation && staffWithInvitation.connect_clerk && (
                          <Badge
                            variant="outline"
                            className="border-info text-info bg-info-foreground px-3 py-1 text-sm font-medium"
                          >
                            <Mail className="h-3 w-3 mr-1" />
                            {t('staff.common.authenticatedStaff')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('staff.add.gender')}
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            {getGenderText(staffAllData.gender || 'unselected')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('staff.add.age')}
                          </p>
                          <p className="text-sm font-semibold text-primary">
                            {staffAllData.age
                              ? t('staff.common.ageValue', { age: staffAllData.age })
                              : t('staff.common.ageNotSet')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-6 lg:mt-0">
                    {staffAllData.instagram_link && (
                      <Link
                        href={staffAllData.instagram_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-foreground transition-colors hover:bg-muted"
                      >
                        <Instagram className="h-5 w-5" />
                        <span className="text-sm font-medium">Instagram</span>
                      </Link>
                    )}
                  </div>
                </div>

                {userEmail && (
                  <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Email</p>
                      <Link
                        href={`mailto:${userEmail}`}
                        className="break-all text-sm font-semibold text-link-foreground hover:text-link-foreground transition-colors"
                      >
                        {userEmail}
                      </Link>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {t('staff.details.introduction')}
                    </h3>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary border border-border">
                    <p className="text-sm text-primary leading-relaxed">
                      {staffAllData.description || t('staff.details.noIntroduction')}
                    </p>
                  </div>
                </div>

                {staffAllData.tags && staffAllData.tags.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">Tags</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {staffAllData.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="px-3 py-1 text-xs font-medium"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* 指名料金 */}
                  <div className="relative overflow-hidden group">
                    <div className="hidden" />
                    <div className="relative rounded-xl border border-border bg-secondary p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-card">
                          <PiggyBank className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('staff.add.nominationFee')}
                          </p>
                          <p className="text-2xl font-semibold tabular-nums text-primary">
                            ¥{staffAllData.extra_charge?.toLocaleString() || 0}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t('staff.add.nominationFeeHelp')}
                      </p>
                    </div>
                  </div>

                  {/* 優先度 */}
                  <div className="relative overflow-hidden group">
                    <div className="hidden" />
                    <div className="relative rounded-xl border border-border bg-muted p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-card">
                          <Star className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">
                            {t('staff.add.priority')}
                          </p>
                          <p className="text-2xl font-semibold tabular-nums text-primary">
                            {staffAllData.priority || 0}
                            <span className="text-sm text-muted-foreground ml-1">
                              /{MAX_PRIORITY}
                            </span>
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t('staff.add.priorityHelp')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 対応外メニュー表示 */}
                {exclusionMenus && exclusionMenus.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold text-foreground">
                        {t('staff.add.exclusionMenuTitle')}
                      </h3>
                    </div>
                    <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
                      <div className="flex flex-wrap gap-2">
                        {exclusionMenus.map((menu) => (
                          <Badge
                            key={menu.menu_id.slice(0, 12)}
                            variant="outline"
                            className="border-warning/50 text-warning-foreground bg-warning/10 px-2 py-1 text-xs font-medium"
                          >
                            {menu.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap justify-between items-start sm:items-center gap-3">
              <div className="text-xs text-muted-foreground tracking-wider font-medium">
                <span>{t('staff.details.createdAt')}: </span>
                <span className="font-semibold text-primary">
                  {new Date(staffAllData._creationTime).toLocaleDateString()}
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={handleShowDeleteDialog}
                >
                  <Trash className="h-4 w-4" />
                  {t('common.delete')}
                </Button>
                <Link href={`/dashboard/staff/${staff_id}/edit`}>
                  <Button
                    size="sm"
                    variant="edit"
                    className="gap-2 hover:bg-muted transition-colors"
                  >
                    <FileEdit className="h-4 w-4" />
                    {t('common.edit')}
                  </Button>
                </Link>
                <Link href={`/dashboard/staff/schedule?staffId=${staff_id}`}>
                  <Button
                    variant="default"
                    size="sm"
                    className="min-h-11 gap-2 transition-colors shadow-none"
                  >
                    <CalendarDays className="h-4 w-4" />
                    {t('common.schedule')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <Trash className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-xl font-semibold">
              {t('staff.common.deleteConfirm')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              {t('staff.common.deleteConfirmDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
              className="flex-1 sm:flex-none"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteStaff}
              className="min-h-11 flex-1 sm:flex-none"
            >
              {t('staff.edit.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
