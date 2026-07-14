import { useEffect, useState } from 'react'
import type {
  CalendarCell,
  GroupRhythm,
  HexCell,
  Kpi,
  OdArc,
  VisitCell,
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
  loading: true,
  error: null,
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
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
        ] = await Promise.all([
          getJson<Kpi>('data/kpi.json'),
          getJson<{ resolutions: Record<string, HexCell[]> }>('data/hex_density.json'),
          getJson<{ bands: Record<string, OdArc[]> }>('data/od_arcs.json'),
          getJson<{ zones: ZoneRow[] }>('data/zones.json'),
          getJson<GeoJSON.FeatureCollection>('data/planning_areas.geojson'),
          getJson<{ calendar: CalendarCell[] }>('data/cubes/cube_hex_hour.json'),
          getJson<{ group_rhythms: GroupRhythm[]; cells: VisitCell[] }>(
            'data/cubes/cube_visits.json',
          ),
          getJson<{ cells: OdArc[] }>('data/cubes/cube_od.json'),
        ])
        if (cancelled) return
        const cats = [
          ...new Set(cubeVisits.group_rhythms.map((r) => r.category_group)),
        ].sort()
        setData({
          kpi,
          hexByRes: hex.resolutions,
          odBands: od.bands,
          cubeOd: cubeOd.cells,
          calendar: cubeHex.calendar,
          groupRhythms: cubeVisits.group_rhythms,
          visitCategories: cats,
          zones: zones.zones,
          planningAreas: planning,
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
