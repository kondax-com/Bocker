'use client'

import { Link } from '@/i18n/navigation'
import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loading, ZodTextField } from '@/components/common'
import { Key, Save, EyeOff, Eye, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Button } from '@/components/ui/button'

import { z } from 'zod'
import { useZodForm } from '@/hooks/useZodForm'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import { useQuery, useMutation } from 'convex/react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'

// 共通リンクスタイル
const externalLinkCls = 'text-primary underline hover:text-primary'
// APIの設定フォーム用のスキーマ
const organizationApiConfigFormSchema = z.object({
  line_access_token: z.string().optional(),
  line_channel_secret: z.string().optional(),
  liff_id: z.string().optional(),
  line_channel_id: z
    .string()
    .optional()
    .refine((val) => !val || /^\d+$/.test(val), 'LINE Channel IDは数字のみで入力してください'),
  destination_id: z.string().optional(),
  org_line_id: z.string().optional(),
})

// スキーマから型を生成
type OrganizationApiConfigFormValues = z.infer<typeof organizationApiConfigFormSchema>

const ApiSettingsCard = () => {
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()
  const locale = useLocale()
  const { showErrorToast } = useErrorHandler()
  const t = useTranslations('settings.apiConfig')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [showFields, setShowFields] = useState<{ [key: string]: boolean }>({
    lineAccessToken: false,
    lineChannelSecret: false,
    liffId: false,
    destinationId: false,
    lineChannelId: false,
    orgLineId: false,
  })

  // すべてのフックをここでトップレベルで宣言
  const organizationApiConfig = useQuery(
    api.organization.api_config.query.getForManagement,
    tenantId && orgId ? { tenant_id: tenantId, org_id: orgId } : 'skip'
  )
  const upsertOrganizationApiConfig = useMutation(api.organization.api_config.mutation.upsert)

  // フォーム管理（useZodFormを使用）
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useZodForm(organizationApiConfigFormSchema)

  // フォームの初期値が変更されたらリセット
  useEffect(() => {
    reset(
      organizationApiConfig ?? {
        line_access_token: '',
        line_channel_secret: '',
        liff_id: '',
        line_channel_id: '',
        destination_id: '',
        org_line_id: '',
      }
    )
  }, [tenantId, orgId, organizationApiConfig, reset])

  // APIの設定を保存する関数
  const onApiSubmit = useCallback(
    async (data: OrganizationApiConfigFormValues) => {
      if (!orgId) return

      try {
        setSubmitting(true)

        await upsertOrganizationApiConfig({
          tenant_id: tenantId!,
          org_id: orgId,
          ...data,
        })

        toast.success(t('messages.settingsSaved'))
      } catch (error) {
        showErrorToast(error)
      } finally {
        setSubmitting(false)
      }
    },
    [upsertOrganizationApiConfig, orgId, tenantId, showErrorToast, t]
  )

  const handleShowFields = (
    e: React.MouseEvent<HTMLButtonElement>,
    field: keyof OrganizationApiConfigFormValues
  ) => {
    e.preventDefault()
    setShowFields({ ...showFields, [field]: !showFields[field] })
  }

  if (organizationApiConfig === undefined) {
    return <Loading />
  }
  if (!isLoaded) {
    return <Loading />
  }

  return (
    <div className="">
      <div className="">
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold">{t('title')}</p>
        </div>
        <div className="flex flex-col gap-2 mt-1 text-sm text-muted-foreground">
          <p>{t('description')}</p>
          <p>{t('lineIntegrationNote')}</p>
        </div>
      </div>

      {/* 有料サポート案内アコーディオン */}
      <Accordion type="multiple" className="mt-6">
        <AccordionItem value="paid-support">
          <AccordionTrigger className=" mb-2">
            💡 設定でお困りの方へ - 専門サポートサービス（5,000円）
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div>
              <div className="flex items-start space-x-4">
                <div className="flex-1">
                  <div className="bg-primary border border-primary/20 rounded-md p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl font-bold text-primary-foreground">
                        5,000円<small>（税込）</small>
                      </span>
                      <span className="text-sm text-muted">でトータルサポート</span>
                    </div>
                    <p className="text-sm text-primary-foreground font-medium">
                      LINE公式アカウント作成からBockerとの完全API連携まで、すべてお任せください
                    </p>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-lg flex-shrink-0">⏰</span>
                      <div>
                        <p className="font-semibold text-foreground">
                          迅速対応：2〜3日以内に設定完了
                        </p>
                        <p className="text-muted-foreground text-xs">
                          お急ぎの場合もご相談ください
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="text-primary text-lg flex-shrink-0">🎯</span>
                      <div>
                        <p className="font-semibold text-foreground">完全サポート内容</p>
                        <ul className="text-xs text-muted-foreground mt-1 space-y-1 ml-2">
                          <li>
                            • LINE公式アカウントがない場合：新規作成からアカウント情報のお渡しまで
                          </li>
                          <li>• LINE公式アカウントをお持ちの場合：BockerとのAPI連携設定</li>
                          <li>• Messaging APIチャンネル・LINEログインチャンネルの作成</li>
                          <li>• LIFF設定・Webhook設定・セキュリティ設定の完全構築</li>
                          <li>• 動作確認・テスト送信まで完了</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="text-destructive text-lg flex-shrink-0">🔒</span>
                      <div>
                        <p className="font-semibold text-foreground">セキュリティについて</p>
                        <p className="text-xs text-muted-foreground">
                          既存の公式アカウントをお持ちの場合は、一時的にログイン情報をお預かりいたします。
                          <br />
                          <span className="text-destructive font-semibold">
                            作業完了後は必ずパスワードの変更をお願いいたします。
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-background border border-accent-2/20 rounded-md">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary text-lg">💬</span>
                      <p className="font-semibold text-primary">お申し込み・ご相談方法</p>
                    </div>
                    <p className="text-xs text-primary leading-relaxed">
                      設定が難しいと感じたら、まずはお気軽にご相談ください。
                      <br />
                      <span className="font-bold text-primary">画面右下のチャットマーク（💬）</span>
                      をクリックして、「LINE設定サポート希望」とお声がけください。
                      <br />
                      弊社スタッフが対応させて頂きます。
                    </p>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                    <span className="text-primary font-semibold">💡 こんな方におすすめ：</span>
                    技術的な設定に不安がある方 / 時間をかけたくない方 / 確実に動作する状態にしたい方
                    / LINE公式アカウントを初めて作る方
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <form
        onSubmit={handleSubmit(onApiSubmit)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault()
          }
        }}
        autoComplete="off"
        className="space-y-6"
      >
        <div className="space-y-4">
          <div className="p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div className="flex items-center w-full relative">
                <ZodTextField
                  label={t('fields.lineAccessToken')}
                  icon={<Key className="h-4 w-4 text-primary" />}
                  errors={errors}
                  register={register}
                  name="line_access_token"
                  className="w-full pr-10"
                  type={showFields.line_access_token ? 'text' : 'password'}
                />
                <Button
                  className="absolute right-0 bottom-0"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleShowFields(e, 'line_access_token')}
                >
                  {showFields.line_access_token ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center w-full relative">
                <ZodTextField
                  label={t('fields.lineChannelSecret')}
                  icon={<Key className="h-4 w-4 text-primary" />}
                  errors={errors}
                  register={register}
                  name="line_channel_secret"
                  className="w-full pr-10"
                  type={showFields.line_channel_secret ? 'text' : 'password'}
                />
                <Button
                  className="absolute right-0 bottom-0"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleShowFields(e, 'line_channel_secret')}
                >
                  {showFields.line_channel_secret ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center w-full relative">
                <ZodTextField
                  label="LIFF ID(LINEログインチャンネル)"
                  icon={<Key className="h-4 w-4 text-primary" />}
                  errors={errors}
                  register={register}
                  name="liff_id"
                  type={showFields.liff_id ? 'text' : 'password'}
                  className="w-full pr-10"
                  placeholder="例: 1234567890-AbcdEfgh"
                />
                <Button
                  className="absolute right-0 bottom-0"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleShowFields(e, 'liff_id')}
                >
                  {showFields.liff_id ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center w-full relative">
                <ZodTextField
                  label={t('fields.lineChannelId')}
                  icon={<Key className="h-4 w-4 text-primary" />}
                  errors={errors}
                  register={register}
                  name="line_channel_id"
                  type={showFields.line_channel_id ? 'text' : 'password'}
                  className="w-full pr-10"
                  placeholder="例: 1234567890 (数字のみ)"
                />
                <Button
                  className="absolute right-0 bottom-0"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleShowFields(e, 'line_channel_id')}
                >
                  {showFields.line_channel_id ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex items-center w-full relative">
                <ZodTextField
                  label="LineユーザーID(予約受付の通知用)"
                  icon={<Key className="h-4 w-4 text-primary" />}
                  errors={errors}
                  register={register}
                  name="org_line_id"
                  type={showFields.org_line_id ? 'text' : 'password'}
                  className="w-full pr-10"
                  placeholder="例: Uabcdef1234567890abcdef1234567890"
                />
                <Button
                  className="absolute right-0 bottom-0"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleShowFields(e, 'org_line_id')}
                >
                  {showFields.org_line_id ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="hidden">
                <div className="flex items-center w-full relative">
                  <ZodTextField
                    label="LINE Destination ID"
                    icon={<Key className="h-4 w-4 text-primary" />}
                    errors={errors}
                    register={register}
                    name="destination_id"
                    className="w-full pr-10"
                  />
                  <Button
                    className="absolute right-0 bottom-0"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleShowFields(e, 'destination_id')}
                  >
                    {showFields.destination_id ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="hidden">
                <div className="flex items-center w-full relative">
                  <ZodTextField
                    label="LINE Destination ID"
                    icon={<Key className="h-4 w-4 text-primary" />}
                    errors={errors}
                    register={register}
                    name="destination_id"
                    className="w-full pr-10"
                  />
                  <Button
                    className="absolute right-0 bottom-0"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleShowFields(e, 'destination_id')}
                  >
                    {showFields.destination_id ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-0 pt-4 pb-0 flex justify-end gap-4">
          <motion.div
            whileHover={{ scale: isDirty ? 1.03 : 1 }}
            whileTap={{ scale: isDirty ? 0.97 : 1 }}
          >
            <Button type="submit" disabled={submitting || !isDirty} className="min-w-[140px]">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('messages.saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('messages.save')}
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </form>
      <div className="flex flex-col relative mt-8">
        <h4 className="text-base font-bold">Bocker / 予約通知</h4>
        <p className="text-sm text-muted-foreground">
          予約通知の受け取りには以下の公式アカウントを追加してください。
        </p>
        <Image
          src="/assets/images/line_add.png"
          alt="LINEログインガイド"
          width={250}
          height={250}
        />
      </div>

      <Accordion type="multiple" className="mt-8 space-y-2">
        {/* チャンネル開設ガイド */}
        <AccordionItem value="channel-setup-guide">
          <AccordionTrigger className="text-primary-foreground bg-primary p-3 border border-primary rounded-md text-base font-bold mb-2">
            🚀 LINE チャンネル開設ガイド（初回設定）
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="bg-secondary border border-secondary p-4 rounded-md">
              <p className="font-semibold text-secondary-foreground text-base mb-2">
                📋 LINE統合に必要な2つのチャンネル
              </p>
              <p className="text-sm text-primary mb-4">
                Bockerでは以下の2つのチャンネルが必要です。順序を守って作成してください。
              </p>

              <div className="space-y-3">
                <div className="bg-card border border-secondary p-3 rounded-md">
                  <p className="font-semibold text-secondary-foreground text-sm mb-1">
                    1️⃣ Messaging APIチャンネル（メッセージ送信用）
                  </p>
                  <p className="text-xs text-primary">
                    • 用途：予約確認メッセージ、リマインダー等の送信
                  </p>
                  <p className="text-xs text-primary">• 必要な設定：アクセストークン</p>
                </div>
                <div className="bg-card border border-border p-3 rounded-md">
                  <p className="font-semibold text-primary text-sm mb-1">
                    2️⃣ LINEログインチャンネル（ログイン用）
                  </p>
                  <p className="text-xs text-primary">
                    • 用途：顧客のLINEログイン、LIFF（LINE内ブラウザ）
                  </p>
                  <p className="text-xs text-primary">
                    • 必要な設定：チャンネルID、チャンネルシークレット、LIFF ID
                  </p>
                </div>
              </div>
            </div>

            {/* Messaging APIチャンネル開設 */}
            <div className="space-y-3">
              <h4 className="font-semibold text-base text-secondary-foreground">
                🔵 Step 1: Messaging APIチャンネルの開設
              </h4>

              {/* 2025年版の重要な変更点 */}
              <div className="bg-warning border border-warning p-3 rounded-md">
                <p className="font-semibold text-warning-foreground text-sm mb-2">
                  ⚠️ 2024年9月以降の重要な変更
                </p>
                <p className="text-xs text-warning-foreground">
                  Messaging
                  APIチャンネルを作成する前に、必ずLINE公式アカウントマネージャーで公式アカウントを作成する必要があります。
                </p>
              </div>

              <div className="bg-accent border border-accent p-4 rounded-md">
                <p className="font-semibold text-base mb-3">📱 手順A: LINE公式アカウントの作成</p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>
                    <Link
                      href="https://manager.line.biz/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkCls}
                    >
                      LINE公式アカウントマネージャー
                    </Link>
                    にアクセス
                  </li>
                  <li>
                    LINEアカウントでログイン
                    <br />
                    <span className="text-xs text-primary font-bold">
                      ※ 必ずサロン運営者本人のアカウントを使用
                    </span>
                  </li>
                  <li>「アカウントを作成」をクリック</li>
                  <li>
                    以下の情報を入力：
                    <div className="ml-4 mt-1 text-xs space-y-1">
                      <div>
                        • <strong>アカウント名</strong>：サロン名（例：「美容室 Bocker」）
                      </div>
                      <div>
                        • <strong>業種</strong>：「美容・健康」→「美容院・理容院」
                      </div>
                      <div>
                        • <strong>サブ業種</strong>：該当するものを選択
                      </div>
                      <div>
                        • <strong>会社・事業者名</strong>：正式な店舗名
                      </div>
                    </div>
                  </li>
                  <li>利用規約に同意して「アカウントを作成」</li>
                  <li>
                    作成完了後、アカウント設定で<strong>「Messaging APIを利用する」</strong>を有効化
                  </li>
                </ol>
              </div>

              <div className="bg-accent border border-accent p-4 rounded-md">
                <p className="font-semibold text-base mb-3">
                  ⚙️ 手順B: Messaging APIチャンネルの作成
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>
                    <Link
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkCls}
                    >
                      LINE Developers コンソール
                    </Link>
                    にアクセス
                    <br />
                    <span className="text-xs text-pop">
                      ⚠️ 公式アカウント作成時と同じLINEアカウントでログイン
                    </span>
                  </li>
                  <li>
                    「プロバイダーを作成」または既存プロバイダーを選択
                    <br />
                    <span className="text-xs text-muted-foreground">
                      プロバイダー名例：「サロン名」「会社名」
                    </span>
                  </li>
                  <li>「チャンネルを作成」→「Messaging API」を選択</li>
                  <li>
                    以下の情報を入力：
                    <div className="ml-4 mt-1 text-xs space-y-1">
                      <div>
                        • <strong>チャンネル名</strong>：「サロン名 Bot」（例：「美容室Bocker
                        Bot」）
                      </div>
                      <div>
                        • <strong>チャンネル説明</strong>：「予約管理・顧客連絡用」
                      </div>
                      <div>
                        • <strong>大業種</strong>：「個人」または「法人・団体」
                      </div>
                      <div>
                        • <strong>小業種</strong>：「美容・健康」
                      </div>
                      <div>
                        • <strong>メールアドレス</strong>：連絡可能なメールアドレス
                      </div>
                    </div>
                  </li>
                  <li>利用規約に同意して「作成」</li>
                  <li>
                    作成完了後、チャンネルページで以下を確認：
                    <div className="ml-4 mt-1 text-xs space-y-1">
                      <div>• 「Messaging API」タブ：チャンネルアクセストークン</div>
                    </div>
                  </li>
                </ol>
              </div>

              {/* トラブルシューティング */}
              <div className="bg-destructive-foreground border border-destructive-foreground p-3 rounded-md">
                <p className="font-semibold text-destructive text-sm mb-2">
                  🚨 よくある問題と解決法
                </p>
                <ul className="text-xs text-destructive space-y-1">
                  <li>
                    • 「チャンネルが見つからない」→
                    公式アカウントマネージャーと同じLINEアカウントでログインしているか確認
                  </li>
                  <li>
                    • 「Messaging APIが有効化できない」→
                    公式アカウントで業種・事業者情報が正しく入力されているか確認
                  </li>
                  <li>
                    • 「プロバイダーが作成できない」→ LINEアカウントの本人確認が完了しているか確認
                  </li>
                </ul>
              </div>
            </div>

            {/* LINEログインチャンネル開設 */}
            <div className="space-y-3">
              <h4 className="font-semibold text-base text-primary">
                🟢 Step 2: LINEログインチャンネルの開設
              </h4>

              <div className="bg-accent border border-accent p-4 rounded-md">
                <p className="font-semibold text-base mb-3">
                  🔐 手順A: LINEログインチャンネルの作成
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>
                    <Link
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={externalLinkCls}
                    >
                      LINE Developers コンソール
                    </Link>
                    で同じプロバイダーを選択
                    <br />
                    <span className="text-xs text-primary">
                      💡 Messaging APIと同じプロバイダー内に作成することを推奨
                    </span>
                  </li>
                  <li>「チャンネルを作成」→「LINEログイン」を選択</li>
                  <li>
                    以下の情報を入力：
                    <div className="ml-4 mt-1 text-xs space-y-1">
                      <div>
                        • <strong>チャンネル名</strong>：「サロン名 Login」（例：「美容室Bocker
                        Login」）
                      </div>
                      <div>
                        • <strong>チャンネル説明</strong>：「顧客ログイン・予約システム用」
                      </div>
                      <div>
                        • <strong>アプリタイプ</strong>：「ウェブアプリ」を選択
                      </div>
                      <div>
                        • <strong>メールアドレス</strong>：連絡可能なメールアドレス
                      </div>
                    </div>
                  </li>
                  <li>利用規約に同意して「作成」</li>
                  <li>
                    作成完了後、「基本設定」タブでチャンネルIDとチャンネルシークレットを確認
                    <br />
                    <span className="text-xs text-muted-foreground">
                      （チャンネルIDは数字のみの10桁程度のIDです）
                    </span>
                  </li>
                </ol>
              </div>

              <div className="bg-accent border border-accent p-4 rounded-md">
                <p className="font-semibold text-base mb-3">📱 手順B: LIFFアプリの作成</p>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>作成したLINEログインチャンネルの「LIFF」タブを選択</li>
                  <li>「追加」ボタンをクリック</li>
                  <li>
                    以下の設定を入力：
                    <div className="ml-4 mt-1 text-sm space-y-1">
                      <div>
                        • <strong>LIFFアプリ名</strong>：「サロン名予約システム」
                      </div>
                      <div>
                        • <strong>サイズ</strong>：「Full」を選択（推奨）
                      </div>
                      <div>
                        • <strong>エンドポイントURL</strong>：
                        <span className="text-primary underline">
                          {window.location.origin}/{locale}/reservation
                        </span>
                      </div>
                      <div>
                        • <strong>スコープ</strong>：「profile」「openid」をチェック
                      </div>
                      <div>
                        • <strong>友だち追加オプション</strong>：「On (Aggressive)」を選択
                      </div>
                    </div>
                  </li>
                  <li>「追加」をクリックして作成完了</li>
                  <li>
                    発行されたLIFF IDの例
                    <br />
                    <span className="text-xs text-primary">形式：1234567890-AbcdEfgh</span>
                  </li>
                </ol>
              </div>

              {/* セキュリティ設定 */}
              <div className="bg-muted border border-muted p-3 rounded-md">
                <p className="font-semibold text-muted-foreground text-base mb-2">
                  🔒 セキュリティ設定（重要）
                </p>
                <ol className="list-decimal list-inside text-sm space-y-1">
                  <li>LINEログインチャンネルの「LINEログイン設定」タブを開く</li>
                  <li>
                    「コールバックURL」に以下を追加：
                    <div className="ml-4 mt-1 space-y-1 font-mono text-xs">
                      <Link
                        href="https://bocker.jp/ja/reservation/auth/callback"
                        className="text-primary underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        https://bocker.jp/ja/reservation/auth/callback
                      </Link>
                    </div>
                  </li>
                  <li>「リンクされたボット」でMessaging APIチャンネルを選択</li>
                  <li>設定を保存</li>
                </ol>
              </div>

              {/* LINEログインの有効化・公式アカウントの紐付け設定 */}
              <div className="bg-muted border border-muted p-3 rounded-md">
                <p className="font-semibold text-muted-foreground text-base mb-2">
                  🚀 LINEログインの有効化・公式アカウントの紐付け設定
                </p>
                <ol className="list-decimal list-inside text-sm space-y-1">
                  <li>LINEログインチャンネルの「LINEログイン設定」タブを開く</li>
                  <li>LINEログインを開く</li>
                  <li>開発中のクリックをして公開を選択</li>
                  <li>LINEログインの有効化が完了</li>
                  <li>基本設定の下部のリンクされた公式アカウントを編集で、公式アカウントを選択</li>
                  <li>保存をクリック</li>
                  <li>公式アカウントの紐付けが完了</li>
                </ol>
              </div>
            </div>

            {/* 設定完了チェックリスト */}
            <div className="bg-card border border-border p-4 rounded-md">
              <p className="font-semibold text-card-foreground text-base mb-3">
                ✅ 設定完了チェックリスト
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>LINE公式アカウントマネージャーで公式アカウント作成済み</span>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>Messaging APIチャンネル作成済み</span>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>LINEログインチャンネル作成済み</span>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>LIFFアプリ作成済み</span>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>コールバックURL設定済み</span>
                </div>
                <div className="flex items-start space-x-2">
                  <input type="checkbox" className="mt-1" disabled />
                  <span>チャンネル間のリンク設定済み</span>
                </div>
                <div></div>
              </div>
            </div>

            {/* 次のステップ */}
            <div className="bg-background border border-secondary p-3 rounded-md">
              <p className="font-semibold text-secondary-foreground text-sm mb-2">
                🎯 次のステップ
              </p>
              <p className="text-sm text-primary">
                チャンネル作成が完了したら、下記の各アコーディオンを開いて、
                作成したチャンネルから必要な値（アクセストークン、シークレット、チャンネルID、LIFF
                ID）を取得し、 このフォームに設定してください。
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* LINE Access Token */}
        <AccordionItem value="line-access-token">
          <AccordionTrigger>LINE アクセストークンの取得方法（Messaging API専用）</AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            {/* 重要な注意 */}
            <div className="bg-background border border-border p-3 rounded-md mb-4">
              <p className="font-semibold text-palette-2-foreground text-sm mb-1">📌 重要</p>
              <p className="text-xs text-primary">
                このトークンは<strong>Messaging APIチャンネル</strong>
                から取得します。LINEログインチャンネルからは取得できません。
              </p>
            </div>


            {/* 前提条件 */}
            <div className="bg-warning border border-warning p-3 rounded-md">
              <p className="font-semibold text-warning-foreground text-sm mb-2">🔔 前提条件</p>
              <ol className="text-xs space-y-1">
                <li>1. LINE公式アカウントマネージャーで公式アカウントを作成済み</li>
                <li>2. 作成した公式アカウントでMessaging APIを有効化済み</li>
                <li>3. LINE Developers ConsoleでMessaging APIチャンネルが作成済み</li>
              </ol>
            </div>

            {/* 取得手順 */}
            <p className="font-semibold">取得手順</p>
            <ol className="list-decimal list-inside space-y-1 bg-background p-4 rounded-md">
              <li>
                <Link
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkCls}
                >
                  LINE Developers コンソール
                </Link>
                にログインします。
              </li>
              <li>
                対象のプロバイダーを選択し、<strong>Messaging API チャンネル</strong>
                をクリックします。
                <br />
                <span className="text-pop text-xs">⚠️ LINEログインチャンネルではありません</span>
              </li>
              <li>
                画面上部のタブから <strong>Messaging API</strong> タブを選択します。
              </li>
              <li>
                ページをスクロールして<strong>「チャンネルアクセストークン」</strong>
                セクションを探します。
              </li>
              <li>
                初回は<strong>「発行」</strong>ボタンをクリックしてトークンを生成します。
                <br />
                <span className="text-muted-foreground text-xs">
                  既に発行済みの場合は表示されているトークンを使用
                </span>
              </li>
              <li>
                発行されたトークンをコピーし、このフォームの「LINE&nbsp;アクセストークン」欄へ貼り付けます。
              </li>
            </ol>

            {/* トラブルシューティング */}
            <div className="bg-destructive-foreground border border-destructive-foreground p-3 rounded-md">
              <p className="font-semibold text-destructive text-sm mb-2">❌ よくあるエラー</p>
              <ul className="text-xs text-destructive space-y-1">
                <li>
                  • 「チャンネルが見つからない」→ 公式アカウントとDevelopers
                  Consoleで同じアカウントを使用しているか確認
                </li>
                <li>• 「トークンが発行できない」→ Messaging APIが有効化されているか確認</li>
                <li>• 「メッセージが送信できない」→ Webhook URLが正しく設定されているか確認</li>
              </ul>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* LINE Channel Secret */}
        <AccordionItem value="line-channel-secret">
          <AccordionTrigger>
            LINE チャンネルシークレットの取得方法（LINEログインチャンネル専用）
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            {/* 重要な注意 */}
            <div className="bg-background border border-border p-3 rounded-md mb-4">
              <p className="font-semibold text-palette-2-foreground text-sm mb-1">📌 重要</p>
              <p className="text-xs text-primary">
                このシークレットは<strong>LINEログインチャンネル</strong>
                から取得します。Messaging APIチャンネルとは別物です。
              </p>
              <p className="text-xs text-pop mt-1">
                ⚠️ 認証の検証に使用されるため、セキュリティ上非常に重要な値です
              </p>
            </div>


            {/* 取得手順 */}
            <p className="font-semibold">取得手順</p>
            <ol className="list-decimal list-inside space-y-1 bg-background p-4 rounded-md">
              <li>
                <Link
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkCls}
                >
                  LINE Developers コンソール
                </Link>
                にログインし、<strong>LINEログインチャンネル</strong>を開きます。
                <br />
                <span className="text-pop text-xs">⚠️ Messaging APIチャンネルではありません</span>
              </li>
              <li>
                画面上部のタブメニューから<strong>基本設定</strong>タブを選択します。
              </li>
              <li>
                ページを下にスクロールして<strong>「チャンネルシークレット」</strong>
                の項目を探します。
              </li>
              <li>
                セキュリティのため初期状態では非表示になっています。
                <strong>「クリックして表示」</strong>または目のアイコンをクリックします。
              </li>
              <li>
                表示された32文字程度の英数字を<strong>コピーアイコン</strong>でコピーします。
                <br />
                <span className="text-muted-foreground text-xs">
                  形式例：a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
                </span>
              </li>
              <li>
                コピーした値を本フォームの「LINE&nbsp;チャンネルシークレット」欄に貼り付けます。
              </li>
            </ol>

            {/* セキュリティ注意事項 */}
            <div className="bg-destructive-foreground border border-destructive-foreground p-3 rounded-md">
              <p className="font-semibold text-destructive text-sm mb-2">🔒 セキュリティ上の注意</p>
              <ul className="text-xs text-destructive space-y-1">
                <li>• この値は絶対に公開しないでください</li>
                <li>• GitやSlackなどに誤って投稿しないよう注意</li>
                <li>• 漏洩した場合は即座にLINE Developersで再生成してください</li>
                <li>• 不審なアクセスがある場合も再生成を検討してください</li>
              </ul>
            </div>

            {/* 用途の説明 */}
            <div className="bg-background border border-border p-3 rounded-md">
              <p className="font-semibold text-sm mb-2">🎯 チャンネルシークレットの用途</p>
              <div className="text-xs space-y-1">
                <p>
                  • <strong>IDトークンの検証</strong>：ログイン時のトークンが正当か確認
                </p>
                <p>
                  • <strong>セキュリティ確保</strong>：不正なリクエストを防止
                </p>
                <p>
                  • <strong>改ざん検知</strong>：データが途中で変更されていないかチェック
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* LIFF ID */}
        <AccordionItem value="liff-id">
          <AccordionTrigger>LIFF ID の取得方法（LINEログインチャンネル専用）</AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            {/* 重要な注意 */}
            <div className="bg-accent border border-accent p-3 rounded-md mb-4">
              <p className="font-semibold text-primary text-sm mb-1">📌 重要</p>
              <p className="text-xs text-primary">
                LIFF IDは<strong>LINEログインチャンネル</strong>から取得します。Messaging
                APIチャンネルからは取得できません。
              </p>
              <p className="text-xs text-pop mt-1">
                ⚠️ LINEログインチャンネルが未作成の場合は、まずチャンネル作成から始めてください
              </p>
            </div>


            {/* 前提条件 */}
            <div className="bg-warning border border-warning p-3 rounded-md">
              <p className="font-semibold text-warning-foreground text-sm mb-2">📋 前提条件</p>
              <p className="text-sm text-warning-foreground">
                LINEログインチャンネルが作成済みであること
                <br />※ まだ作成していない場合は、以下の手順で先にチャンネルを作成してください
              </p>
            </div>

            {/* 取得手順 */}
            <p className="font-semibold">取得手順</p>
            <ol className="list-decimal list-inside space-y-1 bg-background p-4 rounded-md">
              <li>
                <Link
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkCls}
                >
                  LINE Developers コンソール
                </Link>
                でプロバイダー画面を開きます。
              </li>

              {/* LINEログインチャンネルがない場合の手順 */}
              <li className="bg-secondary/20 p-2 rounded text-xs">
                <strong>LINEログインチャンネルがない場合：</strong>
                <br />「<strong>チャンネルを作成</strong>」→「<strong>LINEログイン</strong>」を選択
                <br />
                アプリタイプ：「ウェブアプリ」を選択して必要情報を入力
              </li>

              <li>
                作成済みの<strong>LINEログインチャンネル</strong>をクリックして開きます。
                <br />
                <span className="text-pop text-xs">⚠️ Messaging APIチャンネルではありません</span>
              </li>
              <li>
                画面上部のタブから「<strong>LIFF</strong>」タブを選択します。
              </li>
              <li>
                「<strong>追加</strong>」ボタンをクリックしてLIFFアプリを作成します。
              </li>
              <li>
                LIFFアプリの設定画面で以下を入力します：
                <br />
                <div className="ml-4 mt-1 text-xs space-y-1">
                  <div>
                    • <strong>LIFFアプリ名</strong>：任意の名前（例：「Bockerログイン」）
                  </div>
                  <div>
                    • <strong>サイズ</strong>：Full（推奨）、Tall、Compactから選択
                  </div>
                  <div>
                    • <strong>エンドポイントURL</strong>：{window.location.origin}/reservation
                  </div>
                  <div>
                    • <strong>スコープ</strong>：profile、openid、email（必要に応じて）
                  </div>
                </div>
              </li>
              <li>
                設定を保存すると、「<span className="font-mono">1234567890-AbcdEfgh</span>」形式の
                <strong>LIFF ID</strong>が発行されます。
              </li>
              <li>このIDをコピーして、本フォームの「LIFF&nbsp;ID」欄に貼り付けます。</li>
            </ol>

            {/* チャンネル連携について */}
            <div className="bg-secondary border border-secondary p-3 rounded-md">
              <p className="font-semibold text-secondary-foreground text-sm mb-2">
                🔗 チャンネル連携のメリット
              </p>
              <div className="text-xs space-y-1">
                <p>• LINEログインとMessaging APIを同じプロバイダー内に作成すると連携が可能</p>
                <p>• ログインしたユーザーにメッセージを送信することができる</p>
                <p>• ユーザーIDの統合により、よりスムーズなUXを提供</p>
              </div>
            </div>

            {/* 今後の変更予定 */}
            <div className="bg-background border border-border p-3 rounded-md">
              <p className="font-semibold text-primary text-sm mb-2">🚀 今後の変更予定</p>
              <p className="text-xs text-primary">
                2025年2月以降、LIFFとLINE MINI Appの統合が予定されています。 詳細は
                <Link
                  href="https://developers.line.biz/"
                  className={externalLinkCls}
                  target="_blank"
                >
                  LINE Developers
                </Link>
                で確認してください。
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* LINE Channel ID */}
        <AccordionItem value="line-channel-id">
          <AccordionTrigger>
            LINE チャンネルID の取得方法（LINEログインチャンネル専用）
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            {/* 重要な注意 */}
            <div className="bg-accent border border-accent p-3 rounded-md mb-4">
              <p className="font-semibold text-primary text-sm mb-1">📌 重要</p>
              <p className="text-xs text-primary">
                このChannel IDは<strong>LINEログインチャンネル</strong>から取得します。Messaging
                APIチャンネルのChannel IDとは別物です。
              </p>
              <p className="text-xs text-destructive mt-1">
                ❌ <strong>よくある間違い</strong>：Messaging APIのChannel IDをここに設定してしまう
              </p>
            </div>


            {/* 前提条件 */}
            <div className="bg-warning border border-warning p-3 rounded-md">
              <p className="font-semibold text-warning-foreground text-sm mb-2">📋 前提条件</p>
              <p className="text-xs text-warning-foreground">
                <strong>LINEログインチャンネル</strong>が作成済みであること
                <br />※ Messaging APIチャンネルのChannel IDではありません
              </p>
            </div>

            {/* 取得手順 */}
            <p className="font-semibold">取得手順</p>
            <ol className="list-decimal list-inside space-y-1 bg-background p-4 rounded-md">
              <li>
                <Link
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkCls}
                >
                  LINE Developers コンソール
                </Link>
                にログインします。
              </li>
              <li>
                対象のプロバイダーを選択し、<strong>LINEログインチャンネル</strong>
                をクリックします。
                <br />
                <span className="text-destructive text-xs font-semibold">
                  ⚠️ Messaging APIチャンネルではありません！
                </span>
              </li>
              <li>
                画面上部のタブメニューから<strong>基本設定</strong>
                タブが選択されていることを確認します。
              </li>
              <li>
                ページ上部に表示される<strong>「チャンネルID」</strong>
                の数値（例：1234567890）を確認します。
                <br />
                <span className="text-muted-foreground text-xs">数字のみの10桁程度のIDです</span>
              </li>
              <li>
                チャンネルID横の<strong>コピーアイコン</strong>をクリックしてコピーします。
              </li>
              <li>コピーした値を本フォームの「LINE&nbsp;チャンネルID」欄に貼り付けます。</li>
            </ol>

            {/* 重要な区別 */}
            <div className="bg-background border border-border p-3 rounded-md">
              <p className="font-semibold text-destructive text-sm mb-2">⚡ チャンネルIDの区別</p>
              <div className="space-y-2 text-xs">
                <div className="bg-accent p-2 rounded">
                  <p className="font-semibold text-primary">
                    ✅ LINEログインチャンネルのChannel ID
                  </p>
                  <p>• 用途：LINE IDトークンの検証</p>
                  <p>• 形式：数字のみ（例：1234567890）</p>
                  <p>• 取得場所：LINEログインチャンネル 基本設定</p>
                  <p className="text-primary font-semibold">→ このフォームに設定する値</p>
                </div>
                <div className="bg-destructive-foreground p-2 rounded">
                  <p className="font-semibold text-destructive">
                    ❌ Messaging APIチャンネルのChannel ID
                  </p>
                  <p>• 用途：メッセージ送信API</p>
                  <p>• 形式：数字のみ（例：9876543210）</p>
                  <p>• 取得場所：Messaging APIチャンネル 基本設定</p>
                  <p className="text-destructive font-semibold">→ このフォームには設定しない</p>
                </div>
              </div>
            </div>

            {/* トラブルシューティング */}
            <div className="bg-warning border border-warning p-3 rounded-md">
              <p className="font-semibold text-warning-foreground text-sm mb-2">
                🔍 よくある問題と解決法
              </p>
              <ul className="text-xs space-y-1">
                <li>
                  • 「LINEログインチャンネルが見つからない」→ まず
                  LINEログインチャンネルを作成する必要があります
                </li>
                <li>
                  • 「ログインエラーが発生する」→ Messaging APIのChannel
                  IDを間違って設定していないか確認
                </li>
                <li>
                  • 「Token verification failed」→ 正しいLINEログインチャンネルのChannel IDか再確認
                </li>
              </ul>
            </div>

            {/* 確認方法 */}
            <div className="bg-background border border-border p-3 rounded-md">
              <p className="font-semibold text-primary text-sm mb-2">
                ✅ 正しく設定できているかの確認
              </p>
              <div className="text-xs space-y-1">
                <p>1. 設定したChannel IDが数字のみであること</p>
                <p>2. LINEログインチャンネルから取得したIDであること</p>
                <p>3. Messaging APIチャンネルのIDではないこと</p>
                <p>4. LIFFアプリも同じLINEログインチャンネル内に作成されていること</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 受信用ユーザーID(Messaging API) */}
        <AccordionItem value="line-user-id">
          <AccordionTrigger>予約受付の通知用LineユーザーIDの取得方法</AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-muted-foreground">
            {/* 重要な注意 */}
            <div className="bg-accent border border-accent p-3 rounded-md mb-4">
              <p className="font-semibold text-primary text-sm mb-1">📌 重要</p>
              <p className="text-xs text-primary">
                このユーザーIDは<strong>Messaging APIチャンネルの基本設定</strong>
                から取得します。
              </p>
            </div>
            {/* 前提条件 */}
            <div className="bg-warning border border-warning p-3 rounded-md">
              <p className="font-semibold text-warning-foreground text-sm mb-2">📋 前提条件</p>
              <p className="text-xs text-warning-foreground">
                <strong>Messaging APIチャンネル</strong>が作成済みであること
              </p>
            </div>
            {/* 取得手順 */}
            <p className="font-semibold">取得手順</p>
            <ol className="list-decimal list-inside space-y-1 bg-background p-4 rounded-md">
              <li>
                <Link
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkCls}
                >
                  LINE Developers コンソール
                </Link>
                にログインします。
              </li>
              <li>
                対象のプロバイダーを選択し、<strong>Messaging APIチャンネル</strong>
                をクリックします。
              </li>
              <li>
                画面上部のタブメニューから<strong>チャネル基本設定</strong>
                タブが選択されていることを確認します。
              </li>
              <li>
                ページ下部に表示される<strong>「あなたのユーザーID」</strong>
                の数値（例：U47fd8e362cb11c75fdcd6f67f7543204d）を確認します。
              </li>
              <li>
                チャンネルID横の<strong>コピーアイコン</strong>をクリックしてコピーします。
              </li>
              <li>コピーした値を本フォームの「LINE&nbsp;ユーザーID」欄に貼り付けます。</li>
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

export default ApiSettingsCard
