// Inline-SVG / HTML charts. Colours are CSS variables (lib/palette.ts) so every chart
// re-themes between Daylight and Dark. Rules followed throughout: one y-axis per plot,
// solid hairline grids, value labels on the marks that matter, text in text colours.
import type { ReactNode } from 'react'
import type { DayTag, Tourism, MarketAgg } from '../lib/types'
import { TEAL, PRIMARY, CONTEXT, VOLT, MIST, GRID, DEEP, ICE, HALO, SURFACE, RANGE } from '../lib/palette'
import { dayOfMonth, fmtDate, fmtInt, fmtSigned } from '../lib/format'
import { tx, type Locale } from '../lib/i18n'
import { Legend } from './ui'

type Pt = { date: string; value: number }
const lbl = (locale: Locale) => (en: string, ja: string) => (locale === 'ja' ? ja : en)

// ---- Daily trend: share line on top, posts in their own strip below (shared x, no second y-axis) ----
export function TrendChart({ series, during, tail = [], dayTags, postsByDay, baseline, range, campaignAvg, format = fmtInt, caption, locale = 'en', windowLabel }: {
  series: Pt[]
  during: string[]
  tail?: string[]
  dayTags?: Record<string, DayTag>
  postsByDay?: Record<string, number>
  baseline?: number
  range?: [number, number]
  campaignAvg?: { value: number; label: string }
  format?: (n: number) => string
  caption?: string
  locale?: Locale
  windowLabel: string
}) {
  const L = lbl(locale)
  const n = series.length
  if (!n) return null
  const W = 680, PAD = { l: 44, r: 16 }
  const TOP = { y: 26, h: 176 }
  const POSTS = { y: TOP.y + TOP.h + 26, h: postsByDay ? 54 : 0 }
  const AXIS_Y = POSTS.y + POSTS.h + 14
  const H = AXIS_Y + 14
  const vals = series.map((s) => s.value)
  const lo0 = Math.min(...vals, range?.[0] ?? Infinity), hi0 = Math.max(...vals, range?.[1] ?? -Infinity, campaignAvg?.value ?? -Infinity)
  const pad = (hi0 - lo0) * 0.18
  const lo = lo0 - pad, hi = hi0 + pad
  const step = (W - PAD.l - PAD.r) / n
  const x = (i: number) => PAD.l + step * (i + 0.5)
  const y = (v: number) => TOP.y + (1 - (v - lo) / (hi - lo)) * TOP.h
  const idxOf = (dates: string[]) => series.map((s, i) => (dates.includes(s.date) ? i : -1)).filter((i) => i >= 0)
  const span = (ii: number[]) => (ii.length ? { x: PAD.l + step * ii[0], w: step * ii.length } : null)
  const dI = idxOf(during), tI = idxOf(tail)
  const dBand = span(dI), tBand = span(tI)
  const holI = series.map((s, i) => (dayTags?.[s.date]?.holiday || (i > 0 && dayTags?.[series[i - 1].date]?.holiday && dayTags?.[s.date]?.weekend) ? i : -1)).filter((i) => i >= 0)
  // Silver Week = the run of weekend + holiday days around the holidays
  const swStart = holI.length ? Math.max(0, Math.min(...holI) - 2) : -1, swEnd = holI.length ? Math.max(...holI) : -1
  const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ')
  const maxPosts = postsByDay ? Math.max(1, ...series.map((s) => postsByDay[s.date] ?? 0)) : 1
  const peakPostI = postsByDay ? series.reduce((p, s, i) => ((postsByDay[s.date] ?? 0) > (postsByDay[series[p].date] ?? 0) ? i : p), 0) : -1
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img"
          aria-label={`${n} days. ${campaignAvg ? campaignAvg.label : ''}`}>
          {dBand && <rect x={dBand.x} y={TOP.y - 8} width={dBand.w} height={AXIS_Y - TOP.y} fill={DEEP} />}
          {tBand && <rect x={tBand.x} y={TOP.y - 8} width={tBand.w} height={AXIS_Y - TOP.y} fill="var(--viz-band-soft)" />}
          {dBand && <text x={dBand.x + 6} y={TOP.y + 4} fontSize={10.5} fontWeight={600} fill={ICE}>{windowLabel}</text>}
          {swStart >= 0 && <>
            <line x1={PAD.l + step * swStart + 2} x2={PAD.l + step * (swEnd + 1) - 2} y1={TOP.y - 12} y2={TOP.y - 12} stroke={MIST} strokeWidth={1} />
            <text x={PAD.l + step * (swStart + swEnd + 1) / 2} y={TOP.y - 16} fontSize={10} fill={MIST} textAnchor="middle">{L('Silver Week (holidays)', 'シルバーウィーク（祝日）')}</text>
          </>}
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t) + 3} fontSize={9.5} fill={MIST} textAnchor="end" fontFamily="JetBrains Mono">{format(t)}</text>
            </g>
          ))}
          {range && <>
            <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(range[1])} height={y(range[0]) - y(range[1])} fill={RANGE} />
          </>}
          {baseline != null && <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} stroke={MIST} strokeWidth={1} />
          </>}
          {campaignAvg && dI.length > 0 && <>
            <line x1={PAD.l + step * dI[0]} x2={PAD.l + step * (dI[dI.length - 1] + 1)} y1={y(campaignAvg.value)} y2={y(campaignAvg.value)} stroke={VOLT} strokeWidth={2.5} />
          </>}
          <path d={path} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          {series.map((s, i) => <circle key={s.date} cx={x(i)} cy={y(s.value)} r={3} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />)}
          {postsByDay && <>
            <text x={PAD.l} y={POSTS.y - 8} fontSize={10.5} fill={MIST}>{L('Posts about the brand at the airport, per day', '空港でのブランド関連投稿（1日あたり）')}</text>
            <line x1={PAD.l} x2={W - PAD.r} y1={POSTS.y + POSTS.h} y2={POSTS.y + POSTS.h} stroke={GRID} />
            {series.map((s, i) => {
              const p = postsByDay[s.date] ?? 0
              const h = (p / maxPosts) * POSTS.h
              const bw = Math.min(14, step * 0.6)
              return <path key={s.date} d={`M${x(i) - bw / 2},${POSTS.y + POSTS.h} V${POSTS.y + POSTS.h - h + 3} q0,-3 3,-3 h${bw - 6} q3,0 3,3 V${POSTS.y + POSTS.h} Z`} fill={during.includes(s.date) ? TEAL : 'var(--viz-context)'} />
            })}
            {peakPostI >= 0 && <text x={x(peakPostI)} y={POSTS.y - 1} fontSize={10} fill={ICE} textAnchor="middle" fontFamily="JetBrains Mono">{fmtInt(postsByDay[series[peakPostI].date])}</text>}
          </>}
          {series.map((s, i) => (
            <text key={s.date} x={x(i)} y={AXIS_Y + 8} fontSize={9.5} fill={dayTags?.[s.date]?.weekend || dayTags?.[s.date]?.holiday ? ICE : MIST} textAnchor="middle" fontFamily="JetBrains Mono">{dayOfMonth(s.date)}</text>
          ))}
          {/* hover layer: one tall target per day */}
          {series.map((s, i) => (
            <rect key={`hit${s.date}`} x={PAD.l + step * i} y={TOP.y - 8} width={step} height={AXIS_Y - TOP.y + 8} fill="transparent">
              <title>{`${fmtDate(s.date, locale)} · ${format(s.value)}${postsByDay ? ` · ${postsByDay[s.date] ?? 0} ${L('posts', '投稿')}` : ''}${dayTags?.[s.date]?.holiday ? ` · ${L('holiday', '祝日')}` : ''}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--mn-mist)]">
        <span><span className="mr-1 inline-block h-[2px] w-3.5 align-middle" style={{ background: PRIMARY }} />{L('daily share of terminal visitors', '日次のターミナル来訪者比')}</span>
        {baseline != null && <span><span className="mr-1 inline-block h-px w-3.5 align-middle" style={{ background: 'var(--viz-axis)' }} />{L(`before the campaign ${format(baseline)}`, `施策前 ${format(baseline)}`)}</span>}
        {range && <span><span className="mr-1 inline-block h-2.5 w-3.5 rounded-[2px] align-middle" style={{ background: RANGE }} />{L('normal week-to-week range', '通常の週ごとの変動幅')}</span>}
        {campaignAvg && <span className="font-semibold text-[var(--mn-heading)]"><span className="mr-1 inline-block h-[3px] w-3.5 align-middle" style={{ background: VOLT }} />{campaignAvg.label}</span>}
      </div>
      {caption && <div className="text-[13.5px] leading-relaxed text-[var(--mn-body)] mt-2">{caption}</div>}
      <div className="mt-1 text-[12px] text-[var(--mn-mist)]">{L('Dates in September. The vertical scale is zoomed in and does not start at zero.', '日付は9月。縦軸は拡大表示で、0から始まっていません。')}</div>
    </div>
  )
}

// ---- Change with its uncertainty, one row per zone (a forest plot) ----
export function ForestPlot({ rows, locale = 'en' }: {
  rows: { label: string; role: string; value: number; mde: number; detected: boolean; badge: ReactNode }[]
  locale?: Locale
}) {
  const L = lbl(locale)
  const ext = Math.ceil(Math.max(...rows.map((r) => Math.abs(r.value) + r.mde)) / 5) * 5 + 5
  const W = 300, H = 30
  const sx = (v: number) => ((v + ext) / (2 * ext)) * W
  const ticks = [-ext + 5, 0, ext - 5].map((t) => Math.round(t / 5) * 5)
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_auto] items-center gap-3 border-b border-[var(--mn-wire-subtle)] py-2.5">
          <div>
            <div className="text-[14.5px] font-semibold leading-tight text-[var(--mn-heading)]">{r.label}</div>
            <div className="text-[12px] text-[var(--mn-mist)]">{r.role}</div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${r.label}: ${fmtSigned(r.value)} ±${r.mde}%`}>
            <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} stroke={MIST} strokeWidth={1} />
            <line x1={sx(r.value - r.mde)} x2={sx(r.value + r.mde)} y1={H / 2} y2={H / 2} stroke={r.detected ? PRIMARY : CONTEXT} strokeWidth={4} strokeLinecap="round" />
            <circle cx={sx(r.value)} cy={H / 2} r={6} fill={r.detected ? VOLT : CONTEXT} stroke={SURFACE} strokeWidth={2} />
            <title>{L(`${fmtSigned(r.value)}, likely between ${fmtSigned(r.value - r.mde, 0)} and ${fmtSigned(r.value + r.mde, 0)}`, `${fmtSigned(r.value)}（概ね${fmtSigned(r.value - r.mde, 0)}〜${fmtSigned(r.value + r.mde, 0)}）`)}</title>
          </svg>
          <div className="flex flex-col items-end gap-1">
            <span className="mn-figure text-[18px] text-[var(--mn-heading)]">{fmtSigned(r.value)}</span>
            {r.badge}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_auto] gap-3 pt-1">
        <div />
        <div className="relative h-4 font-mono text-[11px] text-[var(--mn-mist)]">
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(sx(t) / W) * 100}%` }}>{t > 0 ? `+${t}%` : `${t}%`}</span>)}
        </div>
        <div className="w-[88px]" />
      </div>
    </div>
  )
}

// ---- Two values per row, joined: estimate vs reported, before vs during ----
export function Dumbbell({ rows, aLabel, bLabel, format }: {
  rows: { label: string; a: number; b: number }[]
  aLabel: string
  bLabel: string
  format: (n: number) => string
}) {
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.a, r.b])) * 1.08
  const W = 320, H = 34
  const sx = (v: number) => 8 + (v / max) * (W - 16)
  return (
    <div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-3">
            <div className="text-[13.5px] leading-tight text-[var(--mn-body)]">{r.label}</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`${r.label}: ${aLabel} ${format(r.a)}, ${bLabel} ${format(r.b)}`}>
              <line x1={8} x2={W - 8} y1={H / 2} y2={H / 2} stroke={GRID} strokeWidth={1} />
              <line x1={sx(Math.min(r.a, r.b))} x2={sx(Math.max(r.a, r.b))} y1={H / 2} y2={H / 2} stroke={MIST} strokeWidth={2} />
              <circle cx={sx(r.a)} cy={H / 2} r={6} fill={CONTEXT} stroke={SURFACE} strokeWidth={2} />
              <circle cx={sx(r.b)} cy={H / 2} r={6} fill={PRIMARY} stroke={SURFACE} strokeWidth={2} />
              <text x={sx(r.a)} y={H / 2 - 10} fontSize={11} fill={MIST} textAnchor="middle" fontFamily="JetBrains Mono">{format(r.a)}</text>
              <text x={sx(r.b)} y={H / 2 + 20} fontSize={11} fontWeight={600} fill={ICE} textAnchor="middle" fontFamily="JetBrains Mono">{format(r.b)}</text>
            </svg>
          </div>
        ))}
      </div>
      <Legend items={[{ label: aLabel, color: CONTEXT }, { label: bLabel, color: PRIMARY }]} />
    </div>
  )
}

// ---- Lag correlation: posts on day d−lag vs visits on day d ----
export function LagBars({ items, best, locale = 'en' }: { items: { lag_days: number; pearson_r: number }[]; best: number; locale?: Locale }) {
  const L = lbl(locale)
  const W = 300, H = 150, PAD = { l: 8, r: 8, t: 18, b: 26 }
  const bw = (W - PAD.l - PAD.r) / items.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={L('Correlation by lag', 'ラグ別相関')}>
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={GRID} />
      {items.map((it, i) => {
        const h = Math.max(0, it.pearson_r) * (H - PAD.t - PAD.b)
        const hot = it.lag_days === best
        const cx = PAD.l + i * bw + bw / 2, w = Math.min(24, bw * 0.6)
        return (
          <g key={it.lag_days}>
            <path d={`M${cx - w / 2},${H - PAD.b} V${H - PAD.b - h + 4} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - PAD.b} Z`} fill={hot ? VOLT : TEAL} />
            <text x={cx} y={H - PAD.b - h - 5} fontSize={10.5} fill={ICE} fontWeight={hot ? 700 : 400} textAnchor="middle" fontFamily="JetBrains Mono">{it.pearson_r.toFixed(2)}</text>
            <text x={cx} y={H - PAD.b + 14} fontSize={10} fill={MIST} textAnchor="middle">{it.lag_days === 0 ? L('same day', '当日') : L(`${it.lag_days}d later`, `${it.lag_days}日後`)}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ---- Paired horizontal bars (share of visits vs share of sales, before vs during) ----
export function PairedBars({ rows, aLabel, bLabel, format, hot, join = '→' }: {
  rows: { label: string; a: number; b: number }[]
  aLabel: string
  bLabel: string
  format: (n: number) => string
  hot?: string
  join?: string
}) {
  const max = Math.max(1e-9, ...rows.flatMap((r) => [r.a, r.b]))
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-[13.5px]">
            <div className="w-[36%] shrink-0 leading-tight text-[var(--mn-body)]" style={{ fontWeight: r.label === hot ? 600 : 400, color: r.label === hot ? 'var(--mn-heading)' : undefined }}>{r.label}</div>
            <div className="flex flex-1 flex-col gap-[2px]">
              {[{ v: r.a, c: CONTEXT }, { v: r.b, c: r.label === hot ? VOLT : PRIMARY }].map((b, i) => (
                <div key={i} className="h-[9px] rounded-r-[4px]" style={{ width: `${Math.max(1, (b.v / max) * 100)}%`, background: b.c }} />
              ))}
            </div>
            <div className="w-[118px] shrink-0 text-right font-mono text-[12px] leading-tight text-[var(--mn-mist)]">
              {format(r.a)} {join} <span className="text-[var(--mn-heading)]" style={{ fontWeight: 600 }}>{format(r.b)}</span>
            </div>
          </div>
        ))}
      </div>
      <Legend items={[{ label: aLabel, color: CONTEXT }, { label: bLabel, color: PRIMARY }]} />
    </div>
  )
}

// ---- Terminal floor schematic: each zone tinted by its change in campaign week ----
export function FloorMap({ floors, locale = 'en' }: {
  floors: { floor: string; zones: { id: string; label: string; change: number; state: 'clear' | 'small' | 'flat'; note?: string }[] }[]
  locale?: Locale
}) {
  const L = lbl(locale)
  const style = (s: 'clear' | 'small' | 'flat') => s === 'clear'
    ? { background: 'var(--viz-primary)', color: 'var(--viz-on-heat)', borderColor: 'var(--viz-primary)' }
    : s === 'small'
      ? { background: 'var(--mn-callout-bg)', color: 'var(--mn-heading)', borderColor: 'var(--viz-primary)', borderStyle: 'dashed' }
      : { background: 'var(--mn-panel)', color: 'var(--mn-body)', borderColor: 'var(--mn-wire)' }
  return (
    <div className="flex flex-col gap-2">
      {floors.map((f) => (
        <div key={f.floor} className="grid grid-cols-[44px_1fr] items-stretch gap-2">
          <div className="flex items-center justify-center rounded-[4px] border border-[var(--mn-wire)] font-mono text-[12px] text-[var(--mn-mist)]">{f.floor}</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(...floors.map((x) => x.zones.length))}, minmax(0, 1fr))` }}>
            {f.zones.map((z) => (
              <div key={z.id} className="flex min-h-[72px] flex-col justify-between rounded-[6px] border px-2.5 py-2" style={style(z.state)} title={`${z.label}: ${fmtSigned(z.change)}`}>
                <div className="text-[12.5px] font-semibold leading-tight">{z.label}</div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="mn-figure text-[18px]">{fmtSigned(z.change, 0)}</span>
                  {z.note && <span className="text-right text-[11px] leading-tight opacity-90">{z.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--mn-mist)]">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-[2px] align-middle" style={{ background: 'var(--viz-primary)' }} />{L('clear change', '明確な変化')}</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-[2px] border border-dashed align-middle" style={{ borderColor: 'var(--viz-primary)', background: 'var(--mn-callout-bg)' }} />{L('rose, but too small to call', '増加したが判定できない小ささ')}</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-[2px] border align-middle" style={{ borderColor: 'var(--mn-wire)' }} />{L('no meaningful change', '有意な変化なし')}</span>
        <span>{L('Simplified layout, not the real floor plan.', '簡略図であり、実際のフロア図ではありません。')}</span>
      </div>
    </div>
  )
}

// ---- A trip as a line of stops ----
export function JourneyLine({ airport, stops, count, share }: { airport: string; stops: string[]; count?: number; share?: string }) {
  return (
    <div className="flex items-center gap-2">
      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-y-1">
        <li className="flex items-center">
          <span className="rounded-[3px] border border-[var(--mn-border)] px-1.5 py-[1px] text-[11.5px] text-[var(--mn-heading)]">✈ {airport}</span>
        </li>
        {stops.map((s) => (
          <li key={s} className="flex items-center">
            <span className="mx-1.5 h-px w-4 bg-[var(--mn-border)]" aria-hidden />
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: PRIMARY }} aria-hidden />
            <span className="text-[13px] text-[var(--mn-body)]">{s}</span>
          </li>
        ))}
      </ol>
      {count != null && <span className="font-mono text-[12.5px] text-[var(--mn-heading)]">{fmtInt(count)}</span>}
      {share && <span className="w-[38px] text-right font-mono text-[12px] text-[var(--mn-mist)]">{share}</span>}
    </div>
  )
}

