import { Component, type ReactNode } from 'react'
import { TEAL, TEAL_LT, VOLT, WIRE } from '../lib/palette'
import { fmtInt } from '../lib/format'

export function GlassPanel({ children, bright, className = '', id }: { children: ReactNode; bright?: boolean; className?: string; id?: string }) {
  return (
    <section id={id} className={`${bright ? 'vm-glass-bright' : 'vm-glass'} min-w-0 rounded-[var(--mn-radius-lg)] ${className}`}>
      {children}
    </section>
  )
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="mn-kicker">{children}</div>
}

export function SectionHeader({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h3 className="font-display text-[20px] text-[var(--mn-heading)] mt-1">{title}</h3>
      {sub && <p className="text-[14.5px] text-[var(--mn-body)] mt-1 leading-relaxed">{sub}</p>}
    </div>
  )
}

export function SubLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-2 text-[12px] font-medium text-[var(--mn-mist)] ${className}`}>{children}</div>
}

export function KpiTile({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-night)] px-3.5 py-3">
      <div className="text-[12px] leading-snug text-[var(--mn-mist)]">{label}</div>
      <div className="mn-figure mt-1.5 text-[26px] leading-tight break-words" style={{ color: accent ? VOLT : 'var(--mn-heading)' }}>
        {value}
      </div>
      {sub && <div className="text-[12px] text-[var(--mn-mist)] mt-1.5">{sub}</div>}
    </div>
  )
}

export function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className={`mn-chip shrink-0 ${color === VOLT ? 'mn-chip-yes' : color === TEAL_LT ? 'mn-chip-partly' : 'mn-chip-no'}`}>{children}</span>
  )
}

// Question → plain one-line answer → supporting detail. The answer line is what a client reads first.
export function AnswerCard({ q, badge, badgeColor, answer, children }: { q: string; badge: string; badgeColor: string; answer: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[13.5px] leading-snug text-[var(--mn-mist)]">{q}</h3>
        <Badge color={badgeColor}>{badge}</Badge>
      </div>
      <p className="mt-2.5 text-[16px] font-semibold leading-snug text-[var(--mn-heading)]">{answer}</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--mn-body)]">{children}</p>
    </div>
  )
}

// Jump links. Sticky only on wide screens, where the header is one row tall.
export function SectionNav({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  return (
    <nav aria-label={label}
      className="z-[5] flex flex-wrap gap-1 rounded-[var(--mn-radius)] border border-[var(--mn-wire)] bg-[var(--mn-abyss)] px-2 py-1.5 lg:sticky lg:top-[var(--mn-header-h)]">
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`}
          className="rounded px-2.5 py-1 text-[12px] text-[var(--mn-body)] hover:bg-[var(--mn-callout-bg)] hover:text-[var(--mn-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mn-volt)]">
          {it.label}
        </a>
      ))}
    </nav>
  )
}

export function Note({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'volt' }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-[var(--mn-body)] border-l-2 pl-2.5"
      style={{ borderColor: tone === 'volt' ? 'var(--mn-volt)' : 'var(--mn-teal)' }}>
      {children}
    </p>
  )
}

export function BarRow({ items, highlight, color = TEAL, format = fmtInt }: {
  items: { label: string; value: number }[]
  highlight?: (label: string) => boolean
  color?: string
  format?: (n: number) => string
}) {
  const max = Math.max(1e-9, ...items.map((i) => i.value))
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => {
        const hot = highlight?.(it.label)
        return (
          <div key={it.label} className="flex items-center gap-2">
            <div className="w-[38%] shrink-0 leading-tight text-[14.5px] text-[var(--mn-body)]" title={it.label}>{it.label}</div>
            <div className="relative h-[14px] flex-1 rounded-[3px]" style={{ background: WIRE }}>
              <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${(it.value / max) * 100}%`, background: hot ? VOLT : color }} />
            </div>
            <div className="w-[64px] shrink-0 text-right font-mono text-[13.5px]" style={{ color: hot ? VOLT : 'var(--mn-ice)' }}>{format(it.value)}</div>
          </div>
        )
      })}
    </div>
  )
}

export function FlowMatrix({ items, hot }: { items: { from: string; to: string; n: number; key: string }[]; hot?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n))
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2 text-[13.5px]">
          <div className="w-[32%] leading-tight text-right text-[var(--mn-body)]" title={it.from}>{it.from}</div>
          <div className="text-[var(--mn-teal)]">→</div>
          <div className="w-[32%] leading-tight text-[var(--mn-body)]" title={it.to}>{it.to}</div>
          <div className="relative h-[12px] flex-1 rounded-[3px]" style={{ background: WIRE }}>
            <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${(it.n / max) * 100}%`, background: it.key === hot ? VOLT : TEAL }} />
          </div>
          <div className="w-[44px] text-right font-mono text-[var(--mn-ice)]">{fmtInt(it.n)}</div>
        </div>
      ))}
    </div>
  )
}

export function StackedShare({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0))
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[3px]">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${fmtInt(p.value)}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--mn-body)]">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: p.color }} />
            {p.label} <span className="font-mono text-[var(--mn-mist)]">{Math.round((p.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--mn-mist)]">
      {items.map((it) => (
        <span key={it.label}>
          <span style={{ background: it.color }} className={`inline-block w-2.5 ${it.line ? 'h-[2px]' : 'h-2.5 rounded-[2px]'} align-middle mr-1`} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

// What the panel can / cannot do for a given ask — keeps the pitch honest.
export function FeasibilityTable({ rows, head }: {
  head: [string, string, string, string]
  rows: { ask: string; status: 'yes' | 'partial' | 'no'; statusLabel: string; how: string; needs: string }[]
}) {
  const color = { yes: VOLT, partial: '#5FD9CC', no: '#8FA8A3' }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
        <thead>
          <tr className="text-[12px] text-[var(--mn-mist)]">
            {head.map((h) => <th key={h} className="border-b border-[var(--mn-wire)] px-2 py-1.5 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ask} className="align-top">
              <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-2 w-[24%] text-[var(--mn-heading)]">{r.ask}</td>
              <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-2 w-[14%]"><Badge color={color[r.status]}>{r.statusLabel}</Badge></td>
              <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-2 leading-relaxed text-[var(--mn-body)]">{r.how}</td>
              <td className="border-b border-[var(--mn-wire-subtle)] px-2 py-2 w-[28%] leading-relaxed text-[var(--mn-mist)]">{r.needs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Empty({ note }: { note: string }) {
  return (
    <div className="rounded-[var(--mn-radius)] border border-dashed border-[var(--mn-wire)] px-4 py-6 text-center text-[14.5px] text-[var(--mn-mist)]">
      {note}
    </div>
  )
}

// A readout whose JSON does not match the expected shape (e.g. a real engine export
// swapped in with a missing block) shows a notice instead of blanking the whole page.
export class ReadoutBoundary extends Component<{ note: string; resetKey: string; children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(e: Error) { return { failed: e.message } }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: null })
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="rounded-[var(--mn-radius)] border border-dashed border-[var(--mn-border)] px-4 py-6 text-[14.5px] text-[var(--mn-mist)]">
        {this.props.note}
        <div className="mt-1 font-mono text-[12px] text-[var(--mn-mist)]">{this.state.failed}</div>
      </div>
    )
  }
}
