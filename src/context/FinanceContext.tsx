import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SavingsGoal, Transaction, UserProfile } from '../types'
import * as storage from '../lib/storage'

type FinanceContextValue = {
  transactions: Transaction[]
  profile: UserProfile
  savingsGoals: SavingsGoal[]
  setTransactions: (t: Transaction[]) => void
  setProfile: (p: UserProfile) => void
  setSavingsGoals: (g: SavingsGoal[]) => void
  addTransaction: (t: Omit<Transaction, 'id'>) => void
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void
  upsertGoal: (g: SavingsGoal) => void
  removeGoal: (id: string) => void
}

const FinanceContext = createContext<FinanceContextValue | null>(null)

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactionsState] = useState<Transaction[]>(() =>
    storage.loadTransactions(),
  )
  const [profile, setProfileState] = useState<UserProfile>(() => storage.loadProfile())
  const [savingsGoals, setSavingsGoalsState] = useState<SavingsGoal[]>(() =>
    storage.loadGoals(),
  )

  const setTransactions = useCallback((t: Transaction[]) => {
    setTransactionsState(t)
    storage.saveTransactions(t)
  }, [])

  const setProfile = useCallback((p: UserProfile) => {
    setProfileState(p)
    storage.saveProfile(p)
  }, [])

  const setSavingsGoals = useCallback((g: SavingsGoal[]) => {
    setSavingsGoalsState(g)
    storage.saveGoals(g)
  }, [])

  const addTransaction = useCallback((t: Omit<Transaction, 'id'>) => {
    const id = crypto.randomUUID()
    setTransactionsState((prev) => {
      const next = [...prev, { ...t, id }]
      storage.saveTransactions(next)
      return next
    })
  }, [])

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setTransactionsState((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      storage.saveTransactions(next)
      return next
    })
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setTransactionsState((prev) => {
      const next = prev.filter((x) => x.id !== id)
      storage.saveTransactions(next)
      return next
    })
  }, [])

  const upsertGoal = useCallback((g: SavingsGoal) => {
    setSavingsGoalsState((prev) => {
      const exists = prev.some((x) => x.id === g.id)
      const next = exists ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]
      storage.saveGoals(next)
      return next
    })
  }, [])

  const removeGoal = useCallback((id: string) => {
    setSavingsGoalsState((prev) => {
      const next = prev.filter((x) => x.id !== id)
      storage.saveGoals(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({
      transactions,
      profile,
      savingsGoals,
      setTransactions,
      setProfile,
      setSavingsGoals,
      addTransaction,
      updateTransaction,
      removeTransaction,
      upsertGoal,
      removeGoal,
    }),
    [
      transactions,
      profile,
      savingsGoals,
      setTransactions,
      setProfile,
      setSavingsGoals,
      addTransaction,
      updateTransaction,
      removeTransaction,
      upsertGoal,
      removeGoal,
    ],
  )

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
}

export function useFinance() {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error('useFinance ต้องอยู่ภายใน FinanceProvider')
  return ctx
}
