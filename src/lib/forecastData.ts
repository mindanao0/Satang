import type { Transaction } from '../types'
import { parseISODate } from './format'

/** Inclusive calendar months: current month and the two before (3 months). */
export function transactionInLastThreeMonths(t: Transaction, now: Date = new Date()): boolean {
  if (t.type !== 'expense') return false
  const d = parseISODate(t.date)
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m - 2, 1)
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999)
  return d >= start && d <= end
}

export function filterLastThreeMonthsExpenses(
  transactions: Transaction[],
  now: Date = new Date(),
): Transaction[] {
  return transactions.filter((t) => transactionInLastThreeMonths(t, now))
}

export function expenseTotalsByCategoryForMonth(
  transactions: Transaction[],
  year: number,
  monthIndex0: number,
): Record<string, number> {
  const by: Record<string, number> = {}
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    const d = parseISODate(t.date)
    if (d.getFullYear() !== year || d.getMonth() !== monthIndex0) continue
    by[t.category] = (by[t.category] ?? 0) + t.amount
  }
  return by
}

/** Parse trailing `FORECAST_JSON:{...}` line from model output. */
export function splitForecastResponse(full: string): {
  narrative: string
  forecast: Record<string, number> | null
} {
  const trimmed = full.trimEnd()
  const idx = trimmed.lastIndexOf('\n')
  const lastLine = (idx === -1 ? trimmed : trimmed.slice(idx + 1)).trim()
  if (!lastLine.startsWith('FORECAST_JSON:')) {
    return { narrative: full.trimEnd(), forecast: null }
  }
  const jsonStr = lastLine.slice('FORECAST_JSON:'.length).trim()
  try {
    const parsed = JSON.parse(jsonStr) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { narrative: trimmed.slice(0, idx === -1 ? 0 : idx).trimEnd(), forecast: null }
    }
    const forecast: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) forecast[k] = Math.round(n)
    }
    const narrative = (idx === -1 ? '' : trimmed.slice(0, idx)).trimEnd()
    return { narrative: narrative || '—', forecast: Object.keys(forecast).length ? forecast : null }
  } catch {
    return { narrative: trimmed.slice(0, idx === -1 ? 0 : idx).trimEnd() || full.trimEnd(), forecast: null }
  }
}
