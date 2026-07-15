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

export interface ZoneMetric {
  zone: string
  devices: number
  stops?: number
  med_dwell_min?: number
  peak_hour?: number
}

export interface HomeWorkInsight {
  devices_classified: { n: number; commuters: number }
  top_home_zones: ZoneMetric[]
  top_work_zones: ZoneMetric[]
  commute_flows: Array<{
    home_zone: string
    work_zone: string
    devices: number
  }>
  commute_distance_km: Record<string, number>
}

export interface ZoneActivityInsight {
  by_zone: Array<ZoneMetric & { kind: string }>
  day_night: Array<Record<string, string | number>>
  weekend_shift: Array<Record<string, string | number>>
}

export interface PoiInsights {
  attribution: {
    attributed_visits: number
    visitor_visits: number
    match_rate: number
  }
  top_venues: Array<{
    name: string
    grp: string
    devices: number
    visits: number
    med_dwell_min: number
    med_home_dist_km: number
  }>
  top_brands: Array<Record<string, string | number>>
}

export interface MovementInsight {
  trip_distance_km: Record<string, number>
  trip_speed_bands: Array<{
    band: string
    trips: number
    med_dist_km: number
  }>
  radius_of_gyration_km: Record<string, number>
  trips_per_active_device_day: { trips: number }
}

export interface DwellInsight {
  by_kind: Array<{
    kind: string
    stops: number
    med_dwell_min: number
    p90_dwell_min: number
  }>
  longest_dwell_zones: ZoneMetric[]
  dwell_distribution: Array<{ bucket: string; stops: number }>
}

export interface AnomaliesInsight {
  burst_events: Array<{
    hour_sgt: string
    devices: number
    typical_devices: number
    ratio: number
    zone: string
  }>
}

export interface DataQualityInsight {
  utc_midnight_step: Array<{
    h: number
    agg_devices: number
    sdk_app_devices: number
  }>
  duplicate_share: { same_ts_share: number }
}

export interface SegmentsInsight {
  sizes: Array<{ segment: string; devices: number; share: number }>
}

export interface SesInsight {
  quintile_sizes: Array<{
    ses_quintile: number
    devices: number
    mean_score: number
    med_home_value: number
    ios_share: number
  }>
}

export interface PurposeInsight {
  purpose_by_hour: Array<{
    h: number
    daytype: string
    purpose: string
    trips: number
  }>
  purpose_mix: Array<Record<string, string | number>>
}

export interface UrbanContextInsight {
  holiday_effect: {
    calendar: Array<{
      d: string
      day: string
      holiday: string | null
      stop_devices: number
      stops: number
      cbd_stop_share: number
    }>
  }
  penetration: Array<Record<string, string | number>>
}

export interface HouseholdInsight {
  privacy: string
  min_k: number
  household_size_distribution: Array<{
    household_size_band: string
    n_home_cells: number
    n_devices: number
    n_with_work: number
  }>
  single_vs_multi: {
    single_device_homes: number
    multi_device_homes: number
    multi_share: number
  }
  dual_income_proxy: {
    dual_work_homes: number
    multi_homes: number
    dual_income_share_among_multi: number
  }
  weekend_comove_rate: {
    likely_household_pairs: number
    weekend_comove_pairs: number
    weekend_comove_share: number
  }
}

export interface AnalyticsInsights {
  homeWork: HomeWorkInsight
  zoneActivity: ZoneActivityInsight
  poi: PoiInsights
  movement: MovementInsight
  dwell: DwellInsight
  anomalies: AnomaliesInsight
  dataQuality: DataQualityInsight
  segments: SegmentsInsight
  ses: SesInsight
  purpose: PurposeInsight
  urbanContext: UrbanContextInsight
  household: HouseholdInsight
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
