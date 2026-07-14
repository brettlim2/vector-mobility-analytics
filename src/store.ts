import { create } from 'zustand'
import { DEFAULT_FILTERS, type Filters } from './types'

type FilterKey = keyof Filters

interface AppState {
  filters: Filters
  hoveredCorridor: string | null
  setFilter: <K extends FilterKey>(key: K, value: Filters[K]) => void
  setFilters: (partial: Partial<Filters>) => void
  setHoveredCorridor: (id: string | null) => void
  hydrateFromUrl: () => void
  syncToUrl: () => void
}

function parseUrl(): Partial<Filters> {
  const p = new URLSearchParams(window.location.search)
  const out: Partial<Filters> = {}
  const str = (k: string) => p.get(k)
  if (str('daytype')) out.daytype = str('daytype') as Filters['daytype']
  if (str('daypart')) out.daypart = str('daypart') as Filters['daypart']
  if (str('hourBand')) out.hourBand = str('hourBand') as Filters['hourBand']
  if (str('source')) out.sourceClass = str('source') as Filters['sourceClass']
  if (str('h3')) out.h3Res = str('h3') as Filters['h3Res']
  if (str('zone')) out.zone = str('zone')
  if (str('category')) out.category = str('category')
  if (str('hex') === '0') out.showHex = false
  if (str('arcs') === '0') out.showArcs = false
  if (str('boundaries') === '0') out.showBoundaries = false
  return out
}

function writeUrl(filters: Filters) {
  const p = new URLSearchParams()
  if (filters.daytype !== 'all') p.set('daytype', filters.daytype)
  if (filters.daypart !== 'all') p.set('daypart', filters.daypart)
  if (filters.hourBand !== 'all') p.set('hourBand', filters.hourBand)
  if (filters.sourceClass !== 'all') p.set('source', filters.sourceClass)
  if (filters.h3Res !== '8') p.set('h3', filters.h3Res)
  if (filters.zone) p.set('zone', filters.zone)
  if (filters.category) p.set('category', filters.category)
  if (!filters.showHex) p.set('hex', '0')
  if (!filters.showArcs) p.set('arcs', '0')
  if (!filters.showBoundaries) p.set('boundaries', '0')
  const qs = p.toString()
  const next = qs ? `?${qs}` : window.location.pathname
  window.history.replaceState(null, '', next)
}

export const useAppStore = create<AppState>((set, get) => ({
  filters: { ...DEFAULT_FILTERS },
  hoveredCorridor: null,
  setFilter: (key, value) => {
    set((s) => ({ filters: { ...s.filters, [key]: value } }))
    get().syncToUrl()
  },
  setFilters: (partial) => {
    set((s) => ({ filters: { ...s.filters, ...partial } }))
    get().syncToUrl()
  },
  setHoveredCorridor: (id) => set({ hoveredCorridor: id }),
  hydrateFromUrl: () => {
    set((s) => ({ filters: { ...s.filters, ...parseUrl() } }))
  },
  syncToUrl: () => writeUrl(get().filters),
}))
