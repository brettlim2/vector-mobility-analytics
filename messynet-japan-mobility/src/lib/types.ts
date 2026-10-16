// JSON shapes emitted by scripts/generate-data.mjs. They follow the conventions of
// the analytics-engine exports behind messymobility-jp-events (RetailPaths / Tourism),
// extended with the SNS, attribution and route-evaluation blocks these use cases need.
import type { Lbl } from './i18n'

export interface DayTag { dow: string; weekend: boolean; holiday?: string }

export interface ShareNorm {
  basis: string
  during_dates: string[]
  baseline_dates: string[]
  during_share_pct: number
  baseline_share_pct: number
  effect_pts: number
  relative_pct: number
  noise_sd_pts: number
  quiet_days: number
  mde_pts: number
  mde_relative_pct: number
  detected: boolean
  series: Record<string, number>
}

export interface RetailDay {
  terminal_devices: number
  posts: number
  engagement: number
  promoted_visitors: number
  promoted_share_pct: number
  neighbour_share_pct: number
  control_share_pct: number
  promoted_revenue: number
}

export interface ZoneRow {
  zone: string
  label: Lbl
  visitors: number
  primary: number
  secondary: number
  primary_share: number
  reported_revenue: number
  revenue_per_panel_visit: number
  daily_visit_revenue_r: number
  daily_visit_revenue_r_adjusted: number
  visitors_per_day: { baseline: number; campaign: number }
  share_pct: { baseline: number; campaign: number }
}

export interface StoreRow {
  store: string
  label: Lbl
  zone: string
  promoted: boolean
  neighbour: boolean
  reported_revenue: number
  revenue_per_day: { baseline: number; campaign: number }
  traffic_adjusted_change_pct: number
}

export interface AttributionLeg {
  zone: string
  incremental_visits: number
  incremental_first_stop_visits?: number
  incremental_visits_from_promoted?: number
  revenue_per_panel_visit: number
  modelled_revenue: number
  reported_revenue_uplift: number
}

export interface RetailVenue {
  venue: Lbl
  synthetic: boolean
  data_provenance?: { footfall: string; zone_labels: string; revenue: string; social: string }
  window: { first: string; last: string; days: number; baseline: string[]; during: string[]; tail: string[] }
  day_tags: Record<string, DayTag>
  assumed_panel_devices_per_weekday: number
  terminal_device_days: number
  terminal_devices_per_day: number
  silver_week_uplift_pct: number
  retail_sessions: number
  retail_conversion: number
  zones_per_session: number
  promoted_zone: string
  neighbour_zone: string
  control_zone: string
  daily: Record<string, RetailDay>
  normalization: { promoted: ShareNorm; neighbour: ShareNorm; control: ShareNorm }
  diff_in_diff_relative_pct: number
  lag_correlation: { lag_days: number; pearson_r: number; n_days: number }[]
  best_lag: { lag_days: number; pearson_r: number; n_days: number }
  social: {
    posts: number
    campaign_posts: number
    engagement: number
    platforms: Record<string, number>
    language_mix: Record<string, number>
    voice_mix: Record<string, number>
    topics: { topic: Lbl; posts: number }[]
  }
  zones: ZoneRow[]
  cross_zone_visit_revenue_r: number
  cross_zone_visit_revenue_r_ex_dutyfree: number
  zone_transitions: { from: string; to: string; n: number }[]
  promoted_next_stops: { zone: string; baseline: number; campaign: number }[]
  attribution: {
    campaign_days: number
    primary: AttributionLeg
    secondary: AttributionLeg
    transition_per_day: { baseline: number; campaign: number }
    continuation_rate: { baseline: number; campaign: number }
  }
  stores: StoreRow[]
}
export type RetailReadout = Record<string, RetailVenue>

export interface MarketAgg {
  devices: number
  airports: { airport: string; arrivals: number; share: number }[]
  destinations: { zone: string; visitors: number; share: number; avg_nights: number }[]
  flows: { airport: string; zone: string; visitors: number }[]
  itineraries: { airport: string; seq: string[]; devices: number; share: number }[]
  avg_destinations: number
  avg_nights: number
  multi_destination_share: number
}

export interface RouteCandidate {
  market: string
  gateway: string
  region: Lbl
  region_visitors: number
  direct_arrivals: number
  indirect_arrivals: number
  indirect_share: number
  share_of_market: number
  via: { airport: string; devices: number }[]
  avg_region_nights: number
}

export interface Tourism {
  synthetic: boolean
  window: { first: string; last: string; days: number }
  inbound_cohort: number
  cohort_definition: Lbl
  source?: string
  // Domestic origin-region split (replaces the inbound nationality block). `coverage` is
  // the share of travellers with an identified home region; class_counts is the trip mix.
  nationality: {
    coverage: number
    class_counts: { day_trip: number; overnight: number; multi_region: number }
    assumed?: boolean
    by_market: { market: string; label: Lbl; devices: number; share: number }[]
  }
  airports: { id: string; label: Lbl; lng: number; lat: number }[]
  destinations: { id: string; label: Lbl; lng: number; lat: number; gateways: string[] }[]
  hokkaido_zones: string[]
  market_airport_matrix: { market: string; shares: Record<string, number> }[]
  by_market: Record<string, MarketAgg>
  golden_route: { airport: string; seq: string[]; devices: number; all_airports: number }
  route_candidates: RouteCandidate[]
}

export interface Reference {
  synthetic: boolean
  window: { first: string; last: string; days: number }
  panel: { note?: string }
  caveats: string[]
}

export interface JpData {
  retail: RetailReadout | null
  tourism: Tourism | null
  reference: Reference | null
}
