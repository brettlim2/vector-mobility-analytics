import type { ReactNode } from 'react'
import { DAYPART_LABELS, type Daypart } from '../types'
import { useAppStore } from '../store'

const selectClass =
  'rounded-md border border-[var(--vm-line)] bg-white/80 px-2 py-1.5 text-xs text-[var(--vm-ink)] outline-none focus:border-[var(--vm-accent)]'

interface Props {
  zones: string[]
  categories: string[]
}

export function FilterBar({ zones, categories }: Props) {
  const filters = useAppStore((s) => s.filters)
  const setFilter = useAppStore((s) => s.setFilter)

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-[var(--vm-line)] bg-[var(--vm-panel)] px-4 py-3 backdrop-blur-md">
      <BrandChip />

      <Field label="Day type">
        <select
          className={selectClass}
          value={filters.daytype}
          onChange={(e) => setFilter('daytype', e.target.value as typeof filters.daytype)}
        >
          <option value="all">All</option>
          <option value="weekday">Weekday</option>
          <option value="weekend">Weekend</option>
        </select>
      </Field>

      <Field label="Daypart">
        <select
          className={selectClass}
          value={filters.daypart}
          onChange={(e) => setFilter('daypart', e.target.value as Daypart)}
        >
          {(Object.keys(DAYPART_LABELS) as Daypart[]).map((k) => (
            <option key={k} value={k}>
              {DAYPART_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="OD hour band">
        <select
          className={selectClass}
          value={filters.hourBand}
          onChange={(e) => setFilter('hourBand', e.target.value as typeof filters.hourBand)}
        >
          <option value="all">All</option>
          <option value="am">AM 06–09</option>
          <option value="pm">PM 17–20</option>
          <option value="late">Late night</option>
          <option value="offpeak">Off-peak</option>
        </select>
      </Field>

      <Field label="Feed">
        <select
          className={selectClass}
          value={filters.sourceClass}
          onChange={(e) => setFilter('sourceClass', e.target.value as typeof filters.sourceClass)}
        >
          <option value="sdk_app">SDK / app (clean)</option>
          <option value="agg">Agg feed</option>
          <option value="all">All feeds</option>
        </select>
      </Field>

      <Field label="H3 res">
        <select
          className={selectClass}
          value={filters.h3Res}
          onChange={(e) => setFilter('h3Res', e.target.value as typeof filters.h3Res)}
        >
          <option value="7">7 · ~1.2 km</option>
          <option value="8">8 · ~460 m</option>
          <option value="9">9 · ~170 m</option>
        </select>
      </Field>

      <Field label="Zone">
        <select
          className={`${selectClass} max-w-[10rem]`}
          value={filters.zone ?? ''}
          onChange={(e) => setFilter('zone', e.target.value || null)}
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>

      <Field label="POI group">
        <select
          className={`${selectClass} max-w-[10rem]`}
          value={filters.category ?? ''}
          onChange={(e) => setFilter('category', e.target.value || null)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <div className="ml-auto flex flex-wrap items-center gap-3 pb-0.5 text-xs text-[var(--vm-muted)]">
        <Toggle
          label="Hex"
          on={filters.showHex}
          onChange={(v) => setFilter('showHex', v)}
        />
        <Toggle
          label="OD arcs"
          on={filters.showArcs}
          onChange={(v) => setFilter('showArcs', v)}
        />
        <Toggle
          label="Boundaries"
          on={filters.showBoundaries}
          onChange={(v) => setFilter('showBoundaries', v)}
        />
      </div>
    </div>
  )
}

function BrandChip() {
  return (
    <div className="mr-2 min-w-[9rem]">
      <p className="font-display text-lg leading-none tracking-tight text-[var(--vm-ink)]">
        Vector
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--vm-muted)]">
        Mobility analytics
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--vm-muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`rounded-md px-2 py-1 transition ${
        on
          ? 'bg-[var(--vm-accent-soft)] text-[var(--vm-accent)]'
          : 'bg-transparent text-[var(--vm-muted)]'
      }`}
    >
      {label}
    </button>
  )
}
