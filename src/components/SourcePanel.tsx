'use client'

import { useState, useRef } from 'react'
import { PALETTE, defaultSymbology } from '@/lib/types'
import type { LayerConfig } from '@/lib/types'

interface PipelineResult {
  name:         string
  bounds:       [number, number, number, number]
  center:       [number, number, number]
  tileCount:    number
  featureCount: number
  viewerHtml?:  string
}

interface Props {
  layers:   LayerConfig[]
  onAdd:    (cfg: LayerConfig) => void
  onRemove: (name: string) => void
}

const EXAMPLES = [
  {
    label: 'World Countries',
    tag:   'polygon',
    url:   'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
    name:  'countries',
  },
  {
    label: 'US States',
    tag:   'polygon',
    url:   'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json',
    name:  'us-states',
  },
  {
    label: 'Natural Earth Rivers',
    tag:   'line',
    url:   'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson',
    name:  'rivers',
  },
  {
    label: 'World Cities (points)',
    tag:   'point',
    url:   'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson',
    name:  'cities',
  },
]

interface Step { msg: string; warn: boolean }

export default function SourcePanel({ layers, onAdd, onRemove }: Props) {
  const [url,     setUrl]     = useState('')
  const [name,    setName]    = useState('')
  const [maxZoom, setMaxZoom] = useState(12)
  const [steps,   setSteps]   = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState<PipelineResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const abortRef        = useRef<AbortController | null>(null)
  const nameUserEdited  = useRef(false)
  const colorIndexRef   = useRef(layers.length)

  const deriveName = (rawUrl: string) =>
    rawUrl.split('/').pop()?.split('?')[0]
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9-_]/gi, '-')
      .toLowerCase()
      .slice(0, 40) ?? 'dataset'

  const handleUrlChange = (v: string) => {
    setUrl(v)
    if (!nameUserEdited.current) setName(deriveName(v))
  }

  const handleExample = (ex: typeof EXAMPLES[0]) => {
    setUrl(ex.url)
    setName(ex.name)
    nameUserEdited.current = false
    setSteps([]); setResult(null); setError(null)
  }

  const handleRun = async () => {
    if (!url.trim()) return
    const layerName = name.trim() || deriveName(url)

    // Prevent duplicate layer names
    if (layers.some(l => l.name === layerName)) {
      setError(`Layer "${layerName}" already exists. Choose a different name.`)
      return
    }

    setSteps([]); setResult(null); setError(null); setRunning(true)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ingest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim(), name: layerName, maxZoom }),
        signal:  abortRef.current.signal,
      })

      if (!res.ok || !res.body) { setError(await res.text()); setRunning(false); return }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''
      let   etype   = 'progress'

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            etype = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (etype === 'progress') {
              const msg = JSON.parse(data) as string
              setSteps(prev => [...prev, { msg, warn: msg.startsWith('⚠') }])
            } else if (etype === 'done') {
              const r = JSON.parse(data) as PipelineResult
              setResult(r)
              const color = PALETTE[colorIndexRef.current % PALETTE.length]
              colorIndexRef.current++
              onAdd({
                name:         r.name,
                bounds:       r.bounds,
                center:       r.center,
                visible:      true,
                minZoom:      0,
                maxZoom:      maxZoom,
                featureCount: r.featureCount,
                tileCount:    r.tileCount,
                symbology:    defaultSymbology(color),
              })
            } else if (etype === 'error') {
              setError((JSON.parse(data) as { message: string }).message)
            }
            etype = 'progress'
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  const canRun = url.trim().length > 0

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: 'var(--font-sans)' }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Ingest Dataset
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          GeoJSON or GeoPackage URL → GeoParquet → PMTiles → live vector tiles
        </p>
      </div>

      <Divider />

      {/* Active layers */}
      {layers.length > 0 && (
        <div>
          <Label>Active layers ({layers.length})</Label>
          <div className="flex flex-col gap-1.5 mt-2">
            {layers.map(l => (
              <div key={l.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 7,
                background: 'var(--bg-base)', border: '1px solid var(--border)',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.symbology.fill, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.name}
                </span>
                <button
                  onClick={() => onRemove(l.name)}
                  style={{ color: 'var(--text-muted)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                  title="Remove layer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {layers.length > 1 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Basemap: <code style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>/api/basemap/z/x/y?datasets={layers.map(l => l.name).join(',')}</code>
            </p>
          )}
        </div>
      )}

      {layers.length > 0 && <Divider />}

      {/* Examples */}
      <div>
        <Label>Quick examples</Label>
        <div className="flex flex-col gap-1.5 mt-2">
          {EXAMPLES.map(ex => (
            <button key={ex.name} onClick={() => handleExample(ex)} style={{
              textAlign: 'left', padding: '7px 10px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-glow)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: 9, opacity: 0.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-raised)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-muted)' }}>{ex.tag}</span>
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* URL */}
      <div className="flex flex-col gap-2">
        <Label>Source URL</Label>
        <input value={url} onChange={e => handleUrlChange(e.target.value)}
          placeholder="https://…/data.geojson"
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e =>  { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Name */}
      <div className="flex flex-col gap-2">
        <Label>Layer name</Label>
        <input value={name} onChange={e => { nameUserEdited.current = true; setName(e.target.value) }}
          placeholder="my-dataset"
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e =>  { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Max zoom */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Max zoom</Label>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>z{maxZoom}</span>
        </div>
        <input type="range" min={6} max={16} step={1} value={maxZoom}
          onChange={e => setMaxZoom(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
        <div className="flex justify-between mt-1">
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>z6</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>z16</span>
        </div>
      </div>

      {/* Button */}
      {!running ? (
        <button onClick={handleRun} disabled={!canRun} style={{
          width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
          background: canRun ? 'var(--accent)' : 'var(--bg-raised)',
          color: canRun ? '#fff' : 'var(--text-muted)',
          fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
          cursor: canRun ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
          fontFamily: 'var(--font-sans)',
        }}
          onMouseEnter={e => { if (canRun) e.currentTarget.style.background = 'var(--accent-hover)' }}
          onMouseLeave={e => { if (canRun) e.currentTarget.style.background = 'var(--accent)' }}
        >
          Process
        </button>
      ) : (
        <button onClick={() => { abortRef.current?.abort(); setRunning(false) }} style={{
          width: '100%', padding: '10px 0', borderRadius: 8,
          border: '1px solid var(--error)', background: 'rgba(248,113,113,0.08)',
          color: 'var(--error)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}>
          Stop
        </button>
      )}

      {/* Progress */}
      {steps.length > 0 && (
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: s.warn ? '#F59E0B' : 'var(--success)', fontSize: 11, marginTop: 1, flexShrink: 0 }}>{s.warn ? '⚠' : '✓'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>{s.msg}</span>
            </div>
          ))}
          {running && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Spinner />
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Processing…</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--error)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, wordBreak: 'break-all' }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && !running && (
        <div style={{ background: 'rgba(74,144,245,0.06)', border: '1px solid rgba(74,144,245,0.25)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Layer ready</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 10 }}>
            {[
              ['Features', result.featureCount.toLocaleString()],
              ['Tiles',    result.tileCount.toLocaleString()],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
          <a href={`/api/stac/${result.name}/viewer`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'none', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)' }}
          >
            Open standalone viewer ↗
          </a>
        </div>
      )}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)' }} />
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 12, height: 12,
      border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  borderRadius: 7, padding: '8px 11px', fontSize: 13,
  color: 'var(--text-primary)', width: '100%', outline: 'none',
  fontFamily: 'var(--font-sans)', transition: 'border-color 0.15s',
}
