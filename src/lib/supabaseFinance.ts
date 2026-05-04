import type {
  BudgetLimits,
  ExpenseCategory,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserProfile,
} from '../types'
import { EXPENSE_CATEGORIES } from '../types'
import { insertWalletEntry, walletEntryPayloadFromExpense } from './supabaseWallet'
import { supabase } from './supabase'

/** Build a single UI/toast string from a PostgREST/Supabase error (message, details, hint, code). */
export function formatSupabaseError(
  err: { message: string; details?: string; hint?: string; code?: string } | null,
): string | null {
  if (!err) return null
  const parts: string[] = [err.message]
  if (err.details) parts.push(`Details: ${err.details}`)
  if (err.hint) parts.push(`Hint: ${err.hint}`)
  if (err.code) parts.push(`Code: ${err.code}`)
  return parts.join(' · ')
}

export function cloneDefaultUserProfile(): UserProfile {
  return {
    salary: 0,
    taxDeductions: {
      personalAllowance: 60_000,
      socialSecurity: 0,
      lifeInsurance: 0,
      ssf: 0,
      rmf: 0,
    },
  }
}

const defaultProfile = cloneDefaultUserProfile()

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function mapRowToTransaction(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.id ?? ''),
    type: r.type === 'income' ? 'income' : 'expense',
    category: String(r.category ?? ''),
    amount: num(r.amount),
    date: String(r.date ?? ''),
    note: String(r.note ?? ''),
    recurringSourceId:
      r.recurring_source_id != null && String(r.recurring_source_id).length > 0
        ? String(r.recurring_source_id)
        : undefined,
  }
}

export function transactionToRow(t: Transaction): Record<string, unknown> {
  return {
    id: t.id,
    type: t.type,
    category: t.category,
    amount: t.amount,
    date: t.date,
    note: t.note,
    recurring_source_id: t.recurringSourceId ?? null,
  }
}

export function mapRowToRecurring(r: Record<string, unknown>): RecurringTransaction {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    amount: num(r.amount),
    category: String(r.category ?? ''),
    type: r.type === 'income' ? 'income' : 'expense',
    dayOfMonth: Math.min(31, Math.max(1, Math.floor(num(r.day_of_month)) || 1)),
    enabled: r.enabled !== false,
  }
}

export function recurringToRow(r: RecurringTransaction): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    category: r.category,
    type: r.type,
    day_of_month: r.dayOfMonth,
    enabled: r.enabled,
  }
}

export function mapRowToSavingsGoal(r: Record<string, unknown>): SavingsGoal {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    targetAmount: num(r.target_amount),
    currentAmount: num(r.current_amount),
    targetDate: String(r.target_date ?? ''),
    monthlyContribution: num(r.monthly_contribution),
  }
}

export function savingsGoalToRow(g: SavingsGoal): Record<string, unknown> {
  return {
    id: g.id,
    name: g.name,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    target_date: g.targetDate,
    monthly_contribution: g.monthlyContribution,
  }
}

function definedNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = typeof v === 'string' ? Number(v) : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function mapRowToUserProfile(r: Record<string, unknown>): UserProfile {
  const td = r.tax_deductions as Record<string, unknown> | null | undefined
  return {
    salary: num(r.salary),
    taxDeductions: {
      personalAllowance:
        definedNum(r.personal_allowance) ??
        (td?.personalAllowance != null ? num(td.personalAllowance) : undefined) ??
        defaultProfile.taxDeductions.personalAllowance,
      socialSecurity: definedNum(r.social_security) ?? num(td?.socialSecurity),
      lifeInsurance: definedNum(r.life_insurance) ?? num(td?.lifeInsurance),
      ssf: definedNum(r.ssf) ?? num(td?.ssf),
      rmf: definedNum(r.rmf) ?? num(td?.rmf),
    },
  }
}

/** Insert/update payload for `user_profile` (never includes `id`). */
function userProfileDbPayload(p: UserProfile) {
  const td = p.taxDeductions
  return {
    salary: p.salary,
    tax_deductions: td,
    personal_allowance: td.personalAllowance,
    social_security: td.socialSecurity,
    life_insurance: td.lifeInsurance,
    ssf: td.ssf,
    rmf: td.rmf,
  }
}

