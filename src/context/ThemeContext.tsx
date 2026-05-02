import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'darkMode'

function applyDarkClass(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

type ThemeContextValue = {
  isDark: boolean
  toggle: () => void
  setDark: (value: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    applyDarkClass(isDark)
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }, [isDark])

  const toggle = useCallback(() => setIsDark((d) => !d), [])

  const value = useMemo(
    () => ({ isDark, toggle, setDark: setIsDark }),
    [isDark, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme ต้องอยู่ภายใน ThemeProvider')
  return ctx
}
