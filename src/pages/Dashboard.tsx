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
import { computeTaxFromProfile } from '../lib/tax'
import { formatMonthLabel, formatTHB, parseISODate } from '../lib/format'
import { streamClaude } from '../lib/claude'
import { Spinner } from '../components/Spinner'

const PIE_COLORS = [
  '#1d4ed8',
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#64748b',
]

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function Dashboard() {
  const { transactions, profile } = useFinance()
  const tax = useMemo(() => computeTaxFromProfile(profile), [profile])

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

  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!key) {
      setAiError('ตั้งค่า VITE_ANTHROPIC_API_KEY ใน .env เพื่อดูสรุป AI')
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
        await streamClaude(
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">หน้าหลัก</h1>
        <p className="mt-1 text-slate-600">สรุปภาพรวมเดือนปัจจุบันและแนวโน้ม 6 เดือนล่าสุด</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">เงินเดือน (โปรไฟล์)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {formatTHB(profile.salary)}
          </div>
          <div className="mt-1 text-xs text-slate-400">ต่อเดือน</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">รายจ่ายรวมเดือนนี้</div>
          <div className="mt-1 text-xl font-semibold text-red-700">
            {formatTHB(monthStats.expense)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">เงินออม (เดือนนี้)</div>
          <div
            className={`mt-1 text-xl font-semibold ${monthStats.savings >= 0 ? 'text-green-700' : 'text-red-700'}`}
          >
            {formatTHB(monthStats.savings)}
          </div>
          <div className="mt-1 text-xs text-slate-400">รายรับที่ใช้ − รายจ่าย</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">ภาษีโดยประมาณ (ต่อปี)</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {formatTHB(tax.taxAnnual)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            หัก ณ ที่จ่ายเฉลี่ย {formatTHB(tax.taxMonthlyWithholding)}/เดือน
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">สัดส่วนรายจ่ายตามหมวด (เดือนนี้)</h2>
          <div className="mt-4 h-72">
            {pieData.length === 0 ? (
              <p className="py-16 text-center text-slate-500">ยังไม่มีรายจ่ายในเดือนนี้</p>
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
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatTHB(Number(v ?? 0))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">รายรับและรายจ่ายรายเดือน (6 เดือนล่าสุด)</h2>
          <p className="mt-1 text-xs text-slate-500">
            หากไม่มีรายรับในบันทึก ระบบใช้เงินเดือนจากโปรไฟล์เป็นฐาน
          </p>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatTHB(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="รายรับ" fill="#15803d" radius={[4, 4, 0, 0]} />
                <Bar dataKey="รายจ่าย" fill="#b91c1c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">สรุปจาก AI</h2>
          {aiLoading ? <Spinner /> : null}
        </div>
        {aiError ? (
          <p className="mt-3 text-sm text-red-600">{aiError}</p>
        ) : (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {aiSummary || (aiLoading ? 'กำลังวิเคราะห์...' : '')}
          </p>
        )}
      </div>
    </div>
  )
}
