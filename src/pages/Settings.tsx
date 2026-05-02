import { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'

function fmtSyncAt(iso: string | null): string {
  if (!iso) return 'ยังไม่เคยซิงก์'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'ยังไม่เคยซิงก์'
  return d.toLocaleString('th-TH')
}

export function Settings() {
  const { googleSheetsSync, setGoogleSheetsSync, syncAllTransactionsToGoogleSheets } = useFinance()
  const { showToast } = useToast()
  const [scriptUrl, setScriptUrl] = useState(googleSheetsSync.scriptUrl)
  const [sheetId, setSheetId] = useState(googleSheetsSync.sheetId)
  const [autoSync, setAutoSync] = useState(googleSheetsSync.autoSync)
  const [syncing, setSyncing] = useState(false)

  const lastSyncLabel = useMemo(() => fmtSyncAt(googleSheetsSync.lastSyncAt), [googleSheetsSync])

  function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    setGoogleSheetsSync({
      ...googleSheetsSync,
      scriptUrl: scriptUrl.trim(),
      sheetId: sheetId.trim(),
      autoSync,
    })
    showToast('บันทึกการตั้งค่าแล้ว')
  }

  async function handleSyncNow() {
    setSyncing(true)
    try {
      await syncAllTransactionsToGoogleSheets({
        scriptUrl: scriptUrl.trim(),
        sheetId: sheetId.trim(),
        autoSync,
      })
      showToast('ซิงก์ข้อมูลไป Google Sheets สำเร็จ')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ซิงก์ไม่สำเร็จ')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ตั้งค่า</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          เชื่อมต่อ Google Sheets เพื่อสำรองข้อมูลธุรกรรม
        </p>
      </div>

      <form
        onSubmit={saveSettings}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Google Sheets Sync
        </h2>

        <div className="mt-4 grid gap-4">
          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              Google Apps Script Web App URL
            </span>
            <input
              type="url"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              required
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400">Sheet ID</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="1AbCdEf...."
              required
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
            Auto-sync เมื่อมีการเพิ่มธุรกรรมใหม่
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 dark:bg-sky-700 dark:hover:bg-sky-600"
          >
            บันทึกการตั้งค่า
          </button>
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncing}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {syncing ? 'กำลังซิงก์...' : 'Sync to Google Sheets'}
          </button>
        </div>

        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          ซิงก์ล่าสุด: <span className="font-medium">{lastSyncLabel}</span>
        </p>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          ตัวอย่าง Google Apps Script
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          นำโค้ดตัวอย่างไปวางใน Apps Script แล้ว Deploy เป็น Web App (สิทธิ์ให้ทุกคนที่มีลิงก์)
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
{`// Apps Script: doPost webhook for Satang
function doPost(e) {
  // รับ payload JSON จากแอป
  var payload = JSON.parse(e.postData.contents || '{}');
  var sheetId = payload.sheetId;
  var txs = payload.transactions || [];

  var ss = SpreadsheetApp.openById(sheetId);
  var sh = ss.getSheetByName('transactions') || ss.insertSheet('transactions');

  // เขียนหัวตารางครั้งแรก
  if (sh.getLastRow() === 0) {
    sh.appendRow(['วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวน', 'หมายเหตุ']);
  }

  // ล้างข้อมูลเดิม (เก็บหัวตารางไว้)
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 5).clearContent();
  }

  // เขียนข้อมูลใหม่
  var rows = txs.map(function(t) {
    return [t.date, t.type, t.category, t.amount, t.note || ''];
  });
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, 5).setValues(rows);
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, count: rows.length })
  ).setMimeType(ContentService.MimeType.JSON);
}`}
        </pre>
      </div>
    </div>
  )
}
