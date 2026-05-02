import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FinanceProvider } from './context/FinanceContext'
import { ToastProvider } from './context/ToastContext'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { AIAnalysis } from './pages/AIAnalysis'
import { TaxCalculator } from './pages/TaxCalculator'
import { SavingsPlanner } from './pages/SavingsPlanner'

export default function App() {
  return (
    <BrowserRouter>
      <FinanceProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="analysis" element={<AIAnalysis />} />
              <Route path="tax" element={<TaxCalculator />} />
              <Route path="savings" element={<SavingsPlanner />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </FinanceProvider>
    </BrowserRouter>
  )
}
