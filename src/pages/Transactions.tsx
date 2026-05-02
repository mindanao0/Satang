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
  const { transactions, addTransaction, updateTransaction, removeTransaction } = useFinance()
  const { showToast } = useToast()

  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => toISO(new Date()))
  const [note, setNote] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)

  const monthChoices = useMemo(() => monthOptions(transactions), [transactions])

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">บันทึกรายรับ-รายจ่าย</h1>
        <p className="mt-1 text-slate-600">เพิ่ม แก้ไข และกรองรายการของคุณ</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-600">ประเภท</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
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
            <span className="text-slate-600">หมวดหมู่</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
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
            <span className="text-slate-600">จำนวนเงิน (บาท)</span>
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">วันที่</span>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-slate-600">หมายเหตุ</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น ค่าอาหารกลางวัน"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            {editingId ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              ยกเลิกการแก้ไข
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">รายการทั้งหมด</h2>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-slate-600">
              เดือน
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
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
            <label className="text-sm text-slate-600">
              หมวด
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-900"
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
              <tr className="border-b border-slate-200 text-slate-500">
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
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    ไม่มีรายการตามตัวกรอง
                  </td>
                </tr>
              ) : (
                sortedDisplay.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700">{t.date}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          t.type === 'income'
                            ? 'font-medium text-green-700'
                            : 'font-medium text-red-700'
                        }
                      >
                        {t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{t.category}</td>
                    <td
                      className={`py-2 pr-3 text-right font-medium ${t.type === 'income' ? 'text-green-700' : 'text-red-700'}`}
                    >
                      {t.type === 'income' ? '+' : '−'}
                      {formatTHB(t.amount)}
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-3 text-slate-600">{t.note}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="mr-2 text-blue-700 hover:underline"
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
                        className="text-red-700 hover:underline"
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
