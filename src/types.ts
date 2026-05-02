export interface Transaction {
  id: string
  type: 'income' | 'expense'
  category: string
  amount: number
  date: string
  note: string
}

export interface UserProfile {
  salary: number
  taxDeductions: {
    personalAllowance: number
    socialSecurity: number
    lifeInsurance: number
    ssf: number
    rmf: number
  }
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  monthlyContribution: number
}

export const EXPENSE_CATEGORIES = [
  'อาหาร',
  'เดินทาง',
  'ที่พัก',
  'ความบันเทิง',
  'สุขภาพ',
  'การศึกษา',
  'ช้อปปิ้ง',
  'อื่นๆ',
] as const

export const INCOME_CATEGORIES = ['เงินเดือน', 'โบนัส', 'รายได้เสริม', 'อื่นๆ'] as const
