'use client'

import { useZodForm } from '@/hooks/useZodForm'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'
import { SingleImageDrop, Loading, TagInput } from '@/components/common'
import { useStaffRoleUpdate } from '@/hooks/useStaffRoleUpdate'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ExclusionMenu } from '@/components/common'
import { z } from 'zod'
import { Gender, Role, GENDER_VALUES, ROLE_VALUES } from '@/convex/types'
import { MAX_NOTES_LENGTH, MAX_NUM, MAX_TEXT_LENGTH, MAX_PIN_CODE_LENGTH } from '@/convex/constants'
import { Textarea } from '@/components/ui/textarea'
import { ZodTextField } from '@/components/common'
import { uploadImage } from '@/services/gcp/cloud_storage/helpers'
import Uploader from '@/components/common/Uploader'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { Id } from '@/convex/_generated/dataModel'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useParams } from 'next/navigation'
import {
  Save,
  ArrowLeft,
  Info,
  Calendar,
  Shield,
  Tag,
  Sparkles,
  User,
  Clipboard,
  Check,
  X,
  Image as ImageIcon,
  Instagram,
} from 'lucide-react'
import Image from 'next/image'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'

// Create a schema factory function to get translations
const createStaffEditSchema = (t: ReturnType<typeof useTranslations>) =>
  z.object({
    name: z
      .string()
      .min(1, { message: t('staff.validation.nameRequired') })
      .max(MAX_TEXT_LENGTH),
    instagram_link: z.preprocess(
      (val) => {
        // 空文字列の場合はnullを返す
        if (val === '' || val === null || val === undefined) return null
        return val
      },
      z
        .string()
        .url({ message: t('staff.validation.urlInvalid') })
        .nullable()
        .optional()
    ),
    pin_code: z
      .string()
      .min(MAX_PIN_CODE_LENGTH, {
        message: t('staff.validation.pinCodeLength', { length: MAX_PIN_CODE_LENGTH }),
      })
      .max(MAX_PIN_CODE_LENGTH, {
        message: t('staff.validation.pinCodeLength', { length: MAX_PIN_CODE_LENGTH }),
      })
      .optional()
      .refine(
        (val) => {
          if (val === null || val === undefined) return true
          return /^[A-Za-z0-9]+$/.test(val)
        },
        {
          message: t('staff.validation.pinCodeFormat'),
        }
      ),
    gender: z.enum(GENDER_VALUES).default('unselected'),

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
    description: z
      .string()
      .min(1, { message: t('staff.validation.descriptionRequired') })
      .max(MAX_NOTES_LENGTH),
    images: z.array(
      z.object({
        original_url: z.string(),
        thumbnail_url: z.string(),
      })
    ),
    role: z.enum(ROLE_VALUES),
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
        .max(MAX_NUM, { message: t('staff.validation.nominationFeeMax', { max: MAX_NUM }) })
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
        .optional()
    ),
    is_active: z.boolean(),
    exclusion_menu_ids: z.array(z.string()).optional(),
  })

