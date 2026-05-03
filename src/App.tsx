import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FinanceProvider } from './context/FinanceContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { AIAnalysis } from './pages/AIAnalysis'
import { TaxCalculator } from './pages/TaxCalculator'
import { SavingsPlanner } from './pages/SavingsPlanner'
import { Budget } from './pages/Budget'
import { NetWorth } from './pages/NetWorth'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <FinanceProvider>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="analysis" element={<AIAnalysis />} />
                <Route path="budget" element={<Budget />} />
                <Route path="wallet" element={<Navigate to="/transactions" replace />} />
                <Route path="tax" element={<TaxCalculator />} />
                <Route path="savings" element={<SavingsPlanner />} />
                <Route path="wealth" element={<NetWorth />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </FinanceProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