export function budgetRowsToLimits(rows: Record<string, unknown>[]): BudgetLimits {
  const out: BudgetLimits = {}
  for (const r of rows) {
    const cat = String(r.category ?? '')
    if (!EXPENSE_CATEGORIES.includes(cat as ExpenseCategory)) continue
    const n = Math.floor(num(r.amount))
    if (n > 0) out[cat as ExpenseCategory] = n
  }
  return out
}

export type FinanceBootstrap = {
  transactions: Transaction[]
  profile: UserProfile
  savingsGoals: SavingsGoal[]
  recurringTransactions: RecurringTransaction[]
  budgetLimits: BudgetLimits
}

export async function fetchFinanceBootstrap(): Promise<
  { ok: true; data: FinanceBootstrap } | { ok: false; error: string }
> {
  const [txRes, profileRes, goalsRes, recRes, limitsRes] = await Promise.all([
    supabase.from('transactions').select('*').order('date', { ascending: false }),
    supabase.from('user_profile').select('*').limit(1),
    supabase.from('savings_goals').select('*'),
    supabase.from('recurring_transactions').select('*'),
    supabase.from('budget_limits').select('*'),
  ])

  const firstErr =
    txRes.error?.message ||
    profileRes.error?.message ||
    goalsRes.error?.message ||
    recRes.error?.message ||
    limitsRes.error?.message

  if (firstErr) return { ok: false, error: firstErr }

  const profileRow = (profileRes.data ?? [])[0]
  const profile = profileRow
    ? mapRowToUserProfile(profileRow as Record<string, unknown>)
    : cloneDefaultUserProfile()

  return {
    ok: true,
    data: {
      transactions: (txRes.data ?? []).map((r) => mapRowToTransaction(r as Record<string, unknown>)),
      profile,
      savingsGoals: (goalsRes.data ?? []).map((r) => mapRowToSavingsGoal(r as Record<string, unknown>)),
      recurringTransactions: (recRes.data ?? []).map((r) =>
        mapRowToRecurring(r as Record<string, unknown>),
      ),
      budgetLimits: budgetRowsToLimits((limitsRes.data ?? []) as Record<string, unknown>[]),
    },
  }
}

export async function insertTransactions(
  rows: Transaction[],
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null }
  const { error } = await supabase.from('transactions').insert(rows.map(transactionToRow))
  if (error) return { error: error.message }

  const expenses = rows.filter((t) => t.type === 'expense')
  for (const t of expenses) {
    const { error: walletErr } = await insertWalletEntry(walletEntryPayloadFromExpense(t))
    if (walletErr) {
      await supabase.from('transactions').delete().in(
        'id',
        rows.map((r) => r.id),
      )
      return { error: walletErr }
    }
  }
  return { error: null }
}

export async function insertTransaction(t: Transaction): Promise<{ error: string | null }> {
  return insertTransactions([t])
}

