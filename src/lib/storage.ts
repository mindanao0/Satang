import type {
  Asset,
  BudgetLimits,
  ExpenseCategory,
  GoogleSheetsSyncSettings,
  Liability,
  NetWorthSnapshot,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserProfile,
} from '../types'
import {
  ASSET_TYPES,
  EXPENSE_CATEGORIES,
  LIABILITY_TYPES,
} from '../types'

const KEYS = {
  transactions: 'satang_transactions',
  profile: 'satang_profile',
  goals: 'satang_savings_goals',
  recurringTransactions: 'recurringTransactions',
  budgetLimits: 'budgetLimits',
  assets: 'assets',
  liabilities: 'liabilities',
  netWorthHistory: 'netWorthHistory',
  googleSheetsSync: 'googleSheetsSync',
} as const

const defaultProfile: UserProfile = {
  salary: 0,
  taxDeductions: {
    personalAllowance: 60_000,
    socialSecurity: 0,
    lifeInsurance: 0,
    ssf: 0,
    rmf: 0,
  },
}

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(KEYS.transactions)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Transaction[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveTransactions(t: Transaction[]) {
  localStorage.setItem(KEYS.transactions, JSON.stringify(t))
}

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(KEYS.profile)
    if (!raw) return { ...defaultProfile, taxDeductions: { ...defaultProfile.taxDeductions } }
    const parsed = JSON.parse(raw) as UserProfile
    const td = parsed.taxDeductions
    return {
      salary: Number(parsed.salary) || 0,
      taxDeductions: {
        personalAllowance:
          td?.personalAllowance != null ? Number(td.personalAllowance) : 60_000,
        socialSecurity: Number(td?.socialSecurity) || 0,
        lifeInsurance: Number(td?.lifeInsurance) || 0,
        ssf: Number(td?.ssf) || 0,
        rmf: Number(td?.rmf) || 0,
      },
    }
  } catch {
    return { ...defaultProfile, taxDeductions: { ...defaultProfile.taxDeductions } }
  }
}

export function saveProfile(p: UserProfile) {
  localStorage.setItem(KEYS.profile, JSON.stringify(p))
}

export function loadGoals(): SavingsGoal[] {
  try {
    const raw = localStorage.getItem(KEYS.goals)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavingsGoal[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGoals(g: SavingsGoal[]) {
  localStorage.setItem(KEYS.goals, JSON.stringify(g))
}

export function loadRecurringTransactions(): RecurringTransaction[] {
  try {
    const raw = localStorage.getItem(KEYS.recurringTransactions)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecurringTransaction[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      amount: Number(r.amount) || 0,
      category: String(r.category ?? ''),
      type: r.type === 'income' ? 'income' : 'expense',
      dayOfMonth: Math.min(31, Math.max(1, Number(r.dayOfMonth) || 1)),
      enabled: r.enabled !== false,
    }))
  } catch {
    return []
  }
}

export function saveRecurringTransactions(r: RecurringTransaction[]) {
  localStorage.setItem(KEYS.recurringTransactions, JSON.stringify(r))
}

export function loadBudgetLimits(): BudgetLimits {
  try {
    const raw = localStorage.getItem(KEYS.budgetLimits)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: BudgetLimits = {}
    for (const cat of EXPENSE_CATEGORIES) {
      const v = parsed[cat]
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) out[cat as ExpenseCategory] = Math.floor(n)
    }
    return out
  } catch {
    return {}
  }
}

export function saveBudgetLimits(limits: BudgetLimits) {
  const trimmed: Record<string, number> = {}
  for (const cat of EXPENSE_CATEGORIES) {
    const v = limits[cat]
    if (v != null && Number.isFinite(v) && v > 0) trimmed[cat] = Math.floor(Number(v))
  }
  localStorage.setItem(KEYS.budgetLimits, JSON.stringify(trimmed))
}

function normalizeAssetType(t: string): Asset['type'] {
  return ASSET_TYPES.includes(t as Asset['type']) ? (t as Asset['type']) : 'อื่นๆ'
}

function normalizeLiabilityType(t: string): Liability['type'] {
  return LIABILITY_TYPES.includes(t as Liability['type']) ? (t as Liability['type']) : 'อื่นๆ'
}

export function loadAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(KEYS.assets)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Asset[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((a) => ({
      id: String(a.id),
      name: String(a.name ?? ''),
      value: Math.max(0, Number(a.value) || 0),
      type: normalizeAssetType(String(a.type ?? '')),
    }))
  } catch {
    return []
  }
}

export function saveAssets(items: Asset[]) {
  localStorage.setItem(KEYS.assets, JSON.stringify(items))
}

export function loadLiabilities(): Liability[] {
  try {
    const raw = localStorage.getItem(KEYS.liabilities)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Liability[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((l) => ({
      id: String(l.id),
      name: String(l.name ?? ''),
      amount: Math.max(0, Number(l.amount) || 0),
      type: normalizeLiabilityType(String(l.type ?? '')),
    }))
  } catch {
    return []
  }
}

export function saveLiabilities(items: Liability[]) {
  localStorage.setItem(KEYS.liabilities, JSON.stringify(items))
}

export function loadNetWorthHistory(): NetWorthSnapshot[] {
  try {
    const raw = localStorage.getItem(KEYS.netWorthHistory)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NetWorthSnapshot[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((s) => ({
        monthKey: String(s.monthKey ?? ''),
        netWorth: Number(s.netWorth) || 0,
        totalAssets: Math.max(0, Number(s.totalAssets) || 0),
        totalLiabilities: Math.max(0, Number(s.totalLiabilities) || 0),
      }))
      .filter((s) => /^\d{4}-\d{2}$/.test(s.monthKey))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
  } catch {
    return []
  }
}

export function saveNetWorthHistory(history: NetWorthSnapshot[]) {
  localStorage.setItem(KEYS.netWorthHistory, JSON.stringify(history))
}

const defaultGoogleSheetsSync: GoogleSheetsSyncSettings = {
  scriptUrl: '',
  sheetId: '',
  autoSync: false,
  lastSyncAt: null,
}

export function loadGoogleSheetsSyncSettings(): GoogleSheetsSyncSettings {
  try {
    const raw = localStorage.getItem(KEYS.googleSheetsSync)
    if (!raw) return { ...defaultGoogleSheetsSync }
    const parsed = JSON.parse(raw) as Partial<GoogleSheetsSyncSettings>
    return {
      scriptUrl: String(parsed.scriptUrl ?? ''),
      sheetId: String(parsed.sheetId ?? ''),
      autoSync: parsed.autoSync === true,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
    }
  } catch {
    return { ...defaultGoogleSheetsSync }
  }
}

export function saveGoogleSheetsSyncSettings(settings: GoogleSheetsSyncSettings) {
  localStorage.setItem(KEYS.googleSheetsSync, JSON.stringify(settings))
}

export function getAllStoragePayload(): Record<string, unknown> {
  return {
    transactions: loadTransactions(),
    userProfile: loadProfile(),
    savingsGoals: loadGoals(),
    recurringTransactions: loadRecurringTransactions(),
    budgetLimits: loadBudgetLimits(),
    assets: loadAssets(),
    liabilities: loadLiabilities(),
    netWorthHistory: loadNetWorthHistory(),
    googleSheetsSync: loadGoogleSheetsSyncSettings(),
  }
}
