export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700 dark:border-slate-600 dark:border-t-sky-400 ${className}`}
      aria-hidden
    />
  )
}
