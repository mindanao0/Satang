import { Outlet } from 'react-router-dom'
import { useFinance } from '../context/FinanceContext'
import { Sidebar } from './Sidebar'
import { ChatAssistant } from './ChatAssistant'
import { Spinner } from './Spinner'

export function Layout() {
  const { financeHydrating } = useFinance()

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:pl-56">
        <main className="flex-1 bg-slate-100 p-4 md:p-8 dark:bg-slate-950">
          {financeHydrating ? (
            <div
              className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-400"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Spinner className="!h-8 !w-8" />
              <span className="text-sm">กำลังโหลดข้อมูล...</span>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
      <ChatAssistant />
    </div>
  )
}
