import { useEffect, useMemo, useState } from 'react'
import { CalendarHeatmap } from './components/CalendarHeatmap'
import { CorridorList } from './components/CorridorList'
import { FilterBar } from './components/FilterBar'
import { InsightsPanel } from './components/InsightsPanel'
import { KpiStrip } from './components/KpiStrip'
import { MapView } from './components/MapView'
import { RhythmGrid } from './components/RhythmGrid'
import { useAnalyticsData } from './hooks/useAnalyticsData'
import {
  sliceCalendar,
  sliceGroupRhythms,
  sliceHexDensity,
  sliceOdArcs,
} from './lib/slices'
import { useAppStore } from './store'

type DrawerMode = 'live' | 'insights'

export default function App() {
  const data = useAnalyticsData()
  const filters = useAppStore((s) => s.filters)
  const hydrateFromUrl = useAppStore((s) => s.hydrateFromUrl)
  const [drawer, setDrawer] = useState<DrawerMode>('insights')

  useEffect(() => {
    hydrateFromUrl()
  }, [hydrateFromUrl])

  const hexCells = useMemo(() => {
    const cells = data.hexByRes[filters.h3Res] ?? []
    return sliceHexDensity(cells, filters)
  }, [data.hexByRes, filters])

  const arcs = useMemo(() => {
    const band =
      filters.hourBand === 'all'
        ? data.odBands.all ?? []
        : data.odBands[filters.hourBand] ?? data.odBands.all ?? []
    return sliceOdArcs(band, data.cubeOd, filters)
  }, [data.odBands, data.cubeOd, filters])

  const calendar = useMemo(
    () => sliceCalendar(data.calendar, filters),
    [data.calendar, filters],
  )

  const rhythms = useMemo(
    () => sliceGroupRhythms(data.groupRhythms, filters),
    [data.groupRhythms, filters],
  )

  const zoneNames = useMemo(
    () => data.zones.map((z) => z.zone).sort(),
    [data.zones],
  )

  if (data.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--vm-paper)]">
        <p className="font-display text-xl text-[var(--vm-ink)]">Loading warehouse exports…</p>
      </div>
    )
  }

  if (data.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--vm-paper)] px-6 text-center">
        <p className="font-display text-xl text-[var(--vm-ink)]">Couldn’t load analytics data</p>
        <p className="font-mono text-xs text-[var(--vm-muted)]">{data.error}</p>
        <p className="max-w-md text-sm text-[var(--vm-muted)]">
          Run <code className="rounded bg-white px-1">python3 -m analytics export</code> then{' '}
          <code className="rounded bg-white px-1">npm run dev</code>.
        </p>
      </div>
    )
  }

  const routing = data.insights?.routing.road_vs_straight
  const weightedPop = data.insights?.weighted.weighted_totals.estimated_population

  return (
    <div className="relative flex h-full flex-col">
      <FilterBar zones={zoneNames} categories={data.visitCategories} />

      <div className="relative min-h-0 flex-1">
        <MapView
          hexCells={hexCells}
          arcs={arcs}
          planningAreas={data.planningAreas}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 bg-[image:var(--vm-map-fade)] pb-20 pt-3">
          <div className="pointer-events-auto mx-auto max-w-6xl px-4">
            <KpiStrip
              kpi={data.kpi}
              hexCount={hexCells.length}
              corridorCount={arcs.length}
              circuity={routing?.med_circuity}
              population={weightedPop}
            />
            <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-[var(--vm-muted)]">
              Prefer SDK/app for hourly axes — the aggregate feed resets near 08:00 SGT.
              {routing
                ? ` Road distances use OSRM (median circuity ${routing.med_circuity}× vs straight-line).`
                : ' OD arcs still show straight-line distances.'}
            </p>
          </div>
        </div>

        <aside className="absolute bottom-3 right-3 top-28 flex w-[min(100%-1.5rem,28rem)] flex-col overflow-hidden rounded-2xl border border-[var(--vm-line)] bg-[var(--vm-panel)] shadow-[0_18px_50px_rgba(12,18,32,0.12)] backdrop-blur-md">
          <div className="flex items-center gap-1 border-b border-[var(--vm-line)] p-2">
            {(
              [
                ['insights', 'Insights'],
                ['live', 'Live map'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDrawer(id)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs transition ${
                  drawer === id
                    ? 'bg-[var(--vm-accent)] text-white'
                    : 'text-[var(--vm-muted)] hover:bg-[var(--vm-accent-soft)] hover:text-[var(--vm-ink)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            {drawer === 'live' ? (
              <>
                <CorridorList arcs={arcs} />
                <CalendarHeatmap cells={calendar} />
                <RhythmGrid rhythms={rhythms} />
              </>
            ) : (
              data.insights && <InsightsPanel data={data.insights} zone={filters.zone} />
            )}

            <p className="border-t border-[var(--vm-line)] pt-3 text-[10px] leading-relaxed text-[var(--vm-muted)]">
              Privacy: every cell suppressed below 5 distinct devices at export. POI and dining
              footfall use visitor-only rows (home ≥400 m). Filter state is URL-encoded for sharing.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
