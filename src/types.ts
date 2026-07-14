export type Daytype = 'weekday' | 'weekend' | 'all'
export type Daypart = 'all' | 'morning' | 'midday' | 'evening' | 'night'
export type HourBand = 'all' | 'am' | 'pm' | 'late' | 'offpeak'
export type SourceClass = 'all' | 'sdk_app' | 'agg'
export type H3Res = '7' | '8' | '9'

export interface Filters {
  daytype: Daytype
  daypart: Daypart
  hourBand: HourBand
  sourceClass: SourceClass
  h3Res: H3Res
  zone: string | null
  category: string | null
  showHex: boolean
  showArcs: boolean
  showBoundaries: boolean
}

export interface Kpi {
  pings: number
  devices: number
  first_day: string
  last_day: string
}

export interface HexCell {
  h3: string
  daypart: string
  devices: number
}

export interface OdArc {
  o_zone: string
  d_zone: string
  trips: number
  devices: number
  med_travel_min: number
  med_dist_km: number
  o_lat: number
  o_lng: number
  d_lat: number
  d_lng: number
  hour_band?: string
  daytype?: string
}

export interface CalendarCell {
  dow: number
  day: string
  hour: number
  daytype: string
  source_class: string
  devices: number
}

export interface HexHourCell {
  h3: string
  hour: number
  daytype: string
  source_class: string
  devices: number
  pings: number
}

export interface VisitCell {
  category: string
  category_group: string
  zone: string
  hour: number
  daytype: string
  devices: number
  visits: number
  med_dwell_min: number
}

export interface GroupRhythm {
  category_group: string
  hour: number
  daytype: string
  devices: number
}

export interface ZoneRow {
  zone: string
  lat: number
  lng: number
  kind: string
}

export const DEFAULT_FILTERS: Filters = {
  daytype: 'all',
  daypart: 'all',
  hourBand: 'all',
  sourceClass: 'sdk_app',
  h3Res: '8',
  zone: null,
  category: null,
  showHex: true,
  showArcs: true,
  showBoundaries: true,
}

export const DAYPART_LABELS: Record<Daypart, string> = {
  all: 'All day',
  morning: 'Morning 07–09',
  midday: 'Midday 10–16',
  evening: 'Evening 17–20',
  night: 'Night 21–06',
}
