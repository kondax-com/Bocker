'use client'

import { useRouter } from '@/i18n/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useTenantAndOrganization } from '@/hooks/useTenantAndOrganization'
import {
  Mail,
  Phone,
  Calendar,
  ChevronDown,
  Search,
  RefreshCw,
  Download,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { useDebounce } from 'use-debounce'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { Input } from '@/components/ui/input'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  CustomerRepository,
  CustomerExportRepository,
} from '@/services/supabase/repositories/customer'
import type { RowType } from '@/services/supabase/SupabaseService'
import { getIntlLocaleCode, type SupportedLocale } from '@/lib/dateLocale'

// 1回のロードでより多くのアイテムを表示
const PAGE_SIZE: number = 20

// 顧客情報の型定義
type CustomerWithDetails = {
  customer: RowType<'customer'>
  customerDetail: RowType<'customer_detail'> | null
  customerPoints: RowType<'customer_points'> | null
}

export default function CustomerList() {
  const t = useTranslations('customers')
  const tCommon = useTranslations('common')
  const locale = useLocale() as SupportedLocale
  const router = useRouter()
  const { tenantId, orgId, role, isLoaded } = useTenantAndOrganization()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [debouncedSearchTerm] = useDebounce(searchTerm, 1000)
  // 通常リスト用と検索結果用で状態を分離
  const [allCustomers, setAllCustomers] = useState<CustomerWithDetails[]>([]) // 通常リスト
  const [searchResults, setSearchResults] = useState<CustomerWithDetails[]>([]) // 検索結果
  const [isSearchMode, setIsSearchMode] = useState(false) // 検索モード判定

  // ローディング状態の細分化
  const [isLoadingAll, setIsLoadingAll] = useState(true) // 通常リスト
  const [isLoadingSearch, setIsLoadingSearch] = useState(false) // 検索
  const [isLoadingMoreAll, setIsLoadingMoreAll] = useState(false) // 通常リスト追加読み込み
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false) // 検索結果追加読み込み

  // ページネーション状態の分離
  const [currentAllPage, setCurrentAllPage] = useState(1) // 通常リスト用
  const [currentSearchPage, setCurrentSearchPage] = useState(1) // 検索結果用
  const [hasMoreAll, setHasMoreAll] = useState(true) // 通常リスト用
  const [hasMoreSearch, setHasMoreSearch] = useState(true) // 検索結果用

  // データ更新の状態管理
  const [isInterval, setIsInterval] = useState(false)
  const [intervalTime, setIntervalTime] = useState(10)

  // CustomerRepositoryのインスタンスをメモ化
  const customerRepo = useMemo(() => new CustomerRepository(), [])
  const customerExportRepo = useMemo(() => new CustomerExportRepository(), [])

  // テーブル行選択の状態管理
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [isAllSelected, setIsAllSelected] = useState(false)

  // エクスポート関連の状態
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportType, setExportType] = useState<'all' | 'selected'>('all')
  const [exportProgress, setExportProgress] = useState<{
    current: number
    total: number
    percentage: number
  } | null>(null)

  // 検索結果のキャッシュ
  const [searchCache, setSearchCache] = useState<Map<string, CustomerWithDetails[]>>(new Map())

  // キャッシュされた検索結果を取得
  const getCachedResults = useCallback(
    (searchTerm: string): CustomerWithDetails[] | null => {
      return searchCache.get(searchTerm.toLowerCase().trim()) || null
    },
    [searchCache]
  )

  // 詳細データ取得の最適化（バッチ処理）
  const getCustomersWithDetails = useCallback(
    async (customers: RowType<'customer'>[]): Promise<CustomerWithDetails[]> => {
      const BATCH_SIZE = 10
      const results: CustomerWithDetails[] = []

      for (let i = 0; i < customers.length; i += BATCH_SIZE) {
        const batch = customers.slice(i, i + BATCH_SIZE)
        const batchResults = await Promise.all(
          batch.map(async (customer) => {
            const completeData = await customerRepo.getCompleteCustomerData(
              customer.uid,
              tenantId!,
              orgId!
            )
            return {
              customer,
              customerDetail: completeData.customerDetail,
              customerPoints: completeData.customerPoints,
            }
          })
        )
        results.push(...batchResults)
      }

      return results
    },
    [customerRepo, tenantId, orgId]
  )

  // 表示用データを動的に切り替え
  const displayCustomers = isSearchMode ? searchResults : allCustomers
  const isLoading = isSearchMode ? isLoadingSearch : isLoadingAll
  const isLoadingMore = isSearchMode ? isLoadingMoreSearch : isLoadingMoreAll
  const hasMoreData = isSearchMode ? hasMoreSearch : hasMoreAll

  // 通常リスト取得関数（検索モードでない場合のみ実行）
  const fetchAllCustomers = useCallback(
    async (page: number = 1, append: boolean = false) => {
      // 検索モードでない場合のみ実行
      if (!tenantId || !orgId || !isLoaded || isSearchMode) {
        return
      }

      try {
        if (!append) {
          setIsLoadingAll(true)
        } else {
          setIsLoadingMoreAll(true)
        }

        // 顧客リストを取得（検索フィルタリングなし）
        const { data: customerList, count } = await customerRepo.list({
          page,
          pageSize: PAGE_SIZE,
          filters: {
            tenant_id: tenantId,
            org_id: orgId,
            is_archive: false,
          } as Partial<RowType<'customer'>>,
        })

        // バッチ処理で詳細データを効率的に取得
        const customersWithDetails = await getCustomersWithDetails(customerList)

        if (append) {
          setAllCustomers((prev) => [...prev, ...customersWithDetails])
        } else {
          setAllCustomers(customersWithDetails)
        }

        // ページネーション制御
        setHasMoreAll(customersWithDetails.length === PAGE_SIZE && page * PAGE_SIZE < (count || 0))
      } catch (error) {
        console.error('Failed to fetch customer data:', error)
        toast.error(t('fetchError'))
      } finally {
        setIsLoadingAll(false)
        setIsLoadingMoreAll(false)
      }
    },
    [tenantId, orgId, isLoaded, isSearchMode, customerRepo, getCustomersWithDetails, t]
  )

  // 検索専用関数（Supabaseサーバーサイド検索を使用 + キャッシュ対応）
  const searchCustomers = useCallback(
    async (searchTerm: string, page: number = 1, append: boolean = false) => {
      if (!tenantId || !orgId || !searchTerm.trim()) {
        setIsSearchMode(false)
        return
      }

      const cacheKey = searchTerm.toLowerCase().trim()

      // 初回検索でキャッシュチェック
      if (page === 1 && !append) {
        const cachedResults = getCachedResults(searchTerm)
        if (cachedResults) {
          setIsSearchMode(true)
          setSearchResults(cachedResults)
          setHasMoreSearch(false) // キャッシュされた結果は完全なものとして扱う
          return
        }
      }

      try {
        setIsSearchMode(true)
        if (!append) {
          setIsLoadingSearch(true)
        } else {
          setIsLoadingMoreSearch(true)
        }

        // Supabaseのサーバーサイド検索を使用
        const result = await customerRepo.findBySearchableText(tenantId, orgId, searchTerm.trim(), {
          page,
          pageSize: PAGE_SIZE,
        })

        // バッチ処理で詳細データを効率的に取得
        const customersWithDetails = await getCustomersWithDetails(result.data)

        if (append) {
          setSearchResults((prev) => [...prev, ...customersWithDetails])
        } else {
          setSearchResults(customersWithDetails)
          // 初回検索結果をキャッシュ（小さな結果のみ）
          if (customersWithDetails.length <= 20) {
            setSearchCache((prev) => new Map(prev).set(cacheKey, customersWithDetails))
          }
        }

        // ページネーション制御
        setHasMoreSearch(result.hasMore)
      } catch (error) {
        console.error('Failed to search customers:', error)
        toast.error(t('searchError'))
        setSearchResults([])
      } finally {
        setIsLoadingSearch(false)
        setIsLoadingMoreSearch(false)
      }
    },
    [tenantId, orgId, customerRepo, getCachedResults, getCustomersWithDetails, t]
  )

  // 初回データ取得（通常リスト）
  useEffect(() => {
    if (tenantId && orgId && isLoaded && !isSearchMode) {
      fetchAllCustomers(1, false)
      setCurrentAllPage(1)
    }
  }, [tenantId, orgId, isLoaded, isSearchMode, fetchAllCustomers])

  // デバウンス検索処理
  useEffect(() => {
    if (debouncedSearchTerm.trim()) {
      searchCustomers(debouncedSearchTerm, 1, false)
      setCurrentSearchPage(1)
    } else {
      // 検索語が空の場合は通常モードに戻る
      setIsSearchMode(false)
      setSearchResults([])
      // 通常リストがない場合は取得
      if (allCustomers.length === 0) {
        fetchAllCustomers(1, false)
        setCurrentAllPage(1)
      }
    }
  }, [debouncedSearchTerm, searchCustomers, fetchAllCustomers, allCustomers.length])

  // さらに読み込み（検索モードと通常モードに対応）
  const loadMore = () => {
    if (isSearchMode) {
      const nextPage = currentSearchPage + 1
      setCurrentSearchPage(nextPage)
      searchCustomers(debouncedSearchTerm, nextPage, true)
    } else {
      const nextPage = currentAllPage + 1
      setCurrentAllPage(nextPage)
      fetchAllCustomers(nextPage, true)
    }
  }

  // 予約日の書式変換
  const formatReservationDate = useCallback(
    (timestamp: number | null | undefined): string => {
      if (!timestamp) return t('noReservation')
      return new Date(timestamp * 1000).toLocaleDateString(getIntlLocaleCode(locale))
    },
    [locale, t]
  )

  // テーブル行選択の処理
  const handleSelectCustomer = useCallback((customerUid: string, checked: boolean) => {
    setSelectedCustomers((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(customerUid)
      } else {
        newSet.delete(customerUid)
        setIsAllSelected(false)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const allUids = new Set(displayCustomers.map((c) => c.customer.uid))
        setSelectedCustomers(allUids)
        setIsAllSelected(true)
      } else {
        setSelectedCustomers(new Set())
        setIsAllSelected(false)
      }
    },
    [displayCustomers]
  )

  const REFRESH_INTERVAL = 10000 // 10秒

  // CSVエクスポート処理
  const handleExportCsv = useCallback(async () => {
    if (!tenantId || !orgId) {
      toast.error('組織情報が取得できません')
      return
    }

    setIsExporting(true)
    setExportProgress(null)

    try {
      let csvData: string
      let totalCount: number

      if (exportType === 'selected') {
        if (selectedCustomers.size === 0) {
          toast.error('エクスポートする顧客を選択してください')
          return
        }

        const customerUids = Array.from(selectedCustomers)
        console.log(`[CustomerList] Exporting ${customerUids.length} selected customers`)

        const result = await customerExportRepo.exportCustomersCsvBatch(
          tenantId,
          orgId,
          { customerUids },
          (progress) => setExportProgress(progress)
        )

        csvData = result.csvData
        totalCount = result.totalCount
      } else {
        // 全件エクスポート
        console.log('[CustomerList] Exporting all customers')

        const result = await customerExportRepo.exportCustomersCsvBatch(
          tenantId,
          orgId,
          {},
          (progress) => setExportProgress(progress)
        )

        csvData = result.csvData
        totalCount = result.totalCount
      }

      // CSVファイルとしてダウンロード
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      link.setAttribute('href', url)
      link.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success(`${totalCount}件の顧客データをエクスポートしました`)
      setIsExportDialogOpen(false)
    } catch (error) {
      console.error('[CustomerList] Export failed:', error)
      toast.error('エクスポートに失敗しました')
    } finally {
      setIsExporting(false)
      setExportProgress(null)
      // インターバル開始
      setIsInterval(true)
      setIntervalTime(REFRESH_INTERVAL / 1000)
      const interval = setInterval(() => {
        setIntervalTime((prev) => prev - 1)
      }, 1000)
      setTimeout(() => {
        setIsInterval(false)
        clearInterval(interval)
      }, REFRESH_INTERVAL)
    }
  }, [tenantId, orgId, exportType, selectedCustomers, customerExportRepo])

  // 選択状態の管理
  useEffect(() => {
    const currentlyDisplayedUids = new Set(displayCustomers.map((c) => c.customer.uid))
    const selectedDisplayedCount = Array.from(selectedCustomers).filter((uid) =>
      currentlyDisplayedUids.has(uid)
    ).length
    setIsAllSelected(
      selectedDisplayedCount > 0 && selectedDisplayedCount === displayCustomers.length
    )
  }, [selectedCustomers, displayCustomers])

  if (!isLoaded || isLoading) {
    return <Loading />
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4">
        <div className="admin-toolbar justify-between">
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:max-w-md">
            <div className="relative w-full min-w-0 sm:max-w-md">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                className="min-h-11 pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {selectedCustomers.size > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedCustomers.size}件選択中
              </Badge>
            )}
          </div>

          {/* CSVエクスポートボタン */}
          {(role === 'admin' || role === 'owner') && (
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="min-h-11 gap-2 rounded-lg">
                  <Download className="h-4 w-4" />
                  顧客データをダウンロード
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>顧客データCSVエクスポート</DialogTitle>
                  <DialogDescription>顧客データをCSV形式でダウンロードできます</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="export-type">エクスポート対象</Label>
                    <Select
                      value={exportType}
                      onValueChange={(value: 'all' | 'selected') => setExportType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="エクスポート対象を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全ての顧客</SelectItem>
                        <SelectItem value="selected" disabled={selectedCustomers.size === 0}>
                          選択した顧客 ({selectedCustomers.size}件)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {exportType === 'selected' && selectedCustomers.size === 0 && (
                      <p className="text-sm text-muted-foreground">※ 先に顧客を選択してください</p>
                    )}
                  </div>

                  {exportProgress && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>進捗状況</span>
                        <span>{exportProgress.percentage}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${exportProgress.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {exportProgress.current.toLocaleString()} /{' '}
                        {exportProgress.total.toLocaleString()} 件
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsExportDialogOpen(false)}
                    disabled={isExporting}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleExportCsv}
                    disabled={
                      isExporting ||
                      (exportType === 'selected' && selectedCustomers.size === 0) ||
                      isInterval
                    }
                    className="min-h-11 gap-2 rounded-lg"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        エクスポート中...
                      </>
                    ) : isInterval ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        インターバル中 残り{intervalTime}秒
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        顧客データをCSVでダウンロード
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* 検索状態の可視化 */}
        {isSearchMode && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded-md">
            <Search size={16} />
            <span>{t('searchResultsFor', { term: debouncedSearchTerm })}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setIsSearchMode(false)
                setSearchResults([])
              }}
              className="ml-auto"
            >
              {tCommon('clear')}
            </Button>
          </div>
        )}
      </div>

      <div className="admin-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead className="px-4 w-12 text-muted-foreground">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="全選択"
                />
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                {t('customerNameLineUser')}
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                {t('contact')}
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                {t('visitCount')}
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                {t('birthday')}
              </TableHead>
              <TableHead className="px-4 text-nowrap w-fit text-muted-foreground">
                {t('lastVisit')}
              </TableHead>
              <TableHead className="px-2 text-nowrap w-fit text-muted-foreground">
                {t('tags')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {searchTerm ? t('noSearchResults') : t('noCustomers')}
                </TableCell>
              </TableRow>
            ) : (
              displayCustomers.map((customerData) => (
                <TableRow
                  key={customerData.customer.uid}
                  className="transition-colors hover:bg-muted"
                >
                  <TableCell className="px-4">
                    <Checkbox
                      checked={selectedCustomers.has(customerData.customer.uid)}
                      onCheckedChange={(checked) =>
                        handleSelectCustomer(customerData.customer.uid, checked === true)
                      }
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`顧客を選択: ${customerData.customer.last_name} ${customerData.customer.first_name}`}
                    />
                  </TableCell>
                  <TableCell
                    className="font-medium px-4 cursor-pointer text-foreground"
                    onClick={() => router.push(`/dashboard/customer/${customerData.customer.uid}`)}
                  >
                    <div className="flex items-center text-sm text-muted-foreground gap-4 text-nowrap">
                      <span>
                        {customerData.customer.last_name && customerData.customer.first_name
                          ? `${customerData.customer.last_name} ${customerData.customer.first_name}`
                          : t('notRegistered')}
                      </span>
                      {customerData.customer.line_user_name && (
                        <span className="text-sm text-muted-foreground">
                          / {customerData.customer.line_user_name}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell
                    className="px-4 text-sm cursor-pointer"
                    onClick={() => router.push(`/dashboard/customer/${customerData.customer.uid}`)}
                  >
                    <div className="space-y-1">
                      {customerData.customer.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-muted-foreground " />
                          <span className="tracking-wider">{customerData.customer.phone}</span>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">{t('notRegistered')}</p>
                      )}
                      {customerData.customer.email ? (
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-muted-foreground" />
                          <span className="tracking-wider text-nowrap">
                            {customerData.customer.email}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Mail size={14} className="text-muted-foreground" />
                          <p className="text-muted-foreground text-nowrap">{t('notRegistered')}</p>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-center cursor-pointer"
                    onClick={() => router.push(`/dashboard/customer/${customerData.customer.uid}`)}
                  >
                    {customerData.customer.total_reservation_count ?? 0} {t('times')}
                  </TableCell>
                  <TableCell
                    className="px-4 cursor-pointer"
                    onClick={() => router.push(`/dashboard/customer/${customerData.customer.uid}`)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-nowrap">
                        {customerData.customerDetail?.birthday
                          ? format(customerData.customerDetail?.birthday, 'yyyy年MM月dd日')
                          : t('notRegistered')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="px-4 cursor-pointer"
                    onClick={() => router.push(`/dashboard/customer/${customerData.customer.uid}`)}
                  >
                    <div className="flex items-center gap-4">
                      <Calendar size={16} className="text-muted-foreground" />
                      <span className="text-nowrap">
                        {formatReservationDate(customerData.customer.last_reservation_date_unix)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="w-full">
                    {customerData.customer.tags && customerData.customer.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1 w-full min-w-[140px] text-nowrap">
                        {customerData.customer.tags.map((tag: string, index: number) => (
                          <Badge
                            variant="outline"
                            key={index}
                            className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm text-nowrap">
                        {t('noTags')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasMoreData && (
        <div className="flex justify-center mt-6">
          <Button
            onClick={loadMore}
            variant="outline"
            className="min-h-11 gap-2 rounded-lg"
            disabled={isLoadingMore}
          >
            <span>{tCommon('loadMore')}</span>
            {isLoadingMore ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <ChevronDown size={16} />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
