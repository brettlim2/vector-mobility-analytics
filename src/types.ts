export type Daytype = 'weekday' | 'weekend' | 'all'
export type Daypart = 'all' | 'morning' | 'midday' | 'evening' | 'night'
export type HourBand = 'all' | 'am' | 'pm' | 'late' | 'offpeak'
export type SourceClass = 'all' | 'sdk_app' | 'agg'
export type H3Res = '7' | '8' | '9' | '10'

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
  catchment?: Array<Record<string, string | number>>
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
  events: Array<{
    zone: string
    d: string
    first_hour: string
    last_hour: string
    burst_hours: number
    cells: number
    peak_devices: number
    peak_uplift: number
    event_stop_devices: number
    first_time_share: number
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
  occupation_mix?: Array<{ occupation_class: string; devices: number }>
  tags?: Array<Record<string, string | number>>
}

export interface SesInsight {
  quintile_sizes: Array<{
    ses_quintile: number
    devices: number
    mean_score: number
    med_home_value: number
    ios_share: number
  }>
  validation?: {
    spearman_mean_ses_vs_census_income?: number
    pass_criterion?: boolean
  }
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
  rain_response?: {
    outdoor_vs_indoor?: Array<{
      wet: boolean
      outdoor_visits: number
      indoor_visits: number
      all_visits: number
      n_hours: number
    }>
  }
  hawker_footfall?: Array<Record<string, string | number>>
  mrt_station_footfall?: Array<Record<string, string | number>>
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

export interface DiningInsight {
  format_by_ses: Array<{
    ses_quintile: number
    format: string
    visits: number
    share: number
  }>
  hawker_index_by_ses: Array<{
    ses_quintile: number
    devices: number
    hawker_share: number
    restaurant_share: number
    cafe_share: number
    fast_food_share: number
  }>
  cuisine_by_ses: Array<{
    ses_quintile: number
    cuisine: string
    visits: number
    share: number
  }>
  meal_occasion_mix: Array<{
    meal_occasion: string
    daytype: string
    visits: number
    near_home_share: number
    med_dwell_min: number
  }>
  dining_loyalty: {
    mean_visits_per_eatery: number
    repeat3_share: number
    devices: number
  }
  top_cuisines_overall: Array<{
    cuisine: string
    visits: number
    devices: number
  }>
}

export interface RetailInsight {
  mission_by_ses: Array<{
    ses_quintile: number
    mission: string
    visits: number
    share: number
  }>
  mall_missions: Array<{
    mission: string
    visits: number
    share: number
    med_dwell_min: number
  }>
  mall_loyalty: {
    mall_goers: number
    mean_distinct_malls: number
    primary_mall_concentration: number
    single_mall_share: number
  }
  heartland_vs_regional: Array<{
    ses_quintile: number
    local_mall_visits: number
    regional_mall_visits: number
    regional_share: number
  }>
  top_mall_catchment: Array<{
    mall: string
    visitors: number
    med_home_km: number
    day_out_share: number
  }>
}

export interface RoutingInsight {
  status?: string
  reason?: string
  circuity_distribution?: Array<{ band: string; trips: number }>
  road_vs_straight?: {
    med_straight_km: number
    med_road_km: number
    med_circuity: number
    med_drive_min: number
  }
  osrm_validation?: {
    median_elapsed_to_drive_ratio: number
    travel_band_corr: number
    travel_band_trips: number
  }
  mode_inference?: Array<{ mode_est: string; trips: number; share: number }>
  catchment_drive_time?: Array<{
    name: string
    visitors_sampled: number
    share_within_15min: number
    median_drive_min: number
  }>
  census_car_share?: { census_car_share: number }
}

export interface AffinityInsight {
  category_lift: Array<{
    ga: string
    gb: string
    both_days: number
    lift: number
  }>
  brand_lift: Array<{
    ba: string
    bb: string
    both_days: number
    lift: number
  }>
  mall_overlap: Array<{
    mall_a: string
    mall_b: string
    shared_devices: number
    a_devices: number
    b_devices: number
    overlap_share: number
  }>
}

export interface WeightedInsight {
  weighted_totals: {
    weighted_devices: number
    estimated_population: number
  }
  segment_shares: Array<{
    segment: string
    panel_devices: number
    panel_share: number
    weighted_pop: number
    weighted_share: number
  }>
  weighted_od: Array<{
    o_zone: string
    d_zone: string
    panel_trips: number
    weighted_trips: number
  }>
}

export interface UncertaintyInsight {
  method: string
  venue_daily_footfall: Array<{
    name: string
    mean_per_day: number
    se: number
    ci95_lo: number
    ci95_hi: number
  }>
  corridor_daily_trips: Array<{
    corridor: string
    mean_per_day: number
    se: number
    ci95_lo: number
    ci95_hi: number
  }>
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
  dining: DiningInsight
  retail: RetailInsight
  routing: RoutingInsight
  affinity: AffinityInsight
  weighted: WeightedInsight
  uncertainty: UncertaintyInsight
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
