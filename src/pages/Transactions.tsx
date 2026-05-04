import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from '../types'
import { formatTHB, parseISODate, toISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { insertWalletEntry } from '../lib/wallet'
import {
  WALLET_CATEGORIES,
  deleteWalletEntry,
  fetchMonthlyWalletForMonth,
  fetchWalletEntriesForMonth,
  fetchWalletEntriesForMonths,
  fetchWalletMonthKeys,
  monthKeyFromDate,
  updateWalletEntry,
  upsertMonthlyWalletStartingBalance,
  type WalletEntry,
} from '../lib/supabaseWallet'

function monthOptions(
  transactions: Transaction[],
  extraMonths: string[],
): { value: string; label: string }[] {
  const set = new Set<string>()
  for (const t of transactions) {
    const d = parseISODate(t.date)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    set.add(v)
  }
  const now = new Date()
  set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  for (const m of extraMonths) set.add(m)
  const sorted = [...set].sort().reverse()
  return sorted.map((v) => {
    const [y, m] = v.split('-').map(Number)
    return { value: v, label: `${m}/${y + 543}` }
  })
}

const allCategories = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])]

type MergedRow = { kind: 'income'; t: Transaction } | { kind: 'wallet'; w: WalletEntry }

export function Transactions() {
  const {
    transactions,
    addTransaction,
    updateTransaction,
    removeTransaction,
    recurringTransactions,
    addRecurringItem,
    setRecurringEnabled,
    removeRecurringItem,
  } = useFinance()
  const { showToast } = useToast()

  const currentMonthKey = useMemo(() => monthKeyFromDate(new Date()), [])

  const [extraMonthKeys, setExtraMonthKeys] = useState<string[]>([])
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toISO(new Date()))
  const [note, setNote] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)

  const [recType, setRecType] = useState<'income' | 'expense'>('expense')
  const [recCategory, setRecCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [recAmount, setRecAmount] = useState('')
  const [recDay, setRecDay] = useState('1')
  const [recName, setRecName] = useState('')

  const [summaryStarting, setSummaryStarting] = useState(0)
  const [startingInput, setStartingInput] = useState('')
  const [summaryWalletSpent, setSummaryWalletSpent] = useState(0)
  const [walletSummaryError, setWalletSummaryError] = useState<string | null>(null)

  const [walletListEntries, setWalletListEntries] = useState<WalletEntry[]>([])
  const [walletListError, setWalletListError] = useState<string | null>(null)
  const [walletListVersion, setWalletListVersion] = useState(0)

  const [wName, setWName] = useState('')
  const [wCategory, setWCategory] = useState<string>(WALLET_CATEGORIES[0])
  const [wAmount, setWAmount] = useState('')
  const [wDate, setWDate] = useState(() => toISO(new Date()))
  const [wNote, setWNote] = useState('')
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)

  useEffect(() => {
    void fetchWalletMonthKeys().then(({ data, error }) => {
      if (error) return
      if (data?.length) setExtraMonthKeys(data)
    })
  }, [])

  const monthKeysForAllFilter = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) {
      const d = parseISODate(t.date)
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    set.add(currentMonthKey)
    for (const m of extraMonthKeys) set.add(m)
    return [...set].sort()
  }, [transactions, extraMonthKeys, currentMonthKey])

  const refreshWalletSummary = useCallback(async () => {
    const mk = monthKeyFromDate(new Date())
    const [mwRes, entRes] = await Promise.all([
      fetchMonthlyWalletForMonth(mk),
      fetchWalletEntriesForMonth(mk),
    ])
    const err = mwRes.error || entRes.error
    setWalletSummaryError(err)
    const start = mwRes.data?.startingBalance ?? 0
    setSummaryStarting(start)
    setStartingInput(String(start))
    const spent = entRes.data.reduce((s, e) => s + e.amount, 0)
    setSummaryWalletSpent(spent)
  }, [])

  useEffect(() => {
    void refreshWalletSummary()
  }, [refreshWalletSummary])

  useEffect(() => {
    const ch = supabase
      .channel(`transactions-wallet-${currentMonthKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_entries', filter: `month=eq.${currentMonthKey}` },
        () => {
          void refreshWalletSummary()
          setWalletListVersion((v) => v + 1)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_wallet', filter: `month=eq.${currentMonthKey}` },
        () => {
          void refreshWalletSummary()
          setWalletListVersion((v) => v + 1)
        },
      )
      .subscribe()
    return () => void supabase.removeChannel(ch)
  }, [currentMonthKey, refreshWalletSummary])

  useEffect(() => {
    let cancelled = false
    const months = filterMonth === 'all' ? monthKeysForAllFilter : [filterMonth]
    void fetchWalletEntriesForMonths(months).then(({ data, error }) => {
      if (cancelled) return
      setWalletListEntries(data ?? [])
      setWalletListError(error)
    })
    return () => {
      cancelled = true
    }
  }, [filterMonth, monthKeysForAllFilter, walletListVersion])

  const usedTotal = summaryWalletSpent
  const remaining = summaryStarting - usedTotal
  const pctUsed = summaryStarting > 0 ? Math.min(100, (usedTotal / summaryStarting) * 100) : 0
  const isLow =
    remaining < 0 || (summaryStarting > 0 && remaining / summaryStarting < 0.1 && remaining >= 0)
  const summaryOk = remaining >= 0 && !isLow

  const monthChoices = useMemo(
    () => monthOptions(transactions, extraMonthKeys),
    [transactions, extraMonthKeys],
  )
  const recCategoriesForType = recType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const categoriesForType = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  /** Income only — expenses appear via wallet_entries to avoid duplicating dual-written rows. */
  const filteredIncomeTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.type !== 'income') return false
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (filterMonth === 'all') return true
      const d = parseISODate(t.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return key === filterMonth
    })
  }, [transactions, filterMonth, filterCategory])

  const filteredWallet = useMemo(() => {
    return walletListEntries.filter((w) => {
      if (filterCategory !== 'all' && w.category !== filterCategory) return false
      return true
    })
  }, [walletListEntries, filterCategory])

  const sortedDisplay = useMemo(() => {
    const rows: MergedRow[] = []
    for (const t of filteredIncomeTransactions) rows.push({ kind: 'income', t })
    for (const w of filteredWallet) rows.push({ kind: 'wallet', w })
    return rows.sort((a, b) => {
      const dateA = a.kind === 'income' ? a.t.date : a.w.date
      const dateB = b.kind === 'income' ? b.t.date : b.w.date
      if (dateA !== dateB) return dateA < dateB ? 1 : -1
      const tieA = a.kind === 'income' ? a.t.id : a.w.createdAt
      const tieB = b.kind === 'income' ? b.t.id : b.w.createdAt
      return tieB.localeCompare(tieA)
    })
  }, [filteredIncomeTransactions, filteredWallet])

  function resetForm() {
    setType('expense')
    setCategory(EXPENSE_CATEGORIES[0])
    setAmount('')
    setDate(toISO(new Date()))
    setNote('')
    setEditingId(null)
  }

  function resetWalletForm() {
    setWName('')
    setWCategory(WALLET_CATEGORIES[0])
    setWAmount('')
    setWDate(toISO(new Date()))
    setWNote('')
    setEditingWalletId(null)
  }

  async function saveStartingBalance() {
    const num = Number(String(startingInput).replace(/,/g, ''))
    if (!Number.isFinite(num) || num < 0) {
      showToast('กรุณากรอกยอดตั้งต้นที่ถูกต้อง')
      return
    }
    const mk = monthKeyFromDate(new Date())
    const floored = Math.floor(num)
    const { error } = await upsertMonthlyWalletStartingBalance(mk, floored)
    if (error) {
      showToast(error)
      return
    }
    setSummaryStarting(floored)
    showToast('บันทึกยอดตั้งต้นแล้ว')
  }

  function startEdit(t: Transaction) {
    setEditingId(t.id)
    setType(t.type)
    setCategory(t.category)
    setAmount(String(t.amount))
    setDate(t.date)
    setNote(t.note)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEditWallet(w: WalletEntry) {
    setEditingWalletId(w.id)
    setWName(w.name)
    setWCategory(w.category)
    setWAmount(String(w.amount))
    setWDate(w.date)
    setWNote(w.note)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(num) || num <= 0) {
      showToast('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }

    if (editingId) {
      updateTransaction(editingId, { type, category, amount: num, date, note })
      showToast('แก้ไขรายการแล้ว')
    } else {
      addTransaction({ type, category, amount: num, date, note })
      showToast('บันทึกรายการแล้ว')
    }
    resetForm()
  }

  async function handleWalletSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(wAmount.replace(/,/g, ''))
    if (!Number.isFinite(num) || num <= 0) {
      showToast('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    const trimmed = wName.trim()
    if (!trimmed) {
      showToast('กรุณากรอกชื่อรายการ')
      return
    }
    const month = monthKeyFromDate(parseISODate(wDate))
    if (editingWalletId) {
      const { error } = await updateWalletEntry(editingWalletId, {
        name: trimmed,
        category: wCategory,
        amount: Math.floor(num),
        date: wDate,
        note: wNote,
        month,
      })
      if (error) {
        showToast(error)
        return
      }
      showToast('แก้ไขรายการกระเป๋าแล้ว')
    } else {
      const entryData = {
        month,
        name: trimmed,
        category: wCategory,
        amount: Math.floor(num),
        date: wDate,
        note: wNote,
      }
      console.log('[DEBUG] Saving wallet entry:', entryData)
      const result = await insertWalletEntry(entryData)
      console.log('[DEBUG] Result:', result)
      if (result.error) {
        showToast(result.error)
        return
      }
      showToast('บันทึกรายจ่ายกระเป๋าแล้ว')
    }
    resetWalletForm()
    void refreshWalletSummary()
    setWalletListVersion((v) => v + 1)
  }

  function handleRecurringSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(recAmount.replace(/,/g, ''))
    if (!Number.isFinite(num) || num <= 0) {
      showToast('กรุณากรอกจำนวนเงินที่ถูกต้อง')
      return
    }
    const day = Number(recDay)
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      showToast('กรุณาระบุวันที่ 1–31')
      return
    }
    const trimmed = recName.trim()
    if (!trimmed) {
      showToast('กรุณากรอกชื่อรายการ')
      return
    }
    addRecurringItem({
      name: trimmed,
      amount: num,
      category: recCategory,
      type: recType,
      dayOfMonth: day,
      enabled: true,
    })
    showToast('เพิ่มรายการประจำแล้ว')
    setRecType('expense')
    setRecCategory(EXPENSE_CATEGORIES[0])
    setRecAmount('')
    setRecDay('1')
    setRecName('')
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">บันทึกรายรับ-รายจ่าย</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">เพิ่ม แก้ไข และกรองรายการของคุณ</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ยอดเงินเดือนนี้</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ยอดตั้งต้นจากตารางกระเป๋ารายเดือน — ใช้ร่วมกับหน้าหลักและรายงาน
        </p>

        {walletSummaryError ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            โหลดยอดกระเป๋าไม่สำเร็จ: {walletSummaryError}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[200px] text-sm">
            <span className="text-slate-600 dark:text-slate-400">ยอดตั้งต้นเดือนนี้ (บาท)</span>
            <input
              type="number"
              min={0}
              step={1}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={startingInput}
              onChange={(e) => setStartingInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void saveStartingBalance()}
            className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            บันทึกยอดตั้งต้น
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
            <div className="text-sm text-slate-500 dark:text-slate-400">ยอดตั้งต้น</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatTHB(summaryStarting)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800/50">
            <div className="text-sm text-slate-500 dark:text-slate-400">ใช้ไปแล้ว</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-red-700 dark:text-red-400">
              {formatTHB(usedTotal)}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">รายจ่ายจากกระเป๋าเงินสด (รายการเดียวกับตารางด้านล่าง)</p>
          </div>
          <div
            className={`rounded-lg border p-4 ${
              summaryOk
                ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30'
            }`}
          >
            <div className="text-sm text-slate-600 dark:text-slate-400">คงเหลือ</div>
            <div
              className={`mt-1 text-lg font-semibold tabular-nums ${
                summaryOk ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'
              }`}
            >
              {formatTHB(remaining)}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>สัดส่วนที่ใช้ไปแล้ว</span>
            <span className="tabular-nums">{summaryStarting > 0 ? `${pctUsed.toFixed(0)}%` : '—'}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${
                summaryOk ? 'bg-green-600 dark:bg-green-500' : 'bg-red-600 dark:bg-red-500'
              }`}
              style={{ width: `${summaryStarting > 0 ? pctUsed : 0}%` }}
            />
          </div>
        </div>
      </section>

      <form
        onSubmit={(e) => void handleWalletSubmit(e)}
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {editingWalletId ? 'แก้ไขรายจ่ายกระเป๋าเงิน' : 'บันทึกรายจ่ายจากกระเป๋าเงิน'}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          รายจ่ายสดในกระเป๋าเงินสดรายเดือน (แยกจากธุรกรรมหลักด้านล่าง)
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">ชื่อรายการ</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={wName}
              onChange={(e) => setWName(e.target.value)}
              placeholder="เช่น ค่าข้าวเที่ยง"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">หมวดหมู่</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={wCategory}
              onChange={(e) => setWCategory(e.target.value)}
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
              min={1}
              step={1}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={wAmount}
              onChange={(e) => setWAmount(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">วันที่</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={wDate}
              onChange={(e) => setWDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">หมายเหตุ</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={wNote}
              onChange={(e) => setWNote(e.target.value)}
              placeholder="ถ้ามี"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 dark:bg-teal-700 dark:hover:bg-teal-600"
          >
            {editingWalletId ? 'บันทึกการแก้ไขกระเป๋า' : 'บันทึกรายจ่ายกระเป๋า'}
          </button>
          {editingWalletId ? (
            <button
              type="button"
              onClick={resetWalletForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              ยกเลิกการแก้ไขกระเป๋า
            </button>
          ) : null}
        </div>
      </form>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">ประเภท</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={type}
              onChange={(e) => {
                const v = e.target.value as 'income' | 'expense'
                setType(v)
                setCategory(v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0])
              }}
            >
              <option value="income">รายรับ</option>
              <option value="expense">รายจ่าย</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">หมวดหมู่</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categoriesForType.map((c) => (
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
              min={1}
              step={1}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">วันที่</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">หมายเหตุ</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ค่าอาหารกลางวัน"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            {editingId ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              ยกเลิกการแก้ไข
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">รายการประจำ</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ระบบจะเพิ่มรายการเข้า “รายการทั้งหมด” อัตโนมัติเมื่อถึงวันที่ในเดือน (เดือนละครั้งต่อรายการ)
        </p>

        <form onSubmit={handleRecurringSubmit} className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">ชื่อ</span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={recName}
                onChange={(e) => setRecName(e.target.value)}
                placeholder="เช่น ค่าเช่า"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">ประเภท</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={recType}
                onChange={(e) => {
                  const v = e.target.value as 'income' | 'expense'
                  setRecType(v)
                  setRecCategory(v === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0])
                }}
              >
                <option value="income">รายรับ</option>
                <option value="expense">รายจ่าย</option>
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">หมวดหมู่</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
              >
                {recCategoriesForType.map((c) => (
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
                min={1}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={recAmount}
                onChange={(e) => setRecAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">วันที่ของเดือน (1–31)</span>
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={recDay}
                onChange={(e) => setRecDay(e.target.value)}
                required
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            เพิ่มรายการประจำ
          </button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">ชื่อ</th>
                <th className="py-2 pr-3 font-medium">ประเภท</th>
                <th className="py-2 pr-3 font-medium">หมวด</th>
                <th className="py-2 pr-3 font-medium text-right">จำนวน</th>
                <th className="py-2 pr-3 font-medium">วันที่</th>
                <th className="py-2 pr-3 font-medium">ใช้งาน</th>
                <th className="py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {recurringTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 dark:text-slate-400">
                    ยังไม่มีรายการประจำ
                  </td>
                </tr>
              ) : (
                recurringTransactions.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          r.type === 'income'
                            ? 'font-medium text-green-700 dark:text-green-400'
                            : 'font-medium text-red-700 dark:text-red-400'
                        }
                      >
                        {r.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{r.category}</td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${r.type === 'income' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
                    >
                      {r.type === 'income' ? '+' : '−'}
                      {formatTHB(r.amount)}
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">วันที่ {r.dayOfMonth}</td>
                    <td className="py-2 pr-3">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-700"
                          checked={r.enabled}
                          onChange={(e) => setRecurringEnabled(r.id, e.target.checked)}
                        />
                        <span className="text-slate-600 dark:text-slate-400">{r.enabled ? 'เปิด' : 'ปิด'}</span>
                      </label>
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          removeRecurringItem(r.id)
                          showToast('ลบรายการประจำแล้ว')
                        }}
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
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">รายการทั้งหมด</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              รายรับจากบันทึกหลัก · รายจ่ายแสดงจากกระเป๋าเงินสด (ครั้งเดียวต่อรายการ)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              เดือน
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              >
                <option value="all">ทุกเดือน</option>
                {monthChoices.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-400">
              หมวด
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">ทุกหมวด</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {walletListError ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            โหลดรายการกระเป๋าไม่สำเร็จ: {walletListError}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">วันที่</th>
                <th className="py-2 pr-3 font-medium">ประเภท</th>
                <th className="py-2 pr-3 font-medium">ชื่อรายการ</th>
                <th className="py-2 pr-3 font-medium">หมวดหมู่</th>
                <th className="py-2 pr-3 font-medium text-right">จำนวน</th>
                <th className="py-2 pr-3 font-medium">หมายเหตุ</th>
                <th className="py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplay.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    ไม่มีรายการตามตัวกรอง
                  </td>
                </tr>
              ) : (
                sortedDisplay.map((row) =>
                  row.kind === 'income' ? (
                    <tr key={`tx-${row.t.id}`} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{row.t.date}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium text-green-700 dark:text-green-400">รายรับ</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-500">—</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{row.t.category}</td>
                      <td className="py-2 pr-3 text-right font-medium text-green-700 dark:text-green-400">
                        +{formatTHB(row.t.amount)}
                      </td>
                      <td className="max-w-[180px] truncate py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {row.t.note}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row.t)}
                          className="mr-2 text-blue-700 hover:underline dark:text-sky-400"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeTransaction(row.t.id)
                            showToast('ลบรายการแล้ว')
                            if (editingId === row.t.id) resetForm()
                          }}
                          className="text-red-700 hover:underline dark:text-red-400"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`w-${row.w.id}`} className="border-b border-slate-100 dark:border-slate-700">
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{row.w.date}</td>
                      <td className="py-2 pr-3 font-medium text-red-700 dark:text-red-400">รายจ่าย</td>
                      <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{row.w.name}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{row.w.category}</td>
                      <td className="py-2 pr-3 text-right font-medium text-red-700 dark:text-red-400">
                        −{formatTHB(row.w.amount)}
                      </td>
                      <td className="max-w-[180px] truncate py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {row.w.note}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => startEditWallet(row.w)}
                          className="mr-2 text-blue-700 hover:underline dark:text-sky-400"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const { error } = await deleteWalletEntry(row.w.id)
                            if (error) {
                              showToast(error)
                              return
                            }
                            showToast('ลบรายการกระเป๋าแล้ว')
                            if (editingWalletId === row.w.id) resetWalletForm()
                            void refreshWalletSummary()
                            setWalletListVersion((v) => v + 1)
                          }}
                          className="text-red-700 hover:underline dark:text-red-400"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
