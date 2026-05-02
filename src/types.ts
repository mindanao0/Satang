export interface Transaction {
  id: string
  type: 'income' | 'expense'
  category: string
  amount: number
  date: string
  note: string
  /** Set when this row was created from a recurring rule (monthly idempotency). */
  recurringSourceId?: string
}

export interface RecurringTransaction {
  id: string
  name: string
  amount: number
  category: string
  type: 'income' | 'expense'
  /** 1–31; clamped to month length when applying. */
  dayOfMonth: number
  enabled: boolean
}

export interface UserProfile {
  salary: number
  taxDeductions: {
    personalAllowance: number
    socialSecurity: number
    lifeInsurance: number
    ssf: number
    rmf: number
  }
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  monthlyContribution: number
}

export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เดินทาง',
  'ที่พัก',
  'ความบันเทิง',
  'สุขภาพ',
  'การศึกษา',
  'ช้อปปิ้ง',
  'อื่นๆ',
] as const

export const INCOME_CATEGORIES = ['เงินเดือน', 'โบนัส', 'รายได้เสริม', 'อื่นๆ'] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** Monthly spending cap (THB) per expense category. Omitted or zero = no limit. */
export type BudgetLimits = Partial<Record<ExpenseCategory, number>>

export const ASSET_TYPES = ['เงินสด', 'หุ้น', 'อสังหาริมทรัพย์', 'ยานพาหนะ', 'อื่นๆ'] as const
export const LIABILITY_TYPES = ['บ้าน', 'รถ', 'บัตรเครดิต', 'อื่นๆ'] as const

export type AssetType = (typeof ASSET_TYPES)[number]
export type LiabilityType = (typeof LIABILITY_TYPES)[number]

export interface Asset {
  id: string
  name: string
  value: number
  type: AssetType
}

export interface Liability {
  id: string
  name: string
  amount: number
  type: LiabilityType
}

/** Monthly net worth snapshot (YYYY-MM). */
export interface NetWorthSnapshot {
  monthKey: string
  netWorth: number
  totalAssets: number
  totalLiabilities: number
}

export interface GoogleSheetsSyncSettings {
  scriptUrl: string
  sheetId: string
  autoSync: boolean
  lastSyncAt: string | null
}
