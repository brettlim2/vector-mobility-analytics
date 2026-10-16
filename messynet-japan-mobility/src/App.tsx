import { useEffect, useRef, useState } from 'react'
import { useData } from './lib/useData'
import { RetailDashboard } from './dashboards/RetailDashboard'
import { TourismDashboard } from './dashboards/TourismDashboard'
import { IntroPage } from './dashboards/IntroPage'
import { ReadoutBoundary } from './components/ui'
import { makeL, tx, type Locale } from './lib/i18n'

type Tab = 'intro' | 'retail' | 'tourism'
const RETAIL_KEY = 'new_chitose'

type TabDef = { id: Tab; label: { en: string; ja: string }; sub: { en: string; ja: string } }
const INTRO_TAB: TabDef = { id: 'intro', label: { en: 'Start here', ja: 'はじめに' }, sub: { en: 'What is real, assumed, needed', ja: '実在・仮定・必要なデータ' } }
const RETAIL_TAB: TabDef = { id: 'retail', label: { en: 'Airport retail', ja: '空港リテール' }, sub: { en: 'Social media → visits → sales', ja: 'SNS → 来訪 → 売上' } }
const TOURISM_TAB: TabDef = { id: 'tourism', label: { en: 'Airlines & tourism', ja: '航空会社・観光' }, sub: { en: 'Who travels → where they go → routes', ja: '誰が旅行するか → 行き先 → 路線' } }
const TABS: TabDef[] = __ONLY__ === 'retail' ? [INTRO_TAB, RETAIL_TAB] : __ONLY__ === 'tourism' ? [INTRO_TAB, TOURISM_TAB] : [INTRO_TAB, RETAIL_TAB, TOURISM_TAB]

