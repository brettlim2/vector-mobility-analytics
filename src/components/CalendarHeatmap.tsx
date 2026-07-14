import { useMemo } from 'react'
import type { CalendarCell } from '../types'
import { calendarMatrix } from '../lib/slices'

export function CalendarHeatmap({ cells }: { cells: CalendarCell[] }) {
  const rows = useMemo(() => calendarMatrix(cells), [cells])
  const max = useMemo(
    () => Math.max(1, ...rows.flatMap((r) => r.hours)),
    [rows],
  )

  if (!rows.length) {
    return (
      <Empty title="Calendar heatmap" note="No cells for current feed / day-type filters." />
    )
  }

  return (
    <section>
      <Header
        title="When is it busy?"
        subtitle="7 × 24 device index · hour-of-day matched · k≥5"
      />
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid min-w-[520px] gap-0.5"
          style={{ gridTemplateColumns: `2.5rem repeat(24, minmax(0, 1fr))` }}
        >
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="text-center font-mono text-[9px] text-[var(--vm-muted)]"
            >
              {h}
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.dow} className="contents">
              <div className="flex items-center font-mono text-[10px] text-[var(--vm-muted)]">
                {row.day}
              </div>
              {row.hours.map((v, h) => {
                const t = v / max
                return (
                  <div
                    key={h}
                    title={`${row.day} ${h}:00 · ${v.toLocaleString()} devices`}
                    className="aspect-square rounded-[2px]"
                    style={{
                      background: `rgba(13, 122, 111, ${0.08 + t * 0.85})`,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-lg text-[var(--vm-ink)]">{title}</h2>
      <p className="mt-0.5 text-[11px] text-[var(--vm-muted)]">{subtitle}</p>
    </div>
  )
}

function Empty({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <Header title={title} subtitle={note} />
    </section>
  )
}
