import { supabase } from './supabase'

export const WALLET_CATEGORIES = [
  'อาหาร',
  'เดินทาง',
  'ที่พัก',
  'ความบันเทิง',
  'สุขภาพ',
  'การศึกษา',
  'ช้อปปิ้ง',
  'อื่นๆ',
] as const

export type WalletCategory = (typeof WALLET_CATEGORIES)[number]

export type MonthlyWallet = {
  id: string
  month: string
  startingBalance: number
  createdAt: string
}

export type WalletEntry = {
  id: string
  month: string
  name: string
  category: string
  amount: number
  date: string
  note: string
  createdAt: string
}

export type WalletCategoryBudget = {
  id: string
  month: string
  category: string
  budget: number
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function monthKeyFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function mapRowToMonthlyWallet(r: Record<string, unknown>): MonthlyWallet {
  return {
    id: String(r.id ?? ''),
    month: String(r.month ?? ''),
    startingBalance: num(r.starting_balance),
    createdAt: String(r.created_at ?? ''),
  }
}

export function mapRowToWalletEntry(r: Record<string, unknown>): WalletEntry {
  return {
    id: String(r.id ?? ''),
    month: String(r.month ?? ''),
    name: String(r.name ?? ''),
    category: String(r.category ?? ''),
    amount: num(r.amount),
    date: String(r.date ?? ''),
    note: r.note != null ? String(r.note) : '',
    createdAt: String(r.created_at ?? ''),
  }
}

export function mapRowToCategoryBudget(r: Record<string, unknown>): WalletCategoryBudget {
  return {
    id: String(r.id ?? ''),
    month: String(r.month ?? ''),
    category: String(r.category ?? ''),
    budget: num(r.budget),
  }
}

export async function fetchMonthlyWalletForMonth(
  month: string,
): Promise<{ data: MonthlyWallet | null; error: string | null }> {
  const { data, error } = await supabase.from('monthly_wallet').select('*').eq('month', month).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data ? mapRowToMonthlyWallet(data as Record<string, unknown>) : null, error: null }
}

export async function upsertMonthlyWalletStartingBalance(
  month: string,
  startingBalance: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('monthly_wallet').upsert(
    { month, starting_balance: startingBalance },
    { onConflict: 'month' },
  )
  return { error: error?.message ?? null }
}

export async function fetchWalletEntriesForMonths(
  months: string[],
): Promise<{ data: WalletEntry[]; error: string | null }> {
  if (months.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('wallet_entries')
    .select('*')
    .in('month', months)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []).map((r) => mapRowToWalletEntry(r as Record<string, unknown>)), error: null }
}

export async function fetchWalletEntriesForMonth(
  month: string,
): Promise<{ data: WalletEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('wallet_entries')
    .select('*')
    .eq('month', month)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []).map((r) => mapRowToWalletEntry(r as Record<string, unknown>)), error: null }
}

export async function insertWalletEntry(entry: {
  month: string
  name: string
  category: string
  amount: number
  date: string
  note: string
}): Promise<{ data: WalletEntry | null; error: string | null }> {
  const { data, error } = await supabase
    .from('wallet_entries')
    .insert({
      month: entry.month,
      name: entry.name,
      category: entry.category,
      amount: entry.amount,
      date: entry.date,
      note: entry.note || null,
    })
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: mapRowToWalletEntry(data as Record<string, unknown>), error: null }
}

export async function updateWalletEntry(
  id: string,
  patch: Partial<Pick<WalletEntry, 'name' | 'category' | 'amount' | 'date' | 'note' | 'month'>>,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.category !== undefined) row.category = patch.category
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.date !== undefined) row.date = patch.date
  if (patch.note !== undefined) row.note = patch.note || null
  if (patch.month !== undefined) row.month = patch.month
  if (Object.keys(row).length === 0) return { error: null }
  const { error } = await supabase.from('wallet_entries').update(row).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteWalletEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('wallet_entries').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function fetchWalletCategoryBudgetsForMonth(
  month: string,
): Promise<{ data: WalletCategoryBudget[]; error: string | null }> {
  const { data, error } = await supabase.from('wallet_category_budgets').select('*').eq('month', month)
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []).map((r) => mapRowToCategoryBudget(r as Record<string, unknown>)), error: null }
}

export async function persistWalletCategoryBudgets(
  month: string,
  budgets: Record<string, number>,
): Promise<{ error: string | null }> {
  const rows: { month: string; category: string; budget: number }[] = []
  for (const cat of WALLET_CATEGORIES) {
    const v = budgets[cat]
    if (v != null && Number.isFinite(v) && v > 0) {
      rows.push({ month, category: cat, budget: Math.floor(Number(v)) })
    }
  }

  const { data: existing, error: selErr } = await supabase
    .from('wallet_category_budgets')
    .select('category')
    .eq('month', month)
  if (selErr) return { error: selErr.message }

  const nextCats = new Set(rows.map((r) => r.category))
  const toDelete = (existing ?? [])
    .map((r) => String((r as { category: string }).category))
    .filter((c) => WALLET_CATEGORIES.includes(c as WalletCategory) && !nextCats.has(c))

  if (toDelete.length) {
    const { error } = await supabase
      .from('wallet_category_budgets')
      .delete()
      .eq('month', month)
      .in('category', toDelete)
    if (error) return { error: error.message }
  }

  if (rows.length === 0) return { error: null }
  const { error } = await supabase
    .from('wallet_category_budgets')
    .upsert(rows, { onConflict: 'month,category' })
  return { error: error?.message ?? null }
}

export async function fetchWalletMonthKeys(): Promise<{ data: string[]; error: string | null }> {
  const [w, e, b] = await Promise.all([
    supabase.from('monthly_wallet').select('month'),
    supabase.from('wallet_entries').select('month'),
    supabase.from('wallet_category_budgets').select('month'),
  ])
  const err = w.error?.message || e.error?.message || b.error?.message
  if (err) return { data: [], error: err }
  const set = new Set<string>()
  for (const rows of [w.data, e.data, b.data]) {
    for (const row of rows ?? []) {
      const m = (row as { month?: string }).month
      if (m) set.add(m)
    }
  }
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    set.add(monthKeyFromDate(d))
  }
  return { data: [...set].sort((a, b) => b.localeCompare(a)), error: null }
}
