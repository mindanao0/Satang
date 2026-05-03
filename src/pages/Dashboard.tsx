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
  fetchWalletEntriesForMonth,
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
  const [walletBarData, setWalletBarData] = useState<{ label: string; รายรับ: number; รายจ่าย: number }[]>(
    [],
  )
  const [walletLoadError, setWalletLoadError] = useState<string | null>(null)

  const tax = useMemo(
    () => computeTaxFromProfileAndWallet(profile, walletStarting),
    [profile, walletStarting],
  )

  const pdfExportRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const currentMonthKey = useMemo(() => monthKeyFromDate(new Date()), [])

  const refreshDashboardWallet = useCallback(async () => {
    const now = new Date()
    const labels: { y: number; m: number }[] = []
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(monthKeyFromDate(d))
      labels.push({ y: d.getFullYear(), m: d.getMonth() })
    }

    const bundles = await Promise.all(
      keys.map((mk) =>
        Promise.all([fetchMonthlyWalletForMonth(mk), fetchWalletEntriesForMonth(mk)]),
      ),
    )

    let firstErr: string | null = null
    const barRows: { label: string; รายรับ: number; รายจ่าย: number }[] = []
    bundles.forEach(([mw, ent], idx) => {
      const err = mw.error || ent.error
      if (err && !firstErr) firstErr = err
      const starting = mw.data?.startingBalance ?? 0
      const spent = ent.data.reduce((s, e) => s + e.amount, 0)
      const { y, m } = labels[idx]!
      barRows.push({
        label: formatMonthLabel(y, m),
        รายรับ: starting,
        รายจ่าย: spent,
      })
    })

    const curIdx = 5
    const [mwC, entC] = bundles[curIdx]!
    const curErr = mwC.error || entC.error
    setWalletLoadError(curErr || firstErr)
    setWalletStarting(mwC.data?.startingBalance ?? 0)
    setWalletEntries(entC.data)
    setWalletBarData(barRows)
  }, [])

  useEffect(() => {
    void refreshDashboardWallet()
  }, [refreshDashboardWallet])

  useEffect(() => {
    const ch = supabase
      .channel(`dashboard-wallet-${currentMonthKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_entries', filter: `month=eq.${currentMonthKey}` },
        () => void refreshDashboardWallet(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_wallet', filter: `month=eq.${currentMonthKey}` },
        () => void refreshDashboardWallet(),
      )
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [currentMonthKey, refreshDashboardWallet])

  const walletSpent = useMemo(
    () => walletEntries.reduce((s, e) => s + e.amount, 0),
    [walletEntries],
  )

  const transactionsExpenseThisMonth = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === currentMonthKey)
      .reduce((s, t) => s + t.amount, 0)
  }, [transactions, currentMonthKey])

  const monthStats = useMemo(() => {
    const byCat: Record<string, number> = {}
    for (const e of walletEntries) {
      byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
    }
    const expense = walletSpent + transactionsExpenseThisMonth
    const savings = walletStarting - expense
    return { expense, savings, byCat, walletSpent, transactionsExpenseThisMonth }
  }, [walletEntries, walletSpent, walletStarting, transactionsExpenseThisMonth])

  const walletSig = useMemo(() => JSON.stringify(walletEntries.map((e) => e.id)), [walletEntries])

  const pieData = useMemo(
    () =>
      Object.entries(monthStats.byCat).map(([name, value]) => ({
        name,
        value,
      })),
    [monthStats.byCat],
  )

  const budgetRows = useMemo(() => {
    return EXPENSE_CATEGORIES.filter((cat) => (budgetLimits[cat] ?? 0) > 0).map((cat) => {
      const limit = budgetLimits[cat]!
      const used = monthStats.byCat[cat] ?? 0
      const pct = limit > 0 ? (used / limit) * 100 : 0
      const over = used > limit
      const warn = !over && used > limit * 0.8
      return { cat, limit, used, pct, over, warn }
    })
  }, [budgetLimits, monthStats.byCat])

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

  useEffect(() => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const stats = `
ฐานรายได้ต่อเดือนสำหรับภาษี (โปรไฟล์หรือยอดตั้งต้นกระเป๋า): ${monthlyForTaxHint} บาท/เดือน
ยอดตั้งต้นกระเป๋าเดือนนี้: ${walletStarting}
เดือนนี้ — รายจ่ายรวม: ${monthStats.expense} (กระเป๋าเงิน ${monthStats.walletSpent} + ธุรกรรม ${monthStats.transactionsExpenseThisMonth}), เงินเหลือ/ออม: ${monthStats.savings}
ภาษีประมาณการต่อปี: ${tax.taxAnnual} บาท
รายจ่ายตามหมวด (กระเป๋าเงิน): ${JSON.stringify(monthStats.byCat)}
จำนวนรายการกระเป๋าเดือนนี้: ${walletEntries.length}
`

    setAiSummary('')
    setAiError(null)
    setAiLoading(true)

    ;(async () => {
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
    })()

    return () => ac.abort()
  }, [walletSig, walletStarting, monthStats, tax.taxAnnual, monthlyForTaxHint, walletEntries.length])

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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">งบประมาณรายหมวด (เดือนนี้)</h2>
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
                <Bar dataKey="รายรับ" fill={cp.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="รายจ่าย" fill={cp.expense} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">สรุปจาก AI</h2>
          {aiLoading ? <Spinner /> : null}
        </div>
        {aiError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{aiError}</p>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {aiSummary || (aiLoading ? 'กำลังวิเคราะห์...' : '')}
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
