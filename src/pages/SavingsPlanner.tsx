import { useMemo, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import type { SavingsGoal } from '../types'
import { monthsBetween, projectedBalanceAtDate, requiredMonthlyPayment } from '../lib/savings'
import { formatTHB } from '../lib/format'
import { streamClaude } from '../lib/claude'
import { Spinner } from '../components/Spinner'

export function SavingsPlanner() {
  const { savingsGoals, upsertGoal, removeGoal } = useFinance()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [monthlyContribution, setMonthlyContribution] = useState('')
  const [annualReturn, setAnnualReturn] = useState('5')

  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const returnNum = Number(annualReturn) || 0

  const goalInsights = useMemo(() => {
    const map = new Map<string, { months: number; required: number; projected: number }>()
    const today = new Date()
    for (const g of savingsGoals) {
      const end = new Date(g.targetDate)
      const months = monthsBetween(today, end)
      const req = requiredMonthlyPayment(
        g.currentAmount,
        g.targetAmount,
        months,
        returnNum,
      )
      const projected = projectedBalanceAtDate(
        g.currentAmount,
        g.monthlyContribution,
        months,
        returnNum,
      )
      map.set(g.id, { months, required: req, projected })
    }
    return map
  }, [savingsGoals, returnNum])

  function resetForm() {
    setName('')
    setTargetAmount('')
    setCurrentAmount('')
    setTargetDate('')
    setMonthlyContribution('')
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const tgt = Number(targetAmount.replace(/,/g, ''))
    const cur = Number(currentAmount.replace(/,/g, '')) || 0
    const monthly = Number(monthlyContribution.replace(/,/g, '')) || 0
    if (!name.trim()) {
      showToast('กรุณากรอกชื่อเป้าหมาย')
      return
    }
    if (!Number.isFinite(tgt) || tgt <= 0) {
      showToast('กรุณากรอกจำนวนเป้าหมายที่ถูกต้อง')
      return
    }
    if (!targetDate) {
      showToast('กรุณาเลือกวันที่เป้าหมาย')
      return
    }

    const goal: SavingsGoal = {
      id: crypto.randomUUID(),
      name: name.trim(),
      targetAmount: tgt,
      currentAmount: Math.max(0, cur),
      targetDate,
      monthlyContribution: Math.max(0, monthly),
    }
    upsertGoal(goal)
    showToast('บันทึกเป้าหมายแล้ว')
    resetForm()
  }

  async function askAi() {
    setAiError(null)
    setAiText('')
    if (savingsGoals.length === 0) {
      setAiError('เพิ่มเป้าหมายออมก่อนเพื่อให้ AI วิเคราะห์')
      return
    }
    setAiLoading(true)
    try {
      const payload = savingsGoals.map((g) => {
        const ins = goalInsights.get(g.id)
        return {
          ...g,
          monthsRemaining: ins?.months,
          suggestedMonthlyAtAssumedReturn: ins?.required,
          projectedWithCurrentContribution: ins?.projected,
        }
      })
      await streamClaude(
        `ข้อมูลเป้าหมายการออมและการลงทุน (สมมติผลตอบแทน ${returnNum}% ต่อปี):\n${JSON.stringify(payload, null, 2)}\n\nช่วยวิเคราะห์ความเป็นไปได้ ความเสี่ยงเบื้องต้น และแนวทางกระจายการลงทุน/ออมในบริบทไทย เป็นภาษาไทย ไม่ใช้ markdown เน้นข้อความปฏิบัติได้จริง`,
        'คุณเป็นที่ปรึกษาการลงทุนส่วนบุคคล ตอบอย่างระมัดระวัง ไม่ถือเป็นคำแนะนำซื้อขายหลักทรัพย์',
        (d) => setAiText((s) => s + d),
        4096,
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
        <h1 className="text-2xl font-bold text-slate-900">วางแผนออมเงิน</h1>
        <p className="mt-1 text-slate-600">
          ตั้งเป้าหมาย คำนวณยอดที่ต้องออมต่อเดือน และดูภาพรวมดอกเบี้ยทบต้น
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
        >
          <h2 className="text-lg font-semibold text-slate-900">เพิ่มเป้าหมาย</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-600">ชื่อเป้าหมาย</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ดาวน์บ้าน"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">จำนวนเงินเป้าหมาย (บาท)</span>
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">เงินต้นสะสมปัจจุบัน (บาท)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">วันที่ต้องการถึงเป้าหมาย</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">เงินออมปัจจุบันต่อเดือน (บาท)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">สมมติผลตอบแทนการลงทุน (ต่อปี %)</span>
              <input
                type="number"
                step={0.1}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={annualReturn}
                onChange={(e) => setAnnualReturn(e.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-4 rounded-lg bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            บันทึกเป้าหมาย
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">คำแนะนำจาก AI</h2>
            {aiLoading ? <Spinner /> : null}
          </div>
          <button
            type="button"
            onClick={askAi}
            disabled={aiLoading}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            ให้ AI ช่วยวางแผน
          </button>
          {aiError ? (
            <p className="mt-3 text-sm text-red-600">{aiError}</p>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{aiText}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">เป้าหมายของคุณ</h2>
        {savingsGoals.length === 0 ? (
          <p className="mt-4 text-slate-500">ยังไม่มีเป้าหมาย</p>
        ) : (
          <ul className="mt-4 space-y-6">
            {savingsGoals.map((g) => {
              const ins = goalInsights.get(g.id)
              const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))
              const onTrack =
                ins && g.monthlyContribution > 0 && ins.projected + 1 >= g.targetAmount
              return (
                <li
                  key={g.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{g.name}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        เป้าหมาย {formatTHB(g.targetAmount)} · ถึงวันที่ {g.targetDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeGoal(g.id)
                        showToast('ลบเป้าหมายแล้ว')
                      }}
                      className="text-sm text-red-700 hover:underline"
                    >
                      ลบ
                    </button>
                  </div>
                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-700 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    ความคืบหน้า {pct}% — สะสมแล้ว {formatTHB(g.currentAmount)}
                  </div>
                  {ins ? (
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                      <div>
                        เหลือประมาณ {ins.months} เดือน · แนะนำออมขั้นต่ำต่อเดือน (ที่ผลตอบแทน{' '}
                        {returnNum}%/ปี):{' '}
                        <span className="font-medium text-green-700">
                          {formatTHB(Math.max(0, Math.ceil(ins.required)))}
                        </span>
                      </div>
                      <div>
                        หากออม {formatTHB(g.monthlyContribution)}/เดือน คาดการณ์ถึงวันเป้าหมาย:{' '}
                        <span
                          className={
                            ins.projected + 0.01 >= g.targetAmount
                              ? 'font-medium text-green-700'
                              : 'font-medium text-red-700'
                          }
                        >
                          {formatTHB(Math.round(ins.projected))}
                        </span>
                        {onTrack ? (
                          <span className="ml-2 text-green-700">(โดยประมาณถึงเป้า)</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
