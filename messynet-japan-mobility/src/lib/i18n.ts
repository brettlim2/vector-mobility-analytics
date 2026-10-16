export type Locale = 'en' | 'ja'
export interface Lbl { en: string; ja: string }

export const tx = (l: Lbl | undefined, locale: Locale): string => (l ? (locale === 'ja' ? l.ja : l.en) : '—')
export const makeL = (locale: Locale) => (en: string, ja: string) => (locale === 'ja' ? ja : en)
