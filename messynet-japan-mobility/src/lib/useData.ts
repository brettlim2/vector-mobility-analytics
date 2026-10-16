import { useEffect, useState } from 'react'
import type { JpData } from './types'

async function getJson<T>(name: string): Promise<T | null> {
  try {
    const url = new URL(`${import.meta.env.BASE_URL}data/${name}.json`, window.location.href).href
    const r = await fetch(url)
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

// Loads all dashboard feeds in parallel; any missing file degrades to null so the
// app renders empty states rather than failing (data lands incrementally).
export function useData(): { data: JpData | null; loading: boolean } {
  const [data, setData] = useState<JpData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    // the single-file demo build inlines the feeds here, so it needs no network
    const inlined = (window as unknown as { __JP_DATA__?: JpData }).__JP_DATA__
    if (inlined) {
      setData(inlined)
      setLoading(false)
      return
    }
    Promise.all([
      getJson<JpData['retail']>('jp_retail_readout'),
      getJson<JpData['tourism']>('jp_tourism_readout'),
      getJson<JpData['reference']>('jp_reference'),
    ]).then(([retail, tourism, reference]) => {
      if (!alive) return
      setData({ retail, tourism, reference })
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])
  return { data, loading }
}
