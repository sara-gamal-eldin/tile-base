'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import LayerPanel from '@/components/LayerPanel'
import IngestPanel from '@/components/IngestPanel'
import ExportBar from '@/components/ExportBar'
import BasemapSwitcher, { SATELLITE_STYLE } from '@/components/BasemapSwitcher'
import type { LayerConfig } from '@/lib/types'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

export default function Home() {
  const [layers,     setLayers]     = useState<LayerConfig[]>([])
  const [ingestOpen, setIngestOpen] = useState(false)
  const [basemap,    setBasemap]    = useState<string | object>(SATELLITE_STYLE)
  const [colorIndex, setColorIndex] = useState(0)

  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = localStorage.getItem('tilebase-theme') as 'light' | 'dark' | null
    const initial = saved ?? 'light'
    setTheme(initial)
    document.documentElement.setAttribute('data-theme', initial)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('tilebase-theme', next)
      return next
    })
  }, [])

  const handleAddLayer = useCallback((cfg: LayerConfig) => {
    setLayers(prev => {
      if (prev.some(l => l.name === cfg.name)) return prev
      return [...prev, cfg]
    })
    setColorIndex(i => i + 1)
    setIngestOpen(false)
  }, [])

  const handleUpdateLayers = useCallback((updated: LayerConfig[]) => {
    setLayers(updated)
  }, [])

  const handleRemoveLayer = useCallback((name: string) => {
    setLayers(prev => prev.filter(l => l.name !== name))
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
    }}>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <header style={{
        flexShrink: 0,
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        zIndex: 20,
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent)',
          }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="white" opacity="0.9"/>
              <rect x="9" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
              <rect x="1" y="9" width="5" height="5" rx="1" fill="white" opacity="0.6"/>
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity="0.35"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
            TileBase
          </span>
          <span style={{ color: 'var(--border-mid)', fontSize: 13 }}>—</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Geospatial Tile Engine
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Tech stack pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {['DuckDB Spatial', 'GeoParquet', 'PMTiles', 'MapLibre GL'].map(t => (
            <span key={t} style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
            }}>{t}</span>
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => setIngestOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 14px',
            borderRadius: 7,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
        >
          + Add Dataset
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          style={{
            width: 30, height: 30,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>

        {/* Help */}
        <button
          title="Documentation"
          style={{
            width: 30, height: 30,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          ?
        </button>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left: Layer panel */}
        <LayerPanel
          layers={layers}
          onUpdate={handleUpdateLayers}
          onRemove={handleRemoveLayer}
          onAddClick={() => setIngestOpen(true)}
        />

        {/* Center: Map + overlays */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Map layers={layers} basemap={basemap} />

          {/* Basemap switcher overlay */}
          <BasemapSwitcher value={basemap} onChange={setBasemap} />

          {/* Right: Ingest panel (absolute overlay) */}
          <IngestPanel
            open={ingestOpen}
            onClose={() => setIngestOpen(false)}
            existingNames={layers.map(l => l.name)}
            colorIndex={colorIndex}
            onLayerReady={handleAddLayer}
          />
        </div>
      </div>

      {/* ── Export bar ─────────────────────────────────────────────────────── */}
      <ExportBar layers={layers} />
    </div>
  )
}
