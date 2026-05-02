import { useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { streamClaude } from '../lib/claude'
import { Spinner } from '../components/Spinner'

export function AIAnalysis() {
  const { transactions, profile } = useFinance()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    setText('')
    const expenses = transactions.filter((t) => t.type === 'expense')
    if (expenses.length === 0) {
      setError('ยังไม่มีข้อมูลรายจ่ายให้วิเคราะห์')
      return
    }

    setLoading(true)
    try {
      const payload = JSON.stringify(
        expenses.map((t) => ({
          category: t.category,
          amount: t.amount,
          date: t.date,
          note: t.note,
        })),
      )
      await streamClaude(
        `นี่คือรายการรายจ่ายทั้งหมดของผู้ใช้ (JSON): ${payload}\nเงินเดือนจากโปรไฟล์: ${profile.salary} บาท/เดือน\n\nกรุณาตอบเป็นภาษาไทย โดยมีหัวข้อชัดเจนดังนี้:\n1) สรุปพฤติกรรมการใช้จ่าย\n2) หมวดที่ใช้เงินมากเกินไป (ถ้ามี) และเหตุผลสั้นๆ\n3) คำแนะนำลดค่าใช้จ่าย 3-5 ข้อ\n4) เปรียบเทียบกับหลัก 50/30/20 (ความจำเป็น/ความต้องการ/การออมและหนี้) ว่าประมาณการจากข้อมูลนี้เป็นอย่างไร\n\nไม่ต้องใช้ markdown`,
        'คุณเป็นที่ปรึกษาการเงิน ให้คำแนะนำที่นุ่มนวล เป็นจริง และเป็นภาษาไทย',
        (d) => setText((s) => s + d),
        4096,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">วิเคราะห์การใช้จ่ายด้วย AI</h1>
        <p className="mt-1 text-slate-600">
          ส่งข้อมูลรายจ่ายทั้งหมดไปให้ Claude ช่วยสรุปและให้คำแนะนำ
        </p>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-60"
      >
        {loading ? <Spinner className="!h-4 !w-4 border-t-white" /> : null}
        วิเคราะห์ด้วย AI
      </button>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="min-h-[200px] rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">ผลการวิเคราะห์</h2>
        <div className="mt-3 max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {text || (loading ? 'กำลังสตรีมข้อความ...' : 'กดปุ่มด้านบนเพื่อเริ่มวิเคราะห์')}
        </div>
      </div>
    </div>
  )
}
