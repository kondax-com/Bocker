'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useParams, useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Eye, EyeOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { z } from 'zod'
import { api } from '@/convex/_generated/api'
import { fetchQuery } from 'convex/nextjs'
import { useQuery } from 'convex/react'
import { useZodForm } from '@/hooks/useZodForm'
import { Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Loading } from '@/components/common'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'
import { useAnalytics } from '@/hooks/useAnalytics'
import { CustomerRepository } from '@/services/supabase/repositories/customer/CustomerRepository'
import { ZodTextField } from '@/components/common'
import { OptimizedLineLoginButton } from '@/components/auth/OptimizedLineLoginButton'
import { performCompleteLogout } from '@/lib/auth/logout'

const emailLoginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'メールアドレスを入力してください' })
    .max(255, { message: 'メールアドレスは255文字以内で入力してください' })
    .email({ message: 'メールアドレスが不正です' }),
  password: z
    .string()
    .min(1, { message: 'パスワードを入力してください' })
    .max(32, { message: 'パスワードは32文字以内で入力してください' }),
})

export default function ReservePage() {
  const params = useParams()
  const router = useRouter()
  const { showErrorToast } = useErrorHandler()
  const { trackConversion } = useAnalytics()
  const orgId = params.id as Id<'organization'>
  const customerRepository = useMemo(() => new CustomerRepository(), [])
  const [tenantId, setTenantId] = useState<Id<'tenant'> | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const organization = useQuery(
    api.organization.config.query.findByTenantAndOrg,
    tenantId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip'
  )

  const apiConfig = useQuery(
    api.organization.api_config.query.findByTenantAndOrg,
    tenantId
      ? {
          tenant_id: tenantId,
          org_id: orgId,
        }
      : 'skip'
  )

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setValue,
  } = useZodForm(emailLoginSchema)

  // 現在のメール入力値を監視
  const watchedEmail = watch('email')

  // LINE APIが完全に設定されているかを判定
  const isLineApiConfigured = useMemo(() => {
    if (!apiConfig) return false
    return apiConfig.isLineConfigured
  }, [apiConfig])

  const setDemoLogin = useCallback(async () => {
    if (
      window.location.hostname === 'bocker-project.vercel.app' ||
      window.location.hostname === 'bocker-project.vercel.app/ja' ||
      window.location.hostname === 'bocker-project.vercel.app/en'
    ) {
      console.log('development')
      setValue('email', 'bocker.demo@gmail.com')
      setValue('password', 'Bocker_demo')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const loginButton: HTMLButtonElement | null = document.querySelector(
        'button[type="submit"]'
      ) as HTMLButtonElement | null
      if (loginButton) {
        loginButton.click()
      }
      return
    }
  }, [setValue])
  const onSubmit = useCallback(
    async (data: z.infer<typeof emailLoginSchema>) => {
      setIsFirstLogin(true)

      try {
        if (!tenantId) {
          throw new Error('テナントIDが見つかりません')
        }

        // 既存ユーザー確認
        const existingCustomer = await customerRepository.findByTenantAndOrgAndCustomerEmail(
          tenantId,
          orgId,
          data.email
        )

        if (existingCustomer) {
          // 既存ユーザーの場合
          const response = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: existingCustomer.email,
              password: data.password,
              tenantId: tenantId,
              orgId: orgId,
            }),
          })

          const result = await response.json()

          if (!response.ok) {
            toast.error(result.error || 'ログインに失敗しました')
            return
          }

          toast.success('ログインに成功しました')
          router.push(`/reservation/${orgId}/calendar`)
        } else {
          // 新規登録の処理（既存のまま）
          const registrationResponse = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orgName: organization?.org.org_name || '',
              email: data.email,
              password: data.password,
              tenantId: tenantId,
              orgId: orgId,
              detailData: {
                email: data.email || '',
                gender: 'unselected',
                birthday: null,
                age: null,
                notes: '',
              },
              initialPoints: 0,
            }),
          })

          const registrationResult = await registrationResponse.json()

          if (!registrationResponse.ok) {
            toast.error(registrationResult.error || 'アカウント作成に失敗しました')
            return
          }

          // Track signup conversion
          trackConversion('signup', { email: data.email })

          // セッション作成
          const sessionResponse = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: data.email,
              password: data.password,
              tenantId: tenantId,
              orgId: orgId,
            }),
          })

          const sessionResult = await sessionResponse.json()

          if (!sessionResponse.ok) {
            toast.error(sessionResult.error || 'アカウント作成後のログインに失敗しました')
            return
          }

          toast.success('アカウントを作成し、ログインしました')
          router.push(`/reservation/${orgId}/calendar`)
        }
      } catch (error) {
        showErrorToast(error)
      }
    },
    [tenantId, orgId, organization, customerRepository, router, showErrorToast, trackConversion]
  )

  useEffect(() => {
    console.log('window.location.hostname', window.location.hostname)
    // 組織情報を取得して、テナントIDを設定
    fetchQuery(api.organization.query.findByOrgId, {
      org_id: orgId,
    }).then((res) => {
      if (res) {
        setTenantId(res.tenant_id)
      }
    })
    // デモログイン用の自動入力（本番ドメインのみ）
    setDemoLogin()
  }, [orgId, setDemoLogin])

  // セッションがある場合は自動リダイレクト（サーバー確認ベース）
  useEffect(() => {
    if (!tenantId) return

    // サーバーAPIでセッションの妥当性を確認（テナント/組織一致もチェック）
    const url = `/api/auth/session?tenantId=${encodeURIComponent(tenantId)}&orgId=${encodeURIComponent(orgId)}`
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) {
          console.log('[session-check] Session check failed', { status: res.status })
          if (res.status === 401) {
            // 無効なセッションはクリーンアップ
            performCompleteLogout()
          }
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data && data.session) {
          // ログイン済み → カレンダーへ自動遷移
          router.push(`/reservation/${orgId}/calendar`)
        }
      })
      .catch((error) => {
        console.error('[session-check] Error:', error)
      })
  }, [tenantId, orgId, router])

  // セッション削除の無限ループを防ぐため、適切な条件でのみチェック実行
  const shouldCheckSession = tenantId && orgId

  console.log('[Page] Session check decision:', {
    shouldCheckSession,
    tenantId: !!tenantId,
    orgId: !!orgId,
  })

  if (!organization || !tenantId || apiConfig === undefined) {
    return <Loading />
  }

  return (
    <div className="w-full  mx-auto min-h-screen flex items-center justify-center">
      <motion.div
        className="flex items-center justify-center px-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md shadow-lg border-none mt-4 bg-muted overflow-hidden">
          <CardHeader className="relative w-full h-[220px] mb-2 overflow-hidden">
            <div className="absolute inset-0">
              {organization.config?.images && organization.config.images.length > 0 ? (
                <div className="w-full h-full relative">
                  <Image
                    src={organization.config.images[0].original_url}
                    alt={organization.org.org_name ?? ''}
                    width={1280}
                    height={1280}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-palette-1 to-palette-2 opacity-30"></div>
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50">
                    <h1 className="text-xl font-bold text-white">{organization.org.org_name}</h1>
                    <p className="text-sm text-white mt-1">{organization.config.address}</p>
                  </div>
                </div>
              ) : (
                <div className="flex-col w-full h-full bg-gradient-to-b from-palette-1 to-palette-2 text-palette-1-foreground flex items-center justify-center">
                  <h1 className="text-2xl font-bold text-muted-foreground">
                    {organization.org.org_name}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-2">
                    {organization.config?.address}
                  </p>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="mt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <ZodTextField
                icon={<Mail className="w-5 h-5" />}
                register={register}
                name="email"
                label="メールアドレス"
                placeholder="メールアドレスを入力してください"
                errors={errors}
              />
              <div className="flex items-start gap-2">
                <div className="w-full">
                  <ZodTextField
                    icon={<Lock className="w-5 h-5" />}
                    type={showPassword ? 'text' : 'password'}
                    register={register}
                    name="password"
                    label="パスワード"
                    placeholder="パスワードを入力してください"
                    errors={errors}
                  />
                </div>
                <Button
                  className="mt-7"
                  variant="outline"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowPassword(!showPassword)
                  }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </Button>
              </div>

              <Button
                type="submit"
                className="w-full text-base font-bold mt-6"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>ログイン中...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-4">
                    <span>ログイン / アカウント作成</span>
                    <ChevronRight className="h-5 w-5" />
                  </div>
                )}
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground px-4 mt-4">
              初めての方はアカウントが作成されます。
            </p>
            {isFirstLogin && (
              <p className="text-xs text-center text-muted-foreground mb-4 px-4 mt-4">
                パスワードを忘れましたか？
                <Link
                  href={`/customer/reset-password${watchedEmail ? `?e=${encodeURIComponent(watchedEmail)}` : ''}`}
                  className="underline text-link-foreground cursor-pointer mx-1"
                  onClick={() => {
                    if (tenantId) {
                      sessionStorage.setItem('tenantId', tenantId as string)
                    }
                    sessionStorage.setItem('orgId', orgId as string)
                  }}
                >
                  こちら
                </Link>
                から再設定できます。
              </p>
            )}
          </CardContent>

          {isLineApiConfigured && (
            <>
              <Separator className="mb-5 w-1/3 mx-auto" />
              <CardFooter className="flex justify-center pb-6">
                <div className="w-full">
                  <OptimizedLineLoginButton
                    tenantId={tenantId}
                    orgId={orgId}
                    isCustomerLogin={false}
                    onSuccess={(data) => {
                      console.log('[LINE Login Success]', data)
                      // セッション作成成功時に十分な時間を待ってからリダイレクト
                      setTimeout(() => {
                        router.push(`/reservation/${orgId}/calendar`)
                      }, 2000)
                    }}
                  />
                </div>
              </CardFooter>
            </>
          )}
          <p className="text-xs text-center text-muted-foreground mb-4 px-8">
            ログインすることで、当サービスの
            <Link
              href={`/reservation/${orgId}/calendar/terms-of-use`}
              className="underline text-link-foreground cursor-pointer mx-1"
            >
              利用規約
            </Link>
            および
            <Link
              href={`/reservation/${orgId}/calendar/privacy-policy`}
              className="underline text-link-foreground cursor-pointer mx-1"
            >
              プライバシーポリシー
            </Link>
            に同意したものとします。
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
