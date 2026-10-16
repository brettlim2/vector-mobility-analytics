// The first screen of each report: what a CEO should take away in thirty seconds.
// One headline, three findings (each with its number, a small picture and the "so what"),
// and what we would do next. Everything below it is the evidence.
import type { ReactNode } from 'react'
import { PRIMARY, CONTEXT, VOLT, MIST, GRID, SURFACE, RANGE, ICE } from '../lib/palette'
import { fmtSigned } from '../lib/format'

export interface StoryPoint {
  figure: string
  claim: string
  visual: ReactNode
  soWhat: string
  href: string
}

export function StoryBoard({ kicker, headline, sub, points, nextTitle, next, evidenceLabel }: {
  kicker: string
  headline: string
  sub: string
  points: StoryPoint[]
  nextTitle: string
  next: string[]
  evidenceLabel: string
}) {
  return (
    <section className="vm-glass-bright rounded-[var(--mn-radius-lg)] px-5 pb-5 pt-6 md:px-7">
      <div className="mn-kicker">{kicker}</div>
      <h2 className="font-display mt-2 max-w-[980px] text-[30px] leading-[1.12] text-[var(--mn-heading)] [text-wrap:balance] md:text-[38px]">
        {headline}<span className="mn-volt-dot" aria-hidden />
      </h2>
      <p className="mt-2 max-w-[860px] text-[15px] leading-relaxed text-[var(--mn-body)]">{sub}</p>
      <ol className="mt-5 grid gap-3 lg:grid-cols-3">
        {points.map((p, i) => (
          <li key={i} className="flex min-w-0 flex-col rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] p-4">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-[var(--mn-mist)]">{String(i + 1).padStart(2, '0')}</span>
              <span className="mn-figure text-[40px] leading-none text-[var(--mn-heading)]">{p.figure}</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-snug text-[var(--mn-heading)]">{p.claim}</p>
            <div className="mt-3 min-h-[64px]">{p.visual}</div>
            <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-[var(--mn-body)]">{p.soWhat}</p>
            <a href={p.href} className="mt-3 self-start text-[12.5px] font-semibold text-[var(--mn-teal)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]">
              {evidenceLabel} ↓
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-2 border-t border-[var(--mn-wire)] pt-4 md:flex-row md:items-start md:gap-6">
        <div className="mn-kicker shrink-0 pt-0.5">{nextTitle}</div>
        <ol className="grid flex-1 gap-2 md:grid-cols-3">
          {next.map((n, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-[var(--mn-body)]">
              <span className="font-mono text-[12px] text-[var(--mn-teal)]">{i + 1}</span>{n}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// A single change against the normal week-to-week range, for a story card.
export function RangeStrip({ value, mde, rangeLabel, valueLabel }: { value: number; mde: number; rangeLabel: string; valueLabel: string }) {
  const ext = Math.ceil((Math.abs(value) + mde) / 5) * 5 + 5
  const W = 300, H = 58
  const sx = (v: number) => 8 + ((v + ext) / (2 * ext)) * (W - 16)
  const clear = Math.abs(value) > mde
  const vx = sx(value)
  const anchor = vx > W - 70 ? 'end' : vx < 70 ? 'start' : 'middle'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${valueLabel} ${fmtSigned(value, 0)}; ${rangeLabel} ±${mde}%`}>
      <text x={vx} y={11} fontSize={12} fontWeight={600} fill={ICE} textAnchor={anchor}>{valueLabel} {fmtSigned(value, 0)}</text>
      <line x1={8} x2={W - 8} y1={30} y2={30} stroke={GRID} />
      <rect x={sx(-mde)} y={21} width={sx(mde) - sx(-mde)} height={18} rx={3} fill={RANGE} />
      <line x1={sx(0)} x2={sx(0)} y1={17} y2={43} stroke={MIST} />
      <line x1={sx(value - mde)} x2={sx(value + mde)} y1={30} y2={30} stroke={clear ? PRIMARY : CONTEXT} strokeWidth={4} strokeLinecap="round" />
      <circle cx={vx} cy={30} r={7} fill={clear ? VOLT : CONTEXT} stroke={SURFACE} strokeWidth={2} />
      <text x={sx(0)} y={55} fontSize={11} fill={MIST} textAnchor="middle">{rangeLabel}</text>
    </svg>
  )
}

// Two amounts as labelled bars, for a story card (estimate vs reported).
export function TwoBars({ rows, format }: { rows: { label: string; value: number; strong?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value))
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-[12.5px]">
            <span className={r.strong ? 'font-semibold text-[var(--mn-heading)]' : 'text-[var(--mn-mist)]'}>{r.label}</span>
            <span className={`font-mono ${r.strong ? 'font-semibold text-[var(--mn-heading)]' : 'text-[var(--mn-mist)]'}`}>{format(r.value)}</span>
          </div>
          <div className="mt-1 h-[10px] rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: r.strong ? PRIMARY : CONTEXT }} />
        </div>
      ))}
    </div>
  )
}

// Two zones and the movement between them, for a story card.
export function HopStrip({ from, to, moves, toChange, toNote }: { from: string; to: string; moves: string; toChange: number; toNote: string }) {
  return (
    <div className="flex items-stretch gap-2 text-[12.5px]">
      <div className="flex flex-1 flex-col justify-center rounded-[6px] px-2.5 py-2" style={{ background: 'var(--viz-primary)', color: 'var(--viz-on-heat)' }}>
        <span className="font-semibold leading-tight">{from}</span>
      </div>
      <div className="flex flex-col items-center justify-center px-1 text-center">
        <span className="text-[18px] leading-none text-[var(--mn-teal)]">→</span>
        <span className="mt-0.5 whitespace-nowrap font-mono text-[11.5px] text-[var(--mn-heading)]">{moves}</span>
      </div>
      <div className="flex flex-1 flex-col justify-center rounded-[6px] border border-dashed px-2.5 py-2" style={{ borderColor: 'var(--viz-primary)', background: 'var(--mn-callout-bg)' }}>
        <span className="font-semibold leading-tight text-[var(--mn-heading)]">{to}</span>
        <span className="text-[11.5px] text-[var(--mn-body)]">{fmtSigned(toChange)} · {toNote}</span>
      </div>
    </div>
  )
}
