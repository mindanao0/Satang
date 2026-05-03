import { useEffect, useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { streamGroq } from '../lib/groq'
import {
  filterLastThreeMonthsWalletEntries,
  splitForecastResponse,
  walletExpenseTotalsByCategoryForMonth,
} from '../lib/forecastData'
import { formatMonthLabel, formatTHB } from '../lib/format'
import { Spinner } from '../components/Spinner'
import { EXPENSE_CATEGORIES } from '../types'
import { isSupabaseConfigured } from '../lib/supabaseFinance'
import {
  fetchMonthlyWalletForMonth,
  fetchWalletEntriesForMonths,
  monthKeyFromDate,
  type WalletEntry,
} from '../lib/supabaseWallet'

const FORECAST_SYSTEM_PROMPT =
  'คุณคือที่ปรึกษาการเงิน วิเคราะห์ข้อมูลรายจ่ายจากกระเป๋าเงินย้อนหลัง 3 เดือน แล้วคาดการณ์รายจ่ายเดือนหน้าแต่ละหมวด พร้อมบอกหมวดที่มีแนวโน้มเพิ่มขึ้น และให้คำแนะนำ ตอบเป็นภาษาไทย'

function sortCategoryKeys(keys: string[]): string[] {
  const order = new Map<string, number>(EXPENSE_CATEGORIES.map((c, i) => [c, i]))
  return [...new Set(keys)].sort((a, b) => {
    const ia = order.get(a) ?? 999
    const ib = order.get(b) ?? 999
    if (ia !== ib) return ia - ib
    return a.localeCompare(b, 'th')
  })
}

function lastNMonthKeys(n: number, now: Date): string[] {
  const keys: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(monthKeyFromDate(d))
  }
  return keys
}

