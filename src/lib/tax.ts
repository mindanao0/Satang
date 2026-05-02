import type { UserProfile } from '../types'

/** ภาษีเงินได้บุคคลธรรมดา อัตราก้าวหน้า ปีภาษี 2567 (เงินได้สุทธิประจำปี) */
export function calculateProgressiveTaxAnnual(netTaxableIncome: number): number {
  if (netTaxableIncome <= 150_000) return 0

  const brackets: { upTo: number; rate: number }[] = [
    { upTo: 300_000, rate: 0.05 },
    { upTo: 500_000, rate: 0.1 },
    { upTo: 750_000, rate: 0.15 },
    { upTo: 1_000_000, rate: 0.2 },
    { upTo: 2_000_000, rate: 0.25 },
    { upTo: 5_000_000, rate: 0.3 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.35 },
  ]

  let tax = 0
  let prev = 150_000

  for (const b of brackets) {
    if (netTaxableIncome <= prev) break
    const slice = Math.min(netTaxableIncome, b.upTo) - prev
    if (slice > 0) tax += slice * b.rate
    prev = b.upTo
  }

  return Math.round(tax)
}

const MAX_SOCIAL_SECURITY_ANNUAL = 9_000

export function clampSocialSecurityAnnual(amount: number): number {
  return Math.min(Math.max(0, amount), MAX_SOCIAL_SECURITY_ANNUAL)
}

export function annualGrossFromMonthlySalary(monthly: number): number {
  return monthly * 12
}

/** รวมค่าลดหย่อนที่ใช้ลดภาษี (ประกันสังคมจำกัด 9,000 บาท/ปี) */
export function totalAnnualDeductions(profile: UserProfile): number {
  const ss = clampSocialSecurityAnnual(profile.taxDeductions.socialSecurity)
  return (
    profile.taxDeductions.personalAllowance +
    ss +
    profile.taxDeductions.lifeInsurance +
    profile.taxDeductions.ssf +
    profile.taxDeductions.rmf
  )
}

export interface TaxBreakdown {
  annualGross: number
  totalDeductions: number
  netTaxableIncome: number
  taxAnnual: number
  taxMonthlyWithholding: number
  netIncomeAfterTaxAnnual: number
  netIncomeAfterTaxMonthly: number
}

export function computeTaxFromProfile(profile: UserProfile): TaxBreakdown {
  const annualGross = annualGrossFromMonthlySalary(profile.salary)
  const totalDeductions = totalAnnualDeductions(profile)
  const netTaxableIncome = Math.max(0, annualGross - totalDeductions)
  const taxAnnual = calculateProgressiveTaxAnnual(netTaxableIncome)
  const taxMonthlyWithholding = taxAnnual / 12
  const netIncomeAfterTaxAnnual = annualGross - taxAnnual
  const netIncomeAfterTaxMonthly = netIncomeAfterTaxAnnual / 12

  return {
    annualGross,
    totalDeductions,
    netTaxableIncome,
    taxAnnual,
    taxMonthlyWithholding,
    netIncomeAfterTaxAnnual,
    netIncomeAfterTaxMonthly,
  }
}
