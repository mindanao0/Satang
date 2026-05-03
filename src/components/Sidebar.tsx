import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

const linkBase =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
const inactive = 'text-slate-300 hover:bg-white/10 hover:text-white'
const active = 'bg-white/15 text-white'

const items = [
  {
    to: '/',
    label: 'หน้าหลัก',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    to: '/transactions',
    label: 'รายรับ-รายจ่าย',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
  },
  {
    to: '/analysis',
    label: 'วิเคราะห์ AI',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  {
    to: '/budget',
    label: 'งบประมาณ',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
  {
    to: '/wallet',
    label: 'กระเป๋าเงิน',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 7a2 2 0 012-2h11.172a2 2 0 011.414.586l1.828 1.828A2 2 0 0120 8.828V17a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm16 0v3a1 1 0 001 1h1M7 14h.01M11 14h2"
        />
      </svg>
    ),
  },
  {
    to: '/tax',
    label: 'คำนวณภาษี',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    to: '/savings',
    label: 'วางแผนออม',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    to: '/wealth',
    label: 'ความมั่งคั่ง',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'ตั้งค่า',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10.325 4.317a1.724 1.724 0 013.35 0l.147.536a1.724 1.724 0 002.591 1.01l.485-.28a1.724 1.724 0 012.356.63 1.724 1.724 0 01-.631 2.356l-.485.28a1.724 1.724 0 000 2.99l.485.28a1.724 1.724 0 01.631 2.356 1.724 1.724 0 01-2.356.63l-.485-.28a1.724 1.724 0 00-2.591 1.01l-.147.536a1.724 1.724 0 01-3.35 0l-.147-.536a1.724 1.724 0 00-2.591-1.01l-.485.28a1.724 1.724 0 01-2.356-.63 1.724 1.724 0 01.631-2.356l.485-.28a1.724 1.724 0 000-2.99l-.485-.28a1.724 1.724 0 01-.631-2.356 1.724 1.724 0 012.356-.63l.485.28a1.724 1.724 0 002.591-1.01l.147-.536z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-40 w-full shrink-0 bg-[#1e3a5f] text-white md:fixed md:left-0 md:top-0 md:h-screen md:w-56">
      <div className="hidden border-b border-white/10 px-4 py-4 md:block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg font-bold tracking-tight">สตางค์</div>
            <p className="mt-1 text-xs text-slate-300">จัดการเงินเดือนและการเงินส่วนบุคคล</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:gap-1 md:p-3 md:py-4">
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1 md:hidden">
          <span className="text-sm font-bold">สตางค์</span>
          <ThemeToggle />
        </div>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `${linkBase} shrink-0 whitespace-nowrap md:whitespace-normal ${isActive ? active : inactive}`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
