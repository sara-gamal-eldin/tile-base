'use client'

import { useState } from 'react'

interface Props {
  value:    string | object
  onChange: (style: string | object) => void
}

type BasemapStyle = string | Record<string, unknown>

interface Basemap {
  id:    string
  label: string
  style: BasemapStyle
}

const SATELLITE_STYLE: BasemapStyle = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '© Esri World Imagery',
    },
    ref: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'ref', type: 'raster', source: 'ref', minzoom: 3 },
  ],
}

const TOPO_STYLE: BasemapStyle = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    topo: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
  },
  layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
}

const BASEMAPS: Basemap[] = [
  { id: 'satellite', label: 'Satellite', style: SATELLITE_STYLE },
  { id: 'light',     label: 'Light',     style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
  { id: 'topo',      label: 'Terrain',   style: TOPO_STYLE },
  { id: 'dark',      label: 'Dark',      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
]

export { SATELLITE_STYLE }

export default function BasemapSwitcher({ value, onChange }: Props) {
  const [activeId, setActiveId] = useState('satellite')

  const handleSelect = (bm: Basemap) => {
    setActiveId(bm.id)
    onChange(bm.style)
  }

  // Suppress unused variable warning — value is used for controlled-component identity
  void value

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 10,
      display: 'flex',
      gap: 4,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: '3px 5px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {BASEMAPS.map(bm => {
        const isActive = activeId === bm.id
        return (
          <button
            key={bm.id}
            onClick={() => handleSelect(bm)}
            title={bm.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 9px',
              borderRadius: 16,
              border: 'none',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--accent-light)'
                e.currentTarget.style.color = 'var(--accent)'
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
          >
            <span>{bm.label}</span>
          </button>
        )
      })}
    </div>
  )
}
