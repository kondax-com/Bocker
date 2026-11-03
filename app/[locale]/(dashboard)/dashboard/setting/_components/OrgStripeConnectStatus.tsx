'use client'

import { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/common'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ArrowRight, RefreshCw, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import { Loader2 } from 'lucide-react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { ExternalLink } from 'lucide-react'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import { useTranslations } from 'next-intl'

const statusColorMap: Record<string, string> = {
  not_connected: 'border border-palette-1-foreground text-palette-1-foreground bg-palette-1',
  pending: 'border border-palette-2-foreground text-palette-2-foreground bg-palette-2',
  incomplete: 'border border-palette-3-foreground text-palette-3-foreground bg-palette-3',
  restricted: 'border border-destructive-foreground text-destructive-foreground bg-destructive',
  payouts_disabled:
    'border border-destructive-foreground text-destructive-foreground bg-destructive',
  external_account_removed:
    'border border-palette-3-foreground text-palette-3-foreground bg-palette-3',
  bank_account_missing: 'border border-palette-2-foreground text-palette-2-foreground bg-palette-2',
  active: 'border border-success-foreground text-success-foreground bg-success',
  deauthorized: 'border border-destructive-foreground text-destructive-foreground bg-destructive',
}

export default function StripeConnectStatus() {
  const { tenantId, orgId, isLoaded } = useTenantAndOrganization()
  const { showErrorToast } = useErrorHandler()
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const t = useTranslations('settings.stripeConnect')
  // Stripe Connect アカウント情報を取得
  const connectAccount = useQuery(
    api.organization.query.getConnectAccountDetails,
    tenantId && orgId ? { tenant_id: tenantId, org_id: orgId } : 'skip'
  )

  console.log('tenantId', tenantId)
  console.log('orgId', orgId)

  // API呼び出しの共通処理
  const fetchApi = async <T,>(
    url: string,
    body: Record<string, unknown>
  ): Promise<{ data?: T; error?: string }> => {
    setIsLoading(true)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const responseData = await response.json()

      if (!response.ok) {
        const errorMessage = responseData.error || t('messages.error', { status: response.status })
        toast.error(errorMessage)
        return { error: errorMessage }
      }

      return { data: responseData }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    } finally {
      setIsLoading(false)
    }
  }

  // URLからクエリパラメータを取得
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const success = query.get('success')
    const refresh = query.get('refresh')

    if (success === 'true') {
      toast.success(t('messages.connectSuccess'))
      // クエリパラメータを削除
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (refresh === 'true') {
      toast.info(t('messages.continueSetup'))
      // クエリパラメータを削除
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [t])

  // Stripe Connectアカウントを作成する処理
  const handleConnectStripe = async () => {
    try {
      const { data } = await fetchApi<{ account: string; accountLink: string }>(
        '/api/stripe/connect',
        { tenant_id: tenantId, org_id: orgId }
      )
      console.log(data)

      if (data && data.account && data.accountLink) {
        console.log(data.accountLink)
        window.location.href = data.accountLink
      }
    } catch (error) {
      showErrorToast(error)
    }
  }

  // Stripe Dashboardへのリンクを生成
  const handleViewDashboard = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsLoading(true)
    if (!connectAccount?.stripe_account_id) return

    try {
      // FIXME: このAPIはまだ作成していない
      const { data } = await fetchApi<{ url: string; isOnboarding: boolean }>(
        '/api/stripe/connect/login',
        {
          stripe_account_id: connectAccount.stripe_account_id,
        }
      )

      if (data?.url) {
        if (data.isOnboarding) {
          toast.info('Stripeアカウントの設定を完了してください')
        }
        router.push(data.url)
      }
    } catch (error) {
      showErrorToast(error)
    } finally {
      setIsLoading(false)
    }
  }

  if (connectAccount === undefined) {
    return <Loading />
  }
  if (!isLoaded) {
    return <Loading />
  }

  const status = connectAccount?.stripe_connect_status || 'not_connected'
  // FIXME: 変更されたステータスで切り分ける
  const isConnected = status !== 'not_connected'

  return (
    <div className="admin-panel p-5 sm:p-6">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="mb-1 text-lg font-semibold text-foreground">{t('title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="admin-toolbar my-6">
        {isConnected && (
          <Button onClick={handleViewDashboard} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                {t('redirecting')}
              </>
            ) : (
              <>
                <ExternalLink className="mr-1 h-4 w-4" />
                {status === 'incomplete' || status === 'pending'
                  ? t('completeSetting')
                  : status === 'restricted'
                    ? t('liftRestrictions')
                    : t('viewDashboard')}
              </>
            )}
          </Button>
        )}
      </div>

      <Alert className={`${statusColorMap[status]} mb-4`}>
        <AlertTitle className=" text-sm font-medium mb-2">
          <span
            className={`text-xs tracking-widest font-bold px-3 py-1 rounded-md ${statusColorMap[status]}`}
          >
            {t(`status.${status}`)}
          </span>
        </AlertTitle>
        <AlertDescription className="mt-1 text-sm">
          {t(`statusDescription.${status}`)}
        </AlertDescription>
      </Alert>

      {(status === 'pending' || status === 'incomplete' || status === 'restricted') && (
        <motion.div
          className="mt-4 rounded-lg bg-secondary p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="mb-2 font-bold flex items-center">
            <RefreshCw className="mr-2 h-4 w-4 text-active" />
            {status === 'pending'
              ? t('setupRequired.title')
              : status === 'incomplete'
                ? t('setupRequired.incompleteTitle')
                : t('setupRequired.restrictedTitle')}
          </h3>

          {status === 'pending' && (
            <div className="space-y-3 mt-3 leading-6">
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-link-foreground text-xs font-medium text-link-foreground">
                  1
                </div>
                <div>
                  <p className="font-medium">{t('setupRequired.step1.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('setupRequired.step1.description')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-link-foreground text-xs font-medium text-link-foreground">
                  2
                </div>
                <div>
                  <p className="font-medium">{t('setupRequired.step2.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('setupRequired.step2.description')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-link-foreground text-xs font-medium text-link-foreground">
                  3
                </div>
                <div>
                  <p className="font-medium">{t('setupRequired.step3.title')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('setupRequired.step3.description')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {status === 'incomplete' && (
            <div className="space-y-3 mt-3 leading-6">
              <p className="text-sm text-muted-foreground">
                {t('setupRequired.incompleteMessage')}
              </p>
              <ul className="ml-6 list-disc space-y-1 text-sm">
                <li>{t('setupRequired.incompleteItems.item1')}</li>
                <li>{t('setupRequired.incompleteItems.item2')}</li>
              </ul>
            </div>
          )}

          {status === 'restricted' && (
            <div className="space-y-3 mt-3">
              <p className="text-sm text-muted-foreground">
                {t('setupRequired.restrictedMessage')}
              </p>
              <ul className="ml-6 list-disc space-y-1 text-sm">
                <li>{t('setupRequired.restrictedItems.item1')}</li>
                <li>{t('setupRequired.restrictedItems.item2')}</li>
              </ul>
            </div>
          )}

          <div className="mt-4">
            <Button size="sm" className="text-xs" onClick={handleViewDashboard}>
              {t('setupRequired.continueButton')}
              <ChevronRight className="mr-1 h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      )}

      <div className="bg-muted px-6 py-4 rounded-md mt-6">
        <div className="w-full flex flex-col-reverse sm:flex-row justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <p className="text-sm font-semibold mb-1 text-muted-foreground">{t('fee.title')}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs">{t('fee.description')}</p>
            </div>

            {(status === 'incomplete' || status === 'pending') && (
              <button
                onClick={() => {
                  if (window.confirm(t('reconnectConfirm'))) {
                    handleConnectStripe()
                  }
                }}
                className="block mt-2 text-xs text-link-foreground underline"
              >
                {t('reconnect')}
              </button>
            )}
          </div>

          {status === 'not_connected' && (
            <Button
              onClick={handleConnectStripe}
              disabled={isLoading || (isConnected && status !== 'deauthorized')}
              className={`${
                isConnected && status !== 'deauthorized' ? 'bg-muted hover:opacity-80' : ''
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  {t('connectButton')} <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      <Accordion type="multiple" className="mt-8 space-y-2 tracking-normal">
        {/* What is Stripe */}
        <AccordionItem value="stripe-overview">
          <AccordionTrigger>{t('accordion.whatIsStripe.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Stripe（ストライプ）</strong> は、米国発のオンライン決済サービスで、 世界 120
              か国以上・数百万社以上のビジネスで利用されています。Bocker は<strong>Stripe</strong>{' '}
              を採用することで、
              サロン様が複雑な契約やシステム開発を行うことなく、クレジットカード決済を
              すぐに導入できる環境を提供しています。
            </p>
            <p>
              Stripeアカウントを作成すると、カード決済・売上管理・振込管理が すべて Stripe
              で完結。サロン様は「売上を見る」「いつ入金されるか確認する」
              だけのシンプルな運用で済みます。
            </p>
            <p className="bg-muted p-3 rounded-md">
              <strong>ポイント</strong>
              <br />
              ・Bocker もサロン様もカード番号を保持しないため情報漏えいリスクを最小化
              <br />
              ・国内外の主要カードブランド（Visa/Mastercard/JCB 等）に標準対応
              <br />
              ・決済手段の追加（Apple Pay や Google Pay 等）も将来的に拡張可能
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Requirements & Flow */}
        <AccordionItem value="stripe-signup">
          <AccordionTrigger>{t('accordion.requirements.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium">登録に必要なもの</p>
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>サロンの正式名称・所在地・電話番号</li>
              <li>運営責任者（代表者）の氏名・生年月日・住所</li>
              <li>本人確認書類（運転免許証・パスポート等）の画像</li>
              <li>売上振込用の日本国内銀行口座情報</li>
              <li>連絡用メールアドレスと SMS 受信用携帯番号</li>
            </ul>

            <p className="font-medium">手続きの流れ（所要時間 10〜15 分）</p>
            <ol className="list-decimal list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>
                Bocker で <strong>「Stripeと連携する」</strong> をクリック
              </li>
              <li>Stripe のオンボーディング画面が開く</li>
              <li>ビジネス情報の入力（名称・所在地・業種など）</li>
              <li>運営責任者情報と本人確認書類のアップロード</li>
              <li>銀行口座情報の入力</li>
              <li>
                内容を確認して <strong>送信</strong>
              </li>
              <li>審査完了のメールを受信後、カード決済が利用可能に</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              情報に不備がある場合は Stripe から追加提出のメールが届きます。
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Safety & Security */}
        <AccordionItem value="stripe-safety">
          <AccordionTrigger>{t('accordion.security.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>
                国際基準 <strong>PCI‑DSS レベル&nbsp;1</strong>（最高位）を取得
              </li>
              <li>
                通信は全て <strong>256bit&nbsp;TLS</strong> で暗号化
              </li>
              <li>
                AI 不正検知システムが <strong>24&nbsp;時間&nbsp;365&nbsp;日</strong> 監視
              </li>
            </ul>
            <p>
              これらの仕組みにより、カード情報の盗難・不正利用リスクを大幅に低減できます。 Bocker /
              サロン様は決済データに直接触れないため、追加で高額な
              セキュリティ認証を取得する必要もありません。
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Liability & Risk */}
        <AccordionItem value="stripe-liability">
          <AccordionTrigger>{t('accordion.liability.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Bocker とサロン様は <strong>決済代行業務</strong> を Stripe に委託しています。
              そのため、カード情報の保管・不正監視・チャージバック対応など、
              高度なセキュリティ管理は Stripe が担います。
            </p>
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>
                カード番号は <strong>Bocker / サロン様のサーバーに一切保存されません</strong>
              </li>
              <li>
                チャージバック発生時のカード会社対応は Stripe が一次窓口となり、 必要に応じて Bocker
                が仲介します
              </li>
              <li>
                PCI‑DSS、改正割賦販売法、資金決済法 等の
                <strong>法令遵守</strong> は Stripe が実施
              </li>
              <li>決済障害時は Stripe が 24 時間体制で復旧対応・顧客への返金手続きも自動化</li>
            </ul>
            <p>
              これにより、サロン様はクレジットカード決済の
              <strong>法的・技術的リスクから解放</strong>され、 本業に専念できます。
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Payout flow */}
        <AccordionItem value="stripe-payout">
          <AccordionTrigger>{t('accordion.payoutFlow.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>お客様が Bocker でカード決済</li>
              <li>決済額は Stripe 上の残高に即時反映</li>
              <li>
                毎月 <strong>25&nbsp;日</strong> に前月 1〜末日の総売上をまとめて振込
              </li>
              <li>
                登録口座に <strong>1‑2&nbsp;営業日</strong> で着金
              </li>
            </ol>

            <p>
              振込スケジュールは Stripe ダッシュボードでいつでも確認できるため、
              キャッシュフローの見通しが立てやすくなります。
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Fees */}
        <AccordionItem value="stripe-fee">
          <AccordionTrigger>{t('accordion.fees.title')}</AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc list-inside space-y-1 bg-muted p-4 rounded-md">
              <li>
                <strong>決済手数料:</strong> 売上の <strong>4%</strong> + <strong>40円</strong> / 件
              </li>
              <li>
                <strong>振込手数料:</strong> 0円（Bocker が負担）
              </li>
              <li>
                <strong>月額固定費:</strong> 0円（Bocker が負担）
              </li>
            </ul>
            <p className="text-sm">
              例）10,000 円のお会計の場合：10,000 × 4% + 40 = <strong>440 円</strong>
              のみが手数料として引かれ、<strong>9,560&nbsp;円</strong> が振込対象額となります。
            </p>
            <p className="text-xs text-muted-foreground">
              ※ 一部ブランドの海外発行カードは追加 1.5% が発生する場合があります。
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* FAQ */}
        <AccordionItem value="stripe-faq">
          <AccordionTrigger>{t('accordion.faq.title')}</AccordionTrigger>
          <AccordionContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold">カード決済が失敗した場合は？</p>
              <p>
                Stripe が自動で再試行し、それでも失敗した場合は Bocker からお客様へメールで
                お知らせします。サロン側での個別請求も可能です。
              </p>
            </div>
            <div>
              <p className="font-semibold">返金はどう行いますか？</p>
              <p>
                Stripe ダッシュボードからワンクリックで即時返金 できます。返金手数料は
                <strong>無料</strong>です。ただ<strong>決済時に発生した手数料4%</strong>
                は返金されません。
              </p>
            </div>
            <div>
              <p className="font-semibold">導入にどのくらい時間がかかりますか？</p>
              <p>
                オンライン申請のみで<strong>最短 10 分</strong>で利用開始できます。
                本人確認書類の提出が必要ですが、審査状況はダッシュボードでリアルタイムに
                確認できます。
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
