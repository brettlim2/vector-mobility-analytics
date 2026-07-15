import { useMemo, useState } from 'react'
import type { AnalyticsInsights } from '../types'

type View = 'movement' | 'places' | 'people' | 'context'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'movement', label: 'Movement' },
  { id: 'places', label: 'Places' },
  { id: 'people', label: 'People' },
  { id: 'context', label: 'Context' },
]

const compact = new Intl.NumberFormat('en-SG', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const number = new Intl.NumberFormat('en-SG')

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-[var(--vm-line)] pt-3 first:border-0 first:pt-0">
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--vm-muted)]">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Bars({
  rows,
}: {
  rows: Array<{ label: string; value: number; detail?: string }>
}) {
  const max = Math.max(...rows.map((row) => row.value), 1)
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-[var(--vm-ink)]">{row.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
              {row.detail ?? compact.format(row.value)}
            </span>
          </div>
          <div className="h-1 bg-[var(--vm-line)]">
            <div
              className="h-full bg-[var(--vm-accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MovementView({
  data,
  zone,
}: {
  data: AnalyticsInsights
  zone: string | null
}) {
  const flows = data.homeWork.commute_flows
    .filter((flow) => !zone || flow.home_zone === zone || flow.work_zone === zone)
    .slice(0, 5)
  const events = data.anomalies.burst_events
    .filter((event) => !zone || event.zone === zone)
    .slice(0, 3)
  const distance = data.movement.trip_distance_km

  return (
    <>
      <Section title={zone ? `Commutes touching ${zone}` : 'Leading commute flows'}>
        <Bars
          rows={flows.map((flow) => ({
            label: `${flow.home_zone} → ${flow.work_zone}`,
            value: flow.devices,
            detail: `${number.format(flow.devices)} devices`,
          }))}
        />
        {flows.length === 0 && (
          <p className="text-xs text-[var(--vm-muted)]">No k-anonymous flow for this zone.</p>
        )}
      </Section>

      <Section title="Trip profile">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Median trip', `${distance.p50 ?? 0} km`],
            ['90% commute', `${data.homeWork.commute_distance_km.p90 ?? 0} km`],
            ['Trips / day', `${data.movement.trips_per_active_device_day.trips ?? 0}`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="font-display text-lg text-[var(--vm-ink)]">{value}</p>
              <p className="text-[9px] leading-tight text-[var(--vm-muted)]">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Dwell distribution">
        <Bars
          rows={data.dwell.dwell_distribution.map((row) => ({
            label: row.bucket,
            value: row.stops,
          }))}
        />
      </Section>

      <Section title="Detected bursts">
        <div className="space-y-2">
          {events.map((event) => (
            <div key={`${event.zone}-${event.hour_sgt}`} className="flex justify-between gap-3 text-xs">
              <div>
                <p className="text-[var(--vm-ink)]">{event.zone}</p>
                <p className="font-mono text-[9px] text-[var(--vm-muted)]">{event.hour_sgt}</p>
              </div>
              <span className="font-mono text-[10px] text-[var(--vm-accent)]">
                {event.ratio.toFixed(1)}× typical
              </span>
            </div>
          ))}
        </div>
      </Section>

      <p className="border-l-2 border-[var(--vm-accent)] pl-2 text-[10px] leading-relaxed text-[var(--vm-muted)]">
        Feed quality: the aggregate source has a UTC-midnight step near 08:00 SGT.
        Same-timestamp duplicate share is{' '}
        {(data.dataQuality.duplicate_share.same_ts_share * 100).toFixed(2)}%.
      </p>
    </>
  )
}

function PlacesView({
  data,
  zone,
}: {
  data: AnalyticsInsights
  zone: string | null
}) {
  const zoneRows = data.zoneActivity.by_zone
    .filter((row) => !zone || row.zone === zone)
    .slice(0, zone ? 1 : 5)
  return (
    <>
      <Section title={zone ? `${zone} activity` : 'Most active zones'}>
        <Bars
          rows={zoneRows.map((row) => ({
            label: row.zone,
            value: row.devices,
            detail: `${compact.format(row.devices)} · peak ${String(row.peak_hour).padStart(2, '0')}:00`,
          }))}
        />
      </Section>

      <Section title="Visitor destinations">
        <div className="space-y-3">
          {data.poi.top_venues.slice(0, 5).map((venue) => (
            <div key={venue.name} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--vm-ink)]">{venue.name}</p>
                <p className="text-[9px] text-[var(--vm-muted)]">{venue.grp}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-[9px] text-[var(--vm-muted)]">
                <p>{number.format(venue.devices)} devices</p>
                <p>{venue.med_home_dist_km} km catchment</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Attribution coverage">
        <div className="flex items-end justify-between">
          <p className="font-display text-2xl text-[var(--vm-ink)]">
            {(data.poi.attribution.match_rate * 100).toFixed(1)}%
          </p>
          <p className="max-w-36 text-right text-[10px] leading-relaxed text-[var(--vm-muted)]">
            {compact.format(data.poi.attribution.visitor_visits)} visitor visits after home-distance filtering
          </p>
        </div>
      </Section>
    </>
  )
}

function PeopleView({ data }: { data: AnalyticsInsights }) {
  const households = data.household
  return (
    <>
      <Section title="Mobility segments">
        <Bars
          rows={data.segments.sizes.slice(0, 6).map((row) => ({
            label: row.segment.replaceAll('_', ' '),
            value: row.devices,
            detail: `${(row.share * 100).toFixed(1)}%`,
          }))}
        />
      </Section>

      <Section title="Socioeconomic quintiles">
        <Bars
          rows={data.ses.quintile_sizes.map((row) => ({
            label: `Q${row.ses_quintile}`,
            value: row.med_home_value,
            detail: `$${compact.format(row.med_home_value)} home`,
          }))}
        />
      </Section>

      <Section title="Household signals">
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Multi-device', households.single_vs_multi.multi_share],
            ['Dual-work', households.dual_income_proxy.dual_income_share_among_multi],
            ['Weekend co-move', households.weekend_comove_rate.weekend_comove_share],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="font-display text-lg text-[var(--vm-ink)]">
                {((value as number) * 100).toFixed(1)}%
              </p>
              <p className="text-[9px] leading-tight text-[var(--vm-muted)]">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9px] leading-relaxed text-[var(--vm-muted)]">
          Distribution-only household proxies; no device pairs are exported.
        </p>
      </Section>
    </>
  )
}

function ContextView({ data }: { data: AnalyticsInsights }) {
  const purposes = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of data.purpose.purpose_by_hour) {
      totals.set(row.purpose, (totals.get(row.purpose) ?? 0) + row.trips)
    }
    return [...totals]
      .map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7)
  }, [data.purpose.purpose_by_hour])
  const holiday = data.urbanContext.holiday_effect.calendar.find((day) => day.holiday)

  return (
    <>
      <Section title="Inferred trip purpose">
        <Bars rows={purposes} />
      </Section>

      <Section title="Urban context">
        {holiday ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--vm-ink)]">{holiday.holiday}</p>
              <p className="font-mono text-[9px] text-[var(--vm-muted)]">{holiday.d}</p>
            </div>
            <p className="text-right font-mono text-[9px] text-[var(--vm-muted)]">
              {compact.format(holiday.stop_devices)} devices
              <br />
              {(holiday.cbd_stop_share * 100).toFixed(1)}% CBD
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--vm-muted)]">No holiday in the export window.</p>
        )}
      </Section>
    </>
  )
}

export function InsightsPanel({
  data,
  zone,
}: {
  data: AnalyticsInsights
  zone: string | null
}) {
  const [view, setView] = useState<View>('movement')

  return (
    <div>
      <div className="mb-4 flex border-b border-[var(--vm-line)]" role="tablist" aria-label="Analytics views">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={`flex-1 border-b-2 px-1 pb-2 font-mono text-[9px] uppercase tracking-wide transition-colors ${
              view === item.id
                ? 'border-[var(--vm-accent)] text-[var(--vm-ink)]'
                : 'border-transparent text-[var(--vm-muted)] hover:text-[var(--vm-ink)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-4" role="tabpanel">
        {view === 'movement' && <MovementView data={data} zone={zone} />}
        {view === 'places' && <PlacesView data={data} zone={zone} />}
        {view === 'people' && <PeopleView data={data} />}
        {view === 'context' && <ContextView data={data} />}
      </div>
    </div>
  )
}
