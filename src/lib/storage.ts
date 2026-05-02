import type {
  Asset,
  GoogleSheetsSyncSettings,
  Liability,
  NetWorthSnapshot,
} from '../types'
import { ASSET_TYPES, LIABILITY_TYPES } from '../types'

const KEYS = {
  assets: 'assets',
  liabilities: 'liabilities',
  netWorthHistory: 'netWorthHistory',
  googleSheetsSync: 'googleSheetsSync',
} as const

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