export default function StaffEditForm() {
  const router = useRouter()
  const t = useTranslations()
  const { staff_id } = useParams()
  const { tenantId, orgId, role } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const [selectedExclusionMenuIds, setSelectedExclusionMenuIds] = useState<Id<'menu'>[]>([])
  const [exclusionInitialized, setExclusionInitialized] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeletingImage, setIsDeletingImage] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [currentTags, setCurrentTags] = useState<string[]>([])
  const [showExistingImage, setShowExistingImage] = useState(true)
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)

  const { updateStaffRole } = useStaffRoleUpdate()

  // FIXME: 一回の呼び出しで複数のテーブルを更新するようにConvexのトランザクションを活用
  const staffUpsert = useMutation(api.staff.mutation.upsert)
  const staffConfigUpsert = useMutation(api.staff.config.mutation.upsert)
  const menuExclusionStaffUpsert = useMutation(api.menu.menu_exclusion_staff.mutation.upsert)

  // FIXME: 一回の呼び出しで複数のテーブルを更新するようにConvexのトランザクションを活用
  const staffKill = useMutation(api.staff.mutation.killRelatedTables)
  const removeStaffImages = useMutation(api.staff.mutation.removeImages)

  // FIXME: 一回の呼び出しで複数のテーブルを更新するようにConvexのトランザクションを活用
  const exclusionMenus = useQuery(
    api.menu.menu_exclusion_staff.query.listBySalonAndStaffId,
    tenantId && orgId && staff_id
      ? { tenant_id: tenantId, org_id: orgId, staff_id: staff_id as Id<'staff'> }
      : 'skip'
  )
  const staffAllData = useQuery(
    api.staff.query.getRelatedTables,
    tenantId && orgId && staff_id
      ? {
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: staff_id as Id<'staff'>,
        }
      : 'skip'
  )

  const initialExclusionMenus = useMemo(() => {
    return exclusionMenus ? [...exclusionMenus].sort() : []
  }, [exclusionMenus])

  const staffEditSchema = createStaffEditSchema(t)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors, isDirty },
    watch,
  } = useZodForm(staffEditSchema)

  const onSubmit = async (data: z.infer<typeof staffEditSchema>) => {
    setIsLoading(true)
    let staffId: Id<'staff'> | null = null
    let staffConfigId: Id<'staff_config'> | null = null
    let newUploadedImages: { original_url: string; thumbnail_url: string }[] = []

    try {
      if (!tenantId || !orgId) {
        toast.error(t('staff.messages.storeNotFound'))
        return
      }

      if (selectedFile) {
        try {
          setIsLoading(true)
          const result = await uploadImage(selectedFile!, orgId, 'staff', 'square', 'medium')

          newUploadedImages = [
            {
              original_url: result.originalUrl,
              thumbnail_url: result.thumbnailUrl,
            },
          ]
          setIsLoading(false)
        } catch (error) {
          console.error('画像アップロードエラー:', error)
          showErrorToast(error)
          setIsLoading(false)
          return
        }
      }

      // スタッフの基本情報を追加
      staffId = await staffUpsert({
        connect_clerk: staffAllData?.connect_clerk ?? false,
        tenant_id: staffAllData?.tenant_id as Id<'tenant'>, // テナントID
        org_id: staffAllData?.org_id as Id<'organization'>, // 店舗ID
        staff_id: staff_id as Id<'staff'>,
        clerk_user_id: staffAllData?.clerk_user_id, // Clerk ユーザーID ( null = 未認証スタッフ, INVITE=招待中, ${clerk_user_id}=受諾済み)
        name: data.name, // スタッフ名
        description: data.description, // 自己紹介
        images:
          newUploadedImages.length > 0
            ? newUploadedImages
            : showExistingImage && staffAllData?.images
              ? staffAllData.images
              : [], // 画像（新しい画像がない場合かつ既存画像を表示する場合は既存の画像を維持）
        is_active: data.is_active, // 有効/無効
      })

      if (newUploadedImages.length > 0 && staffAllData?.images && staffAllData?.images.length > 0) {
        try {
          await fetch('/api/storage', {
            method: 'DELETE',
            body: JSON.stringify({
              originalUrl: staffAllData.images[0].original_url,
              withThumbnail: true,
            }),
          })
        } catch (deleteError) {
          console.error('画像削除中にエラーが発生しました:', deleteError)
        }
      }

      try {
        // スタッフの設定情報を追加
        staffConfigId = await staffConfigUpsert({
          staff_config_id: staffAllData?.staff_config_id as Id<'staff_config'>,
          tenant_id: staffAllData?.tenant_id as Id<'tenant'>, // テナントID
          org_id: staffAllData?.org_id as Id<'organization'>, // 店舗ID
          staff_id: staff_id as Id<'staff'>, // スタッフID
          age: data.age ?? undefined, // 年齢
          gender: data.gender, // 性別
          instagram_link: data.instagram_link ?? undefined, // インスタグラムリンク
          tags: data.tags ?? [], // タグ
          role: data.role, // ロール
          featured_hair_images: [], // フィーチャー画像
          extra_charge: data.extra_charge ?? 0, // 追加料金
          priority: data.priority ?? 0, // 優先度
        })

        // 除外メニューを更新

        await menuExclusionStaffUpsert({
          tenant_id: tenantId,
          org_id: orgId,
          staff_id: staff_id as Id<'staff'>,
          selected_menu_ids: selectedExclusionMenuIds,
        })

        if (staffAllData && data.role !== staffAllData?.role && staffAllData?.clerk_user_id) {
          await updateStaffRole(
            staff_id as Id<'staff'>,
            staffAllData?.clerk_user_id as string,
            staffConfigId,
            data.role
          )
        }

        toast.success(t('staff.messages.staffUpdated'), {
          icon: <Check className="h-4 w-4 text-success" />,
        })
        router.push('/dashboard/staff')
      } catch (configAuthError) {
        // スタッフ設定または認証の保存に失敗した場合、作成したスタッフを削除
        if (staffId && staffConfigId) {
          try {
            await staffKill({
              tenant_id: tenantId,
              org_id: orgId,
              staff_id: staff_id as Id<'staff'>,
              staff_config_id: staffConfigId,
            })
          } catch (cleanupError) {
            console.error('スタッフ削除中にエラーが発生しました:', cleanupError)
          }
        }
        throw configAuthError // 元のエラーを再スロー
      }
    } catch (error: unknown) {
      // エラー発生時のクリーンアップ
      if (newUploadedImages.length > 0) {
        try {
          await fetch('/api/storage', {
            method: 'DELETE',
            body: JSON.stringify({
              originalUrl: newUploadedImages[0].original_url,
              withThumbnail: true,
            }),
          })
        } catch (deleteError) {
          console.error('画像削除中にエラーが発生しました:', deleteError)
        }
      }

      // staffIdが存在し、configAuthErrorでないケースでスタッフを削除（重複防止）
      if (staffId && !(error instanceof Error && error.name === 'configAuthError')) {
        try {
          if (staffConfigId && tenantId && orgId) {
            await staffKill({
              tenant_id: tenantId,
              org_id: orgId,
              staff_id: staff_id as Id<'staff'>,
              staff_config_id: staffConfigId,
            })
          }
        } catch (killError) {
          console.error('スタッフ削除中にエラーが発生しました:', killError)
        }
      }
      showErrorToast(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteImage = async () => {
    setIsDeletingImage(true)
    setShowDeleteDialog(false)
    try {
      if (staffAllData?.images && staffAllData?.images.length > 0) {
        // オリジナル画像が存在する場合は削除
        if (staffAllData?.images[0].original_url) {
          await fetch('/api/storage', {
            method: 'DELETE',
            body: JSON.stringify({
              originalUrl: staffAllData.images[0].original_url,
              withThumbnail: true,
            }),
          })
        }

        await removeStaffImages({
          staff_id: staff_id as Id<'staff'>,
        })

        // 画像削除後、UIを更新
        setShowExistingImage(false)
        setExistingImageUrl(null)

        toast.success(t('staff.edit.imageDeleteSuccess'), {
          icon: <Check className="h-4 w-4 text-accent-2" />,
        })
      }
    } catch (error) {
      console.error('画像削除中にエラーが発生しました:', error)
      toast.error(t('staff.edit.imageDeleteError'), {
        icon: <X className="h-4 w-4 text-destructive-foreground" />,
      })
    } finally {
      setIsDeletingImage(false)
    }
  }

  useEffect(() => {
    if (!exclusionInitialized && exclusionMenus) {
      setSelectedExclusionMenuIds(initialExclusionMenus.map((menu) => menu.menu_id))
      setExclusionInitialized(true)
    }
  }, [exclusionMenus, initialExclusionMenus, exclusionInitialized])

  useEffect(() => {
    if (!staffAllData) return

    const initializeForm = async () => {
      try {
        // フォームの初期値をリセット
        reset(
          {
            name: staffAllData.name,
            instagram_link: staffAllData.instagram_link ?? undefined,
            gender: staffAllData.gender ?? 'unselected',
            age: staffAllData.age ?? undefined,
            description: staffAllData.description ?? '',
            images: staffAllData.images ?? [],
            is_active: staffAllData.is_active,
            role: staffAllData.role,
            extra_charge: staffAllData.extra_charge ?? undefined,
            priority: staffAllData.priority ?? undefined,
            tags: staffAllData.tags ?? [],
          },
          {
            keepDirtyValues: false,
            keepDefaultValues: false,
          }
        )
        // 既存タグをローカル state に同期
        setCurrentTags(staffAllData.tags || [])
        // 既存画像URLを設定
        if (staffAllData.images && staffAllData.images.length > 0) {
          setExistingImageUrl(
            staffAllData.images[0].original_url || staffAllData.images[0].thumbnail_url
          )
          setShowExistingImage(true)
        } else {
          setShowExistingImage(false)
        }
      } catch (error) {
        console.error('フォーム初期化中にエラーが発生しました:', error)
        toast.error(t('staff.messages.formInitializationError'), {
          icon: <X className="h-4 w-4 text-destructive" />,
        })
      }
    }

    initializeForm()
  }, [reset, staffAllData, watch, t])

  const exclusionChanged = useMemo(() => {
    if (exclusionMenus === undefined) return false // データ未ロード時は false
    const currentSorted = [...selectedExclusionMenuIds].sort()
    // initialExclusionMenuIds は既にソート済み
    return JSON.stringify(currentSorted) !== JSON.stringify(initialExclusionMenus)
  }, [selectedExclusionMenuIds, initialExclusionMenus, exclusionMenus])

  if (!staffAllData) {
    return <Loading />
  }

  if (isLoading) {
    return <Uploader />
  }

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="admin-form">
        <Tabs defaultValue="basic">
          <TabsList className="mb-4 h-auto max-w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="basic">{t('staff.add.tabBasicInfo')}</TabsTrigger>
            <TabsTrigger value="exclusion">{t('staff.add.tabExclusionMenu')}</TabsTrigger>
          </TabsList>
          <TabsContent value="basic">
            <Card className="admin-panel">
              <CardContent className="space-y-8 px-4 pt-5 sm:px-6 sm:pt-6">
                {/* 基本情報セクション */}
                <div>
                  <div className="flex flex-col md:flex-row gap-6 pb-4 w-full overflow-hidden">
                    <div className="w-full md:w-2/5 flex-shrink-0">
                      <div className="mb-2 flex items-center">
                        <ImageIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">
                          {t('staff.add.staffImage')}
                        </span>
                      </div>

                      <div className="w-full max-w-full">
                        {showExistingImage && existingImageUrl ? (
                          <div className="relative">
                            <Image
                              src={existingImageUrl}
                              alt="Staff image"
                              width={300}
                              height={300}
                              className="w-full h-auto object-cover rounded-lg aspect-square"
                            />
                            <div className="flex gap-2 mt-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowExistingImage(false)
                                  setSelectedFile(null)
                                }}
                                className="flex-1"
                              >
                                {t('common.imageDrop.changeImage')}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => setShowDeleteDialog(true)}
                                className="flex-1"
                              >
                                {t('common.imageDrop.deleteImage')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <SingleImageDrop
                              onFileSelect={(file) => {
                                setSelectedFile(file ?? null)
                                if (file) {
                                  setShowExistingImage(false)
                                }
                              }}
                              aspectType="square"
                              className="transition-all duration-200 hover:opacity-90"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setShowExistingImage(true)
                                setSelectedFile(null)
                              }}
                              className="flex-1 mt-2"
                            >
                              {t('common.back')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4 w-full md:w-3/5 min-w-0">
                      <div>
                        <ZodTextField
                          name="name"
                          label={t('staff.list.name')}
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
                            defaultValue={staffAllData?.gender ?? 'unselected'}
                            onValueChange={(value) =>
                              setValue('gender', value as Gender, {
                                shouldDirty: true,
                                shouldValidate: true,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('staff.add.genderPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {GENDER_VALUES.map((gender) => (
                                <SelectItem key={gender} value={gender}>
                                  {t(`staff.add.${gender}`)}
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
                          onCheckedChange={(checked) =>
                            setValue('is_active', checked, {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        />
                        <Label htmlFor="is_active" className="text-xs cursor-pointer">
                          {watch('is_active') ? (
                            <span className="text-accent-2 font-medium">{t('common.enabled')}</span>
                          ) : (
                            <span className="text-destructive font-medium">
                              {t('common.disabled')}
                            </span>
                          )}
                        </Label>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t('staff.add.reservationAvailable')}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
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
                      <Label className="font-medium text-primary">
                        {t('staff.add.staffIntroduction')}
                      </Label>
                    </div>
                    <Textarea
                      value={watch('description')}
                      rows={12}
                      {...register('description')}
                      placeholder={t('staff.add.staffIntroductionPlaceholder')}
                      className="transition-all duration-200"
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

                {/* 認証情報セクション */}
                {staffAllData.connect_clerk && role === 'admin' && (
                  <>
                    <div>
                      <div className="flex items-center mb-4">
                        <Shield className="h-5 w-5 mr-2 text-muted-foreground" />
                        <h3 className="font-semibold text-lg">
                          {t('staff.add.invitePermissionSettings')}
                        </h3>
                      </div>

                      <Alert className="bg-warning border border-warning-foreground rounded-md mb-4">
                        <AlertDescription className="text-warning-foreground text-sm">
                          {t('staff.edit.permissionNotice')}
                        </AlertDescription>
                      </Alert>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <div className="flex items-center mb-2">
                            <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
                            <Label className="font-medium text-primary">
                              {t('staff.edit.permission')}
                            </Label>
                          </div>
                          <div className="mt-1">
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
                                <div
                                  key={item.role}
                                  className={`border rounded-md p-3 cursor-pointer transition-all ${
                                    watch('role') === item.role
                                      ? 'border-accent-2 bg-accent-2-foreground text-accent-2'
                                      : 'border-border bg-muted text-muted-foreground'
                                  }`}
                                  onClick={() =>
                                    setValue('role', item.role as Role, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                >
                                  <div className="font-medium text-sm mb-1">{item.label}</div>
                                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <Separator className="my-8 md:my-12 w-full" />
                  </>
                )}

                {role === 'admin' && (
                  <>
                    {/* 詳細設定セクション */}
                    <div>
                      <div className="flex items-center mb-4">
                        <Sparkles className="h-5 w-5 mr-2 text-primary" />
                        <h3 className="font-semibold text-lg">{t('staff.add.advancedSettings')}</h3>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <div className="flex items-center mb-2">
                            <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                            <Label className="font-medium text-muted-foreground">
                              {t('staff.add.nominationFee')}
                            </Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs w-56">{t('staff.add.nominationFeeHelp')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <ZodTextField
                            name="extra_charge"
                            label={t('staff.add.nominationFee')}
                            type="number"
                            register={register}
                            errors={errors}
                            placeholder={t('staff.add.nominationFeePlaceholder')}
                            className="transition-all duration-200"
                          />
                        </div>
                        <div>
                          <div className="flex items-center mb-2">
                            <Sparkles className="h-4 w-4 mr-2 text-muted-foreground" />
                            <Label className="font-medium text-muted-foreground">
                              {t('staff.add.priority')}
                            </Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 ml-1 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs w-56">{t('staff.add.priorityHelp')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <ZodTextField
                            name="priority"
                            label={t('staff.add.priority')}
                            type="number"
                            register={register}
                            errors={errors}
                            placeholder={t('staff.add.priorityPlaceholder')}
                            className="transition-all duration-200"
                          />
                          <p
                            className="text-xs text-muted-foreground mt-1"
                            dangerouslySetInnerHTML={{
                              __html: t('staff.edit.priorityHelp').replace(/\n/g, '<br />'),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="exclusion">
            <ExclusionMenu
              title={t('staff.add.exclusionMenuTitle')}
              selectedMenuIds={selectedExclusionMenuIds}
              setSelectedMenuIdsAction={setSelectedExclusionMenuIds}
            />
            {Object.keys(errors).length > 0 && (
              <ul className="text-destructive-foreground bg-destructive p-2 rounded-md space-y-1 text-xs mt-2 list-disc pl-5">
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
            className="flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>

          <Button
            type="submit"
            disabled={Boolean(
              isSubmitting ||
                isLoading ||
                (!isDirty &&
                  !exclusionChanged &&
                  !selectedFile &&
                  (!showExistingImage || (showExistingImage && existingImageUrl)))
            )}
          >
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('staff.edit.updating')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {t('staff.edit.updateStaff')}
              </>
            )}
          </Button>
        </div>
      </form>
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('staff.edit.deleteImageTitle')}</DialogTitle>
            <DialogDescription>{t('staff.edit.deleteImageDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('staff.edit.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteImage}>
              {isDeletingImage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('staff.edit.deleting')}
                </>
              ) : (
                t('staff.edit.delete')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div>
        {Object.keys(errors).length > 0 && (
          <ul className="text-destructive bg-destructive-foreground p-2 rounded-md space-y-1 text-xs mt-2 list-disc pl-5">
            {Object.values(errors).map((error, index) => (
              <li key={index}>{error.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
