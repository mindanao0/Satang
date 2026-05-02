import type { SavingsGoal, Transaction, UserProfile } from '../types'

const KEYS = {
  transactions: 'satang_transactions',
  profile: 'satang_profile',
  goals: 'satang_savings_goals',
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

export function getAllStoragePayload(): Record<string, unknown> {
  return {
    transactions: loadTransactions(),
    userProfile: loadProfile(),
    savingsGoals: loadGoals(),
  }
}