export function AIAnalysis() {
  const { profile } = useFinance()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [forecastNarrative, setForecastNarrative] = useState('')
  const [forecastByCategory, setForecastByCategory] = useState<Record<string, number> | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const [forecastStreaming, setForecastStreaming] = useState('')

  const [walletEntries3m, setWalletEntries3m] = useState<WalletEntry[]>([])
  const [walletStartingMonth, setWalletStartingMonth] = useState(0)
  const [walletLoadError, setWalletLoadError] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])
  const nextMonth = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth() + 1, 1)
  }, [])

  const thisMonthLabel = formatMonthLabel(now.getFullYear(), now.getMonth())
  const nextMonthLabel = formatMonthLabel(nextMonth.getFullYear(), nextMonth.getMonth())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isSupabaseConfigured()) {
        setWalletLoadError('ยังไม่ได้ตั้งค่า Supabase')
        return
      }
      const keys = lastNMonthKeys(3, now)
      const [entRes, mwRes] = await Promise.all([
        fetchWalletEntriesForMonths(keys),
        fetchMonthlyWalletForMonth(monthKeyFromDate(now)),
      ])
      if (cancelled) return
      setWalletLoadError(entRes.error || mwRes.error)
      setWalletEntries3m(entRes.data)
      setWalletStartingMonth(mwRes.data?.startingBalance ?? 0)
    })()
    return () => {
      cancelled = true
    }
  }, [now])

  const monthlyIncomeHint = profile.salary > 0 ? profile.salary : walletStartingMonth

  const thisMonthByCategory = useMemo(
    () => walletExpenseTotalsByCategoryForMonth(walletEntries3m, now.getFullYear(), now.getMonth()),
    [walletEntries3m, now],
  )

  const comparisonCategories = useMemo(() => {
    return sortCategoryKeys([
      ...Object.keys(thisMonthByCategory),
      ...(forecastByCategory ? Object.keys(forecastByCategory) : []),
    ])
  }, [thisMonthByCategory, forecastByCategory])

  async function run() {
    setError(null)
    setText('')
    const slice = filterLastThreeMonthsWalletEntries(walletEntries3m, now)
    if (slice.length === 0) {
      setError('ยังไม่มีข้อมูลรายจ่ายในกระเป๋าเงินช่วง 3 เดือนล่าสุด')
      return
    }

    setLoading(true)
    try {
      const payload = JSON.stringify(
        slice.map((e) => ({
          month: e.month,
          name: e.name,
          category: e.category,
          amount: e.amount,
          date: e.date,
          note: e.note,
        })),
      )
      await streamGroq(
        `นี่คือรายการใช้จ่ายจากกระเป๋าเงิน (JSON) ย้อนหลัง 3 เดือน:\n${payload}\nฐานรายได้ต่อเดือน (โปรไฟล์หรือยอดตั้งต้นกระเป๋าเดือนนี้): ${monthlyIncomeHint} บาท/เดือน\n\nกรุณาตอบเป็นภาษาไทย โดยมีหัวข้อชัดเจนดังนี้:\n1) สรุปพฤติกรรมการใช้จ่าย\n2) หมวดที่ใช้เงินมากเกินไป (ถ้ามี) และเหตุผลสั้นๆ\n3) คำแนะนำลดค่าใช้จ่าย 3-5 ข้อ\n4) เปรียบเทียบกับหลัก 50/30/20 (ความจำเป็น/ความต้องการ/การออมและหนี้) ว่าประมาณการจากข้อมูลนี้เป็นอย่างไร\n\nไม่ต้องใช้ markdown`,
        'คุณเป็นที่ปรึกษาการเงิน ให้คำแนะนำที่นุ่มนวล เป็นจริง และเป็นภาษาไทย',
        (d) => setText((s) => s + d),
        4096,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  async function runForecast() {
    setForecastError(null)
    setForecastNarrative('')
    setForecastByCategory(null)
    setForecastStreaming('')

    const slice = filterLastThreeMonthsWalletEntries(walletEntries3m, now)
    if (slice.length === 0) {
      setForecastError('ไม่มีรายจ่ายในช่วง 3 เดือนล่าสุดให้คาดการณ์')
      return
    }

    const payload = JSON.stringify(
      slice.map((e) => ({
        month: e.month,
        name: e.name,
        category: e.category,
        amount: e.amount,
        date: e.date,
        note: e.note,
      })),
    )

    const userPrompt = `นี่คือรายการใช้จ่ายจากกระเป๋าเงินย้อนหลัง 3 เดือนล่าสุด (JSON):\n${payload}\n\nฐานรายได้ต่อเดือน (โปรไฟล์หรือยอดตั้งต้นกระเป๋าเดือนนี้): ${monthlyIncomeHint} บาท/เดือน\n\nให้คุณวิเคราะห์และตอบเป็นภาษาไทย โดย:\n1) สรุปแนวโน้มรายจ่ายรายหมวดจากข้อมูล 3 เดือน\n2) คาดการณ์รายจ่ายเดือนหน้าแต่ละหมวดเป็นตัวเลขบาท (อธิบายเหตุผลสั้นๆ ได้)\n3) ระบุหมวดที่มีแนวโน้มเพิ่มขึ้นและข้อเสนอแนะการจัดการ\n\nสำคัญ: หลังข้อความอธิบายทั้งหมด ให้ขึ้นบรรทัดใหม่แล้วพิมพ์บรรทัดเดียวในรูปแบบนี้เท่านั้น (ไม่ใช้ markdown):\nFORECAST_JSON:{"ชื่อหมวด":จำนวนบาท,...}\nโดย key เป็นชื่อหมวดภาษาไทยตามข้อมูล และ value เป็นตัวเลขรวมคาดการณ์รายจ่ายเดือนหน้าเป็นบาท (ตัวเลขล้วน)`

    setForecastLoading(true)
    let acc = ''
    try {
      await streamGroq(
        userPrompt,
        FORECAST_SYSTEM_PROMPT,
        (d) => {
          acc += d
          setForecastStreaming(acc)
        },
        4096,
      )
      const { narrative, forecast } = splitForecastResponse(acc)
      setForecastNarrative(narrative)
      setForecastByCategory(forecast)
    } catch (e) {
      setForecastError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setForecastLoading(false)
      setForecastStreaming('')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">วิเคราะห์การใช้จ่ายด้วย AI</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          ส่งข้อมูลรายจ่ายจากกระเป๋าเงิน (ย้อนหลัง 3 เดือน) ให้ AI ช่วยสรุปและให้คำแนะนำ
        </p>
      </div>

      {walletLoadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          โหลดกระเป๋าเงิน: {walletLoadError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600"
      >
        {loading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
        วิเคราะห์ด้วย AI
      </button>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="min-h-[200px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ผลการวิเคราะห์</h2>
        <div className="mt-3 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
          {text || (loading ? 'กำลังสตรีมข้อความ...' : 'กดปุ่มด้านบนเพื่อเริ่มวิเคราะห์')}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">คาดการณ์เดือนหน้า</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ใช้รายจ่ายจากกระเป๋าเงินย้อนหลัง 3 เดือน (รวมเดือนปัจจุบัน) ส่งให้ AI คาดการณ์รายจ่ายเดือนถัดไปรายหมวด
        </p>
        <button
          type="button"
          onClick={runForecast}
          disabled={forecastLoading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-900 disabled:opacity-60 dark:bg-indigo-700 dark:hover:bg-indigo-600"
        >
          {forecastLoading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
          คาดการณ์ด้วย AI
        </button>

        {forecastError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {forecastError}
          </div>
        ) : null}

        {(forecastLoading && forecastStreaming) || forecastNarrative ? (
          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">สรุปจาก AI</h3>
            <div className="mt-2 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {forecastLoading && forecastStreaming
                ? forecastStreaming
                : forecastNarrative || '—'}
            </div>
          </div>
        ) : null}

        {comparisonCategories.length > 0 &&
        (forecastLoading ||
          forecastNarrative !== '' ||
          forecastByCategory != null) ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">เปรียบเทียบรายหมวด</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              เดือนนี้ ({thisMonthLabel}) เทียบกับคาดการณ์เดือนหน้า ({nextMonthLabel})
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <th className="px-3 py-2 font-medium">หมวด</th>
                    <th className="px-3 py-2 font-medium text-right">เดือนนี้ (จริง)</th>
                    <th className="px-3 py-2 font-medium text-right">คาดการณ์เดือนหน้า</th>
                    <th className="px-3 py-2 font-medium text-right">ต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonCategories.map((cat) => {
                    const cur = thisMonthByCategory[cat] ?? 0
                    const nextF = forecastByCategory?.[cat]
                    const diff =
                      nextF != null && Number.isFinite(nextF) ? nextF - cur : null
                    return (
                      <tr key={cat} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{cat}</td>
                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{formatTHB(cur)}</td>
                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                          {nextF != null && Number.isFinite(nextF) ? formatTHB(nextF) : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            diff == null
                              ? 'text-slate-400 dark:text-slate-500'
                              : diff > 0
                                ? 'text-amber-700 dark:text-amber-400'
                                : diff < 0
                                  ? 'text-green-700 dark:text-green-400'
                                  : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {diff == null
                            ? '—'
                            : `${diff > 0 ? '+' : ''}${formatTHB(diff)}`}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-slate-50 font-medium dark:bg-slate-800/80">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">รวม</td>
                    <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">
                      {formatTHB(
                        comparisonCategories.reduce(
                          (s, c) => s + (thisMonthByCategory[c] ?? 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">
                      {forecastByCategory
                        ? formatTHB(
                            comparisonCategories.reduce(
                              (s, c) => s + (forecastByCategory[c] ?? 0),
                              0,
                            ),
                          )
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                      {forecastByCategory
                        ? (() => {
                            const tCur = comparisonCategories.reduce(
                              (s, c) => s + (thisMonthByCategory[c] ?? 0),
                              0,
                            )
                            const tNext = comparisonCategories.reduce(
                              (s, c) => s + (forecastByCategory[c] ?? 0),
                              0,
                            )
                            const d = tNext - tCur
                            return `${d > 0 ? '+' : ''}${formatTHB(d)}`
                          })()
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
