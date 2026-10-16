import { useEffect, useState } from 'react'
import type {
  AffinityInsight,
  AnalyticsInsights,
  AnomaliesInsight,
  CalendarCell,
  DataQualityInsight,
  DiningInsight,
  DwellInsight,
  GroupRhythm,
  HexCell,
  HomeWorkInsight,
  HouseholdInsight,
  Kpi,
  MovementInsight,
  OdArc,
  PoiInsights,
  PurposeInsight,
  RetailInsight,
  RoutingInsight,
  SegmentsInsight,
  SesInsight,
  UncertaintyInsight,
  UrbanContextInsight,
  VisitCell,
  WeightedInsight,
  ZoneActivityInsight,
  ZoneRow,
} from '../types'

export interface AppData {
  kpi: Kpi | null
  hexByRes: Record<string, HexCell[]>
  odBands: Record<string, OdArc[]>
  cubeOd: OdArc[]
  calendar: CalendarCell[]
  groupRhythms: GroupRhythm[]
  visitCategories: string[]
  zones: ZoneRow[]
  planningAreas: GeoJSON.FeatureCollection | null
  insights: AnalyticsInsights | null
  loading: boolean
  error: string | null
}

const empty: AppData = {
  kpi: null,
  hexByRes: {},
  odBands: {},
  cubeOd: [],
  calendar: [],
  groupRhythms: [],
  visitCategories: [],
  zones: [],
  planningAreas: null,
  insights: null,
  loading: true,
  error: null,
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}

// Optional artifact: analyses/exports a given deployment doesn't produce resolve to
// null instead of rejecting the whole load (e.g. POI/census sections on the Japan build).
async function getOpt<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function useAnalyticsData(): AppData {
  const [data, setData] = useState<AppData>(empty)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [
          kpi,
          hex,
          od,
          zones,
          planning,
          cubeHex,
          cubeVisits,
          cubeOd,
          homeWork,
          zoneActivity,
          poi,
          movement,
          dwell,
          anomalies,
          dataQuality,
          segments,
          ses,
          purpose,
          urbanContext,
          household,
          dining,
          retail,
          routing,
          affinity,
          weighted,
          uncertainty,
        ] = await Promise.all([
          getJson<Kpi>('data/kpi.json'),
          getJson<{ resolutions: Record<string, HexCell[]> }>('data/hex_density.json'),
          getJson<{ bands: Record<string, OdArc[]> }>('data/od_arcs.json'),
          getJson<{ zones: ZoneRow[] }>('data/zones.json'),
          getOpt<GeoJSON.FeatureCollection>('data/planning_areas.geojson'),
          getJson<{ calendar: CalendarCell[] }>('data/cubes/cube_hex_hour.json'),
          getOpt<{ group_rhythms: GroupRhythm[]; cells: VisitCell[] }>(
            'data/cubes/cube_visits.json',
          ),
          getJson<{ cells: OdArc[] }>('data/cubes/cube_od.json'),
          getOpt<HomeWorkInsight>('data/insights/home_work.json'),
          getOpt<ZoneActivityInsight>('data/insights/zone_activity.json'),
          getOpt<PoiInsights>('data/insights/poi_insights.json'),
          getOpt<MovementInsight>('data/insights/movement.json'),
          getOpt<DwellInsight>('data/insights/dwell.json'),
          getOpt<AnomaliesInsight>('data/insights/anomalies.json'),
          getOpt<DataQualityInsight>('data/insights/data_quality.json'),
          getOpt<SegmentsInsight>('data/insights/segments.json'),
          getOpt<SesInsight>('data/insights/ses.json'),
          getOpt<PurposeInsight>('data/insights/purpose.json'),
          getOpt<UrbanContextInsight>('data/insights/urban_context.json'),
          getOpt<HouseholdInsight>('data/insights/household.json'),
          getOpt<DiningInsight>('data/insights/dining.json'),
          getOpt<RetailInsight>('data/insights/retail.json'),
          getOpt<RoutingInsight>('data/insights/routing.json'),
          getOpt<AffinityInsight>('data/insights/affinity.json'),
          getOpt<WeightedInsight>('data/insights/weighted.json'),
          getOpt<UncertaintyInsight>('data/insights/uncertainty.json'),
        ])
        if (cancelled) return
        const cats = [
          ...new Set((cubeVisits?.group_rhythms ?? []).map((r) => r.category_group)),
        ].sort()
        setData({
          kpi,
          hexByRes: hex.resolutions,
          odBands: od.bands,
          cubeOd: cubeOd.cells,
          calendar: cubeHex.calendar,
          groupRhythms: cubeVisits?.group_rhythms ?? [],
          visitCategories: cats,
          zones: zones.zones,
          planningAreas: planning,
          insights: {
            homeWork,
            zoneActivity,
            poi,
            movement,
            dwell,
            anomalies,
            dataQuality,
            segments,
            ses,
            purpose,
            urbanContext,
            household,
            dining,
            retail,
            routing,
            affinity,
            weighted,
            uncertainty,
          },
          loading: false,
          error: null,
        })
      } catch (e) {
        if (cancelled) return
        setData({
          ...empty,
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load data',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return data
}
