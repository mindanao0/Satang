import type { RecurringTransaction, Transaction } from '../types'
import { parseISODate, toISO } from './format'

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

export function dueDateForMonth(rec: RecurringTransaction, now: Date): string {
  const y = now.getFullYear()
  const m = now.getMonth()
  const dim = daysInMonth(y, m)
  const d = Math.min(rec.dayOfMonth, dim)
  return toISO(new Date(y, m, d))
}

export function isRecurringDueInCurrentMonth(rec: RecurringTransaction, now: Date): boolean {
  const y = now.getFullYear()
  const m = now.getMonth()
  const dim = daysInMonth(y, m)
  const d = Math.min(rec.dayOfMonth, dim)
  const due = new Date(y, m, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return today >= due
}

export function hasRecurringInstanceInMonth(
  transactions: Transaction[],
  recurringId: string,
  year: number,
  monthIndex0: number,
): boolean {
  return transactions.some((t) => {
    if (t.recurringSourceId !== recurringId) return false
    const dt = parseISODate(t.date)
    return dt.getFullYear() === year && dt.getMonth() === monthIndex0
  })
}

/** New transaction rows to append so current month is covered (idempotent per recurring id + month). */
export function buildDueRecurringTransactions(
  existing: Transaction[],
  recurringList: RecurringTransaction[],
  now: Date = new Date(),
): Transaction[] {
  const y = now.getFullYear()
  const m = now.getMonth()
  const out: Transaction[] = []
  for (const rec of recurringList) {
    if (!rec.enabled) continue
    if (!isRecurringDueInCurrentMonth(rec, now)) continue
    if (hasRecurringInstanceInMonth(existing, rec.id, y, m)) continue
    out.push({
      id: crypto.randomUUID(),
      type: rec.type,
      category: rec.category,
      amount: rec.amount,
      date: dueDateForMonth(rec, now),
      note: rec.name,
      recurringSourceId: rec.id,
    })
  }
  return out
}
