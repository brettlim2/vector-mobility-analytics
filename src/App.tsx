import { useEffect, useMemo } from 'react'
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

export default function App() {
  const data = useAnalyticsData()
  const filters = useAppStore((s) => s.filters)
  const hydrateFromUrl = useAppStore((s) => s.hydrateFromUrl)

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

  return (
    <div className="relative flex h-full flex-col">
      <FilterBar zones={zoneNames} categories={data.visitCategories} />

      <div className="relative min-h-0 flex-1">
        <MapView
          hexCells={hexCells}
          arcs={arcs}
          planningAreas={data.planningAreas}
        />

        {/* Top fade + KPI */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-[image:var(--vm-map-fade)] pb-16 pt-3">
          <div className="pointer-events-auto mx-auto max-w-5xl px-4">
            <KpiStrip
              kpi={data.kpi}
              hexCount={hexCells.length}
              corridorCount={arcs.length}
            />
            <p className="mt-2 text-[11px] text-[var(--vm-muted)]">
              Agg feed resets near 08:00 SGT (UTC midnight) — prefer SDK/app for hourly axes.
              Distances are straight-line until routing is added.
            </p>
          </div>
        </div>

        {/* Side panel */}
        <aside className="absolute bottom-3 right-3 top-28 flex w-[min(100%-1.5rem,22rem)] flex-col gap-4 overflow-y-auto rounded-xl bg-[var(--vm-panel)] p-4 shadow-lg backdrop-blur-md">
          <CorridorList arcs={arcs} />
          <CalendarHeatmap cells={calendar} />
          <RhythmGrid rhythms={rhythms} />
          {data.insights && <InsightsPanel data={data.insights} zone={filters.zone} />}
          <p className="border-t border-[var(--vm-line)] pt-3 text-[10px] leading-relaxed text-[var(--vm-muted)]">
            Privacy: every cell suppressed below 5 distinct devices at export. POI rhythms use
            visitor footfall only (home ≥400 m from venue). Filter state is URL-encoded for sharing.
          </p>
        </aside>
      </div>
    </div>
  )
}
