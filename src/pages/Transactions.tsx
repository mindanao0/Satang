import { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction } from '../types'
import { formatTHB, parseISODate, toISO } from '../lib/format'

function monthOptions(transactions: Transaction[]): { value: string; label: string }[] {
  const set = new Set<string>()
  for (const t of transactions) {
    const d = parseISODate(t.date)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    set.add(v)
  }
  const now = new Date()
  set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const sorted = [...set].sort().reverse()
  return sorted.map((v) => {
    const [y, m] = v.split('-').map(Number)
    return { value: v, label: `${m}/${y + 543}` }
  })
}

const allCategories = [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])]

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

  const monthChoices = useMemo(() => monthOptions(transactions), [transactions])
  const recCategoriesForType = recType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const categoriesForType = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      if (filterMonth === 'all') return true
      const d = parseISODate(t.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return key === filterMonth
    })
  }, [transactions, filterMonth, filterCategory])

  const sortedDisplay = useMemo(() => {
    return [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [filtered])

  function resetForm() {
    setType('expense')
    setCategory(EXPENSE_CATEGORIES[0])
    setAmount('')
    setDate(toISO(new Date()))
    setNote('')
    setEditingId(null)
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
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">รายการทั้งหมด</h2>
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

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">วันที่</th>
                <th className="py-2 pr-3 font-medium">ประเภท</th>
                <th className="py-2 pr-3 font-medium">หมวด</th>
                <th className="py-2 pr-3 font-medium text-right">จำนวน</th>
                <th className="py-2 pr-3 font-medium">หมายเหตุ</th>
                <th className="py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {sortedDisplay.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    ไม่มีรายการตามตัวกรอง
                  </td>
                </tr>
              ) : (
                sortedDisplay.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{t.date}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          t.type === 'income'
                            ? 'font-medium text-green-700 dark:text-green-400'
                            : 'font-medium text-red-700 dark:text-red-400'
                        }
                      >
                        {t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{t.category}</td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${t.type === 'income' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
                    >
                      {t.type === 'income' ? '+' : '−'}
                      {formatTHB(t.amount)}
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-3 text-slate-600 dark:text-slate-400">{t.note}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="mr-2 text-blue-700 hover:underline dark:text-sky-400"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeTransaction(t.id)
                          showToast('ลบรายการแล้ว')
                          if (editingId === t.id) resetForm()
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
    </div>
  )
}
