import { useMemo, useState } from 'react'
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { computeNetWorthTotals } from '../lib/netWorthUtils'
import { formatMonthLabel, formatTHB } from '../lib/format'
import { streamGroq } from '../lib/groq'
import { Spinner } from '../components/Spinner'
import {
  ASSET_TYPES,
  LIABILITY_TYPES,
  type Asset,
  type AssetType,
  type Liability,
  type LiabilityType,
} from '../types'
import { getChartPalette } from '../lib/chartPalette'

function monthKeyToLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return formatMonthLabel(y, m - 1)
}

export function NetWorth() {
  const {
    assets,
    liabilities,
    netWorthHistory,
    addAsset,
    updateAsset,
    removeAsset,
    addLiability,
    updateLiability,
    removeLiability,
  } = useFinance()
  const { showToast } = useToast()
  const { isDark } = useTheme()
  const cp = useMemo(() => getChartPalette(isDark), [isDark])

  const { totalAssets, totalLiabilities, netWorth } = useMemo(
    () => computeNetWorthTotals(assets, liabilities),
    [assets, liabilities],
  )

  const debtToAssetRatio = totalAssets > 0 ? totalLiabilities / totalAssets : null

  const assetsByType = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of assets) {
      m[a.type] = (m[a.type] ?? 0) + a.value
    }
    return m
  }, [assets])

  const donutData = useMemo(
    () =>
      Object.entries(assetsByType)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value })),
    [assetsByType],
  )

  const timelineData = useMemo(
    () =>
      netWorthHistory.map((s) => ({
        label: monthKeyToLabel(s.monthKey),
        monthKey: s.monthKey,
        ความมั่งคั่ง: s.netWorth,
      })),
    [netWorthHistory],
  )

  const [aName, setAName] = useState('')
  const [aValue, setAValue] = useState('')
  const [aType, setAType] = useState<AssetType>(ASSET_TYPES[0])
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)

  const [lName, setLName] = useState('')
  const [lAmount, setLAmount] = useState('')
  const [lType, setLType] = useState<LiabilityType>(LIABILITY_TYPES[0])
  const [editingLiabilityId, setEditingLiabilityId] = useState<string | null>(null)

  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  function resetAssetForm() {
    setAName('')
    setAValue('')
    setAType(ASSET_TYPES[0])
    setEditingAssetId(null)
  }

  function resetLiabilityForm() {
    setLName('')
    setLAmount('')
    setLType(LIABILITY_TYPES[0])
    setEditingLiabilityId(null)
  }

  function startEditAsset(a: Asset) {
    setEditingAssetId(a.id)
    setAName(a.name)
    setAValue(String(a.value))
    setAType(a.type)
  }

  function startEditLiability(l: Liability) {
    setEditingLiabilityId(l.id)
    setLName(l.name)
    setLAmount(String(l.amount))
    setLType(l.type)
  }

  function submitAsset(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(aValue.replace(/,/g, ''))
    if (!aName.trim() || !Number.isFinite(v) || v < 0) {
      showToast('กรุณากรอกชื่อและมูลค่าที่ถูกต้อง')
      return
    }
    if (editingAssetId) {
      updateAsset(editingAssetId, { name: aName.trim(), value: v, type: aType })
      showToast('อัปเดตทรัพย์สินแล้ว')
    } else {
      addAsset({ name: aName.trim(), value: v, type: aType })
      showToast('เพิ่มทรัพย์สินแล้ว')
    }
    resetAssetForm()
  }

  function submitLiability(e: React.FormEvent) {
    e.preventDefault()
    const v = Number(lAmount.replace(/,/g, ''))
    if (!lName.trim() || !Number.isFinite(v) || v < 0) {
      showToast('กรุณากรอกชื่อและจำนวนหนี้ที่ถูกต้อง')
      return
    }
    if (editingLiabilityId) {
      updateLiability(editingLiabilityId, { name: lName.trim(), amount: v, type: lType })
      showToast('อัปเดตหนี้สินแล้ว')
    } else {
      addLiability({ name: lName.trim(), amount: v, type: lType })
      showToast('เพิ่มหนี้สินแล้ว')
    }
    resetLiabilityForm()
  }

  async function runAiAnalysis() {
    setAiError(null)
    setAiText('')
    setAiLoading(true)
    const liabilitiesByType: Record<string, number> = {}
    for (const l of liabilities) {
      liabilitiesByType[l.type] = (liabilitiesByType[l.type] ?? 0) + l.amount
    }
    const stats = {
      totalAssets,
      totalLiabilities,
      netWorth,
      debtToAssetRatio: debtToAssetRatio != null ? Number((debtToAssetRatio * 100).toFixed(2)) : null,
      assetsByType,
      liabilitiesByType,
      assetCount: assets.length,
      liabilityCount: liabilities.length,
    }
    const userPrompt = `ข้อมูลสรุป (JSON):\n${JSON.stringify(stats)}\n\ndebtToAssetRatio คือหนี้สินรวม ÷ ทรัพย์สินรวม (แสดงเป็น % ใน JSON แล้ว)\n\nกรุณาวิเคราะห์:\n1) ความหมายของสัดส่วนหนี้ต่อสินทรัพย์ (debt-to-asset) ในกรณีของผู้ใช้\n2) จุดเสี่ยงหรือจุดแข็งสั้นๆ\n3) คำแนะนำปรับปรุง 3-5 ข้อ (เช่น ลดหนี้บัตร, สร้างเงินสดสำรอง)\n\nตอบเป็นภาษาไทย กระชับ ไม่ใช้ markdown`

    try {
      await streamGroq(
        userPrompt,
        'คุณเป็นที่ปรึกษาการเงินส่วนบุคคล ให้คำแนะนำที่เป็นจริงและนุ่มนวล',
        (d) => setAiText((s) => s + d),
        2048,
      )
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ความมั่งคั่ง</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          ติดตามทรัพย์สิน หนี้สิน และความมั่งคั่งสุทธิ — บันทึกสรุปรายเดือนอัตโนมัติ
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:col-span-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">ความมั่งคั่งสุทธิ</div>
          <div
            className={`mt-1 text-2xl font-bold ${netWorth >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {formatTHB(netWorth)}
          </div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">ทรัพย์สินรวม − หนี้สินรวม</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">ทรัพย์สินรวม</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatTHB(totalAssets)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm text-slate-500 dark:text-slate-400">หนี้สินรวม</div>
          <div className="mt-1 text-xl font-semibold text-red-800 dark:text-red-400">
            {formatTHB(totalLiabilities)}
          </div>
          {debtToAssetRatio != null ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              หนี้ต่อสินทรัพย์: {(debtToAssetRatio * 100).toFixed(1)}%
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              ไม่มีทรัพย์สินสำหรับคำนวณสัดส่วน
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={submitAsset}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingAssetId ? 'แก้ไขทรัพย์สิน' : 'เพิ่มทรัพย์สิน'}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">ชื่อ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={aName}
                onChange={(e) => setAName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">มูลค่า (บาท)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={aValue}
                onChange={(e) => setAValue(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">ประเภท</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={aType}
                onChange={(e) => setAType(e.target.value as AssetType)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 dark:bg-sky-700 dark:hover:bg-sky-600"
            >
              {editingAssetId ? 'บันทึก' : 'เพิ่ม'}
            </button>
            {editingAssetId ? (
              <button
                type="button"
                onClick={resetAssetForm}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                ยกเลิก
              </button>
            ) : null}
          </div>
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-4 dark:divide-slate-700 dark:border-slate-700">
            {assets.length === 0 ? (
              <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">ยังไม่มีรายการ</li>
            ) : (
              assets.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{a.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{a.type}</span>
                  <span className="ml-auto font-medium text-slate-900 dark:text-slate-100">{formatTHB(a.value)}</span>
                  <button
                    type="button"
                    className="text-blue-700 hover:underline dark:text-sky-400"
                    onClick={() => startEditAsset(a)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="text-red-700 hover:underline dark:text-red-400"
                    onClick={() => {
                      removeAsset(a.id)
                      showToast('ลบทรัพย์สินแล้ว')
                      if (editingAssetId === a.id) resetAssetForm()
                    }}
                  >
                    ลบ
                  </button>
                </li>
              ))
            )}
          </ul>
        </form>

        <form
          onSubmit={submitLiability}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6"
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingLiabilityId ? 'แก้ไขหนี้สิน' : 'เพิ่มหนี้สิน'}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-400">ชื่อ</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={lName}
                onChange={(e) => setLName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">จำนวนหนี้ (บาท)</span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={lAmount}
                onChange={(e) => setLAmount(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">ประเภท</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={lType}
                onChange={(e) => setLType(e.target.value as LiabilityType)}
              >
                {LIABILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              {editingLiabilityId ? 'บันทึก' : 'เพิ่ม'}
            </button>
            {editingLiabilityId ? (
              <button
                type="button"
                onClick={resetLiabilityForm}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                ยกเลิก
              </button>
            ) : null}
          </div>
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-4 dark:divide-slate-700 dark:border-slate-700">
            {liabilities.length === 0 ? (
              <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">ยังไม่มีรายการ</li>
            ) : (
              liabilities.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{l.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{l.type}</span>
                  <span className="ml-auto font-medium text-red-800 dark:text-red-400">{formatTHB(l.amount)}</span>
                  <button
                    type="button"
                    className="text-blue-700 hover:underline dark:text-sky-400"
                    onClick={() => startEditLiability(l)}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="text-red-700 hover:underline dark:text-red-400"
                    onClick={() => {
                      removeLiability(l.id)
                      showToast('ลบหนี้สินแล้ว')
                      if (editingLiabilityId === l.id) resetLiabilityForm()
                    }}
                  >
                    ลบ
                  </button>
                </li>
              ))
            )}
          </ul>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">สัดส่วนทรัพย์สินตามประเภท</h2>
          <div className="mt-4 h-80">
            {donutData.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">เพิ่มทรัพย์สินเพื่อดูแผนภูมิ</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={64}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={cp.pie[i % cp.pie.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatTHB(Number(v ?? 0))}
                    contentStyle={{
                      backgroundColor: cp.tooltipBg,
                      border: `1px solid ${cp.tooltipBorder}`,
                    }}
                  />
                  <Legend wrapperStyle={{ color: cp.legendColor, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">แนวโน้มความมั่งคั่งสุทธิ</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            จุดข้อมูล = สรุปสิ้นเดือน (อัปเดตเมื่อมีการเปลี่ยนแปลง)
          </p>
          <div className="mt-4 h-80">
            {timelineData.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">ยังไม่มีประวัติ</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: cp.tick }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: cp.tick }}
                    tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(v) => formatTHB(Number(v ?? 0))}
                    contentStyle={{
                      backgroundColor: cp.tooltipBg,
                      border: `1px solid ${cp.tooltipBorder}`,
                    }}
                  />
                  <Legend wrapperStyle={{ color: cp.legendColor, fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="ความมั่งคั่ง"
                    stroke={cp.linePrimary}
                    strokeWidth={2}
                    dot={{ r: 3, fill: cp.linePrimary }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">วิเคราะห์ AI</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              ให้ AI วิเคราะห์สัดส่วนหนี้ต่อสินทรัพย์ (debt-to-asset) และแนะนำการปรับปรุง
            </p>
          </div>
          <button
            type="button"
            onClick={runAiAnalysis}
            disabled={aiLoading}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-900 disabled:opacity-60 dark:bg-indigo-700 dark:hover:bg-indigo-600"
          >
            {aiLoading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
            วิเคราะห์ด้วย AI
          </button>
        </div>
        {aiError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{aiError}</p>
        ) : (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {aiText || (aiLoading ? 'กำลังวิเคราะห์...' : '')}
          </p>
        )}
      </div>
    </div>
  )
}
