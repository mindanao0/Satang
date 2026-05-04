import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { computeTaxFromProfileAndWallet } from '../lib/tax'
import { formatMonthLabel, formatTHB } from '../lib/format'
import { streamGroq } from '../lib/groq'
import { Spinner } from '../components/Spinner'
import { EXPENSE_CATEGORIES } from '../types'
import { DashboardPdfExportContent } from '../components/DashboardPdfExportContent'
import { exportElementToPdf, exportTransactionsExcel } from '../lib/reportExport'
import { getChartPalette } from '../lib/chartPalette'
import { supabase } from '../lib/supabase'
import {
  fetchMonthlyWalletForMonth,
  fetchWalletEntriesForMonths,
  monthKeyFromDate,
  type WalletEntry,
} from '../lib/supabaseWallet'

export function Dashboard() {
  const { transactions, profile, budgetLimits } = useFinance()
  const { showToast } = useToast()
  const { isDark } = useTheme()
  const cp = useMemo(() => getChartPalette(isDark), [isDark])

  const [walletStarting, setWalletStarting] = useState(0)
  const [walletEntries, setWalletEntries] = useState<WalletEntry[]>([])
  const [walletBarData, setWalletBarData] = useState<
    { label: string; startingBalance: number; walletExpense: number }[]
  >([])
  /** Month key aligned with last wallet fetch (กระเป๋า + กราฟ) */
  const [dataMonthKey, setDataMonthKey] = useState(() => monthKeyFromDate(new Date()))
  const [walletLoadError, setWalletLoadError] = useState<string | null>(null)

  const tax = useMemo(
    () => computeTaxFromProfileAndWallet(profile, walletStarting),
    [profile, walletStarting],
  )

  const pdfExportRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const refreshDashboardWallet = useCallback(async () => {
    const now = new Date()
    const labels: { y: number; m: number }[] = []
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(monthKeyFromDate(d))
      labels.push({ y: d.getFullYear(), m: d.getMonth() })
    }

    const [entRes, ...mwResults] = await Promise.all([
      fetchWalletEntriesForMonths(keys, { orderByDate: false }),
      ...keys.map((mk) => fetchMonthlyWalletForMonth(mk)),
    ])

    const spendByMonth = new Map<string, number>()
    for (const e of entRes.data) {
      spendByMonth.set(e.month, (spendByMonth.get(e.month) ?? 0) + e.amount)
    }

    let firstErr: string | null = entRes.error
    const barRows: { label: string; startingBalance: number; walletExpense: number }[] = []
    keys.forEach((mk, idx) => {
      const mw = mwResults[idx]!
      const err = mw.error
      if (err && !firstErr) firstErr = err
      const starting = mw.data?.startingBalance ?? 0
      const spent = spendByMonth.get(mk) ?? 0
      const { y, m } = labels[idx]!
      barRows.push({
        label: formatMonthLabel(y, m),
        startingBalance: starting,
        walletExpense: spent,
      })
    })

    const curIdx = 5
    const mkCurrent = keys[curIdx]!
    const mwC = mwResults[curIdx]!
    const curErr = entRes.error || mwC.error
    setWalletLoadError(curErr || firstErr)
    setDataMonthKey(mkCurrent)
    setWalletStarting(mwC.data?.startingBalance ?? 0)
    setWalletEntries(
      entRes.data
        .filter((e) => e.month === mkCurrent)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    )
    setWalletBarData(barRows)
  }, [])

  useEffect(() => {
    void refreshDashboardWallet()
  }, [refreshDashboardWallet])

  useEffect(() => {
    const ch = supabase
      .channel(`dashboard-wallet-${dataMonthKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_entries', filter: `month=eq.${dataMonthKey}` },
        () => void refreshDashboardWallet(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_wallet', filter: `month=eq.${dataMonthKey}` },
        () => void refreshDashboardWallet(),
      )
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [dataMonthKey, refreshDashboardWallet])

  const walletSpent = useMemo(
    () => walletEntries.reduce((s, e) => s + e.amount, 0),
    [walletEntries],
  )

  const transactionsExpenseThisMonth = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === dataMonthKey)
      .reduce((s, t) => s + t.amount, 0)
  }, [transactions, dataMonthKey])

  /** รายจ่ายตามหมวดจาก wallet_entries เดือนปัจจุบัน (ใช้เปรียบเทียบงบประมาณ) */
  const expenseByCategoryWallet = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const e of walletEntries) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
    }
    return byCat
  }, [walletEntries])

  /** รายจ่ายตามหมวดจาก transactions เดือนปัจจุบัน */
  const expenseByCategoryTransactions = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date.slice(0, 7) !== dataMonthKey) continue
      byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
    }
    return byCat
  }, [transactions, dataMonthKey])

  /** โดนัท: รวม wallet + ธุรกรรมตามหมวด */
  const expenseByCategoryCombined = useMemo(() => {
    const out: Record<string, number> = { ...expenseByCategoryWallet }
    for (const [cat, amt] of Object.entries(expenseByCategoryTransactions)) {
      out[cat] = (out[cat] ?? 0) + amt
    }
    return out
  }, [expenseByCategoryWallet, expenseByCategoryTransactions])

  const monthStats = useMemo(() => {
    const expense = walletSpent + transactionsExpenseThisMonth
    const savings = walletStarting - expense
    return { expense, savings, walletSpent, transactionsExpenseThisMonth }
  }, [walletSpent, transactionsExpenseThisMonth, walletStarting])

  const pieData = useMemo(
    () =>
      Object.entries(expenseByCategoryCombined)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          value,
        })),
    [expenseByCategoryCombined],
  )

  const budgetRows = useMemo(() => {
    return EXPENSE_CATEGORIES.filter((cat) => (budgetLimits[cat] ?? 0) > 0).map((cat) => {
      const limit = budgetLimits[cat]!
      const used = expenseByCategoryWallet[cat] ?? 0
      const pct = limit > 0 ? (used / limit) * 100 : 0
      const over = used > limit
      const warn = !over && used > limit * 0.8
      return { cat, limit, used, pct, over, warn }
    })
  }, [budgetLimits, expenseByCategoryWallet])

  const monthWalletRowsPdf = useMemo(
    () =>
      [...walletEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [walletEntries],
  )

  async function handleExportPdf() {
    const el = pdfExportRef.current
    if (!el) {
      showToast('ไม่พบพื้นที่สำหรับสร้าง PDF')
      return
    }
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    setPdfBusy(true)
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      await exportElementToPdf(el, `satang-รายงาน-${stamp}.pdf`)
      showToast('ดาวน์โหลด PDF แล้ว')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ส่งออก PDF ไม่สำเร็จ')
    } finally {
      setPdfBusy(false)
    }
  }

  function handleExportExcel() {
    try {
      const d = new Date()
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      exportTransactionsExcel(transactions, `satang-transactions-${stamp}.xlsx`)
      showToast('ดาวน์โหลด Excel แล้ว')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ส่งออก Excel ไม่สำเร็จ')
    }
  }

  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const monthlyForTaxHint = profile.salary > 0 ? profile.salary : walletStarting

  const runAiSummary = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const stats = `
ฐานรายได้ต่อเดือนสำหรับภาษี (โปรไฟล์หรือยอดตั้งต้นกระเป๋า): ${monthlyForTaxHint} บาท/เดือน
ยอดตั้งต้นกระเป๋าเดือนนี้: ${walletStarting}
เดือนนี้ — รายจ่ายรวม: ${monthStats.expense} (กระเป๋าเงิน ${monthStats.walletSpent} + ธุรกรรม ${monthStats.transactionsExpenseThisMonth}), เงินเหลือ/ออม: ${monthStats.savings}
ภาษีประมาณการต่อปี: ${tax.taxAnnual} บาท
รายจ่ายตามหมวด (กระเป๋า + ธุรกรรมรวม): ${JSON.stringify(expenseByCategoryCombined)}
รายจ่ายจากกระเป๋าตามหมวด (เทียบงบ): ${JSON.stringify(expenseByCategoryWallet)}
จำนวนรายการกระเป๋าเดือนนี้: ${walletEntries.length}
`

    setAiSummary('')
    setAiError(null)
    setAiLoading(true)

    try {
      await streamGroq(
        `จากข้อมูลนี้ ช่วยสรุปสั้นๆ 3-6 ประโยคเป็นภาษาไทย ให้คำแนะนำเชิงบวก:\n${stats}`,
        'คุณเป็นที่ปรึกษาการเงินส่วนบุคคล ตอบกระชับ เป็นภาษาไทย ไม่ใช้ markdown',
        (delta) => {
          if (ac.signal.aborted) return
          setAiSummary((s) => s + delta)
        },
        900,
      )
    } catch (e) {
      if (ac.signal.aborted) return
      setAiError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      if (!ac.signal.aborted) setAiLoading(false)
    }
  }, [
    monthlyForTaxHint,
    walletStarting,
    monthStats,
    tax.taxAnnual,
    expenseByCategoryCombined,
    expenseByCategoryWallet,
    walletEntries.length,
  ])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">หน้าหลัก</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            สรุปจากกระเป๋าเงิน (ยอดตั้งต้นเดือนนี้) และแนวโน้ม 6 เดือนล่าสุด
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">ส่งออกรายงาน</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={pdfBusy}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {pdfBusy ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF'}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              ดาวน์โหลด Excel
            </button>
          </div>
          <p className="max-w-xs text-right text-xs text-slate-500 dark:text-slate-400">
            PDF: สรุปกระเป๋าเงินเดือนนี้ · Excel: รายการธุรกรรมหลัก
          </p>
        </div>
      </div>

      {walletLoadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ: {walletLoadError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">ยอดตั้งต้นเดือนนี้</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatTHB(walletStarting)}
          </div>
          <Link
            to="/transactions"
            className="mt-2 inline-block text-xs font-medium text-blue-800 hover:underline dark:text-sky-400"
          >
            ตั้งยอดในรายรับ-รายจ่าย
          </Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">รายจ่ายรวมเดือนนี้</div>
          <div className="mt-1 text-xl font-semibold text-red-700 dark:text-red-400">
            {formatTHB(monthStats.expense)}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            กระเป๋าเงิน {formatTHB(monthStats.walletSpent)} + ธุรกรรม {formatTHB(monthStats.transactionsExpenseThisMonth)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">เงินออม (เดือนนี้)</div>
          <div
            className={`mt-1 text-xl font-semibold ${monthStats.savings >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {formatTHB(monthStats.savings)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">ยอดตั้งต้น − รายจ่ายรวม</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">ภาษีโดยประมาณ (ต่อปี)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatTHB(tax.taxAnnual)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            หัก ณ ที่จ่ายเฉลี่ย {formatTHB(tax.taxMonthlyWithholding)}/เดือน
            {profile.salary <= 0 && walletStarting > 0 ? (
              <span className="block">ประมาณจากยอดตั้งต้นกระเป๋า × 12</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">งบประมาณรายหมวด (เดือนนี้)</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              เปรียบเทียบเพดานงบกับรายจ่ายจากกระเป๋าเงิน (wallet_entries) เท่านั้น
            </p>
          </div>
          <Link
            to="/budget"
            className="text-sm font-medium text-blue-800 hover:text-blue-900 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
          >
            ตั้งงบประมาณ
          </Link>
        </div>
        {budgetRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            ยังไม่ได้ตั้งเพดานรายจ่าย —{' '}
            <Link to="/budget" className="font-medium text-blue-800 hover:underline dark:text-sky-400">
              ไปตั้งงบประมาณ
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-5">
            {budgetRows.map(({ cat, limit, used, pct, over, warn }) => (
              <li key={cat}>
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{cat}</span>
                  {over ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      เกินงบ
                    </span>
                  ) : warn ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      ใกล้เต็มงบ
                    </span>
                  ) : null}
                  <span className="ml-auto text-sm text-slate-600 dark:text-slate-400">
                    {formatTHB(used)} / {formatTHB(limit)}
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      over ? 'bg-red-600' : warn ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">สัดส่วนรายจ่ายตามหมวด (เดือนนี้)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            รวมรายจ่ายจากกระเป๋าเงินและธุรกรรม — จัดกลุ่มตามหมวดแล้วรวมยอด
          </p>
          <div className="mt-4 h-72">
            {pieData.length === 0 ? (
              <p className="py-16 text-center text-slate-500 dark:text-slate-400">ยังไม่มีรายจ่ายในเดือนนี้</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={cp.pie[i % cp.pie.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatTHB(Number(v ?? 0))}
                    contentStyle={{
                      backgroundColor: cp.tooltipBg,
                      border: `1px solid ${cp.tooltipBorder}`,
                    }}
                  />
                  <Legend wrapperStyle={{ color: cp.legendColor, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ยอดตั้งต้นและรายจ่ายรายเดือน (6 เดือนล่าสุด)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            แท่งเขียว = ยอดตั้งต้นกระเป๋าเดือนนั้น · แท่งแดง = รายจ่ายจากกระเป๋าเงิน
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={walletBarData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={cp.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: cp.tick }} />
                <YAxis
                  tick={{ fontSize: 11, fill: cp.tick }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v) => formatTHB(Number(v ?? 0))}
                  contentStyle={{
                    backgroundColor: cp.tooltipBg,
                    border: `1px solid ${cp.tooltipBorder}`,
                  }}
                />
                <Legend wrapperStyle={{ color: cp.legendColor, fontSize: 12 }} />
                <Bar dataKey="startingBalance" name="ยอดตั้งต้น" fill={cp.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="walletExpense" name="รายจ่าย" fill={cp.expense} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">สรุปจาก AI</h2>
          <button
            type="button"
            onClick={() => void runAiSummary()}
            disabled={aiLoading}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            {aiLoading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
            ให้ AI วิเคราะห์
          </button>
        </div>
        {aiError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{aiError}</p>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {aiSummary ||
              (aiLoading ? 'กำลังวิเคราะห์...' : 'กดปุ่ม "ให้ AI วิเคราะห์" เพื่อสรุปจากข้อมูลบนหน้านี้')}
          </p>
        )}
      </div>

      <div
        className="pointer-events-none fixed top-0 -left-[10000px] z-[-1]"
        aria-hidden
      >
        <DashboardPdfExportContent
          ref={pdfExportRef}
          monthLabel={formatMonthLabel(new Date().getFullYear(), new Date().getMonth())}
          startingBalance={walletStarting}
          expense={monthStats.expense}
          savings={monthStats.savings}
          taxAnnual={tax.taxAnnual}
          taxWithholding={tax.taxMonthlyWithholding}
          pieData={pieData}
          barData={walletBarData}
          walletMonthRows={monthWalletRowsPdf.map((e) => ({
            date: e.date,
            name: e.name,
            category: e.category,
            amount: e.amount,
            note: e.note,
          }))}
        />
      </div>
    </div>
  )
}
