import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ChatAssistant } from './ChatAssistant'

export function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:pl-56">
        <main className="flex-1 bg-slate-100 p-4 md:p-8 dark:bg-slate-950">
          <Outlet />
        </main>
      </div>
      <ChatAssistant />
    </div>
  )
}
