/** Recharts-friendly colors: light vs dark UI. */
export type ChartPalette = {
  pie: string[]
  grid: string
  axis: string
  tick: string
  tooltipBg: string
  tooltipBorder: string
  income: string
  expense: string
  linePrimary: string
  legendColor: string
}

export const chartPaletteLight: ChartPalette = {
  pie: [
    '#1d4ed8',
    '#0ea5e9',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#64748b',
  ],
  grid: '#e2e8f0',
  axis: '#64748b',
  tick: '#64748b',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e2e8f0',
  income: '#15803d',
  expense: '#b91c1c',
  linePrimary: '#0d9488',
  legendColor: '#334155',
}

export const chartPaletteDark: ChartPalette = {
  pie: [
    '#38bdf8',
    '#818cf8',
    '#c084fc',
    '#f472b6',
    '#34d399',
    '#fbbf24',
    '#a78bfa',
    '#94a3b8',
  ],
  grid: '#334155',
  axis: '#94a3b8',
  tick: '#94a3b8',
  tooltipBg: '#1e293b',
  tooltipBorder: '#475569',
  income: '#4ade80',
  expense: '#f87171',
  linePrimary: '#2dd4bf',
  legendColor: '#cbd5e1',
}

export function getChartPalette(isDark: boolean): ChartPalette {
  return isDark ? chartPaletteDark : chartPaletteLight
}
