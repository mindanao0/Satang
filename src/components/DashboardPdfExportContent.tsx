import { forwardRef } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Transaction } from '../types'
import { formatTHB } from '../lib/format'

const PIE_COLORS = [
  '#1d4ed8',
  '#0ea5e9',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#64748b',
]

export type DashboardPdfExportContentProps = {
  monthLabel: string
  salary: number
  income: number
  expense: number
  savings: number
  taxAnnual: number
  taxWithholding: number
  pieData: { name: string; value: number }[]
  barData: { label: string; รายรับ: number; รายจ่าย: number }[]
  monthTransactions: Transaction[]
}

export const DashboardPdfExportContent = forwardRef<HTMLDivElement, DashboardPdfExportContentProps>(
  function DashboardPdfExportContent(
    {
      monthLabel,
      salary,
      income,
      expense,
      savings,
      taxAnnual,
      taxWithholding,
      pieData,
      barData,
      monthTransactions,
    },
    ref,
  ) {
    const maxCat = Math.max(...pieData.map((d) => d.value), 1)

    return (
      <div
        ref={ref}
        className="box-border bg-white p-8 text-slate-900"
        style={{ width: 794 }}
      >
        <h1 className="m-0 text-xl font-bold">สตางค์ — รายงานสรุปรายเดือน</h1>
        <p className="mt-1 text-sm text-slate-600">{monthLabel}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">เงินเดือน (โปรไฟล์)</div>
            <div className="mt-1 text-lg font-semibold">{formatTHB(salary)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">รายรับที่ใช้ (เดือนนี้)</div>
            <div className="mt-1 text-lg font-semibold text-green-800">{formatTHB(income)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">รายจ่ายรวม (เดือนนี้)</div>
            <div className="mt-1 text-lg font-semibold text-red-700">{formatTHB(expense)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">เงินออม (เดือนนี้)</div>
            <div
              className={`mt-1 text-lg font-semibold ${savings >= 0 ? 'text-green-700' : 'text-red-700'}`}
            >
              {formatTHB(savings)}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">ภาษีโดยประมาณ (ต่อปี)</div>
            <div className="mt-1 text-lg font-semibold">
              {formatTHB(taxAnnual)}{' '}
              <span className="text-sm font-normal text-slate-600">
                (หัก ณ ที่จ่าย ~{formatTHB(taxWithholding)}/เดือน)
              </span>
            </div>
          </div>
        </div>

        <h2 className="mb-2 mt-8 text-base font-semibold">รายจ่ายตามหมวด (เดือนนี้)</h2>
        {pieData.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีรายจ่ายในเดือนนี้</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            <div>
              <PieChart width={320} height={260}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatTHB(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </div>
            <div className="min-w-[200px] flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-1 pr-2 font-medium">หมวด</th>
                    <th className="py-1 text-right font-medium">จำนวน</th>
                    <th className="py-1 pl-2 font-medium">สัดส่วน</th>
                  </tr>
                </thead>
                <tbody>
                  {pieData.map((row, i) => (
                    <tr key={row.name} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        {row.name}
                      </td>
                      <td className="py-1.5 text-right">{formatTHB(row.value)}</td>
                      <td className="py-1.5 pl-2">
                        <div className="h-2 w-full max-w-[120px] overflow-hidden rounded bg-slate-200">
                          <div
                            className="h-full rounded bg-blue-600"
                            style={{ width: `${(row.value / maxCat) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <h2 className="mb-2 mt-8 text-base font-semibold">รายรับและรายจ่ายรายเดือน (6 เดือนล่าสุด)</h2>
        <BarChart width={758} height={260} data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => formatTHB(Number(v ?? 0))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="รายรับ" fill="#15803d" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="รายจ่าย" fill="#b91c1c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>

        <h2 className="mb-2 mt-8 text-base font-semibold">รายการธุรกรรม (เดือนนี้)</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-600">
              <th className="px-2 py-2 text-left font-medium">วันที่</th>
              <th className="px-2 py-2 text-left font-medium">ประเภท</th>
              <th className="px-2 py-2 text-left font-medium">หมวด</th>
              <th className="px-2 py-2 text-right font-medium">จำนวน</th>
              <th className="px-2 py-2 text-left font-medium">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {monthTransactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                  ไม่มีรายการในเดือนนี้
                </td>
              </tr>
            ) : (
              monthTransactions.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 text-slate-800">{t.date}</td>
                  <td className="px-2 py-1.5">{t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</td>
                  <td className="px-2 py-1.5 text-slate-700">{t.category}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-medium ${t.type === 'income' ? 'text-green-800' : 'text-red-800'}`}
                  >
                    {t.type === 'income' ? '+' : '−'}
                    {formatTHB(t.amount)}
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1.5 text-slate-600">{t.note || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )
  },
)
