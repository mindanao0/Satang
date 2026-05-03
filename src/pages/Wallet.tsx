import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Spinner } from '../components/Spinner'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { callGroq } from '../lib/groq'
import { formatMonthKeyLabel, formatTHB, toISO } from '../lib/format'
import { getChartPalette } from '../lib/chartPalette'
import { isSupabaseConfigured } from '../lib/supabaseFinance'
import { supabase } from '../lib/supabase'
import {
  WALLET_CATEGORIES,
  deleteWalletEntry,
  fetchMonthlyWalletForMonth,
  fetchWalletCategoryBudgetsForMonth,
  fetchWalletEntriesForMonth,
  fetchWalletMonthKeys,
  insertWalletEntry,
  monthKeyFromDate,
  persistWalletCategoryBudgets,
  type MonthlyWallet,
  type WalletCategory,
  type WalletCategoryBudget,
  type WalletEntry,
  updateWalletEntry,
  upsertMonthlyWalletStartingBalance,
} from '../lib/supabaseWallet'

const AI_SYSTEM_PROMPT =
  'คุณคือที่ปรึกษาการเงิน วิเคราะห์การใช้จ่ายในกระเป๋าเงินเดือนนี้ บอกว่าใช้เงินไปกับอะไรมากที่สุด เหลือเพียงพอไหม และควรระวังอะไร ตอบเป็นภาษาไทย'

function defaultDateForMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return toISO(new Date())
  const now = new Date()
  if (now.getFullYear() === y && now.getMonth() + 1 === m) return toISO(now)
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function emptyBudgetDraft(): Record<WalletCategory, string> {
  const d = {} as Record<WalletCategory, string>
  for (const c of WALLET_CATEGORIES) d[c] = ''
  return d
}

function budgetsToDraft(rows: WalletCategoryBudget[]): Record<WalletCategory, string> {
  const d = emptyBudgetDraft()
  for (const b of rows) {
    if (WALLET_CATEGORIES.includes(b.category as WalletCategory) && b.budget > 0) {
      d[b.category as WalletCategory] = String(Math.floor(b.budget))
    }
  }
  return d
}

type AddWalletEntryFormProps = {
  month: string
  disabled: boolean
  inputClass: string
  onSaved: () => void
  showToast: (message: string) => void
}

