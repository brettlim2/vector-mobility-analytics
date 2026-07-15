import type { Kpi } from '../types'

export function KpiStrip({
  kpi,
  corridorCount,
  hexCount,
  circuity,
  population,
}: {
  kpi: Kpi | null
  corridorCount: number
  hexCount: number
  circuity?: number
  population?: number
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Tile label="Devices" value={fmt(kpi?.devices)} />
      <Tile label="Pings" value={fmt(kpi?.pings)} />
      <Tile
        label="Window"
        value={kpi ? `${kpi.first_day.slice(5)} → ${kpi.last_day.slice(5)}` : '—'}
        mono
      />
      <Tile
        label="Est. population"
        value={population != null ? compact(population) : `${hexCount} hex`}
      />
      <Tile
        label={circuity != null ? 'Road circuity' : 'Visible OD'}
        value={circuity != null ? `${circuity.toFixed(2)}×` : String(corridorCount)}
      />
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
    <div className="rounded-xl border border-white/50 bg-[var(--vm-panel-strong)] px-3 py-2.5 shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--vm-muted)]">{label}</p>
      <p
        className={`mt-1 text-[var(--vm-ink)] ${mono ? 'font-mono text-xs' : 'font-display text-base'}`}
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

function compact(n: number) {
  return new Intl.NumberFormat('en-SG', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}
