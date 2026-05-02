import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { computeTaxFromProfile } from '../lib/tax'
import { formatMonthLabel, formatTHB, parseISODate } from '../lib/format'
import { streamGroq } from '../lib/groq'
import { Spinner } from '../components/Spinner'
import { EXPENSE_CATEGORIES } from '../types'
import { DashboardPdfExportContent } from '../components/DashboardPdfExportContent'
import { exportElementToPdf, exportTransactionsExcel } from '../lib/reportExport'
import { getChartPalette } from '../lib/chartPalette'

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function Dashboard() {
  const { transactions, profile, budgetLimits } = useFinance()
  const { showToast } = useToast()
  const { isDark } = useTheme()
  const cp = useMemo(() => getChartPalette(isDark), [isDark])
  const tax = useMemo(() => computeTaxFromProfile(profile), [profile])
  const pdfExportRef = useRef<HTMLDivElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const monthStats = useMemo(() => {
    const now = new Date()
    let income = 0
    let expense = 0
    const byCat: Record<string, number> = {}

    for (const t of transactions) {
      const dt = parseISODate(t.date)
      if (!isSameMonth(dt, now)) continue
      if (t.type === 'income') income += t.amount
      else {
        expense += t.amount
        byCat[t.category] = (byCat[t.category] ?? 0) + t.amount
      }
    }

    const displayIncome = income > 0 ? income : profile.salary
    const savings = displayIncome - expense

    return { income: displayIncome, expense, savings, byCat }
  }, [transactions, profile.salary])

  const txSig = useMemo(() => JSON.stringify(transactions), [transactions])

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

  const barData = useMemo(() => {
    const now = new Date()
    const rows: { label: string; รายรับ: number; รายจ่าย: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      let inc = 0
      let exp = 0
      for (const t of transactions) {
        const dt = parseISODate(t.date)
        if (dt.getFullYear() !== d.getFullYear() || dt.getMonth() !== d.getMonth()) continue
        if (t.type === 'income') inc += t.amount
        else exp += t.amount
      }
      const displayInc = inc > 0 ? inc : profile.salary
      rows.push({
        label: formatMonthLabel(d.getFullYear(), d.getMonth()),
        รายรับ: displayInc,
        รายจ่าย: exp,
      })
    }
    return rows
  }, [transactions, profile.salary])

  const monthTransactions = useMemo(() => {
    const now = new Date()
    return transactions
      .filter((t) => isSameMonth(parseISODate(t.date), now))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [transactions])

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

  useEffect(() => {
    const key = import.meta.env.VITE_GROQ_API_KEY
    if (!key) {
      setAiError('ตั้งค่า VITE_GROQ_API_KEY ใน .env เพื่อดูสรุป AI')
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const stats = `
เงินเดือน (โปรไฟล์): ${profile.salary} บาท/เดือน
เดือนนี้ — รายรับที่ใช้คำนวณ: ${monthStats.income}, รายจ่าย: ${monthStats.expense}, เงินเหลือออม: ${monthStats.savings}
ภาษีประมาณการต่อปี: ${tax.taxAnnual} บาท
รายจ่ายตามหมวดเดือนนี้: ${JSON.stringify(monthStats.byCat)}
จำนวนรายการทั้งหมด: ${transactions.length}
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
  }, [txSig, profile.salary, monthStats, tax.taxAnnual])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">หน้าหลัก</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">สรุปภาพรวมเดือนปัจจุบันและแนวโน้ม 6 เดือนล่าสุด</p>
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
            PDF: สรุปเดือนนี้และกราฟ · Excel: รายการทั้งหมด
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">เงินเดือน (โปรไฟล์)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatTHB(profile.salary)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">ต่อเดือน</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">รายจ่ายรวมเดือนนี้</div>
          <div className="mt-1 text-xl font-semibold text-red-700 dark:text-red-400">
            {formatTHB(monthStats.expense)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">เงินออม (เดือนนี้)</div>
          <div
            className={`mt-1 text-xl font-semibold ${monthStats.savings >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {formatTHB(monthStats.savings)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">รายรับที่ใช้ − รายจ่าย</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">ภาษีโดยประมาณ (ต่อปี)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatTHB(tax.taxAnnual)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            หัก ณ ที่จ่ายเฉลี่ย {formatTHB(tax.taxMonthlyWithholding)}/เดือน
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">รายรับและรายจ่ายรายเดือน (6 เดือนล่าสุด)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            หากไม่มีรายรับในบันทึก ระบบใช้เงินเดือนจากโปรไฟล์เป็นฐาน
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
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
          salary={profile.salary}
          income={monthStats.income}
          expense={monthStats.expense}
          savings={monthStats.savings}
          taxAnnual={tax.taxAnnual}
          taxWithholding={tax.taxMonthlyWithholding}
          pieData={pieData}
          barData={barData}
          monthTransactions={monthTransactions}
        />
      </div>
    </div>
  )
}
