import type {
  CalendarCell,
  Filters,
  GroupRhythm,
  HexCell,
  HexHourCell,
  OdArc,
  VisitCell,
} from '../types'

export function sliceHexDensity(
  cells: HexCell[],
  filters: Filters,
): HexCell[] {
  const daypart = filters.daypart
  return cells.filter((c) => c.daypart === daypart || (daypart === 'all' && c.daypart === 'all'))
}

export function sliceOdArcs(
  arcs: OdArc[],
  cubeCells: OdArc[] | null,
  filters: Filters,
): OdArc[] {
  // Prefer pre-banded arcs when daytype/zone aren't filtering; otherwise slice the OD cube.
  const needsCube =
    Boolean(cubeCells?.length) &&
    (filters.daytype !== 'all' ||
      Boolean(filters.zone) ||
      filters.hourBand === 'offpeak')
  const source = needsCube && cubeCells ? cubeCells : arcs
  return source
    .filter((a) => {
      if (filters.hourBand !== 'all' && a.hour_band && a.hour_band !== filters.hourBand) {
        return false
      }
      if (filters.daytype !== 'all' && a.daytype && a.daytype !== filters.daytype) {
        return false
      }
      if (filters.zone && a.o_zone !== filters.zone && a.d_zone !== filters.zone) {
        return false
      }
      return true
    })
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 80)
}

export function sliceCalendar(
  calendar: CalendarCell[],
  filters: Filters,
): CalendarCell[] {
  return calendar.filter((c) => {
    if (filters.daytype !== 'all' && c.daytype !== filters.daytype) return false
    if (filters.sourceClass !== 'all' && c.source_class !== filters.sourceClass) return false
    return true
  })
}

export function sliceGroupRhythms(
  rhythms: GroupRhythm[],
  filters: Filters,
): GroupRhythm[] {
  return rhythms.filter((r) => {
    if (filters.daytype !== 'all' && r.daytype !== filters.daytype) return false
    if (filters.category && r.category_group !== filters.category) return false
    return true
  })
}

export function sliceVisits(
  cells: VisitCell[],
  filters: Filters,
): VisitCell[] {
  return cells.filter((c) => {
    if (filters.daytype !== 'all' && c.daytype !== filters.daytype) return false
    if (filters.zone && c.zone !== filters.zone) return false
    if (filters.category && c.category_group !== filters.category) return false
    return true
  })
}

export function corridorId(a: OdArc): string {
  return `${a.o_zone}→${a.d_zone}`
}

/** Prefer sdk/app calendar when source filter is sdk_app; fall back to summed. */
export function calendarMatrix(
  cells: CalendarCell[],
): { dow: number; day: string; hours: number[] }[] {
  const byDow = new Map<number, { day: string; hours: number[] }>()
  for (const c of cells) {
    const slot = byDow.get(c.dow) ?? { day: c.day, hours: Array(24).fill(0) }
    slot.hours[c.hour] += c.devices
    slot.day = c.day
    byDow.set(c.dow, slot)
  }
  // DuckDB dayofweek: 0=Sun … 6=Sat — display Mon→Sun
  const order = [1, 2, 3, 4, 5, 6, 0]
  return order
    .filter((d) => byDow.has(d))
    .map((d) => {
      const v = byDow.get(d)!
      return { dow: d, day: v.day.slice(0, 3), hours: v.hours }
    })
}

export function rhythmByGroup(
  rhythms: GroupRhythm[],
): { group: string; hours: number[] }[] {
  const map = new Map<string, number[]>()
  for (const r of rhythms) {
    const hours = map.get(r.category_group) ?? Array(24).fill(0)
    hours[r.hour] += r.devices
    map.set(r.category_group, hours)
  }
  return [...map.entries()]
    .map(([group, hours]) => ({ group, hours }))
    .sort((a, b) => b.hours.reduce((s, n) => s + n, 0) - a.hours.reduce((s, n) => s + n, 0))
}

export function filterHexHourDevices(
  cells: HexHourCell[],
  filters: Filters,
): number {
  return cells
    .filter((c) => {
      if (filters.daytype !== 'all' && c.daytype !== filters.daytype) return false
      if (filters.sourceClass !== 'all' && c.source_class !== filters.sourceClass) return false
      return true
    })
    .reduce((s, c) => s + c.devices, 0)
}
