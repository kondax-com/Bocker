// app/(salon)/dashboard/staff/add/page.tsx
// スタッフの追加ページ
'use client'

import { Loader2 } from 'lucide-react'
import { TagInput } from '@/components/common'
import { DashboardSection } from '@/components/common'
import { useZodForm } from '@/hooks/useZodForm'
import { useMutation } from 'convex/react'
import { fetchAction, fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'
import { ERROR_SEVERITY, ERROR_STATUS_CODE } from '@/lib/errors/constants'
import { SingleImageDrop } from '@/components/common'
import { z } from 'zod'
import { Gender, GENDER_VALUES, Role, ROLE_VALUES } from '@/convex/types'
import { MAX_NOTES_LENGTH, MAX_TEXT_LENGTH } from '@/convex/constants'
import { Textarea } from '@/components/ui/textarea'
import { ZodTextField } from '@/components/common'
import { useUser } from '@clerk/clerk-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SubscriptionPlanName } from '@/convex/types'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Id } from '@/convex/_generated/dataModel'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ConvexError } from 'convex/values'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'
import { useTranslations } from 'next-intl'
import Uploader from '@/components/common/Uploader'

import {
  Save,
  ArrowLeft,
  Calendar,
  Shield,
  Sparkles,
  User,
  Mail,
  Clipboard,
  Check,
  Instagram,
  Image as ImageIcon,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExclusionMenu, withOwnerAccess } from '@/components/common'

// sendInviteEmailフラグに応じて動的にバリデーションを変更するスキーマファクトリー関数
const createStaffAddSchema = (sendInviteEmail: boolean, t: ReturnType<typeof useTranslations>) =>
  z.object({
    // 名前：招待メール送信時は任意、通常作成時は必須
    name: z
      .string()
      .min(1, { message: t('staff.validation.nameRequired') })
      .max(MAX_TEXT_LENGTH, {
        message: t('staff.validation.nameMaxLength', { max: MAX_TEXT_LENGTH }),
      }),

    // メールアドレス：招待メール送信時は必須、通常作成時は任意
    email: sendInviteEmail
      ? z
          .string()
          .min(1, { message: t('staff.validation.emailRequired') })
          .email({ message: t('staff.validation.emailInvalid') })
      : z.string().optional().nullable(),

    instagram_link: z
      .preprocess(
        (val) => {
          // val が文字列以外なら undefined
          if (typeof val !== 'string') return undefined
          // トリムして空文字なら undefined、それ以外はトリム済み文字列
          const str = val.trim()
          return str === '' ? undefined : str
        },
        // undefined が渡れば optional でスキップ、文字列なら URL バリデーション
        z
          .string()
          .url({ message: t('staff.validation.urlInvalid') })
          .optional()
      )
      .nullable(), // null も許容したい場合のみ残します

    gender: z.enum(GENDER_VALUES).optional().nullable(),

    age: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return null
        // 数値に変換できない場合もnullを返す
        const num = Number(val)
        return isNaN(num) ? null : num
      },
      z
        .number()
        .max(99, { message: t('staff.validation.ageMax') })
        .nullable()
        .optional()
    ),

    // 説明：招待メール送信時は任意、通常作成時は必須
    description: sendInviteEmail
      ? z.string().max(MAX_NOTES_LENGTH).optional().nullable()
      : z
          .string()
          .min(1, { message: t('staff.validation.descriptionRequired') })
          .max(MAX_NOTES_LENGTH)
          .optional()
          .nullable(),

    images: z.array(
      z.object({
        original_url: z.string(),
        thumbnail_url: z.string(),
      })
    ),

    is_active: z.boolean(),

    role: z.enum(ROLE_VALUES).optional().nullable(),

    tags: z.preprocess(
      (val) => (typeof val === 'string' ? val : Array.isArray(val) ? val.join(',') : ''),
      z
        .string()
        .max(100, { message: t('staff.validation.tagsMaxLength') })
        .transform((val) =>
          val
            ? val
                .replace(/[,、]/g, ',')
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag !== '')
            : []
        )
        .refine((val) => val.length <= 5, { message: t('staff.validation.tagsMaxCount') })
    ),

    extra_charge: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return null
        // 数値に変換できない場合もnullを返す
        const num = Number(val)
        return isNaN(num) ? null : num
      },
      z
        .number()
        .max(99999, { message: t('staff.validation.nominationFeeMax', { max: 99999 }) })
        .nullable()
        .optional()
    ),

    priority: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return null
        // 数値に変換できない場合もnullを返す
        const num = Number(val)
        return isNaN(num) ? null : num
      },
      z
        .number()
        .max(999, { message: t('staff.validation.priorityMax') })
        .nullable()
        .optional()
    ),

    selected_menu_ids: z.array(z.string()).optional(),
  })

