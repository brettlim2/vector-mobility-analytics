import { useMemo } from 'react'
import { DeckGL } from '@deck.gl/react'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { ArcLayer, GeoJsonLayer } from '@deck.gl/layers'
import { Map as MapGL } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppStore } from '../store'
import { corridorId } from '../lib/slices'
import type { HexCell, OdArc } from '../types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
const INITIAL_VIEW = {
  longitude: 103.82,
  latitude: 1.35,
  zoom: 10.6,
  pitch: 35,
  bearing: -8,
}

function densityColor(devices: number, max: number): [number, number, number, number] {
  const t = Math.min(devices / Math.max(max, 1), 1)
  // teal → amber (avoid purple bias)
  const r = Math.round(13 + t * 200)
  const g = Math.round(122 - t * 40)
  const b = Math.round(111 - t * 90)
  return [r, g, b, 90 + Math.round(t * 130)]
}

interface Props {
  hexCells: HexCell[]
  arcs: OdArc[]
  planningAreas: GeoJSON.FeatureCollection | null
}

export function MapView({ hexCells, arcs, planningAreas }: Props) {
  const filters = useAppStore((s) => s.filters)
  const hovered = useAppStore((s) => s.hoveredCorridor)

  const maxDevices = useMemo(
    () => Math.max(1, ...hexCells.map((c) => c.devices)),
    [hexCells],
  )
  const maxTrips = useMemo(
    () => Math.max(1, ...arcs.map((a) => a.trips)),
    [arcs],
  )

  const layers = useMemo(() => {
    const out = []

    if (filters.showBoundaries && planningAreas) {
      out.push(
        new GeoJsonLayer({
          id: 'planning-areas',
          data: planningAreas,
          stroked: true,
          filled: true,
          getFillColor: [12, 18, 32, 18],
          getLineColor: [12, 18, 32, 90],
          lineWidthMinPixels: 1,
          pickable: true,
          autoHighlight: true,
          highlightColor: [13, 122, 111, 60],
        }),
      )
    }

    if (filters.showHex && hexCells.length) {
      out.push(
        new H3HexagonLayer({
          id: 'hex-density',
          data: hexCells,
          getHexagon: (d: HexCell) => d.h3,
          getFillColor: (d: HexCell) => densityColor(d.devices, maxDevices),
          extruded: true,
          getElevation: (d: HexCell) => Math.min(d.devices * 2.2, 3500),
          elevationScale: 1,
          pickable: true,
          opacity: 0.85,
        }),
      )
    }

    if (filters.showArcs && arcs.length) {
      out.push(
        new ArcLayer({
          id: 'od-arcs',
          data: arcs,
          getSourcePosition: (d: OdArc) => [d.o_lng, d.o_lat],
          getTargetPosition: (d: OdArc) => [d.d_lng, d.d_lat],
          getSourceColor: (d: OdArc) => {
            const hot = hovered === corridorId(d)
            return hot ? [180, 83, 9, 240] : [13, 122, 111, 160]
          },
          getTargetColor: (d: OdArc) => {
            const hot = hovered === corridorId(d)
            return hot ? [234, 179, 8, 240] : [6, 78, 70, 200]
          },
          getWidth: (d: OdArc) => Math.max(1.2, (d.trips / maxTrips) * 8),
          greatCircle: false,
          pickable: true,
        }),
      )
    }

    return out
  }, [filters.showBoundaries, filters.showHex, filters.showArcs, planningAreas, hexCells, arcs, hovered, maxDevices, maxTrips])

  return (
    <div className="absolute inset-0">
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller
        layers={layers}
        getTooltip={({ object, layer }) => {
          if (!object) return null
          if (layer?.id === 'hex-density') {
            const d = object as HexCell
            return `Devices ≥${d.devices.toLocaleString()} · ${d.daypart}`
          }
          if (layer?.id === 'od-arcs') {
            const d = object as OdArc
            return `${d.o_zone} → ${d.d_zone}\n${d.trips.toLocaleString()} trips · ${d.med_travel_min} min (straight-line)`
          }
          if (layer?.id === 'planning-areas') {
            const name =
              (object as { properties?: Record<string, string> }).properties?.PLN_AREA_N ??
              (object as { properties?: Record<string, string> }).properties?.name
            return name ?? null
          }
          return null
        }}
      >
        <MapGL mapStyle={MAP_STYLE} attributionControl={false} />
      </DeckGL>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-[var(--vm-panel)] px-2 py-1 font-mono text-[10px] text-[var(--vm-muted)] shadow-sm">
        Singapore · aggregates only · k≥5 · OpenFreeMap
      </div>
    </div>
  )
}