// ---- Part of a whole, as one bar ----
export function SplitBar({ parts, height = 14 }: { parts: { label: string; value: number; color: string }[]; height?: number }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0))
  return (
    <div className="flex w-full gap-[2px] overflow-hidden rounded-[4px]" style={{ height }} role="img"
      aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
      {parts.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${fmtInt(p.value)}`} />)}
    </div>
  )
}

// ---- Market × arrival-airport share matrix ----
export function HeatMatrix({ rows, cols, selected, onSelect }: {
  rows: { id: string; label: string; values: Record<string, number> }[]
  cols: { id: string; label: string }[]
  selected?: string
  onSelect?: (id: string) => void
}) {
  const max = Math.max(1e-9, ...rows.flatMap((r) => cols.map((c) => r.values[c.id] ?? 0)))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-[2px] text-[12px]">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c.id} className="px-1 pb-1 font-mono font-normal text-[var(--mn-mist)]" title={c.label}>{c.id}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th className="whitespace-nowrap pr-2 text-left font-normal">
                <button type="button" onClick={() => onSelect?.(r.id)} aria-pressed={selected === r.id}
                  className="text-[13.5px] underline decoration-[var(--mn-border)] underline-offset-2 hover:text-[var(--mn-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]"
                  style={{ color: selected === r.id ? 'var(--mn-teal)' : 'var(--mn-body)', fontWeight: selected === r.id ? 600 : 400 }}>
                  {r.label}
                </button>
              </th>
              {cols.map((c) => {
                const v = r.values[c.id] ?? 0
                // five sequential steps; the gap before the last keeps every label above 4.5:1
                const step = Math.min(4, Math.floor((v / max) * 5))
                const mix = [7, 20, 33, 47, 80][step]
                return (
                  <td key={c.id} className="h-[24px] rounded-[3px] text-center font-mono"
                    style={{ background: `color-mix(in srgb, var(--viz-heat) ${mix}%, var(--viz-surface))`, color: step === 4 ? 'var(--viz-on-heat)' : v < 0.005 ? 'var(--mn-mist)' : 'var(--viz-ink)' }}
                    title={`${r.label} · ${c.label}: ${(v * 100).toFixed(1)}%`}>
                    {v < 0.005 ? '·' : Math.round(v * 100)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Schematic Japan flow map: arrival airports → places visited ----
// Hand-placed like a transit diagram: relative positions follow geography, but the
// Tokyo and Kansai clusters are spread out so every node and label stays legible.
const LAYOUT: Record<string, [number, number]> = {
  sapporo: [392, 62], niseko_otaru: [322, 98], furano_biei: [468, 44], CTS: [438, 112],
  tokyo: [398, 248], NRT: [470, 232], HND: [432, 296], gotemba: [332, 292],
  takayama_kanazawa: [268, 186], nagoya: [262, 282], NGO: [286, 336],
  kyoto: [182, 252], osaka: [146, 308], nara: [208, 326], KIX: [128, 362],
  hiroshima: [92, 250], fukuoka: [58, 318], FUK: [40, 362], yufuin_beppu: [112, 392],
  HIJ: [124, 286], OKA: [50, 78], okinawa: [86, 58],
}
const LABEL_POS: Record<string, [number, number, 'start' | 'end' | 'middle']> = {
  NRT: [9, 3, 'start'], HND: [9, 4, 'start'], KIX: [0, 16, 'middle'], CTS: [9, 4, 'start'], FUK: [0, 16, 'middle'],
  NGO: [9, 4, 'start'], HIJ: [9, 5, 'start'], OKA: [0, 16, 'middle'],
  tokyo: [0, -10, 'middle'], gotemba: [0, 12, 'middle'], kyoto: [0, -10, 'middle'], osaka: [9, 15, 'start'], nara: [9, 4, 'start'],
  sapporo: [0, -10, 'middle'], niseko_otaru: [-9, 4, 'end'], furano_biei: [0, -9, 'middle'], fukuoka: [0, -10, 'middle'],
  yufuin_beppu: [9, 4, 'start'], nagoya: [9, -5, 'start'], takayama_kanazawa: [0, -10, 'middle'], hiroshima: [0, -10, 'middle'],
  okinawa: [9, 4, 'start'],
}
export function FlowMap({ t, agg, locale = 'en', highlight }: { t: Tourism; agg: MarketAgg; locale?: Locale; highlight?: string[] }) {
  const L = lbl(locale)
  const W = 520, H = 420
  const inset = { x: 16, y: 24, w: 150, h: 78 }
  const P = LAYOUT
  const maxFlow = Math.max(1, ...agg.flows.map((f) => f.visitors))
  const maxDest = Math.max(1, ...agg.destinations.map((d) => d.visitors))
  const destVisitors = Object.fromEntries(agg.destinations.map((d) => [d.zone, d.visitors]))
  const arrivals = Object.fromEntries(agg.airports.map((a) => [a.airport, a.arrivals]))
  const hot = new Set(highlight ?? [])
  return (
    <div>
      <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[440px]" role="img" aria-label={L('Arrival airport to destination flows', '到着空港から訪問先への流れ')}>
        <rect x={inset.x} y={inset.y} width={inset.w} height={inset.h} rx={5} fill="none" stroke={GRID} />
        <text x={inset.x + 7} y={inset.y + 13} fontSize={9} fill={MIST} fontFamily="JetBrains Mono">{L('OKINAWA (shown separately)', '沖縄（別枠）')}</text>
        {agg.flows.map((f) => {
          const a = P[f.airport], b = P[f.zone]
          if (!a || !b) return null
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
          if (len < 6) return null
          // bow the arc perpendicular to the chord so overlapping corridors separate
          const cx = (a[0] + b[0]) / 2 - (dy / len) * len * 0.22, cy = (a[1] + b[1]) / 2 + (dx / len) * len * 0.22
          const w = 0.8 + (f.visitors / maxFlow) * 5.2
          const isHot = hot.has(`${f.airport}>${f.zone}`)
          return (
            <path key={`${f.airport}>${f.zone}`} d={`M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`}
              fill="none" stroke={isHot ? VOLT : PRIMARY} strokeWidth={isHot ? Math.max(w, 3) : w} strokeLinecap="round" opacity={isHot ? 1 : 0.22 + (f.visitors / maxFlow) * 0.5}>
              <title>{`${f.airport} → ${tx(t.destinations.find((d) => d.id === f.zone)?.label, locale)}: ${fmtInt(f.visitors)}`}</title>
            </path>
          )
        })}
        {t.destinations.map((d) => {
          const v = destVisitors[d.id] ?? 0
          const [px, py] = P[d.id] ?? [0, 0]
          const lp = LABEL_POS[d.id] ?? [8, 3, 'start']
          return (
            <g key={d.id} opacity={v ? 1 : 0.35}>
              <circle cx={px} cy={py} r={3 + Math.sqrt(v / maxDest) * 9} fill={TEAL} stroke={SURFACE} strokeWidth={2}>
                <title>{`${tx(d.label, locale)}: ${fmtInt(v)}`}</title>
              </circle>
              <text x={px + lp[0] + Math.sign(lp[0]) * Math.sqrt(v / maxDest) * 7} y={py + lp[1] + Math.sign(lp[1]) * Math.sqrt(v / maxDest) * 5}
                fontSize={10.5} fill={ICE} textAnchor={lp[2]} stroke={HALO} strokeWidth={3} paintOrder="stroke">{tx(d.label, locale)}</text>
            </g>
          )
        })}
        {t.airports.map((a) => {
          const [px, py] = P[a.id]
          const lp = LABEL_POS[a.id] ?? [8, 3, 'start']
          return (
            <g key={a.id} opacity={arrivals[a.id] ? 1 : 0.35}>
              <rect x={px - 4.5} y={py - 4.5} width={9} height={9} fill={SURFACE} stroke={ICE} strokeWidth={1.5} transform={`rotate(45 ${px} ${py})`}>
                <title>{`${tx(a.label, locale)} (${a.id}): ${fmtInt(arrivals[a.id] ?? 0)}`}</title>
              </rect>
              <text x={px + lp[0]} y={py + lp[1]} fontSize={9.5} fill={MIST} textAnchor={lp[2]} fontFamily="JetBrains Mono"
                stroke={HALO} strokeWidth={3} paintOrder="stroke">{a.id}</text>
            </g>
          )
        })}
      </svg></div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--mn-mist)]">
        <span><span className="inline-block h-2 w-2 rotate-45 border border-[var(--mn-ice)] align-middle mr-1.5" />{L('arrival airport', '到着空港')}</span>
        <span><span style={{ background: TEAL }} className="inline-block h-2.5 w-2.5 rounded-full align-middle mr-1" />{L('place visited (bigger = more visitors)', '訪問先（大きいほど旅行者が多い）')}</span>
        <span><span style={{ background: PRIMARY }} className="inline-block h-[2px] w-3 align-middle mr-1" />{L('route (thicker = more visitors)', '移動（太いほど旅行者が多い）')}</span>
        <span>{L('simplified map, not to scale', '簡略図（縮尺は不正確）')}</span>
      </div>
    </div>
  )
}