function AddWalletEntryForm({
  month,
  disabled,
  inputClass,
  onSaved,
  showToast,
}: AddWalletEntryFormProps) {
  const [entryName, setEntryName] = useState('')
  const [entryCategory, setEntryCategory] = useState<WalletCategory>(WALLET_CATEGORIES[0])
  const [entryAmount, setEntryAmount] = useState('')
  const [entryDate, setEntryDate] = useState(() => defaultDateForMonth(month))
  const [entryNote, setEntryNote] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault()
    const name = entryName.trim()
    if (!name) {
      showToast('กรุณากรอกชื่อรายการ')
      return
    }
    const amt = Number(entryAmount.replace(/,/g, '').trim())
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    setSavingEntry(true)
    const { error } = await insertWalletEntry({
      month,
      name,
      category: entryCategory,
      amount: amt,
      date: entryDate,
      note: entryNote.trim(),
    })
    setSavingEntry(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('บันทึกรายการแล้ว')
    setEntryName('')
    setEntryAmount('')
    setEntryNote('')
    onSaved()
  }

  return (
    <form
      onSubmit={(e) => void handleAddEntry(e)}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">บันทึกการใช้จ่าย</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">แยกจากรายการรายรับ-รายจ่ายหลักของแอป</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="text-slate-600 dark:text-slate-400">ชื่อรายการ</span>
          <input
            className={inputClass}
            value={entryName}
            onChange={(e) => setEntryName(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">หมวดหมู่</span>
          <select
            className={inputClass}
            value={entryCategory}
            onChange={(e) => setEntryCategory(e.target.value as WalletCategory)}
            disabled={disabled}
          >
            {WALLET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">จำนวนเงิน (บาท)</span>
          <input
            type="number"
            min={0}
            step={1}
            className={inputClass}
            value={entryAmount}
            onChange={(e) => setEntryAmount(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400">วันที่</span>
          <input
            type="date"
            className={inputClass}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">หมายเหตุ</span>
          <input
            className={inputClass}
            value={entryNote}
            onChange={(e) => setEntryNote(e.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={savingEntry || disabled}
        className="mt-6 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600"
      >
        {savingEntry ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
        บันทึกรายการ
      </button>
    </form>
  )
}

function remainingStyle(pctRemaining: number): { card: string; text: string } {
  if (pctRemaining < 20) {
    return {
      card: 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30',
      text: 'text-red-800 dark:text-red-300',
    }
  }
  if (pctRemaining < 50) {
    return {
      card: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/25',
      text: 'text-amber-900 dark:text-amber-300',
    }
  }
  return {
    card: 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/25',
    text: 'text-green-800 dark:text-green-300',
  }
}

export function Wallet() {
  const { showToast } = useToast()
  const { isDark } = useTheme()
  const cp = getChartPalette(isDark)

  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyFromDate(new Date()))
  const [monthOptions, setMonthOptions] = useState<string[]>([])
  const [monthlyWallet, setMonthlyWallet] = useState<MonthlyWallet | null>(null)
  const [entries, setEntries] = useState<WalletEntry[]>([])
  const [categoryBudgetRows, setCategoryBudgetRows] = useState<WalletCategoryBudget[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [startingDraft, setStartingDraft] = useState('')
  const [savingStarting, setSavingStarting] = useState(false)

  const [budgetDraft, setBudgetDraft] = useState<Record<WalletCategory, string>>(emptyBudgetDraft)
  const [savingBudgets, setSavingBudgets] = useState(false)

  const [filterCategory, setFilterCategory] = useState<string>('')
  const [editingEntry, setEditingEntry] = useState<WalletEntry | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<WalletCategory>(WALLET_CATEGORIES[0])
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoadError('ยังไม่ได้ตั้งค่า Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [mw, ent, bud, months] = await Promise.all([
        fetchMonthlyWalletForMonth(selectedMonth),
        fetchWalletEntriesForMonth(selectedMonth),
        fetchWalletCategoryBudgetsForMonth(selectedMonth),
        fetchWalletMonthKeys(),
      ])
      const err = mw.error || ent.error || bud.error || months.error
      if (err) setLoadError(err)
      setMonthlyWallet(mw.data)
      setStartingDraft(mw.data ? String(mw.data.startingBalance) : '')
      setEntries(ent.data)
      setCategoryBudgetRows(bud.data)
      setBudgetDraft(budgetsToDraft(bud.data))
      setMonthOptions(months.data.length ? months.data : [selectedMonth])
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(t)
  }, [refresh])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const ch = supabase
      .channel(`wallet-${selectedMonth}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_entries', filter: `month=eq.${selectedMonth}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_wallet', filter: `month=eq.${selectedMonth}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_category_budgets',
          filter: `month=eq.${selectedMonth}`,
        },
        () => void refresh(),
      )
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [selectedMonth, refresh])

  const starting = monthlyWallet?.startingBalance ?? 0
  const spent = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries])
  const remaining = starting - spent
  const pctSpent = starting > 0 ? Math.min(100, (spent / starting) * 100) : 0
  const pctRemaining = starting > 0 ? Math.max(0, (remaining / starting) * 100) : 0
  const remStyle =
    starting > 0
      ? remainingStyle(pctRemaining)
      : {
          card: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
          text: 'text-slate-800 dark:text-slate-200',
        }

  const spentByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of entries) {
      m[e.category] = (m[e.category] ?? 0) + e.amount
    }
    return m
  }, [entries])

  const budgetByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of categoryBudgetRows) m[b.category] = b.budget
    return m
  }, [categoryBudgetRows])

  const pieData = useMemo(() => {
    return Object.entries(spentByCategory)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [spentByCategory])

  const filteredEntries = useMemo(() => {
    if (!filterCategory) return entries
    return entries.filter((e) => e.category === filterCategory)
  }, [entries, filterCategory])

  async function handleSaveStarting(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(startingDraft.replace(/,/g, '').trim())
    if (!Number.isFinite(n) || n < 0) {
      showToast('กรุณากรอกยอดตั้งต้นที่ถูกต้อง')
      return
    }
    setSavingStarting(true)
    const { error } = await upsertMonthlyWalletStartingBalance(selectedMonth, n)
    setSavingStarting(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('บันทึกยอดตั้งต้นแล้ว')
    void refresh()
  }

  async function handleSaveBudgets(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, number> = {}
    for (const c of WALLET_CATEGORIES) {
      const raw = budgetDraft[c].replace(/,/g, '').trim()
      if (!raw) continue
      const v = Number(raw)
      if (!Number.isFinite(v) || v <= 0) {
        showToast(`กรุณากรอกงบ “${c}” ให้ถูกต้อง`)
        return
      }
      next[c] = Math.floor(v)
    }
    setSavingBudgets(true)
    const { error } = await persistWalletCategoryBudgets(selectedMonth, next)
    setSavingBudgets(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('บันทึกงบตามหมวดแล้ว')
    void refresh()
  }

  function startEdit(row: WalletEntry) {
    setEditingEntry(row)
    setEditName(row.name)
    setEditCategory((WALLET_CATEGORIES.includes(row.category as WalletCategory) ? row.category : WALLET_CATEGORIES[0]) as WalletCategory)
    setEditAmount(String(row.amount))
    setEditDate(row.date)
    setEditNote(row.note)
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEntry) return
    const name = editName.trim()
    if (!name) {
      showToast('กรุณากรอกชื่อรายการ')
      return
    }
    const amt = Number(editAmount.replace(/,/g, '').trim())
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    setSavingEdit(true)
    const { error } = await updateWalletEntry(editingEntry.id, {
      name,
      category: editCategory,
      amount: amt,
      date: editDate,
      note: editNote.trim(),
    })
    setSavingEdit(false)
    if (error) {
      showToast(error)
      return
    }
    showToast('อัปเดตรายการแล้ว')
    setEditingEntry(null)
    void refresh()
  }

  async function handleDelete(id: string) {
    if (!window.confirm('ลบรายการนี้?')) return
    const { error } = await deleteWalletEntry(id)
    if (error) {
      showToast(error)
      return
    }
    showToast('ลบรายการแล้ว')
    if (editingEntry?.id === id) setEditingEntry(null)
    void refresh()
  }

  async function runAi() {
    setAiError(null)
    setAiText('')
    setAiLoading(true)
    try {
      const byCat: Record<string, number> = {}
      for (const e of entries) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
      const payload = {
        เดือน: selectedMonth,
        ยอดตั้งต้น: starting,
        ยอดใช้รวม: spent,
        คงเหลือ: remaining,
        เปอร์เซ็นต์ที่ใช้ไป: starting > 0 ? Math.round(pctSpent) : null,
        รายการ: entries.map((e) => ({
          ชื่อ: e.name,
          หมวด: e.category,
          จำนวน: e.amount,
          วันที่: e.date,
          หมายเหตุ: e.note,
        })),
        สรุปตามหมวด: byCat,
        งบตามหมวดที่ตั้งไว้: budgetByCategory,
      }
      const text = await callGroq(
        [{ role: 'user', content: JSON.stringify(payload) }],
        AI_SYSTEM_PROMPT,
        2048,
      )
      setAiText(text)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setAiLoading(false)
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">กระเป๋าเงิน</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            ตั้งยอดต้นเดือน บันทึกค่าใช้จ่ายแยกจากรายรับ-รายจ่ายหลัก และดูสรุปแบบเรียลไทม์
          </p>
        </div>
        <label className="block text-sm sm:w-56">
          <span className="text-slate-600 dark:text-slate-400">เลือกเดือน</span>
          <select
            className={inputClass}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthKeyLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isSupabaseConfigured() ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          ตั้งค่า Supabase ในไฟล์ .env แล้วรีเฟรชหน้าเว็บเพื่อใช้กระเป๋าเงิน
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {loadError}
        </div>
      ) : null}

      <div className={`rounded-2xl border-2 p-6 shadow-sm ${remStyle.card}`}>
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">ยอดตั้งต้นเดือนนี้</p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${monthlyWallet || starting > 0 ? remStyle.text : 'text-slate-700 dark:text-slate-200'}`}>
          {formatTHB(starting)}
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {formatMonthKeyLabel(selectedMonth)}
          {!monthlyWallet && starting === 0 ? ' — ยังไม่ได้บันทึกยอดตั้งต้น' : null}
        </p>
      </div>

      <form
        onSubmit={handleSaveStarting}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ตั้งยอดเงินต้นเดือน</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          กำหนดยอดเงินเริ่มต้นสำหรับเดือนที่เลือก (เช่น 20,000 บาท)
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">ยอดตั้งต้น (บาท)</span>
            <input
              type="number"
              min={0}
              step={1}
              className={inputClass}
              value={startingDraft}
              onChange={(e) => setStartingDraft(e.target.value)}
              disabled={!isSupabaseConfigured()}
            />
          </label>
          <button
            type="submit"
            disabled={savingStarting || !isSupabaseConfigured()}
            className="rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-60 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            {savingStarting ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
            บันทึกยอดตั้งต้น
          </button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">ยอดตั้งต้น</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatTHB(starting)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">ใช้ไปแล้ว</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {formatTHB(spent)}
          </p>
        </div>
        <div className={`rounded-xl border-2 p-4 shadow-sm ${remStyle.card}`}>
          <p className="text-sm text-slate-600 dark:text-slate-400">คงเหลือ</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${remStyle.text}`}>{formatTHB(remaining)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-400">ใช้ไป {starting > 0 ? `${pctSpent.toFixed(0)}%` : '—'}</p>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-[width] ${
                pctRemaining < 20 ? 'bg-red-500' : pctRemaining < 50 ? 'bg-amber-500' : 'bg-green-600'
              }`}
              style={{ width: `${starting > 0 ? Math.min(100, pctSpent) : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">แบ่งหมวด (ใช้จริง)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">สัดส่วนการใช้จ่ายในเดือนที่เลือก</p>
          <div className="mt-4 h-72">
            {pieData.length === 0 ? (
              <p className="py-16 text-center text-slate-500 dark:text-slate-400">ยังไม่มีรายการใช้จ่าย</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
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

        <form
          onSubmit={handleSaveBudgets}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">งบตามหมวด (กระเป๋าเงิน)</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            ตั้งงบรายหมวดสำหรับเดือนนี้ แล้วเปรียบเทียบกับยอดใช้จริง
          </p>
          <ul className="mt-4 space-y-4">
            {WALLET_CATEGORIES.map((cat) => {
              const used = spentByCategory[cat] ?? 0
              const cap = budgetByCategory[cat] ?? 0
              const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0
              const over = cap > 0 && used > cap
              return (
                <li key={cat}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{cat}</span>
                    <span className="ml-auto text-slate-600 dark:text-slate-400">
                      ใช้ {formatTHB(used)}
                      {cap > 0 ? ` / งบ ${formatTHB(cap)}` : ''}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inputClass} mt-1`}
                    placeholder="งบ (บาท) ว่าง = ไม่ตั้ง"
                    value={budgetDraft[cat]}
                    onChange={(e) => setBudgetDraft((d) => ({ ...d, [cat]: e.target.value }))}
                    disabled={!isSupabaseConfigured()}
                  />
                  {cap > 0 ? (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full ${over ? 'bg-red-600' : pct > 85 ? 'bg-amber-500' : 'bg-blue-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">ยังไม่ได้ตั้งงบ — แสดงเฉพาะยอดใช้จริง</p>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="submit"
            disabled={savingBudgets || !isSupabaseConfigured()}
            className="mt-6 rounded-lg bg-indigo-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-900 disabled:opacity-60 dark:bg-indigo-700 dark:hover:bg-indigo-600"
          >
            {savingBudgets ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
            บันทึกงบตามหมวด
          </button>
        </form>
      </div>

      <AddWalletEntryForm
        key={selectedMonth}
        month={selectedMonth}
        disabled={!isSupabaseConfigured()}
        inputClass={inputClass}
        onSaved={() => void refresh()}
        showToast={showToast}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">รายการในเดือนนี้</h2>
          <label className="block text-sm sm:w-48">
            <span className="text-slate-600 dark:text-slate-400">กรองหมวด</span>
            <select
              className={inputClass}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">ทุกหมวด</option>
              {WALLET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {editingEntry ? (
          <form
            onSubmit={handleSaveEdit}
            className="mt-4 rounded-lg border border-blue-200 bg-blue-50/80 p-4 dark:border-blue-900/50 dark:bg-blue-950/30"
          >
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">แก้ไขรายการ</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">ชื่อรายการ</span>
                <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">หมวด</span>
                <select
                  className={inputClass}
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as WalletCategory)}
                >
                  {WALLET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">จำนวนเงิน</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={inputClass}
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600 dark:text-slate-400">วันที่</span>
                <input
                  type="date"
                  className={inputClass}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-slate-600 dark:text-slate-400">หมายเหตุ</span>
                <input className={inputClass} value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-medium text-white hover:bg-blue-900 dark:bg-sky-700"
              >
                {savingEdit ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
                บันทึกการแก้ไข
              </button>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <th className="px-3 py-2 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">ชื่อรายการ</th>
                  <th className="px-3 py-2 font-medium">หมวด</th>
                  <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                  <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                  <th className="px-3 py-2 font-medium text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">
                      ไม่มีรายการ
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300">{row.date}</td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{row.name}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                        {formatTHB(row.amount)}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-slate-600 dark:text-slate-400">
                        {row.note || '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="mr-2 text-blue-700 hover:underline dark:text-sky-400"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="text-red-700 hover:underline dark:text-red-400"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">AI วิเคราะห์กระเป๋าเงิน</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ส่งข้อมูลเดือนที่เลือกไปยัง Groq เพื่อสรุปและเตือนความเสี่ยง
        </p>
        <button
          type="button"
          onClick={() => void runAi()}
          disabled={aiLoading || !isSupabaseConfigured()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-900 disabled:opacity-60 dark:bg-violet-700 dark:hover:bg-violet-600"
        >
          {aiLoading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
          ให้ AI วิเคราะห์
        </button>
        {aiError ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {aiError}
          </div>
        ) : null}
        <div className="mt-4 min-h-[120px] rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {aiText || (aiLoading ? 'กำลังวิเคราะห์...' : 'กดปุ่มเพื่อให้ AI วิเคราะห์ข้อมูลเดือนนี้')}
          </div>
        </div>
      </div>
    </div>
  )
}
