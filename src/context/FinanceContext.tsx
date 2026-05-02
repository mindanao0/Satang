import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Asset,
  BudgetLimits,
  GoogleSheetsSyncSettings,
  Liability,
  NetWorthSnapshot,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
  UserProfile,
} from '../types'
import { buildDueRecurringTransactions } from '../lib/recurring'
import {
  computeNetWorthTotals,
  netWorthMonthKey,
  upsertNetWorthSnapshot,
} from '../lib/netWorthUtils'
import { syncTransactionsToGoogleSheets } from '../lib/googleSheets'
import * as storage from '../lib/storage'

type FinanceContextValue = {
  transactions: Transaction[]
  profile: UserProfile
  savingsGoals: SavingsGoal[]
  recurringTransactions: RecurringTransaction[]
  budgetLimits: BudgetLimits
  assets: Asset[]
  liabilities: Liability[]
  netWorthHistory: NetWorthSnapshot[]
  googleSheetsSync: GoogleSheetsSyncSettings
  setTransactions: (t: Transaction[]) => void
  setProfile: (p: UserProfile) => void
  setSavingsGoals: (g: SavingsGoal[]) => void
  addRecurringItem: (item: Omit<RecurringTransaction, 'id' | 'enabled'> & { enabled?: boolean }) => void
  setRecurringEnabled: (id: string, enabled: boolean) => void
  removeRecurringItem: (id: string) => void
  setBudgetLimits: (limits: BudgetLimits) => void
  addAsset: (item: Omit<Asset, 'id'>) => void
  updateAsset: (id: string, patch: Partial<Asset>) => void
  removeAsset: (id: string) => void
  addLiability: (item: Omit<Liability, 'id'>) => void
  updateLiability: (id: string, patch: Partial<Liability>) => void
  removeLiability: (id: string) => void
  setGoogleSheetsSync: (settings: GoogleSheetsSyncSettings) => void
  syncAllTransactionsToGoogleSheets: (
    override?: Partial<Pick<GoogleSheetsSyncSettings, 'scriptUrl' | 'sheetId' | 'autoSync'>>,
  ) => Promise<void>
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
  const [recurringTransactions, setRecurringState] = useState<RecurringTransaction[]>(() =>
    storage.loadRecurringTransactions(),
  )
  const [budgetLimits, setBudgetLimitsState] = useState<BudgetLimits>(() => storage.loadBudgetLimits())
  const [assets, setAssetsState] = useState<Asset[]>(() => storage.loadAssets())
  const [liabilities, setLiabilitiesState] = useState<Liability[]>(() => storage.loadLiabilities())
  const [netWorthHistory, setNetWorthHistoryState] = useState<NetWorthSnapshot[]>(() =>
    storage.loadNetWorthHistory(),
  )
  const [googleSheetsSync, setGoogleSheetsSyncState] = useState<GoogleSheetsSyncSettings>(() =>
    storage.loadGoogleSheetsSyncSettings(),
  )
  const prevTxCountRef = useRef<number>(transactions.length)

  useEffect(() => {
    setTransactionsState((prev) => {
      const additions = buildDueRecurringTransactions(prev, recurringTransactions)
      if (additions.length === 0) return prev
      const next = [...prev, ...additions]
      storage.saveTransactions(next)
      return next
    })
  }, [recurringTransactions])

  useEffect(() => {
    const { totalAssets, totalLiabilities, netWorth } = computeNetWorthTotals(assets, liabilities)
    const snapshot: NetWorthSnapshot = {
      monthKey: netWorthMonthKey(),
      netWorth,
      totalAssets,
      totalLiabilities,
    }
    setNetWorthHistoryState((prev) => {
      const next = upsertNetWorthSnapshot(prev, snapshot)
      storage.saveNetWorthHistory(next)
      return next
    })
  }, [assets, liabilities])

  const setGoogleSheetsSync = useCallback((settings: GoogleSheetsSyncSettings) => {
    setGoogleSheetsSyncState(settings)
    storage.saveGoogleSheetsSyncSettings(settings)
  }, [])

  const syncAllTransactionsToGoogleSheets = useCallback(
    async (
      override?: Partial<Pick<GoogleSheetsSyncSettings, 'scriptUrl' | 'sheetId' | 'autoSync'>>,
    ) => {
      const effective: GoogleSheetsSyncSettings = {
        ...googleSheetsSync,
        ...override,
      }
      await syncTransactionsToGoogleSheets(effective.scriptUrl, effective.sheetId, transactions)
      const nextSettings: GoogleSheetsSyncSettings = {
        ...effective,
        lastSyncAt: new Date().toISOString(),
      }
      setGoogleSheetsSyncState(nextSettings)
      storage.saveGoogleSheetsSyncSettings(nextSettings)
    },
    [googleSheetsSync, transactions],
  )

  useEffect(() => {
    const prevCount = prevTxCountRef.current
    const currCount = transactions.length
    prevTxCountRef.current = currCount
    if (currCount <= prevCount) return
    if (!googleSheetsSync.autoSync) return
    if (!googleSheetsSync.scriptUrl.trim() || !googleSheetsSync.sheetId.trim()) return

    void (async () => {
      try {
        await syncTransactionsToGoogleSheets(
          googleSheetsSync.scriptUrl,
          googleSheetsSync.sheetId,
          transactions,
        )
        const nextSettings: GoogleSheetsSyncSettings = {
          ...googleSheetsSync,
          lastSyncAt: new Date().toISOString(),
        }
        setGoogleSheetsSyncState(nextSettings)
        storage.saveGoogleSheetsSyncSettings(nextSettings)
      } catch {
        // ignore auto-sync errors to avoid interrupting primary transaction flow
      }
    })()
  }, [transactions, googleSheetsSync])

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

  const addRecurringItem = useCallback(
    (item: Omit<RecurringTransaction, 'id' | 'enabled'> & { enabled?: boolean }) => {
      const id = crypto.randomUUID()
      setRecurringState((prev) => {
        const next: RecurringTransaction[] = [
          ...prev,
          {
            ...item,
            id,
            enabled: item.enabled !== false,
          },
        ]
        storage.saveRecurringTransactions(next)
        return next
      })
    },
    [],
  )

  const setRecurringEnabled = useCallback((id: string, enabled: boolean) => {
    setRecurringState((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, enabled } : r))
      storage.saveRecurringTransactions(next)
      return next
    })
  }, [])

  const removeRecurringItem = useCallback((id: string) => {
    setRecurringState((prev) => {
      const next = prev.filter((r) => r.id !== id)
      storage.saveRecurringTransactions(next)
      return next
    })
  }, [])

  const setBudgetLimits = useCallback((limits: BudgetLimits) => {
    setBudgetLimitsState(limits)
    storage.saveBudgetLimits(limits)
  }, [])

  const addAsset = useCallback((item: Omit<Asset, 'id'>) => {
    const id = crypto.randomUUID()
    setAssetsState((prev) => {
      const next = [...prev, { ...item, id }]
      storage.saveAssets(next)
      return next
    })
  }, [])

  const updateAsset = useCallback((id: string, patch: Partial<Asset>) => {
    setAssetsState((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      storage.saveAssets(next)
      return next
    })
  }, [])

  const removeAsset = useCallback((id: string) => {
    setAssetsState((prev) => {
      const next = prev.filter((x) => x.id !== id)
      storage.saveAssets(next)
      return next
    })
  }, [])

  const addLiability = useCallback((item: Omit<Liability, 'id'>) => {
    const id = crypto.randomUUID()
    setLiabilitiesState((prev) => {
      const next = [...prev, { ...item, id }]
      storage.saveLiabilities(next)
      return next
    })
  }, [])

  const updateLiability = useCallback((id: string, patch: Partial<Liability>) => {
    setLiabilitiesState((prev) => {
      const next = prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      storage.saveLiabilities(next)
      return next
    })
  }, [])

  const removeLiability = useCallback((id: string) => {
    setLiabilitiesState((prev) => {
      const next = prev.filter((x) => x.id !== id)
      storage.saveLiabilities(next)
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
      recurringTransactions,
      budgetLimits,
      assets,
      liabilities,
      netWorthHistory,
      googleSheetsSync,
      setTransactions,
      setProfile,
      setSavingsGoals,
      addRecurringItem,
      setRecurringEnabled,
      removeRecurringItem,
      setBudgetLimits,
      addAsset,
      updateAsset,
      removeAsset,
      addLiability,
      updateLiability,
      removeLiability,
      setGoogleSheetsSync,
      syncAllTransactionsToGoogleSheets,
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
      recurringTransactions,
      budgetLimits,
      assets,
      liabilities,
      netWorthHistory,
      googleSheetsSync,
      setTransactions,
      setProfile,
      setSavingsGoals,
      addRecurringItem,
      setRecurringEnabled,
      removeRecurringItem,
      setBudgetLimits,
      addAsset,
      updateAsset,
      removeAsset,
      addLiability,
      updateLiability,
      removeLiability,
      setGoogleSheetsSync,
      syncAllTransactionsToGoogleSheets,
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
