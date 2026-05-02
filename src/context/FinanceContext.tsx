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
import * as db from '../lib/supabaseFinance'
import { useToast } from './ToastContext'

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
  /** True while initial Supabase fetch is in progress. */
  financeHydrating: boolean
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
  const { showToast } = useToast()
  const [financeHydrating, setFinanceHydrating] = useState(true)

  const [transactions, setTransactionsState] = useState<Transaction[]>([])
  const [profile, setProfileState] = useState<UserProfile>(() => db.cloneDefaultUserProfile())
  const [savingsGoals, setSavingsGoalsState] = useState<SavingsGoal[]>([])
  const [recurringTransactions, setRecurringState] = useState<RecurringTransaction[]>([])
  const [budgetLimits, setBudgetLimitsState] = useState<BudgetLimits>({})
  const [assets, setAssetsState] = useState<Asset[]>(() => storage.loadAssets())
  const [liabilities, setLiabilitiesState] = useState<Liability[]>(() => storage.loadLiabilities())
  const [netWorthHistory, setNetWorthHistoryState] = useState<NetWorthSnapshot[]>(() =>
    storage.loadNetWorthHistory(),
  )
  const [googleSheetsSync, setGoogleSheetsSyncState] = useState<GoogleSheetsSyncSettings>(() =>
    storage.loadGoogleSheetsSyncSettings(),
  )
  const prevTxCountRef = useRef<number>(0)
  const didFinishHydrateRef = useRef(false)
  const transactionsRef = useRef(transactions)

  useEffect(() => {
    transactionsRef.current = transactions
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!db.isSupabaseConfigured()) {
        showToast('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY')
        setFinanceHydrating(false)
        return
      }
      const res = await db.fetchFinanceBootstrap()
      if (cancelled) return
      if (!res.ok) {
        showToast(`โหลดข้อมูลไม่สำเร็จ: ${res.error}`)
        setFinanceHydrating(false)
        return
      }
      setTransactionsState(res.data.transactions)
      setProfileState(res.data.profile)
      setSavingsGoalsState(res.data.savingsGoals)
      setRecurringState(res.data.recurringTransactions)
      setBudgetLimitsState(res.data.budgetLimits)
      setFinanceHydrating(false)
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (financeHydrating) return
    if (!db.isSupabaseConfigured()) return

    const additions = buildDueRecurringTransactions(transactionsRef.current, recurringTransactions)
    if (additions.length === 0) return

    let cancelled = false
    void (async () => {
      const { error } = await db.insertTransactions(additions)
      if (cancelled) return
      if (error) {
        showToast(`ไม่สามารถสร้างรายการจากรายการประจำได้: ${error}`)
        return
      }
      setTransactionsState((p) => [...p, ...additions])
    })()
    return () => {
      cancelled = true
    }
  }, [recurringTransactions, financeHydrating, showToast])

  useEffect(() => {
    if (financeHydrating || didFinishHydrateRef.current) return
    didFinishHydrateRef.current = true
    prevTxCountRef.current = transactions.length
  }, [financeHydrating, transactions.length])

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

  const setTransactions = useCallback(
    (t: Transaction[]) => {
      void (async () => {
        const { error } = await db.replaceAllTransactions(t)
        if (error) {
          showToast(`บันทึกรายการไม่สำเร็จ: ${error}`)
          return
        }
        setTransactionsState(t)
      })()
    },
    [showToast],
  )

  const setProfile = useCallback(
    (p: UserProfile) => {
      void (async () => {
        const { error } = await db.upsertUserProfile(p)
        if (error) {
          showToast(`บันทึกโปรไฟล์ไม่สำเร็จ: ${error}`)
          return
        }
        setProfileState(p)
      })()
    },
    [showToast],
  )

  const setSavingsGoals = useCallback(
    (g: SavingsGoal[]) => {
      void (async () => {
        const { error } = await db.replaceAllSavingsGoals(g)
        if (error) {
          showToast(`บันทึกเป้าหมายออมไม่สำเร็จ: ${error}`)
          return
        }
        setSavingsGoalsState(g)
      })()
    },
    [showToast],
  )

  const addTransaction = useCallback(
    (t: Omit<Transaction, 'id'>) => {
      const id = crypto.randomUUID()
      const full: Transaction = { ...t, id }
      void (async () => {
        const { error } = await db.insertTransaction(full)
        if (error) {
          showToast(`บันทึกรายการไม่สำเร็จ: ${error}`)
          return
        }
        setTransactionsState((prev) => [...prev, full])
      })()
    },
    [showToast],
  )

  const updateTransaction = useCallback(
    (id: string, patch: Partial<Transaction>) => {
      void (async () => {
        const { error } = await db.updateTransactionDb(id, patch)
        if (error) {
          showToast(`อัปเดตรายการไม่สำเร็จ: ${error}`)
          return
        }
        setTransactionsState((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
      })()
    },
    [showToast],
  )

  const removeTransaction = useCallback(
    (id: string) => {
      void (async () => {
        const { error } = await db.deleteTransactionDb(id)
        if (error) {
          showToast(`ลบรายการไม่สำเร็จ: ${error}`)
          return
        }
        setTransactionsState((prev) => prev.filter((x) => x.id !== id))
      })()
    },
    [showToast],
  )

  const addRecurringItem = useCallback(
    (item: Omit<RecurringTransaction, 'id' | 'enabled'> & { enabled?: boolean }) => {
      const id = crypto.randomUUID()
      const full: RecurringTransaction = {
        ...item,
        id,
        enabled: item.enabled !== false,
      }
      void (async () => {
        const { error } = await db.insertRecurring(full)
        if (error) {
          showToast(`บันทึกรายการประจำไม่สำเร็จ: ${error}`)
          return
        }
        setRecurringState((prev) => [...prev, full])
      })()
    },
    [showToast],
  )

  const setRecurringEnabled = useCallback(
    (id: string, enabled: boolean) => {
      void (async () => {
        const { error } = await db.updateRecurringDb(id, { enabled })
        if (error) {
          showToast(`อัปเดตรายการประจำไม่สำเร็จ: ${error}`)
          return
        }
        setRecurringState((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)))
      })()
    },
    [showToast],
  )

  const removeRecurringItem = useCallback(
    (id: string) => {
      void (async () => {
        const { error } = await db.deleteRecurringDb(id)
        if (error) {
          showToast(`ลบรายการประจำไม่สำเร็จ: ${error}`)
          return
        }
        setRecurringState((prev) => prev.filter((r) => r.id !== id))
      })()
    },
    [showToast],
  )

  const setBudgetLimits = useCallback(
    (limits: BudgetLimits) => {
      void (async () => {
        const { error } = await db.persistBudgetLimits(limits)
        if (error) {
          showToast(`บันทึกงบประมาณไม่สำเร็จ: ${error}`)
          return
        }
        setBudgetLimitsState(limits)
      })()
    },
    [showToast],
  )

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

  const upsertGoal = useCallback(
    (g: SavingsGoal) => {
      void (async () => {
        const { error } = await db.upsertSavingsGoal(g)
        if (error) {
          showToast(`บันทึกเป้าหมายออมไม่สำเร็จ: ${error}`)
          return
        }
        setSavingsGoalsState((prev) => {
          const exists = prev.some((x) => x.id === g.id)
          return exists ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]
        })
      })()
    },
    [showToast],
  )

  const removeGoal = useCallback(
    (id: string) => {
      void (async () => {
        const { error } = await db.deleteSavingsGoalDb(id)
        if (error) {
          showToast(`ลบเป้าหมายออมไม่สำเร็จ: ${error}`)
          return
        }
        setSavingsGoalsState((prev) => prev.filter((x) => x.id !== id))
      })()
    },
    [showToast],
  )

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
      financeHydrating,
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
      financeHydrating,
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
