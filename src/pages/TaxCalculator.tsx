import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFinance } from '../context/FinanceContext'
import { useToast } from '../context/ToastContext'
import {
  clampSocialSecurityAnnual,
  computeTaxFromProfileAndWallet,
  totalAnnualDeductions,
} from '../lib/tax'
import { formatTHB } from '../lib/format'
import { streamGroq } from '../lib/groq'
import { Spinner } from '../components/Spinner'
import { fetchMonthlyWalletForMonth, monthKeyFromDate } from '../lib/supabaseWallet'

export function TaxCalculator() {
  const { profile, setProfile } = useFinance()
  const { showToast } = useToast()

  const [walletStarting, setWalletStarting] = useState(0)
  const [walletLoaded, setWalletLoaded] = useState(false)
  const didAutofillSalary = useRef(false)

  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const mk = monthKeyFromDate(new Date())
      const { data, error } = await fetchMonthlyWalletForMonth(mk)
      if (cancelled) return
      if (!error) setWalletStarting(data?.startingBalance ?? 0)
      setWalletLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!walletLoaded || didAutofillSalary.current) return
    if (profile.salary > 0) {
      didAutofillSalary.current = true
      return
    }
    if (walletStarting <= 0) {
      didAutofillSalary.current = true
      return
    }
    didAutofillSalary.current = true
    void setProfile({ ...profile, salary: Math.floor(walletStarting) })
  }, [walletLoaded, walletStarting, profile, setProfile])

  const breakdown = useMemo(
    () => computeTaxFromProfileAndWallet(profile, walletStarting),
    [profile, walletStarting],
  )

  function updateDeductions(partial: Partial<typeof profile.taxDeductions>) {
    setProfile({
      ...profile,
      taxDeductions: { ...profile.taxDeductions, ...partial },
    })
  }

  /** Re-persist on blur so success toast matches last save; errors use formatted Supabase text via toast. */
  const persistProfileOnBlur = useCallback(async () => {
    const { error } = await setProfile(profile)
    if (!error) showToast('บันทึกข้อมูลแล้ว')
  }, [profile, setProfile, showToast])

  async function askAi() {
    setAiError(null)
    setAiText('')
    setAiLoading(true)
    try {
      const summary = `
เงินเดือนในโปรไฟล์ (บาท/เดือน): ${profile.salary}
ยอดตั้งต้นกระเป๋าเดือนนี้: ${walletStarting}
เงินได้ทั้งปีโดยประมาณ (ฐานคำนวณ): ${breakdown.annualGross}
ค่าลดหย่อนรวม: ${totalAnnualDeductions(profile)} (รวมประกันสังคมหลังจำกัดสูงสุด 9,000 บาท/ปี)
เงินได้สุทธิสำหรับคำนวณภาษี: ${breakdown.netTaxableIncome}
ภาษีประมาณการต่อปี: ${breakdown.taxAnnual}
รายละเอียดค่าลดหย่อน: ${JSON.stringify(profile.taxDeductions)}
`
      await streamGroq(
        `จากข้อมูลผู้ใช้:\n${summary}\n\nช่วยแนะนำแนวทางลดหย่อนภาษีเพิ่มเติมที่เหมาะสมในบริบทไทย (SSF, RMF, ประกันชีวิต ฯลฯ) เป็นภาษาไทย 3-8 ย่อหน้า ไม่ใช้ markdown เน้นข้อความที่เข้าใจง่าย`,
        'คุณเป็นที่ปรึกษาภาษีส่วนบุคคลในประเทศไทย ตอบอย่างระมัดระวัง ไม่ถือเป็นคำแนะนำทางกฎหมาย',
        (d) => setAiText((s) => s + d),
        4096,
      )
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setAiLoading(false)
    }
  }

  const ssCapped = clampSocialSecurityAnnual(profile.taxDeductions.socialSecurity)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">คำนวณภาษีเงินได้บุคคลธรรมดา</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          อัตราก้าวหน้า ปีภาษี 2567 — สำหรับประมาณการเบื้องต้นเท่านั้น
        </p>
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
          ระบบใช้ยอดตั้งต้นจากกระเป๋าเงินเป็นฐานคำนวณเมื่อยังไม่ได้ระบุเงินเดือนในโปรไฟล์
          {profile.salary <= 0 ? (
            <>
              {' '}
              — เงินได้ทั้งปีโดยประมาณ = ยอดตั้งต้นเดือนนี้ × 12 ({formatTHB(walletStarting * 12)})
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm md:p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ข้อมูลรายได้และค่าลดหย่อน</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            เงินเดือนเป็นฐานต่อเดือน ระบบคูณ 12 เพื่อหาเงินได้ทั้งปี — ถ้าเว้นว่างจะใช้ยอดตั้งต้นกระเป๋าเดือนปัจจุบัน
          </p>

          <label className="mt-4 block text-sm">
            <span className="text-slate-600 dark:text-slate-400">เงินเดือน (บาท/เดือน)</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={profile.salary || ''}
              onChange={(e) =>
                setProfile({ ...profile, salary: Number(e.target.value) || 0 })
              }
              onBlur={() => void persistProfileOnBlur()}
            />
          </label>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">ค่าลดหย่อนส่วนตัว (บาท/ปี)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={profile.taxDeductions.personalAllowance || ''}
                onChange={(e) =>
                  updateDeductions({ personalAllowance: Number(e.target.value) || 0 })
                }
                onBlur={() => void persistProfileOnBlur()}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">ประกันสังคม (บาท/ปี, ใช้ลดหย่อนได้สูงสุด 9,000)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={profile.taxDeductions.socialSecurity || ''}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    taxDeductions: {
                      ...profile.taxDeductions,
                      socialSecurity: Number(e.target.value) || 0,
                    },
                  })
                }
                onBlur={() => void persistProfileOnBlur()}
              />
              <span className="mt-1 block text-xs text-slate-500">
                ใช้ในการคำนวณ: {formatTHB(ssCapped)} / ปี
              </span>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">เบี้ยประกันชีวิต (บาท/ปี)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={profile.taxDeductions.lifeInsurance || ''}
                onChange={(e) =>
                  updateDeductions({ lifeInsurance: Number(e.target.value) || 0 })
                }
                onBlur={() => void persistProfileOnBlur()}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">SSF (บาท/ปี)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={profile.taxDeductions.ssf || ''}
                onChange={(e) => updateDeductions({ ssf: Number(e.target.value) || 0 })}
                onBlur={() => void persistProfileOnBlur()}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-400">RMF (บาท/ปี)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={profile.taxDeductions.rmf || ''}
                onChange={(e) => updateDeductions({ rmf: Number(e.target.value) || 0 })}
                onBlur={() => void persistProfileOnBlur()}
              />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">ผลการคำนวณ</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">เงินได้ทั้งปี (ประมาณ)</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatTHB(breakdown.annualGross)}
                </span>
              </li>
              <li className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">ค่าลดหย่อนรวม</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatTHB(breakdown.totalDeductions)}
                </span>
              </li>
              <li className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">เงินได้สุทธิ (ฐานภาษี)</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatTHB(breakdown.netTaxableIncome)}
                </span>
              </li>
              <li className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">ภาษีสุทธิ (ต่อปี)</span>
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {formatTHB(breakdown.taxAnnual)}
                </span>
              </li>
              <li className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-slate-700">
                <span className="text-slate-600 dark:text-slate-400">ภาษีหัก ณ ที่จ่ายโดยเฉลี่ย (ต่อเดือน)</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatTHB(breakdown.taxMonthlyWithholding)}
                </span>
              </li>
              <li className="flex justify-between gap-4">
                <span className="text-slate-600 dark:text-slate-400">เงินได้สุทธิหลังหักภาษี (ต่อปี)</span>
                <span className="font-medium text-green-700 dark:text-green-400">
                  {formatTHB(breakdown.netIncomeAfterTaxAnnual)}
                </span>
              </li>
              <li className="flex justify-between gap-4 pt-2">
                <span className="text-slate-600 dark:text-slate-400">เงินได้สุทธิหลังหักภาษี (ต่อเดือน)</span>
                <span className="font-medium text-green-700 dark:text-green-400">
                  {formatTHB(breakdown.netIncomeAfterTaxMonthly)}
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">คำแนะนำจาก AI</h2>
              {aiLoading ? <Spinner /> : null}
            </div>
            <button
              type="button"
              onClick={askAi}
              disabled={aiLoading}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              ให้ AI แนะนำการลดหย่อนภาษีเพิ่มเติม
            </button>
            {aiError ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{aiError}</p>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{aiText}</p>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        อัตราภาษี: 0–150,000 บาท 0% · 150,001–300,000 5% · 300,001–500,000 10% · 500,001–750,000
        15% · 750,001–1,000,000 20% · 1,000,001–2,000,000 25% · 2,000,001–5,000,000 30% ·
        5,000,001 ขึ้นไป 35%
      </p>
    </div>
  )
}
