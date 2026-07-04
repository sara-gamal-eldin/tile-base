'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { SkySpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LayerConfig } from '@/lib/types'

export type { LayerConfig } from '@/lib/types'

interface Props {
  layers:  LayerConfig[]
  basemap: string | object
}

function sourceId(name: string) { return `tf-src-${name}` }
function layerIds(name: string) {
  return [
    `tf-fill-${name}`,
    `tf-outline-${name}`,
    `tf-line-${name}`,
    `tf-circle-${name}`,
  ]
}

function addLayerToMap(map: maplibregl.Map, layer: LayerConfig) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const src = sourceId(layer.name)
  const { symbology } = layer

  if (!map.getSource(src)) {
    map.addSource(src, {
      type: 'vector',
      tiles: [`${origin}/api/xyz/${layer.name}/{z}/{x}/{y}`],
      minzoom: layer.minZoom,
      maxzoom: layer.maxZoom,
    })
  }

  const sl = layer.name
  const vis = layer.visible ? 'visible' : 'none'

  if (!map.getLayer(`tf-fill-${layer.name}`)) {
    map.addLayer({
      id: `tf-fill-${layer.name}`,
      type: 'fill',
      source: src,
      'source-layer': sl,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility: vis },
      paint: {
        'fill-color': symbology.fill,
        'fill-opacity': symbology.fillOpacity,
      },
    })
  }

  if (!map.getLayer(`tf-outline-${layer.name}`)) {
    map.addLayer({
      id: `tf-outline-${layer.name}`,
      type: 'line',
      source: src,
      'source-layer': sl,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { visibility: vis },
      paint: {
        'line-color': symbology.stroke,
        'line-width': symbology.strokeWidth,
        'line-opacity': symbology.strokeOpacity,
      },
    })
  }

  if (!map.getLayer(`tf-line-${layer.name}`)) {
    map.addLayer({
      id: `tf-line-${layer.name}`,
      type: 'line',
      source: src,
      'source-layer': sl,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      layout: { visibility: vis },
      paint: {
        'line-color': symbology.stroke,
        'line-width': symbology.strokeWidth,
        'line-opacity': symbology.strokeOpacity,
      },
    })
  }

  if (!map.getLayer(`tf-circle-${layer.name}`)) {
    map.addLayer({
      id: `tf-circle-${layer.name}`,
      type: 'circle',
      source: src,
      'source-layer': sl,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: { visibility: vis },
      paint: {
        'circle-color': symbology.fill,
        'circle-radius': symbology.circleRadius,
        'circle-opacity': symbology.circleOpacity,
        'circle-stroke-color': symbology.stroke,
        'circle-stroke-width': symbology.strokeWidth,
        'circle-stroke-opacity': symbology.strokeOpacity,
      },
    })
  }

  // Click popup
  const clickIds = [
    `tf-fill-${layer.name}`,
    `tf-line-${layer.name}`,
    `tf-circle-${layer.name}`,
  ]
  clickIds.forEach(id => {
    map.on('click', id, e => {
      const props = e.features?.[0]?.properties ?? {}
      const rows = Object.entries(props)
        .filter(([, v]) => v != null && v !== '')
        .slice(0, 22)
        .map(([k, v]) =>
          `<div class="tf-prop-row"><span class="tf-prop-key">${escHtml(k)}</span><span class="tf-prop-val">${escHtml(String(v))}</span></div>`
        )
        .join('')

      new maplibregl.Popup({ maxWidth: '340px', className: 'tf-popup' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="tf-popup-header" style="border-left:3px solid ${layer.symbology.fill}">` +
          `<span class="tf-color-dot" style="background:${layer.symbology.fill}"></span>` +
          `${escHtml(layer.name)}</div>` +
          `<div class="tf-popup-body">${rows || '<em class="tf-no-props">No properties</em>'}</div>`
        )
        .addTo(map)
    })
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = '' })
  })
}

export default function Map({ layers, basemap }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<maplibregl.Map | null>(null)
  const prevNamesRef   = useRef<Set<string>>(new Set())
  const layersRef      = useRef<LayerConfig[]>(layers)
  const basemapRef     = useRef<string | object>(basemap)

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const initialStyle = typeof basemap === 'string'
      ? basemap
      : (basemap as maplibregl.StyleSpecification)

    const map = new maplibregl.Map({
      container: containerRef.current,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style: initialStyle as any,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      // Globe projection
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: 'globe' } as maplibregl.ProjectionSpecification)
      }
      // Sky / atmosphere
      map.setSky({
        'sky-color': '#aaccff',
        'horizon-color': 'rgba(220,235,255,0.8)',
        'fog-color': 'rgba(220,235,255,0.4)',
        'fog-ground-blend': 0.9,
        'atmosphere-blend': 0.3,
      } as SkySpecification)

      // Add any layers that arrived before the style loaded
      for (const layer of layersRef.current) {
        addLayerToMap(map, layer)
      }
      prevNamesRef.current = new Set(layersRef.current.map(l => l.name))
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Handle basemap style changes ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (basemap === basemapRef.current) return
    basemapRef.current = basemap

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setStyle(basemap as any)

    const reAddLayers = () => {
      if (typeof map.setProjection === 'function') {
        map.setProjection({ type: 'globe' } as maplibregl.ProjectionSpecification)
      }
      map.setSky({
        'sky-color': '#aaccff',
        'horizon-color': 'rgba(220,235,255,0.8)',
        'fog-color': 'rgba(220,235,255,0.4)',
        'fog-ground-blend': 0.9,
        'atmosphere-blend': 0.3,
      } as SkySpecification)
      // Re-add all current layers
      prevNamesRef.current = new Set()
      for (const layer of layersRef.current) {
        addLayerToMap(map, layer)
      }
      prevNamesRef.current = new Set(layersRef.current.map(l => l.name))
    }

    map.once('style.load', reAddLayers)
  }, [basemap])

  // ── Sync layers when the array changes ──────────────────────────────────
  useEffect(() => {
    layersRef.current = layers
    const map = mapRef.current
    if (!map) return

    const sync = () => {
      const newNames = new Set(layers.map(l => l.name))
      const prev     = prevNamesRef.current

      // Remove layers no longer in the list
      for (const name of prev) {
        if (!newNames.has(name)) {
          for (const id of layerIds(name)) {
            if (map.getLayer(id)) map.removeLayer(id)
          }
          if (map.getSource(sourceId(name))) map.removeSource(sourceId(name))
        }
      }

      // Add new layers; update paint/layout for existing ones
      for (const layer of layers) {
        if (!prev.has(layer.name)) {
          addLayerToMap(map, layer)
        } else {
          // Update visibility
          const vis = layer.visible ? 'visible' : 'none'
          const fillId    = `tf-fill-${layer.name}`
          const outlineId = `tf-outline-${layer.name}`
          const lineId    = `tf-line-${layer.name}`
          const circleId  = `tf-circle-${layer.name}`

          if (map.getLayer(fillId)) {
            map.setLayoutProperty(fillId, 'visibility', vis)
            map.setPaintProperty(fillId, 'fill-color', layer.symbology.fill)
            map.setPaintProperty(fillId, 'fill-opacity', layer.symbology.fillOpacity)
          }
          if (map.getLayer(outlineId)) {
            map.setLayoutProperty(outlineId, 'visibility', vis)
            map.setPaintProperty(outlineId, 'line-color', layer.symbology.stroke)
            map.setPaintProperty(outlineId, 'line-width', layer.symbology.strokeWidth)
            map.setPaintProperty(outlineId, 'line-opacity', layer.symbology.strokeOpacity)
          }
          if (map.getLayer(lineId)) {
            map.setLayoutProperty(lineId, 'visibility', vis)
            map.setPaintProperty(lineId, 'line-color', layer.symbology.stroke)
            map.setPaintProperty(lineId, 'line-width', layer.symbology.strokeWidth)
            map.setPaintProperty(lineId, 'line-opacity', layer.symbology.strokeOpacity)
          }
          if (map.getLayer(circleId)) {
            map.setLayoutProperty(circleId, 'visibility', vis)
            map.setPaintProperty(circleId, 'circle-color', layer.symbology.fill)
            map.setPaintProperty(circleId, 'circle-radius', layer.symbology.circleRadius)
            map.setPaintProperty(circleId, 'circle-opacity', layer.symbology.circleOpacity)
            map.setPaintProperty(circleId, 'circle-stroke-color', layer.symbology.stroke)
            map.setPaintProperty(circleId, 'circle-stroke-width', layer.symbology.strokeWidth)
            map.setPaintProperty(circleId, 'circle-stroke-opacity', layer.symbology.strokeOpacity)
          }
        }
      }

      prevNamesRef.current = newNames

      // Fly to the newest layer
      if (layers.length > 0) {
        const newest = layers[layers.length - 1]
        if (!prev.has(newest.name)) {
          map.fitBounds(
            [[newest.bounds[0], newest.bounds[1]], [newest.bounds[2], newest.bounds[3]]],
            { padding: 60, maxZoom: 14, duration: 1000 }
          )
        }
      }
    }

    if (map.isStyleLoaded()) sync()
    else map.once('load', sync)
  }, [layers])

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <style>{`
        .tf-popup .maplibregl-popup-content {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        }
        .tf-popup .maplibregl-popup-tip { border-top-color: #E2E8F0 !important; }
        .tf-popup-header {
          padding: 8px 14px;
          font-size: 11px;
          font-weight: 600;
          color: #475569;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border-bottom: 1px solid #E2E8F0;
          background: #F8FAFC;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .tf-color-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          display: inline-block;
        }
        .tf-popup-body {
          padding: 12px 14px;
          font-family: var(--font-mono, monospace);
          font-size: 11.5px;
          color: #0F172A;
          max-height: 260px;
          overflow-y: auto;
        }
        .tf-prop-row { display: flex; gap: 10px; margin-bottom: 5px; align-items: baseline; }
        .tf-prop-key { color: #2563EB; min-width: 88px; flex-shrink: 0; font-size: 11px; }
        .tf-prop-val { color: #475569; word-break: break-all; }
        .tf-no-props  { opacity: 0.4; font-style: italic; }
        .tf-popup-body::-webkit-scrollbar { width: 3px; }
        .tf-popup-body::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }
      `}</style>
    </>
  )
}

function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
