import type { Transaction } from '../types'

type GoogleSheetsPayload = {
  action: 'sync_transactions'
  sheetId: string
  syncedAt: string
  transactions: Transaction[]
}

export async function syncTransactionsToGoogleSheets(
  scriptUrl: string,
  sheetId: string,
  transactions: Transaction[],
): Promise<void> {
  const url = scriptUrl.trim()
  if (!url) throw new Error('กรุณากรอก Google Apps Script Web App URL')
  if (!sheetId.trim()) throw new Error('กรุณากรอก Sheet ID')

  const payload: GoogleSheetsPayload = {
    action: 'sync_transactions',
    sheetId: sheetId.trim(),
    syncedAt: new Date().toISOString(),
    transactions,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Sync failed: HTTP ${res.status}`)
  }
}
