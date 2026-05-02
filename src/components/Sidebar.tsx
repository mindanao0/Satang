import { NavLink } from 'react-router-dom'

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
]

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-40 w-full shrink-0 bg-[#1e3a5f] text-white md:fixed md:left-0 md:top-0 md:h-screen md:w-56">
      <div className="hidden border-b border-white/10 px-4 py-5 md:block">
        <div className="text-lg font-bold tracking-tight">สตางค์</div>
        <p className="mt-1 text-xs text-slate-300">จัดการเงินเดือนและการเงินส่วนบุคคล</p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:gap-1 md:p-3 md:py-4">
        <div className="flex shrink-0 items-center px-2 py-1 text-sm font-bold md:hidden">สตางค์</div>
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
