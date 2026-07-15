import { useMemo, useState } from 'react'
import type { AnalyticsInsights } from '../types'

type View = 'movement' | 'places' | 'lifestyle' | 'audience' | 'context'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'movement', label: 'Move' },
  { id: 'places', label: 'Places' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'audience', label: 'Audience' },
  { id: 'context', label: 'Context' },
]

const compact = new Intl.NumberFormat('en-SG', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const number = new Intl.NumberFormat('en-SG')

function labelize(value: string) {
  return value.replaceAll('_', ' ')
}

function pct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

function Section({
  title,
  children,
  note,
}: {
  title: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <section className="space-y-2.5 border-t border-[var(--vm-line)] pt-3 first:border-0 first:pt-0">
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--vm-muted)]">
          {title}
        </h3>
        {note && (
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--vm-muted)]">{note}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string }>
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg bg-[var(--vm-accent-soft)]/45 px-2.5 py-2"
        >
          <p className="font-display text-lg leading-none text-[var(--vm-ink)]">{item.value}</p>
          <p className="mt-1 text-[9px] leading-tight text-[var(--vm-muted)]">{item.label}</p>
          {item.hint && (
            <p className="mt-0.5 font-mono text-[9px] text-[var(--vm-accent)]">{item.hint}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function Bars({
  rows,
}: {
  rows: Array<{ label: string; value: number; detail?: string }>
}) {
  if (!rows.length) {
    return <p className="text-xs text-[var(--vm-muted)]">No rows for this filter.</p>
  }
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
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--vm-line)]">
            <div
              className="h-full rounded-full bg-[var(--vm-accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function StackedSes({
  rows,
  keyField,
}: {
  rows: Array<{ ses_quintile: number; share: number } & Record<string, string | number>>
  keyField: string
}) {
  const keys = [...new Set(rows.map((row) => String(row[keyField])))]
  const palette = ['#0d7a6f', '#1f9d8f', '#5bb8ab', '#9ad4cb', '#cfe8e3', '#7a8b9c']
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((q) => {
        const slice = rows.filter((row) => row.ses_quintile === q)
        return (
          <div key={q}>
            <div className="mb-1 flex justify-between text-[10px] text-[var(--vm-muted)]">
              <span>Q{q}</span>
              <span className="font-mono">{compact.format(slice.reduce((s, r) => s + Number(r.visits ?? 0), 0))} visits</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-[var(--vm-line)]">
              {slice.map((row, i) => (
                <div
                  key={`${q}-${row[keyField]}`}
                  title={`${labelize(String(row[keyField]))}: ${pct(row.share, 0)}`}
                  style={{
                    width: `${row.share * 100}%`,
                    background: palette[i % palette.length],
                  }}
                />
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {keys.slice(0, 6).map((key, i) => (
          <span key={key} className="flex items-center gap-1.5 text-[9px] text-[var(--vm-muted)]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: palette[i % palette.length] }}
            />
            {labelize(key)}
          </span>
        ))}
      </div>
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
  const routing = data.routing
  const road = routing.road_vs_straight
  const flows = data.homeWork.commute_flows
    .filter((flow) => !zone || flow.home_zone === zone || flow.work_zone === zone)
    .slice(0, 6)
  const events = data.anomalies.events
    .filter((event) => !zone || event.zone === zone)
    .slice(0, 4)
  const corridors = data.uncertainty.corridor_daily_trips.slice(0, 4)

  return (
    <>
      {road && (
        <Section title="Road network vs straight-line" note="OSRM car routing on a trip sample">
          <StatGrid
            items={[
              {
                label: 'Median road',
                value: `${road.med_road_km} km`,
                hint: `${road.med_circuity}× circuity`,
              },
              {
                label: 'Median drive',
                value: `${road.med_drive_min} min`,
              },
              {
                label: 'OSRM corr',
                value: routing.osrm_validation
                  ? routing.osrm_validation.travel_band_corr.toFixed(2)
                  : '—',
                hint: 'travel-band',
              },
            ]}
          />
        </Section>
      )}

      {routing.mode_inference && (
        <Section title="Inferred mode mix" note="Observed duration vs car drive estimate">
          <Bars
            rows={routing.mode_inference.map((row) => ({
              label: labelize(row.mode_est),
              value: row.share,
              detail: pct(row.share, 0),
            }))}
          />
          {routing.census_car_share && (
            <p className="text-[10px] text-[var(--vm-muted)]">
              Census car-to-work share: {pct(routing.census_car_share.census_car_share, 0)}
            </p>
          )}
        </Section>
      )}

      <Section title={zone ? `Commutes touching ${zone}` : 'Leading commute flows'}>
        <Bars
          rows={flows.map((flow) => ({
            label: `${flow.home_zone} → ${flow.work_zone}`,
            value: flow.devices,
            detail: `${number.format(flow.devices)} devices`,
          }))}
        />
      </Section>

      <Section title="Event anatomy" note="Burst hours clustered into zone-day events">
        <div className="space-y-2.5">
          {events.map((event) => (
            <div
              key={`${event.zone}-${event.d}`}
              className="rounded-lg border border-[var(--vm-line)] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--vm-ink)]">{event.zone}</p>
                  <p className="font-mono text-[9px] text-[var(--vm-muted)]">{event.d}</p>
                </div>
                <p className="font-mono text-[10px] text-[var(--vm-accent)]">
                  {event.peak_uplift.toFixed(1)}× peak
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] text-[var(--vm-muted)]">
                <span>{number.format(event.peak_devices)} peak</span>
                <span>{pct(event.first_time_share, 0)} first-time</span>
                <span>{event.burst_hours}h burst</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Corridor confidence" note={data.uncertainty.method}>
        <div className="space-y-2">
          {corridors.map((row) => (
            <div key={row.corridor} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--vm-ink)]">{row.corridor}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
                {compact.format(row.mean_per_day)}/d · {compact.format(row.ci95_lo)}–
                {compact.format(row.ci95_hi)}
              </span>
            </div>
          ))}
        </div>
      </Section>
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
  const venues = data.uncertainty.venue_daily_footfall.slice(0, 4)

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
        <div className="space-y-2.5">
          {data.poi.top_venues.slice(0, 5).map((venue) => (
            <div key={venue.name} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-[var(--vm-ink)]">{venue.name}</p>
                <p className="text-[9px] text-[var(--vm-muted)]">{venue.grp}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-[9px] text-[var(--vm-muted)]">
                <p>{number.format(venue.devices)} devices</p>
                <p>{venue.med_home_dist_km} km home</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Category affinity" note="Lift > 1 means categories co-occur more than chance">
        <Bars
          rows={data.affinity.category_lift.slice(0, 5).map((row) => ({
            label: `${row.ga} × ${row.gb}`,
            value: row.lift,
            detail: `${row.lift.toFixed(2)}× lift`,
          }))}
        />
      </Section>

      <Section title="Venue footfall ± CI">
        <div className="space-y-2">
          {venues.map((row) => (
            <div key={row.name} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--vm-ink)]">{row.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
                {compact.format(row.mean_per_day)}/d
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function LifestyleView({ data }: { data: AnalyticsInsights }) {
  const weekdayMeals = data.dining.meal_occasion_mix.filter((row) => row.daytype === 'weekday')
  const hawker = data.dining.hawker_index_by_ses

  return (
    <>
      <Section title="Dining format by SES" note="Visitor Food & Drink visits">
        <StackedSes rows={data.dining.format_by_ses} keyField="format" />
      </Section>

      <Section title="Hawker vs restaurant share">
        <Bars
          rows={hawker.map((row) => ({
            label: `Q${row.ses_quintile}`,
            value: row.hawker_share,
            detail: `hawker ${pct(row.hawker_share, 0)} · rest ${pct(row.restaurant_share, 0)}`,
          }))}
        />
      </Section>

      <Section title="Meal occasions (weekday)">
        <Bars
          rows={weekdayMeals.map((row) => ({
            label: labelize(row.meal_occasion),
            value: row.visits,
            detail: `${pct(row.near_home_share, 0)} near home`,
          }))}
        />
      </Section>

      <Section title="Mall mission mix" note="Grab <25m · browse <90m · day out ≥90m">
        <Bars
          rows={data.retail.mall_missions.map((row) => ({
            label: labelize(row.mission),
            value: row.share,
            detail: `${pct(row.share, 0)} · ${row.med_dwell_min} min`,
          }))}
        />
        <StatGrid
          items={[
            {
              label: 'Single-mall',
              value: pct(data.retail.mall_loyalty.single_mall_share, 0),
            },
            {
              label: 'Primary mall',
              value: pct(data.retail.mall_loyalty.primary_mall_concentration, 0),
            },
            {
              label: 'Mall goers',
              value: compact.format(data.retail.mall_loyalty.mall_goers),
            },
          ]}
        />
      </Section>

      <Section title="Heartland vs regional malls">
        <Bars
          rows={data.retail.heartland_vs_regional.map((row) => ({
            label: `Q${row.ses_quintile}`,
            value: row.regional_share,
            detail: `${pct(row.regional_share, 0)} regional`,
          }))}
        />
      </Section>

      <Section title="Top mall catchments">
        <div className="space-y-2">
          {data.retail.top_mall_catchment.slice(0, 5).map((mall) => (
            <div key={mall.mall} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-[var(--vm-ink)]">{mall.mall}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
                {number.format(mall.visitors)} · {mall.med_home_km} km
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}

function AudienceView({ data }: { data: AnalyticsInsights }) {
  const households = data.household
  const spearman = data.ses.validation?.spearman_mean_ses_vs_census_income

  return (
    <>
      <Section title="Population-weighted panel">
        <StatGrid
          items={[
            {
              label: 'Est. population',
              value: compact.format(data.weighted.weighted_totals.estimated_population),
            },
            {
              label: 'Weighted devices',
              value: compact.format(data.weighted.weighted_totals.weighted_devices),
            },
            {
              label: 'SES Spearman',
              value: spearman != null ? spearman.toFixed(2) : '—',
              hint: data.ses.validation?.pass_criterion ? 'validated' : undefined,
            },
          ]}
        />
      </Section>

      <Section title="Mobility segments">
        <Bars
          rows={data.segments.sizes
            .filter((row) => row.segment !== 'unanchored')
            .slice(0, 7)
            .map((row) => ({
              label: labelize(row.segment),
              value: row.devices,
              detail: pct(row.share, 1),
            }))}
        />
      </Section>

      <Section title="Socioeconomic quintiles">
        <Bars
          rows={data.ses.quintile_sizes.map((row) => ({
            label: `Q${row.ses_quintile}`,
            value: row.med_home_value,
            detail: `$${compact.format(row.med_home_value)} · iOS ${pct(row.ios_share, 0)}`,
          }))}
        />
      </Section>

      <Section title="Household signals" note="Distribution-only proxies · no device pairs exported">
        <Bars
          rows={households.household_size_distribution.map((row) => ({
            label: `${row.household_size_band} person`,
            value: row.n_devices,
            detail: compact.format(row.n_devices),
          }))}
        />
        <StatGrid
          items={[
            {
              label: 'Multi-device',
              value: pct(households.single_vs_multi.multi_share, 1),
            },
            {
              label: 'Dual-work',
              value: pct(households.dual_income_proxy.dual_income_share_among_multi, 1),
            },
            {
              label: 'Weekend co-move',
              value: pct(households.weekend_comove_rate.weekend_comove_share, 0),
            },
          ]}
        />
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
      .map(([label, value]) => ({ label: labelize(label), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7)
  }, [data.purpose.purpose_by_hour])

  const holiday = data.urbanContext.holiday_effect.calendar.find((day) => day.holiday)
  const rain = data.urbanContext.rain_response?.outdoor_vs_indoor ?? []
  const wet = rain.find((row) => row.wet)
  const dry = rain.find((row) => !row.wet)

  return (
    <>
      <Section title="Inferred trip purpose">
        <Bars rows={purposes} />
      </Section>

      <Section title="Urban context">
        {holiday ? (
          <div className="rounded-lg border border-[var(--vm-line)] px-3 py-2">
            <p className="text-xs text-[var(--vm-ink)]">{holiday.holiday}</p>
            <p className="mt-1 font-mono text-[9px] text-[var(--vm-muted)]">
              {holiday.d} · {compact.format(holiday.stop_devices)} devices ·{' '}
              {pct(holiday.cbd_stop_share, 1)} CBD
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--vm-muted)]">No holiday in the export window.</p>
        )}
      </Section>

      {wet && dry && (
        <Section title="Rain response" note="Indoor vs outdoor visits during wet hours">
          <StatGrid
            items={[
              {
                label: 'Wet outdoor share',
                value: pct(wet.outdoor_visits / Math.max(wet.all_visits, 1), 0),
              },
              {
                label: 'Dry outdoor share',
                value: pct(dry.outdoor_visits / Math.max(dry.all_visits, 1), 0),
              },
              {
                label: 'Wet hours',
                value: String(wet.n_hours),
              },
            ]}
          />
        </Section>
      )}

      {data.urbanContext.mrt_station_footfall && (
        <Section title="MRT station catchments">
          <div className="space-y-2">
            {data.urbanContext.mrt_station_footfall.slice(0, 5).map((row) => (
              <div
                key={String(row.station)}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-[var(--vm-ink)]">
                  {labelize(String(row.station).replace(' MRT STATION', ''))}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--vm-muted)]">
                  {compact.format(Number(row.devices))} · {row.med_home_dist_km} km
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <p className="border-l-2 border-[var(--vm-accent)] pl-2 text-[10px] leading-relaxed text-[var(--vm-muted)]">
        Feed quality: aggregate source has a UTC-midnight step near 08:00 SGT. Same-timestamp
        duplicate share is {(data.dataQuality.duplicate_share.same_ts_share * 100).toFixed(2)}%.
      </p>
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
  const [view, setView] = useState<View>('lifestyle')

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[var(--vm-ink)]">Warehouse insights</h2>
          <p className="text-[11px] text-[var(--vm-muted)]">
            Dining · retail · routing · SES · events
          </p>
        </div>
      </div>

      <div
        className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--vm-line)] pb-0"
        role="tablist"
        aria-label="Insight views"
      >
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={`shrink-0 border-b-2 px-2.5 pb-2 font-mono text-[9px] uppercase tracking-wide transition-colors ${
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
        {view === 'lifestyle' && <LifestyleView data={data} />}
        {view === 'audience' && <AudienceView data={data} />}
        {view === 'context' && <ContextView data={data} />}
      </div>
    </div>
  )
}
