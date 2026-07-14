import { corridorId } from '../lib/slices'
import { useAppStore } from '../store'
import type { OdArc } from '../types'

export function CorridorList({ arcs }: { arcs: OdArc[] }) {
  const setHovered = useAppStore((s) => s.setHoveredCorridor)
  const setFilter = useAppStore((s) => s.setFilter)

  return (
    <section>
      <h2 className="font-display text-lg text-[var(--vm-ink)]">Corridors</h2>
      <p className="mt-0.5 text-[11px] text-[var(--vm-muted)]">
        Zone → zone · straight-line distance · hover to highlight arcs
      </p>
      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
        {arcs.slice(0, 18).map((a) => {
          const id = corridorId(a)
          return (
            <li key={id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--vm-accent-soft)]"
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setFilter('zone', a.o_zone)}
              >
                <span className="min-w-0 truncate text-[var(--vm-ink)]">
                  {a.o_zone} → {a.d_zone}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
                  {a.trips.toLocaleString()} · {a.med_dist_km} km
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
