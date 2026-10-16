import { useState } from 'react'
import type { AnalyticsInsights } from '../types'

type View = 'move' | 'places' | 'events' | 'quality'

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'places', label: 'Places' },
  { id: 'move', label: 'Move' },
  { id: 'events', label: 'Events' },
  { id: 'quality', label: 'Data' },
]

const compact = new Intl.NumberFormat('ja-JP', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const number = new Intl.NumberFormat('ja-JP')

function labelize(value: string) {
  return value.replaceAll('_', ' ')
}

function pct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`
}

function km(value: number | undefined) {
  return value == null ? '—' : `${value.toFixed(value < 10 ? 1 : 0)} km`
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

function Empty({ what }: { what: string }) {
  return (
    <p className="text-xs text-[var(--vm-muted)]">
      {what} isn’t available for this dataset.
    </p>
  )
}

function PlacesView({
  data,
  zone,
}: {
  data: AnalyticsInsights
  zone: string | null
}) {
  const za = data.zoneActivity
  const dwell = data.dwell
  const zoneRows = (za?.by_zone ?? [])
    .filter((row) => !zone || row.zone === zone)
    .slice(0, zone ? 1 : 8)

  return (
    <>
      <Section title={zone ? `${zone} activity` : 'Most active zones'} note="Distinct devices with a dwell in each metro area">
        {za ? (
          <Bars
            rows={zoneRows.map((row) => ({
              label: row.zone,
              value: row.devices,
              detail: `${compact.format(row.devices)} · peak ${String(row.peak_hour ?? 0).padStart(2, '0')}:00`,
            }))}
          />
        ) : (
          <Empty what="Zone activity" />
        )}
      </Section>

      <Section title="Longest-dwell destinations" note="Median dwell per zone (venue-like stays)">
        {dwell ? (
          <Bars
            rows={dwell.longest_dwell_zones.slice(0, 6).map((row) => ({
              label: row.zone,
              value: row.med_dwell_min ?? 0,
              detail: `${Math.round(row.med_dwell_min ?? 0)} min · ${compact.format(row.devices)} dev`,
            }))}
          />
        ) : (
          <Empty what="Dwell data" />
        )}
      </Section>

      <Section title="Dwell by area type">
        {dwell ? (
          <Bars
            rows={dwell.by_kind
              .slice()
              .sort((a, b) => b.stops - a.stops)
              .map((row) => ({
                label: labelize(row.kind),
                value: row.stops,
                detail: `${compact.format(row.stops)} stops · ${Math.round(row.med_dwell_min)} min`,
              }))}
          />
        ) : (
          <Empty what="Dwell data" />
        )}
      </Section>
    </>
  )
}

function MoveView({ data }: { data: AnalyticsInsights }) {
  const mv = data.movement
  const hw = data.homeWork
  const dist = mv?.trip_distance_km ?? {}
  const rog = mv?.radius_of_gyration_km ?? {}
  const cdist = hw?.commute_distance_km ?? {}

  return (
    <>
      <Section title="Trip distance" note="Straight-line distance between consecutive stops">
        {mv ? (
          <StatGrid
            items={[
              { label: 'Median', value: km(dist.p50), hint: 'p50' },
              { label: 'Upper quartile', value: km(dist.p75), hint: 'p75' },
              { label: 'Long trips', value: km(dist.p95), hint: 'p95' },
            ]}
          />
        ) : (
          <Empty what="Movement data" />
        )}
      </Section>

      {mv && (
        <Section title="Travel mode mix" note="Inferred from trip speed">
          <Bars
            rows={mv.trip_speed_bands.map((row) => ({
              label: labelize(row.band),
              value: row.trips,
              detail: `${compact.format(row.trips)} · ${row.med_dist_km} km`,
            }))}
          />
        </Section>
      )}

      {mv && (
        <Section title="Daily footprint" note="Radius of gyration = spread of a device’s stops">
          <StatGrid
            items={[
              { label: 'Median radius', value: km(rog.p50) },
              { label: 'Upper quartile', value: km(rog.p75) },
              {
                label: 'Trips / device·day',
                value: mv.trips_per_active_device_day.trips.toFixed(2),
              },
            ]}
          />
        </Section>
      )}

      <Section title="Home & work anchors" note="Top residential and daytime zones">
        {hw ? (
          <>
            <Bars
              rows={hw.top_home_zones.slice(0, 5).map((row) => ({
                label: row.zone,
                value: row.devices,
                detail: `${compact.format(row.devices)} home`,
              }))}
            />
            <p className="mt-1 text-[10px] text-[var(--vm-muted)]">
              Median home→work distance {km(cdist.p50)} (p75 {km(cdist.p75)}).
            </p>
          </>
        ) : (
          <Empty what="Home/work data" />
        )}
      </Section>
    </>
  )
}

function EventsView({
  data,
  zone,
}: {
  data: AnalyticsInsights
  zone: string | null
}) {
  const an = data.anomalies
  const events = (an?.events ?? [])
    .filter((event) => !zone || event.zone === zone)
    .slice(0, 6)
  const days = an?.quietest_vs_busiest_days ?? []

  return (
    <>
      <Section title="Burst events" note="Zone-days where footfall spiked well above its norm">
        {an ? (
          <div className="space-y-2.5">
            {events.length === 0 && <Empty what="Events" />}
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
        ) : (
          <Empty what="Events" />
        )}
      </Section>

      <Section title="Quietest vs busiest days">
        {days.length ? (
          <Bars
            rows={days.map((row) => ({
              label: `${row.d} · ${String(row.day).slice(0, 3)}`,
              value: Number(row.devices),
              detail: compact.format(Number(row.devices)),
            }))}
          />
        ) : (
          <Empty what="Daily totals" />
        )}
      </Section>
    </>
  )
}

function QualityView({ data }: { data: AnalyticsInsights }) {
  const dq = data.dataQuality
  const dwell = data.dwell
  return (
    <>
      <Section title="Dwell duration mix">
        {dwell ? (
          <Bars
            rows={dwell.dwell_distribution.map((row) => ({
              label: row.bucket,
              value: row.stops,
              detail: compact.format(row.stops),
            }))}
          />
        ) : (
          <Empty what="Dwell data" />
        )}
      </Section>

      <p className="border-l-2 border-[var(--vm-accent)] pl-2 text-[10px] leading-relaxed text-[var(--vm-muted)]">
        Factori Japan mobility · September 2026 · timestamps in JST. Every exported cell is
        suppressed below 5 distinct devices.
        {dq
          ? ` Same-timestamp duplicate share ${(dq.duplicate_share.same_ts_share * 100).toFixed(2)}%.`
          : ''}
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
  const [view, setView] = useState<View>('places')

  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-[var(--vm-ink)]">Warehouse insights</h2>
          <p className="text-[11px] text-[var(--vm-muted)]">
            Zones · movement · dwell · events
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
        {view === 'places' && <PlacesView data={data} zone={zone} />}
        {view === 'move' && <MoveView data={data} />}
        {view === 'events' && <EventsView data={data} zone={zone} />}
        {view === 'quality' && <QualityView data={data} />}
      </div>
    </div>
  )
}