// Slim opening bar: the sample-data notice, plus a fold-out guide to reading the numbers.
// The story itself starts immediately below, so it lands in the first screen.
function SampleBar({ locale }: { locale: Locale }) {
  const L = makeL(locale)
  return (
    <details className="group mb-4 rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-panel)] px-4 py-2.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]">
        <span className="mn-kicker">{L('Real mobility', '実モビリティ')}</span>
        <span className="text-[13.5px] text-[var(--mn-body)]">{L('Footfall and movement are real, from the Factori Japan panel. Revenue is modelled and the social-media series is synthetic — both labelled where they appear.', '来訪と動きはFactori日本パネルの実データです。売上は推計、SNSは合成データで、該当箇所に明示しています。')}</span>
        <span className="ml-auto text-[13px] font-semibold text-[var(--mn-teal)] underline underline-offset-4">
          <span className="group-open:hidden">{L('How to read these numbers ▾', '数値の読み方 ▾')}</span>
          <span className="hidden group-open:inline">{L('Hide ▴', '閉じる ▴')}</span>
        </span>
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 border-t border-[var(--mn-wire)] pt-3 text-[13.5px] leading-relaxed md:grid-cols-2">
        {[
          [L('Where the data comes from', 'データの出どころ'), L('A sample of smartphones that report their location through apps. It is a sample, not a head count, so read the percentages and patterns rather than the raw totals.', 'アプリを通じて位置情報が得られるスマートフォンのサンプルです。全数ではないため、実数よりも割合と傾向をご覧ください。')],
          [L('"Visits" and "visitors"', '「来訪」「旅行者」とは'), L('Phones in that sample seen in a place. Each one stands for many real people.', 'その場所で観測されたサンプル内のスマートフォンです。1台が多数の実際の人を代表します。')],
          [L('"Too small to call"', '「判定できない小ささ」'), L('Visits go up and down from week to week anyway. A change has to be bigger than that normal variation before we call it real.', '来訪は週ごとに自然に上下します。その通常の変動幅を超えて初めて、本物の変化と判断します。')],
          [L('"Normal week"', '「通常週」とは'), L('The days before the campaign, adjusted for how busy the terminal was, so holidays and extra flights do not count as campaign effect.', '施策前の期間を、ターミナルの混雑度で調整したものです。祝日や増便の影響が施策効果に混ざらないようにしています。')],
        ].map(([term, text]) => (
          <div key={term}>
            <dt className="font-semibold text-[var(--mn-heading)]">{term}</dt>
            <dd className="text-[var(--mn-body)]">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const value = new URLSearchParams(window.location.search).get('tab')
    return TABS.some((item) => item.id === value) ? (value as Tab) : 'intro'
  })
  const [theme, setTheme] = useState<'day' | 'dark'>(() => {
    const value = new URLSearchParams(window.location.search).get('theme')
    if (value === 'dark' || value === 'day') return value
    const host = document.documentElement.getAttribute('data-theme')
    if (host === 'dark') return 'dark'
    if (host === 'light') return 'day'
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'day' } catch { return 'day' }
  })
  const [locale, setLocale] = useState<Locale>(() => {
    const value = new URLSearchParams(window.location.search).get('lang')
    if (value === 'en' || value === 'ja') return value
    try { return window.localStorage.getItem('jp-usecases-locale') === 'ja' ? 'ja' : 'en' } catch { return 'en' }
  })
  const { data, loading } = useData()
  const L = makeL(locale)
  const headerRef = useRef<HTMLElement>(null)
  // the sticky section bar sits directly under the header, whatever height the header wraps to
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--mn-header-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    try { window.localStorage.setItem('jp-usecases-locale', locale) } catch { /* private browsing */ }
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      url.searchParams.set('lang', locale)
      url.searchParams.set('theme', theme)
      window.history.replaceState(null, '', url)
    } catch { /* sandboxed viewers may refuse history writes */ }
    document.body.style.background = theme === 'day' ? '#f5f2e9' : '#0b0e18'
  }, [tab, locale, theme])

  return (
    <div className={`vm-page-bg min-h-screen ${theme === 'day' ? 'theme-day' : 'theme-dark'}`}>
      <header ref={headerRef} style={{ top: 'env(safe-area-inset-top, 0px)' }} className="theme-dark z-10 lg:sticky border-b border-[var(--mn-wire)] bg-[var(--mn-night)]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--mn-radius)] bg-[var(--mn-teal)] font-display text-[16px] text-[var(--mn-logo-ink)]">
              MN
            </div>
            <div>
              <div className="font-display text-[16px] leading-none text-[var(--mn-heading)]">MessyNet</div>
              <div className="text-[11px] tracking-[0.06em] text-[var(--mn-mist)]">{L('Visitor movement · Japan', '人流分析 · 日本')}</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
                className="rounded-[var(--mn-radius-btn)] border px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]"
                style={{ borderColor: tab === t.id ? 'var(--mn-teal)' : 'var(--mn-wire)', background: tab === t.id ? 'var(--mn-callout-bg)' : 'transparent' }}>
                <div className="text-[14.5px]" style={{ color: tab === t.id ? 'var(--mn-heading)' : 'var(--mn-body)' }}>{tx(t.label, locale)}</div>
                <div className="text-[12px] text-[var(--mn-mist)]">{tx(t.sub, locale)}</div>
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 text-[13.5px] text-[var(--mn-mist)]" role="group" aria-label={L('Theme', 'テーマ')}>
            {(['day', 'dark'] as const).map((th) => (
              <button key={th} type="button" onClick={() => setTheme(th)} aria-pressed={theme === th}
                className={`rounded-[var(--mn-radius-btn)] border px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)] ${theme === th ? 'border-[var(--mn-teal)] bg-[var(--mn-callout-bg)] text-[var(--mn-heading)]' : 'border-[var(--mn-wire)] text-[var(--mn-mist)] hover:text-[var(--mn-heading)]'}`}>
                {th === 'day' ? L('Daylight', 'ライト') : L('Dark', 'ダーク')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[13.5px] text-[var(--mn-mist)]" role="group" aria-label={L('Language', '言語')}>
            <span className="mr-1">{L('Language', '言語')}</span>
            {(['en', 'ja'] as const).map((lang) => (
              <button key={lang} type="button" onClick={() => setLocale(lang)} aria-pressed={locale === lang}
                className={`rounded-[var(--mn-radius-btn)] border px-2.5 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)] ${locale === lang ? 'border-[var(--mn-teal)] bg-[var(--mn-callout-bg)] text-[var(--mn-heading)]' : 'border-[var(--mn-wire)] text-[var(--mn-mist)] hover:text-[var(--mn-heading)]'}`}>
                {lang === 'en' ? 'English' : '日本語'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 lg:px-8">
        {loading ? (
          <div className="py-24 text-center text-[16px] text-[var(--mn-mist)]">{L('Loading…', '読み込み中…')}</div>
        ) : (
          <>
            <SampleBar locale={locale} />
            <ReadoutBoundary resetKey={tab} note={L('This report could not be shown because its data file is not in the expected format.', 'データファイルの形式が想定と異なるため、このレポートを表示できません。')}>
              {tab === 'intro' && <IntroPage data={data} locale={locale} onPick={(x) => { setTab(x); window.scrollTo({ top: 0 }) }} />}
              {__ONLY__ !== 'tourism' && tab === 'retail' && <RetailDashboard v={data?.retail?.[RETAIL_KEY]} locale={locale} />}
              {__ONLY__ !== 'retail' && tab === 'tourism' && <TourismDashboard t={data?.tourism} locale={locale} />}
            </ReadoutBoundary>
          </>
        )}
        <footer className="mt-8 border-t border-[var(--mn-wire)] pt-4 text-[12px] text-[var(--mn-mist)]">
          {L('MessyNet · Built on real Factori Japan mobility (Sep 16–23 2026); revenue modelled, social synthetic. Location data is a sample, not a head count: read the patterns rather than the totals.',
             'MessyNet · Factori日本の実モビリティに基づく（2026年9月16〜23日）。売上は推計、SNSは合成。位置情報データは全数ではなくサンプルです。実数ではなく傾向をご覧ください。')}
        </footer>
      </main>
    </div>
  )
}
