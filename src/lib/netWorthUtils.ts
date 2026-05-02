import type { Asset, Liability, NetWorthSnapshot } from '../types'

export function netWorthMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function computeNetWorthTotals(assets: Asset[], liabilities: Liability[]) {
  const totalAssets = assets.reduce((s, a) => s + a.value, 0)
  const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0)
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  }
}

export function upsertNetWorthSnapshot(
  history: NetWorthSnapshot[],
  snapshot: NetWorthSnapshot,
): NetWorthSnapshot[] {
  const i = history.findIndex((h) => h.monthKey === snapshot.monthKey)
  if (i === -1) {
    return [...history, snapshot].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  }
  const next = [...history]
  next[i] = snapshot
  return next
}
