import { useEffect, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import { EXPENSE_CATEGORIES } from '../types'
import type { BudgetLimits, ExpenseCategory } from '../types'

function draftFromLimits(limits: BudgetLimits): Record<ExpenseCategory, string> {
  const d = {} as Record<ExpenseCategory, string>
  for (const c of EXPENSE_CATEGORIES) {
    const v = limits[c]
    d[c] = v != null && v > 0 ? String(v) : ''
  }
  return d
}

export function Budget() {
  const { budgetLimits, setBudgetLimits } = useFinance()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Record<ExpenseCategory, string>>(() =>
    draftFromLimits(budgetLimits),
  )

  useEffect(() => {
    setDraft(draftFromLimits(budgetLimits))
  }, [budgetLimits])

  function setField(cat: ExpenseCategory, value: string) {
    setDraft((prev) => ({ ...prev, [cat]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next: BudgetLimits = {}
    for (const c of EXPENSE_CATEGORIES) {
      const raw = draft[c].replace(/,/g, '').trim()
      if (!raw) continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) {
        showToast(`กรุณากรอกตัวเลขที่ถูกต้องสำหรับ “${c}”`)
        return
      }
      next[c] = Math.floor(n)
    }
    setBudgetLimits(next)
    showToast('บันทึกงบประมาณแล้ว')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">งบประมาณ</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          กำหนดเพดานรายจ่ายรายเดือนตามหมวด (เฉพาะรายจ่าย)
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ตั้งงบประมาณ</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          ใส่จำนวนเงินสูงสุดต่อเดือนในแต่ละหมวด ว่าง = ไม่จำกัด (ไม่แสดงบนหน้าหลัก)
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXPENSE_CATEGORIES.map((cat) => (
            <label key={cat} className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">{cat}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={draft[cat]}
                onChange={(e) => setField(cat, e.target.value)}
                placeholder="ไม่จำกัด"
              />
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="mt-6 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 dark:bg-sky-700 dark:hover:bg-sky-600"
        >
          บันทึกงบประมาณ
        </button>
      </form>
    </div>
  )
}