export async function updateTransactionDb(
  id: string,
  patch: Partial<Transaction>,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {}
  if (patch.type !== undefined) row.type = patch.type
  if (patch.category !== undefined) row.category = patch.category
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.date !== undefined) row.date = patch.date
  if (patch.note !== undefined) row.note = patch.note
  if (patch.recurringSourceId !== undefined) row.recurring_source_id = patch.recurringSourceId ?? null
  if (Object.keys(row).length === 0) return { error: null }
  const { error } = await supabase.from('transactions').update(row).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteTransactionDb(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function replaceAllTransactions(
  txs: Transaction[],
): Promise<{ error: string | null }> {
  const { data: existing, error: selErr } = await supabase.from('transactions').select('id')
  if (selErr) return { error: selErr.message }
  const keep = new Set(txs.map((t) => t.id))
  const toDel = (existing ?? []).map((r) => String((r as { id: string }).id)).filter((id) => !keep.has(id))
  if (toDel.length) {
    const { error } = await supabase.from('transactions').delete().in('id', toDel)
    if (error) return { error: error.message }
  }
  if (txs.length === 0) return { error: null }
  const { error } = await supabase.from('transactions').upsert(txs.map(transactionToRow))
  return { error: error?.message ?? null }
}

export async function upsertUserProfile(p: UserProfile): Promise<{ error: string | null }> {
  const payload = userProfileDbPayload(p)
  console.log('[Supabase] user_profile save payload:', JSON.stringify(payload, null, 2))

  console.log('[DEBUG] Starting upsertUserProfile')

  const { data: existing, error: selErr } = await supabase
    .from('user_profile')
    .select('id')
    .limit(1)
    .maybeSingle()

  console.log('[DEBUG] existing row:', JSON.stringify(existing))

  if (selErr) {
    console.log('[DEBUG] Error:', JSON.stringify(selErr))
    return { error: formatSupabaseError(selErr) }
  }

  if (existing) {
    console.log('[DEBUG] Updating id:', existing.id, 'payload:', JSON.stringify(payload))
    const { error } = await supabase.from('user_profile').update(payload).eq('id', existing.id)
    if (error) console.log('[DEBUG] Error:', JSON.stringify(error))
    return { error: formatSupabaseError(error) }
  }

  console.log('[DEBUG] Inserting payload:', JSON.stringify(payload))
  const { error } = await supabase.from('user_profile').insert(payload)
  if (error) console.log('[DEBUG] Error:', JSON.stringify(error))
  return { error: formatSupabaseError(error) }
}

export async function insertRecurring(
  r: RecurringTransaction,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recurring_transactions').insert(recurringToRow(r))
  return { error: error?.message ?? null }
}

export async function updateRecurringDb(
  id: string,
  patch: Partial<RecurringTransaction>,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.amount !== undefined) row.amount = patch.amount
  if (patch.category !== undefined) row.category = patch.category
  if (patch.type !== undefined) row.type = patch.type
  if (patch.dayOfMonth !== undefined) row.day_of_month = patch.dayOfMonth
  if (patch.enabled !== undefined) row.enabled = patch.enabled
  if (Object.keys(row).length === 0) return { error: null }
  const { error } = await supabase.from('recurring_transactions').update(row).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteRecurringDb(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recurring_transactions').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function replaceAllRecurring(
  list: RecurringTransaction[],
): Promise<{ error: string | null }> {
  const { data: existing, error: selErr } = await supabase.from('recurring_transactions').select('id')
  if (selErr) return { error: selErr.message }
  const keep = new Set(list.map((r) => r.id))
  const toDel = (existing ?? []).map((r) => String((r as { id: string }).id)).filter((id) => !keep.has(id))
  if (toDel.length) {
    const { error } = await supabase.from('recurring_transactions').delete().in('id', toDel)
    if (error) return { error: error.message }
  }
  if (list.length === 0) return { error: null }
  const { error } = await supabase.from('recurring_transactions').upsert(list.map(recurringToRow))
  return { error: error?.message ?? null }
}

export async function upsertSavingsGoal(g: SavingsGoal): Promise<{ error: string | null }> {
  const { error } = await supabase.from('savings_goals').upsert(savingsGoalToRow(g))
  return { error: error?.message ?? null }
}

export async function deleteSavingsGoalDb(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function replaceAllSavingsGoals(
  goals: SavingsGoal[],
): Promise<{ error: string | null }> {
  const { data: existing, error: selErr } = await supabase.from('savings_goals').select('id')
  if (selErr) return { error: selErr.message }
  const keep = new Set(goals.map((g) => g.id))
  const toDel = (existing ?? []).map((r) => String((r as { id: string }).id)).filter((id) => !keep.has(id))
  if (toDel.length) {
    const { error } = await supabase.from('savings_goals').delete().in('id', toDel)
    if (error) return { error: error.message }
  }
  if (goals.length === 0) return { error: null }
  const { error } = await supabase.from('savings_goals').upsert(goals.map(savingsGoalToRow))
  return { error: error?.message ?? null }
}

export async function persistBudgetLimits(limits: BudgetLimits): Promise<{ error: string | null }> {
  const trimmed: Record<string, number> = {}
  for (const cat of EXPENSE_CATEGORIES) {
    const v = limits[cat]
    if (v != null && Number.isFinite(v) && v > 0) trimmed[cat] = Math.floor(Number(v))
  }

  const { data: existing, error: selErr } = await supabase.from('budget_limits').select('category')
  if (selErr) return { error: selErr.message }

  const nextCats = new Set(Object.keys(trimmed))
  const toDelete = (existing ?? [])
    .map((r) => String((r as { category: string }).category))
    .filter((c) => EXPENSE_CATEGORIES.includes(c as ExpenseCategory) && !nextCats.has(c))

  if (toDelete.length) {
    const { error } = await supabase.from('budget_limits').delete().in('category', toDelete)
    if (error) return { error: error.message }
  }

  const rows = Object.entries(trimmed).map(([category, amount]) => ({ category, amount }))
  if (rows.length === 0) return { error: null }

  const { error } = await supabase.from('budget_limits').upsert(rows, { onConflict: 'category' })
  return { error: error?.message ?? null }
}
