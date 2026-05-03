import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ToastContextValue = {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setMessage(msg)
    const longOrError = msg.length > 120 || msg.includes('ไม่สำเร็จ')
    window.setTimeout(() => setMessage(null), longOrError ? 12_000 : 3200)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          className="fixed bottom-24 left-1/2 z-[60] max-h-[min(50vh,24rem)] max-w-[min(90vw,36rem)] -translate-x-1/2 overflow-y-auto rounded-lg bg-slate-900 px-4 py-2 text-left text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900 md:bottom-8"
          role="status"
        >
          <span className="whitespace-pre-wrap break-words">{message}</span>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast ต้องอยู่ภายใน ToastProvider')
  return ctx
}
