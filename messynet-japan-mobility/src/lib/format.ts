import type { Locale } from './i18n'

export const fmtInt = (n: number | null | undefined): string =>
  n == null ? '—' : Math.round(n).toLocaleString('en-US')

export const fmtPct = (n: number | null | undefined, dp = 0): string =>
  n == null ? '—' : `${(n * 100).toFixed(dp)}%`

export const fmtSigned = (n: number | null | undefined, dp = 1): string =>
  n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}%`

// ¥4.35M / ¥976K in English, 435万円 / 1.2億円 in Japanese
export const fmtYen = (n: number | null | undefined, locale: Locale = 'en'): string => {
  if (n == null) return '—'
  const a = Math.abs(n), sign = n < 0 ? '−' : ''
  if (locale === 'ja') {
    if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(1)}億円`
    return `${sign}${Math.round(a / 1e4).toLocaleString('en-US')}万円`
  }
  if (a >= 1e9) return `${sign}¥${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${sign}¥${(a / 1e6).toFixed(a >= 1e8 ? 0 : 2)}M`
  // one unit throughout, so ¥0.95M and ¥4.14M can be compared at a glance
  return `${sign}¥${(a / 1e6).toFixed(2)}M`
}

// "2026-09-19" -> "19" (axis) / "Sep 19" | "9/19" (prose)
export const dayOfMonth = (iso: string): string => String(+iso.slice(8, 10))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmtDate = (iso: string, locale: Locale = 'en'): string => {
  const m = +iso.slice(5, 7), d = +iso.slice(8, 10)
  return locale === 'ja' ? `${m}/${d}` : `${MONTHS[m - 1]} ${d}`
}
