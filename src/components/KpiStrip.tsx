import type { Kpi } from '../types'

export function KpiStrip({
  kpi,
  corridorCount,
  hexCount,
}: {
  kpi: Kpi | null
  corridorCount: number
  hexCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Devices" value={fmt(kpi?.devices)} />
      <Tile label="Pings" value={fmt(kpi?.pings)} />
      <Tile
        label="Window"
        value={
          kpi ? `${kpi.first_day} → ${kpi.last_day}` : '—'
        }
        mono
      />
      <Tile label="Visible hex / OD" value={`${hexCount} · ${corridorCount}`} />
    </div>
  )
}

function Tile({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg bg-[var(--vm-panel-strong)] px-3 py-2 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--vm-muted)]">{label}</p>
      <p
        className={`mt-1 text-sm text-[var(--vm-ink)] ${mono ? 'font-mono text-xs' : 'font-display text-base'}`}
      >
        {value}
      </p>
    </div>
  )
}

function fmt(n?: number) {
  if (n == null) return '—'
  return n.toLocaleString()
}