function StaffAddPage() {
  const router = useRouter()
  const t = useTranslations()
  const { tenantId, orgId, planName } = useTenantAndOrganization()
  const { user } = useUser()
  const { showErrorToast } = useErrorHandler()
  const [exclusionMenuIds, setExclusionMenuIds] = useState<Id<'menu'>[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [sendInviteEmail, setSendInviteEmail] = useState(false)

  const staffAdd = useMutation(api.staff.mutation.create)
  const staffConfigAdd = useMutation(api.staff.config.mutation.create)
  const staffKill = useMutation(api.staff.mutation.killRelatedTables)
  const menuExclusionStaffUpsert = useMutation(api.menu.menu_exclusion_staff.mutation.upsert)

  // sendInviteEmailフラグに応じて動的にスキーマを生成
  const staffAddSchema = createStaffAddSchema(sendInviteEmail, t)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors, isDirty },
    watch,
  } = useZodForm(staffAddSchema)

  const onSubmit = async (data: z.infer<ReturnType<typeof createStaffAddSchema>>) => {
    setIsLoading(true)
    let staffId: Id<'staff'> | null = null
    let staffConfigId: Id<'staff_config'> | null = null
    let newUploadedImageUrls: { original_url: string; thumbnail_url: string }[] = []

    try {
      if (!tenantId || !orgId || !planName) {
        toast.error(t('staff.messages.storeNotFound'))
        return
      }

      await fetchQuery(api.tenant.plan.query.checkLimitByPlan, {
        tenant_id: tenantId,
        org_id: orgId,
        limit_type: 'staff',
      })

      // 招待メール送信の場合は、スタッフ作成をスキップして直接招待APIを呼び出す
      if (sendInviteEmail) {
        try {
          // 招待メール送信時は事前にメールアドレスの重複チェック
          const userEmail = user?.emailAddresses[0].emailAddress
          const isAdmin = userEmail === data.email && user?.publicMetadata.role === 'admin'
          if (sendInviteEmail && data.email) {
            if (isAdmin) {
              toast.error(t('staff.messages.adminCannotCreateStaff'))
              setIsLoading(false)
              return
            }

            try {
              const emailCheckResult = await fetchAction(
                api.staff.invitation.action.checkEmailAvailability,
                {
                  tenant_id: tenantId,
                  org_id: orgId,
                  email: data.email,
                }
              )

              if (!emailCheckResult.isAvailable) {
                toast.error(t('staff.messages.emailAlreadyRegistered'))
                setIsLoading(false)
                return
              }
            } catch (checkError) {
              console.error('メールアドレスチェックエラー:', checkError)
              showErrorToast(checkError)
              setIsLoading(false)
              return
            }
          }
          console.log('📧 招待メール送信を開始:', {
            email: data.email,
            tenant_id: tenantId,
            org_id: orgId,
            role: data.role,
          })

          if (selectedFile) {
            try {
              setIsLoading(true)
              console.log('[画像アップロード] Staff招待: 署名付きURL方式を使用')
              const result = await uploadImage(selectedFile!, orgId, 'staff', 'square', 'medium')
              // 新方式のレスポンス形式に合わせて修正
              newUploadedImageUrls = [
                {
                  original_url: result.originalUrl,
                  thumbnail_url: result.thumbnailUrl,
                },
              ]
              setIsLoading(false)
            } catch (error) {
              console.log('画像アップロードエラー: ', error)

              showErrorToast(error)
              setIsLoading(false)
              return
            }
          }

          const inviteResponse = await fetch('/api/clerk/staff/invite', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: data.email,
              tenant_id: tenantId,
              org_id: orgId,
              name: data.name ?? '', // スタッフ名
              description: data.description ?? undefined, // 自己紹介
              images: newUploadedImageUrls.length > 0 ? newUploadedImageUrls : data.images || [], // 画像
              is_active: data.is_active ?? true, // 有効/無効
              age: data.age ?? undefined, // 年齢
              gender: data.gender ?? ('unselected' as Gender), // 性別
              instagram_link: data.instagram_link ?? undefined, // インスタグラムリンク
              tags: data.tags ?? [], // タグ
              role: data.role ?? ('staff' as Role), // ロール
              featured_hair_images: [], // フィーチャー画像
              extra_charge: data.extra_charge ?? undefined, // 追加料金
              priority: data.priority ?? undefined, // 優先度
            }),
          })

          const inviteData = await inviteResponse.json()

          if (!inviteResponse.ok) {
            console.error('招待APIエラー:', inviteData)

            // より詳細なエラーメッセージを表示
            if (inviteData.type === 'request_error') {
              toast.error(`リクエストエラー: ${inviteData.error}`)
            } else if (inviteData.details) {
              const fieldErrors = inviteData.details
                .map((d: { field: string; message: string }) => `${d.field}: ${d.message}`)
                .join(', ')
              toast.error(`検証エラー: ${fieldErrors}`)
            } else if (inviteResponse.status === 400 && inviteData.error?.includes('Clerk')) {
              toast.error(t('staff.messages.emailAlreadyInClerk'))
            } else {
              toast.error(
                t('staff.messages.inviteFailed', { error: inviteData.error || 'Unknown error' })
              )
            }
            return
          }

          toast.success(t('staff.messages.inviteEmailSent'), {
            icon: <Check className="h-4 w-4 text-accent-2" />,
          })
          router.push('/dashboard/staff')
          return
        } catch (inviteError) {
          console.error('🚨 招待メール送信エラー:', inviteError)
          toast.error(t('staff.messages.inviteError'))
          return
        }
      } else {
        // 通常のスタッフ作成処理
        if (selectedFile) {
          try {
            setIsLoading(true)
            console.log('[画像アップロード] Staff作成: 署名付きURL方式を使用')
            const result = await uploadImage(selectedFile!, orgId, 'staff', 'square', 'medium')
            // 新方式のレスポンス形式に合わせて修正
            newUploadedImageUrls = [
              {
                original_url: result.originalUrl,
                thumbnail_url: result.thumbnailUrl,
              },
            ]
            setIsLoading(false)
          } catch (error) {
            console.log('画像アップロードエラー: ', error)

            showErrorToast(error)
            setIsLoading(false)
            return
          }
        }

        try {
          // スタッフの基本情報を追加
          try {
            staffId = await staffAdd({
              tenant_id: tenantId, // テナントID
              org_id: orgId, // 店舗ID
              plan_name: planName as SubscriptionPlanName,
              connect_clerk: false, // Clerk ユーザーID (true = clerk認証ユーザー, false = 未認証スタッフ)
              clerk_user_id: undefined, // Clerk ユーザーID ( null = 未認証スタッフ, INVITE=招待中, ${clerk_user_id}=受諾済み)
              name: data.name ?? '', // スタッフ名
              description: data.description ?? undefined, // 自己紹介
              images: newUploadedImageUrls ? newUploadedImageUrls : data.images, // 画像
              is_active: data.is_active, // 有効/無効
            })
          } catch (creationError) {
            console.log('creationError type: ', typeof creationError)
            console.log('creationError: ', creationError)
            showErrorToast(creationError)
            setIsLoading(false)
            return
          }
          // スタッフの設定情報を追加
          staffConfigId = await staffConfigAdd({
            tenant_id: tenantId, // テナントID
            org_id: orgId, // 店舗ID
            staff_id: staffId, // スタッフID
            age: data.age ?? undefined, // 年齢
            gender: data.gender ?? ('unselected' as Gender), // 性別
            instagram_link: data.instagram_link ?? undefined, // インスタグラムリンク
            tags: data.tags ?? [], // タグ
            role: data.role ?? ('staff' as Role), // ロール
            featured_hair_images: [], // フィーチャー画像
            extra_charge: data.extra_charge ?? undefined, // 追加料金
            priority: data.priority ?? undefined, // 優先度
          })

          // スタッフの対応外メニューを追加
          await menuExclusionStaffUpsert({
            tenant_id: tenantId,
            org_id: orgId,
            staff_id: staffId,
            selected_menu_ids: exclusionMenuIds,
          })

          toast.success(t('staff.messages.staffAdded'), {
            icon: <Check className="h-4 w-4 text-accent-2" />,
          })

          router.push('/dashboard/staff')
        } catch (configAuthError) {
          // スタッフ設定または認証の保存に失敗した場合、作成したスタッフを削除
          if (staffId) {
            try {
              if (staffConfigId && staffId) {
                await staffKill({
                  tenant_id: tenantId,
                  org_id: orgId,
                  staff_id: staffId,
                  staff_config_id: staffConfigId,
                })
              }
            } catch (cleanupError) {
              throw new ConvexError({
                message: '指定されたスタッフが存在しません',
                statusCode: ERROR_STATUS_CODE.NOT_FOUND,
                severity: ERROR_SEVERITY.ERROR,
                callFunc: 'staff.mutation.create',
                details: { ...data, error: JSON.stringify(cleanupError) },
              })
            }
          }
          throw configAuthError // 元のエラーを再スロー
        }
      }
    } catch (error: unknown) {
      // エラー発生時のクリーンアップ
      if (newUploadedImageUrls.length > 0) {
        try {
          await fetch('/api/storage', {
            method: 'DELETE',
            body: JSON.stringify({
              originalUrl: newUploadedImageUrls[0]?.original_url,
              withThumbnail: true,
            }),
          })
        } catch (deleteError) {
          console.error('画像削除中にエラーが発生しました:', deleteError)
        }
      }
      if (staffId) {
        try {
          if (staffConfigId && staffId && tenantId && orgId) {
            await staffKill({
              tenant_id: tenantId,
              org_id: orgId,
              staff_id: staffId,
              staff_config_id: staffConfigId,
            })
          }
        } catch (cleanupError) {
          throw new ConvexError({
            message: 'スタッフ削除中にエラーが発生しました',
            statusCode: ERROR_STATUS_CODE.INTERNAL_SERVER_ERROR,
            severity: ERROR_SEVERITY.ERROR,
            callFunc: 'staff.mutation.create',
            details: { ...data, error: JSON.stringify(cleanupError) },
          })
        }
        showErrorToast(error)
        return
      }
      showErrorToast(error)
    } finally {
      setIsLoading(false)
    }
  }

  // フォームの初期化とスキーマの再適用
  useEffect(() => {
    reset({
      name: '',
      email: '',
      instagram_link: undefined,
      gender: 'unselected',
      description: '',
      images: [],
      is_active: true,
      role: 'staff',
      extra_charge: undefined,
      priority: undefined,
      tags: [],
    })
    setCurrentTags([])
  }, [reset, sendInviteEmail]) // sendInviteEmailの変更時もリセット

  if (isLoading) {
    return <Uploader />
  }

  return (
    <DashboardSection
      title={t('staff.add.title')}
      backLink="/dashboard/staff"
      backLinkTitle={t('staff.list.title')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="admin-form">
        <Tabs defaultValue="basic">
          <TabsList className="mb-4 h-auto max-w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="basic">{t('staff.add.tabBasicInfo')}</TabsTrigger>
            <TabsTrigger value="exclusion">{t('staff.add.tabExclusionMenu')}</TabsTrigger>
          </TabsList>
          <TabsContent value="basic">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="admin-panel overflow-hidden">
                <CardContent className="space-y-8 px-4 pt-5 sm:px-6 sm:pt-6 overflow-x-hidden">
                  {/* 基本情報セクション */}
                  <div>
                    {planName !== 'MICRO' ? (
                      <div className="mb-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-secondary p-4 text-secondary-foreground">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="send_invite_email"
                            checked={sendInviteEmail}
                            onCheckedChange={(checked) => setSendInviteEmail(checked)}
                          />
                          <Label htmlFor="send_invite_email" className="text-sm cursor-pointer">
                            {t('staff.add.sendInviteEmail')}
                          </Label>
                        </div>
                        <p className="text-xs text-warning-foreground bg-warning rounded-md px-3 py-1 w-fit">
                          {t('staff.add.sendInviteEmailDesc2')}
                        </p>
                        <p className="text-xs text-muted-foreground w-fit">
                          {t('staff.add.sendInviteEmailDesc')}
                        </p>
                      </div>
                    ) : null}
                    {/* 権限設定セクション */}
                    {sendInviteEmail && (
                      <div>
                        <div className="flex items-center mb-4">
                          <Shield className="h-5 w-5 mr-2 text-accent-2" />
                          <h3 className="font-semibold text-lg">
                            {t('staff.add.invitePermissionSettings')}
                          </h3>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="flex flex-col space-y-4 items-center gap-2 w-full">
                            <div className="w-full">
                              <ZodTextField
                                name="email"
                                icon={<Mail className="h-4 w-4 mr-2 text-muted-foreground" />}
                                label={t('staff.add.inviteEmail')}
                                register={register}
                                errors={errors}
                                placeholder={t('staff.add.inviteEmailPlaceholder')}
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                {t('staff.add.inviteEmailHelp')}
                              </p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                {
                                  role: 'staff',
                                  label: t('staff.roles.staff'),
                                  desc: t('staff.edit.roleStaffDesc'),
                                },
                                {
                                  role: 'manager',
                                  label: t('staff.roles.manager'),
                                  desc: t('staff.edit.roleManagerDesc'),
                                },
                                {
                                  role: 'owner',
                                  label: t('staff.roles.owner'),
                                  desc: t('staff.edit.roleOwnerDesc'),
                                },
                              ].map((item) => (
                                <motion.div
                                  key={item.role}
                                  whileHover={{ scale: 1.02 }}
                                  className={`border rounded-md p-3 cursor-pointer transition-all ${
                                    watch('role') === item.role
                                      ? 'border-accent-2 bg-accent-2-foreground text-accent-2'
                                      : 'border-border bg-muted text-muted-foreground'
                                  }`}
                                  onClick={() => setValue('role', item.role as Role)}
                                >
                                  <div className="text-sm mb-1 font-bold">{item.label}</div>
                                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                                </motion.div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <div className="flex items-center mb-2">
                                <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
                                <Label className="font-medium text-muted-foreground">
                                  {t('staff.add.permissionSettings')}
                                </Label>
                              </div>
                              <div className="mt-1">
                                {/* 権限詳細説明 */}
                                <div className="mb-4 p-3 bg-background rounded-md border border-border">
                                  <h4 className="text-sm font-medium text-foreground mb-2">
                                    {t('staff.add.permissionDetails')}
                                  </h4>
                                  <div className="space-y-2 text-xs text-muted-foreground">
                                    <div className="border-l-2 border-palette-1-foreground pl-2">
                                      <strong className="text-palette-1-foreground">
                                        {t('staff.add.ownerRole')}
                                      </strong>
                                      <span className="ml-1">{t('staff.add.ownerRoleDesc')}</span>
                                    </div>
                                    <div className="border-l-2 border-palette-4-foreground pl-2">
                                      <strong className="text-palette-4-foreground">
                                        {t('staff.add.managerRole')}
                                      </strong>
                                      <span className="ml-1">{t('staff.add.managerRoleDesc')}</span>
                                    </div>
                                    <div className="border-l-2 border-palette-3-foreground pl-2">
                                      <strong className="text-palette-3-foreground">
                                        {t('staff.add.staffRole')}
                                      </strong>
                                      <span className="ml-1">{t('staff.add.staffRoleDesc')}</span>
                                    </div>
                                  </div>
                                  <div className="mt-3 pt-2 border-t border-border">
                                    <p className="text-xs text-warning-foreground font-medium">
                                      {t('staff.add.permissionNote')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Separator className="my-8 md:my-12 w-full" />
                    <div className="flex flex-col md:flex-row gap-6 pb-4 w-full overflow-hidden">
                      <div className="w-full md:w-2/5 flex-shrink-0">
                        <div className="mb-2 flex items-center">
                          <ImageIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            {t('staff.add.staffImage')}
                          </span>
                        </div>

                        <div className="w-full max-w-full">
                          <SingleImageDrop
                            onFileSelect={(file) => setSelectedFile(file ?? null)}
                            aspectType="square"
                            className="transition-all duration-200 hover:opacity-90"
                          />
                        </div>
                      </div>
                      <div className="space-y-4 w-full md:w-3/5 min-w-0">
                        <div>
                          <ZodTextField
                            name="name"
                            label={t('staff.name')}
                            icon={<User className="h-4 w-4 mr-2 text-muted-foreground" />}
                            register={register}
                            errors={errors}
                            placeholder={t('staff.add.namePlaceholder')}
                            className="transition-all duration-200"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-full">
                            <Label className="flex items-center mb-2 font-medium text-muted-foreground">
                              <User className="h-4 w-4 mr-2 text-muted-foreground" />
                              {t('staff.add.gender')}
                            </Label>
                            <Select
                              defaultValue="unselected"
                              onValueChange={(value) => setValue('gender', value as Gender)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={t('staff.add.genderPlaceholder')} />
                              </SelectTrigger>
                              <SelectContent>
                                {GENDER_VALUES.map((gender) => (
                                  <SelectItem key={gender} value={gender}>
                                    {gender === 'male'
                                      ? t('staff.add.male')
                                      : gender === 'female'
                                        ? t('staff.add.female')
                                        : t('staff.add.unselected')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="w-full">
                            <ZodTextField
                              name="age"
                              label={t('staff.add.age')}
                              icon={<Calendar className="h-4 w-4 mr-2 text-muted-foreground" />}
                              type="number"
                              register={register}
                              errors={errors}
                              placeholder={t('staff.add.agePlaceholder')}
                            />
                          </div>
                        </div>

                        {/* タグセクション */}
                        <TagInput
                          tags={currentTags}
                          setTagsAction={(tags) => {
                            setCurrentTags(tags)

                            setValue('tags', tags, { shouldValidate: true })
                          }}
                          errors={errors.tags}
                          title={t('staff.add.tagsTitle')}
                        />

                        <div className="flex items-center space-x-2 pt-1">
                          <Switch
                            id="is_active"
                            checked={watch('is_active')}
                            onCheckedChange={(checked) => setValue('is_active', checked)}
                          />
                          <Label htmlFor="is_active" className="text-xs cursor-pointer">
                            {watch('is_active') ? (
                              <span className="text-accent-2 font-medium">{t('staff.active')}</span>
                            ) : (
                              <span className="text-destructive font-medium">
                                {t('staff.inactive')}
                              </span>
                            )}
                          </Label>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {t('staff.add.reservationAvailable')}
                        </span>
                      </div>
                    </div>
                    <div className="mt-10">
                      <ZodTextField
                        icon={<Instagram className="h-4 w-4 mr-2 text-muted-foreground" />}
                        name="instagram_link"
                        label={t('staff.add.instagramLink')}
                        register={register}
                        errors={errors}
                        placeholder={t('staff.add.instagramPlaceholder')}
                      />
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <Clipboard className="h-4 w-4 mr-2 text-muted-foreground" />
                        <Label className="font-medium text-muted-foreground">
                          {t('staff.add.staffIntroduction')}
                        </Label>
                      </div>
                      <Textarea
                        value={watch('description') ?? ''}
                        rows={10}
                        {...register('description')}
                        placeholder={t('staff.add.staffIntroductionPlaceholder')}
                        className="resize-none focus:ring-2 focus:ring-border transition-all duration-200"
                      />
                      {errors.description && (
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-sm text-destructive mt-1"
                        >
                          {errors.description.message}
                        </motion.p>
                      )}
                    </div>
                  </div>
                  <Separator />
                  {/* 詳細設定セクション */}

                  <div>
                    <div className="flex items-center mb-4">
                      <Sparkles className="h-5 w-5 mr-2 text-muted-foreground" />
                      <h3 className="font-semibold text-lg">{t('staff.add.advancedSettings')}</h3>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <ZodTextField
                          name="extra_charge"
                          label={t('staff.add.nominationFee')}
                          type="number"
                          register={register}
                          errors={errors}
                          placeholder={t('staff.add.nominationFeePlaceholder')}
                          className="transition-all duration-200"
                        />
                        <p className="text-xs mt-1 text-muted-foreground">
                          {t('staff.add.nominationFeeHelp')}
                        </p>
                      </div>

                      <div>
                        <ZodTextField
                          name="priority"
                          label={t('staff.add.priority')}
                          type="number"
                          register={register}
                          errors={errors}
                          placeholder={t('staff.add.priorityPlaceholder')}
                          className="transition-all duration-200"
                        />
                        <p className="text-xs mt-1 text-muted-foreground">
                          {t('staff.add.priorityHelp')}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
          <TabsContent value="exclusion">
            <ExclusionMenu
              title={t('staff.add.exclusionMenuTitle')}
              selectedMenuIds={exclusionMenuIds}
              setSelectedMenuIdsAction={(menuIds) => {
                setExclusionMenuIds(menuIds)
                setValue('selected_menu_ids', menuIds, { shouldValidate: true })
              }}
            />
            {Object.keys(errors).length > 0 && (
              <ul className="text-destructive bg-destructive-foreground p-2 rounded-md space-y-1 text-xs mt-2 list-disc pl-5">
                {Object.values(errors).map((error, index) => (
                  <li key={index}>{error.message}</li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
        <div className="admin-toolbar justify-between border-t border-border py-5 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/dashboard/staff')}
            className="flex items-center gap-1 border-border"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('staff.add.back')}
          </Button>

          <Button type="submit" disabled={isSubmitting || isLoading || !isDirty}>
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('staff.add.adding')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t('staff.add.save')}
              </>
            )}
          </Button>
        </div>
      </form>
    </DashboardSection>
  )
}

export default withOwnerAccess(StaffAddPage)
