/** ดอกเบี้ยทบต้นรายเดือน จากอัตราผลตอบแทนต่อปี (เช่น 5 = 5%) */
export function monthlyRateFromAnnualPercent(annualPercent: number): number {
  return annualPercent / 100 / 12
}

/**
 * จำนวนเงินที่ต้องออมต่อเดือนเพื่อให้ถึงเป้าหมาย (ท้ายเดือนสุดท้าย)
 * FV = PV*(1+r)^n + PMT * (((1+r)^n - 1) / r)
 * => PMT = (FV - PV*(1+r)^n) / (((1+r)^n - 1) / r
 */
export function requiredMonthlyPayment(
  currentAmount: number,
  targetAmount: number,
  months: number,
  annualReturnPercent: number,
): number {
  if (months <= 0) return Math.max(0, targetAmount - currentAmount)
  if (targetAmount <= currentAmount) return 0

  const r = monthlyRateFromAnnualPercent(annualReturnPercent)
  if (r === 0) {
    return (targetAmount - currentAmount) / months
  }

  const n = months
  const fvPv = currentAmount * (1 + r) ** n
  const growth = ((1 + r) ** n - 1) / r
  return (targetAmount - fvPv) / growth
}

export function monthsBetween(from: Date, to: Date): number {
  const y = to.getFullYear() - from.getFullYear()
  const m = to.getMonth() - from.getMonth()
  return Math.max(1, y * 12 + m)
}

export function projectedBalanceAtDate(
  currentAmount: number,
  monthlyPayment: number,
  months: number,
  annualReturnPercent: number,
): number {
  const r = monthlyRateFromAnnualPercent(annualReturnPercent)
  let bal = currentAmount
  for (let i = 0; i < months; i++) {
    bal = bal * (1 + r) + monthlyPayment
  }
  return bal
}
