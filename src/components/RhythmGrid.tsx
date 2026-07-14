import { useMemo } from 'react'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { GroupRhythm } from '../types'
import { rhythmByGroup } from '../lib/slices'

export function RhythmGrid({ rhythms }: { rhythms: GroupRhythm[] }) {
  const groups = useMemo(() => rhythmByGroup(rhythms).slice(0, 12), [rhythms])

  if (!groups.length) {
    return (
      <section>
        <h2 className="font-display text-lg text-[var(--vm-ink)]">Category rhythms</h2>
        <p className="mt-1 text-[11px] text-[var(--vm-muted)]">No visitor footfall for these filters.</p>
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-display text-lg text-[var(--vm-ink)]">Category rhythms</h2>
      <p className="mt-0.5 text-[11px] text-[var(--vm-muted)]">
        Visitor-filtered (home ≥400 m) · one shape per POI group
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {groups.map(({ group, hours }) => {
          const data = hours.map((devices, hour) => ({ hour, devices }))
          const peak = Math.max(...hours, 1)
          return (
            <div key={group} className="rounded-lg bg-white/70 p-2">
              <p className="truncate text-[11px] font-medium text-[var(--vm-ink)]">{group}</p>
              <div className="mt-1 h-14">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <XAxis dataKey="hour" hide />
                    <YAxis hide domain={[0, peak]} />
                    <Line
                      type="monotone"
                      dataKey="devices"
                      stroke="#0d7a6f"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
