'use client'

import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SampleQuery } from '@/lib/sample-queries'

interface Stats {
  features: number
  tiles: number
  lastTileMs: number | null
}

interface Props {
  query: SampleQuery
  stats: Stats
  onStats: (updater: (prev: Stats) => Stats) => void
  streaming: boolean
  onStreamingDone: () => void
}

const MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#060A16' },
    },
  ],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
} as maplibregl.StyleSpecification

const SOURCE_ID = 'streamgl'
const LAYER_IDS = ['streamgl-fill', 'streamgl-line', 'streamgl-circle', 'streamgl-outline']

export default function StreamMap({ query, stats, onStats, streaming, onStreamingDone }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  const abortRef     = useRef<AbortController | null>(null)
  const featuresRef  = useRef<GeoJSON.Feature[]>([])

  // ── Initialise map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: query.defaultCenter,
      zoom: query.defaultZoom,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right'
    )

    map.on('load', () => {
      // ── GeoJSON source (for streamed query results) ──────────────────
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Fill layer (polygons)
      map.addLayer({
        id: 'streamgl-fill',
        type: 'fill',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': query.layerColor,
          'fill-opacity': 0.35,
        },
      })

      // Outline layer (polygon borders)
      map.addLayer({
        id: 'streamgl-outline',
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': query.layerColor,
          'line-width': 1,
          'line-opacity': 0.8,
        },
      })

      // Line layer (LineString)
      map.addLayer({
        id: 'streamgl-line',
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': query.layerColor,
          'line-width': 1.5,
          'line-opacity': 0.85,
        },
      })

      // Circle layer (points)
      map.addLayer({
        id: 'streamgl-circle',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-color': query.layerColor,
          'circle-radius': 4,
          'circle-opacity': 0.9,
          'circle-stroke-color': '#000',
          'circle-stroke-width': 0.5,
        },
      })

      // ── Tile usage tracking ────────────────────────────────────────
      map.on('data', e => {
        if (e.dataType === 'tile') {
          onStats(prev => ({ ...prev, tiles: prev.tiles + 1 }))
        }
      })
    })

    // Feature click popup
    LAYER_IDS.forEach(layerId => {
      map.on('click', layerId, e => {
        const features = e.features
        if (!features?.length) return
        const props = features[0].properties
        const html  = Object.entries(props ?? {})
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `<div class="flex gap-2"><span class="text-[#00D4AA]">${k}</span><span>${v}</span></div>`)
          .join('')

        new maplibregl.Popup({ maxWidth: '320px' })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="background:#0d1117;color:#fff;padding:12px;border-radius:8px;font-size:12px;font-family:monospace">
              ${html || '<em style="opacity:0.5">No properties</em>'}
            </div>`
          )
          .addTo(map)
      })

      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = ''
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fly to new default location when query changes ──────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    map.flyTo({ center: query.defaultCenter, zoom: query.defaultZoom })
  }, [query])

  // ── Stream query results onto the map ────────────────────────────────────
  const runStream = useCallback(async () => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Cancel any in-flight stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Reset state
    featuresRef.current = []
    onStats(() => ({ features: 0, tiles: 0, lastTileMs: null }))
    ;(map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [],
    })

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: query.sql }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      let lastUpdate = 0
      const BATCH_MS = 150  // flush to map every 150 ms

      const flush = () => {
        if (!mapRef.current || !mapRef.current.isStyleLoaded()) return
        ;(mapRef.current.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: featuresRef.current,
        })
        lastUpdate = performance.now()
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines  = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const feature = JSON.parse(line.slice(6)) as GeoJSON.Feature
              featuresRef.current.push(feature)
            } catch { /* skip malformed line */ }
          } else if (line.startsWith('event: done')) {
            // Will be handled on next data line
          } else if (line.startsWith('event: error')) {
            // Error event — next data line has the message
          }
        }

        // Batched map update
        const now = performance.now()
        if (now - lastUpdate > BATCH_MS) {
          flush()
          onStats(prev => ({ ...prev, features: featuresRef.current.length }))
        }
      }

      // Final flush
      flush()
      onStats(prev => ({ ...prev, features: featuresRef.current.length }))
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Stream error:', err)
      }
    } finally {
      onStreamingDone()
    }
  }, [query, onStats, onStreamingDone])

  // Start stream when `streaming` flips to true
  useEffect(() => {
    if (streaming) runStream()
  }, [streaming, runStream])

  return (
    <div ref={containerRef} className="w-full h-full" />
  )
}
