'use client'

import { useState, useRef, useEffect } from 'react'
import { PALETTE, defaultSymbology } from '@/lib/types'
import type { LayerConfig } from '@/lib/types'

interface PipelineResult {
  name:         string
  bounds:       [number, number, number, number]
  center:       [number, number, number]
  tileCount:    number
  featureCount: number
}

interface Props {
  open:          boolean
  onClose:       () => void
  existingNames: string[]
  colorIndex:    number
  onLayerReady:  (cfg: LayerConfig) => void
}

const EXAMPLES = [
  { label: 'World Countries', tag: 'polygon', url: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson', name: 'countries' },
  { label: 'US States',       tag: 'polygon', url: 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json', name: 'us-states' },
  { label: 'Natural Earth Rivers', tag: 'line', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson', name: 'rivers' },
  { label: 'World Cities',    tag: 'point',   url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson', name: 'cities' },
]

// Pipeline phase labels — maps prefix of step message to a phase name + description
const PHASES: { prefix: string; label: string; desc: string; color: string }[] = [
  { prefix: 'Connecting',      label: '1 · Init',         desc: 'Starting DuckDB spatial engine',           color: '#6366F1' },
  { prefix: 'Reading',         label: '2 · Fetch',        desc: 'Loading source file via GDAL',             color: '#0EA5E9' },
  { prefix: '  Downloading',   label: '2 · Fetch',        desc: 'Loading source file via GDAL',             color: '#0EA5E9' },
  { prefix: '  Downloaded',    label: '2 · Fetch',        desc: 'Loading source file via GDAL',             color: '#0EA5E9' },
  { prefix: 'Found',           label: '3 · Analyse',      desc: 'Counting features, computing bounds',      color: '#10B981' },
  { prefix: 'Exporting',       label: '4 · GeoParquet',   desc: 'Writing columnar geospatial archive',      color: '#F59E0B' },
  { prefix: 'GeoParquet',      label: '4 · GeoParquet',   desc: 'Writing columnar geospatial archive',      color: '#F59E0B' },
  { prefix: 'Building GeoJSON',label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: '  Reprojecting',  label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: '  Simplifying',   label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: '  Streaming',     label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: 'Loaded',          label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: 'Building tile',   label: '5 · Tile Index',   desc: 'Simplifying & streaming geometry',        color: '#8B5CF6' },
  { prefix: 'Encoding',        label: '6 · MVT Tiles',    desc: 'Encoding Mapbox Vector Tiles per zoom',   color: '#EC4899' },
  { prefix: '  z',             label: '6 · MVT Tiles',    desc: 'Encoding Mapbox Vector Tiles per zoom',   color: '#EC4899' },
  { prefix: 'Generated',       label: '6 · MVT Tiles',    desc: 'Encoding Mapbox Vector Tiles per zoom',   color: '#EC4899' },
  { prefix: 'Writing PMT',     label: '7 · PMTiles',      desc: 'Writing PMTiles v3 archive to disk',      color: '#EA580C' },
  { prefix: 'PMTiles',         label: '7 · PMTiles',      desc: 'Writing PMTiles v3 archive to disk',      color: '#EA580C' },
  { prefix: 'STAC item',       label: '8 · STAC',         desc: 'Building STAC metadata catalog entry',    color: '#06B6D4' },
  { prefix: 'STAC catalog',    label: '8 · STAC',         desc: 'Building STAC metadata catalog entry',    color: '#06B6D4' },
  { prefix: 'HTML viewer',     label: '9 · Viewer',       desc: 'Generating standalone HTML viewer',       color: '#84CC16' },
  { prefix: 'Pipeline',        label: '10 · Done',        desc: 'All steps complete',                      color: '#10B981' },
]

function phaseFor(msg: string): { label: string; desc: string; color: string } {
  const m = msg.trim()
  for (const p of PHASES) {
    if (m.startsWith(p.prefix)) return p
  }
  return { label: 'Processing', desc: '', color: 'var(--accent)' }
}

interface Step { msg: string; warn: boolean; phase: string; phaseColor: string; phaseDesc: string }

export default function IngestPanel({ open, onClose, existingNames, colorIndex, onLayerReady }: Props) {
  const [url,     setUrl]     = useState('')
  const [name,    setName]    = useState('')
  const [maxZoom, setMaxZoom] = useState(12)
  const [steps,   setSteps]   = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState<PipelineResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [r2Uploading, setR2Uploading] = useState(false)
  const [r2Url,   setR2Url]   = useState<string | null>(null)

  const abortRef       = useRef<AbortController | null>(null)
  const nameUserEdited = useRef(false)
  const logEndRef      = useRef<HTMLDivElement>(null)

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps, running])

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
    setUrl(ex.url); setName(ex.name)
    nameUserEdited.current = false
    setSteps([]); setResult(null); setError(null); setR2Url(null)
  }

  const handleRun = async () => {
    if (!url.trim()) return
    const layerName = name.trim() || deriveName(url)

    if (existingNames.includes(layerName)) {
      setError(`Layer "${layerName}" already exists. Choose a different name.`)
      return
    }

    setSteps([]); setResult(null); setError(null); setR2Url(null); setRunning(true)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ingest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: url.trim(), name: layerName, maxZoom }),
        signal:  abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        setError(await res.text()); setRunning(false); return
      }

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
              const { label, color, desc } = phaseFor(msg)
              setSteps(prev => [...prev, { msg, warn: msg.startsWith('⚠'), phase: label, phaseColor: color, phaseDesc: desc }])
            } else if (etype === 'done') {
              const r = JSON.parse(data) as PipelineResult
              setResult(r)
              const color = PALETTE[colorIndex % PALETTE.length]
              onLayerReady({
                name: r.name, bounds: r.bounds, center: r.center,
                visible: true, minZoom: 0, maxZoom: maxZoom,
                featureCount: r.featureCount, tileCount: r.tileCount,
                symbology: defaultSymbology(color),
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

  const handleR2Upload = async () => {
    if (!result) return
    setR2Uploading(true)
    try {
      const res  = await fetch('/api/r2/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.name }),
      })
      const json = await res.json() as { url?: string; error?: string }
      if (json.url) setR2Url(json.url)
      else setError(json.error ?? 'R2 upload failed')
    } catch (err) { setError(String(err)) }
    finally { setR2Uploading(false) }
  }

  // Determine current phase for the header
  const currentPhase = running
    ? (steps.length > 0 ? steps[steps.length - 1].phase : '1 · Init')
    : result ? '10 · Done'
    : error ? 'Failed'
    : null

  const phaseSteps = [
    '1 · Init', '2 · Fetch', '3 · Analyse', '4 · GeoParquet',
    '5 · Tile Index', '6 · MVT Tiles', '7 · PMTiles',
    '8 · STAC', '9 · Viewer', '10 · Done',
  ]
  const currentPhaseIdx = currentPhase ? phaseSteps.indexOf(currentPhase) : -1
  const currentPhaseColor = steps.length > 0 ? steps[steps.length - 1].phaseColor : '#3B82F6'

  const canRun = url.trim().length > 0

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.25)', zIndex: 40 }} />

      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
        background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)', zIndex: 50,
        display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>Add Dataset</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Config form — collapses while running */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              URL → GeoParquet → PMTiles → XYZ vector tiles
            </p>

            {/* Examples */}
            <div>
              <Label>Quick examples</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {EXAMPLES.map(ex => (
                  <button key={ex.name} onClick={() => handleExample(ex)} style={{
                    textAlign: 'left', padding: '6px 10px', borderRadius: 7,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                    transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 9, opacity: 0.6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-raised)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{ex.tag}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* URL + name + zoom */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label>Source URL</Label>
              <input value={url} onChange={e => handleUrlChange(e.target.value)} placeholder="https://…/data.geojson" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label>Layer name</Label>
              <input value={name} onChange={e => { nameUserEdited.current = true; setName(e.target.value) }} placeholder="my-dataset" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <Label>Max zoom</Label>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>z{maxZoom}</span>
              </div>
              <input type="range" min={6} max={16} step={1} value={maxZoom} onChange={e => setMaxZoom(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>z6</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>z16</span>
              </div>
            </div>

            {/* Process / Stop */}
            {!running ? (
              <button onClick={handleRun} disabled={!canRun} style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                background: canRun ? 'var(--accent)' : 'var(--bg-raised)',
                color: canRun ? '#fff' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 600, cursor: canRun ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (canRun) e.currentTarget.style.background = 'var(--accent-hover)' }}
                onMouseLeave={e => { if (canRun) e.currentTarget.style.background = 'var(--accent)' }}
              >Process Dataset</button>
            ) : (
              <button onClick={() => { abortRef.current?.abort(); setRunning(false) }} style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                border: '1px solid var(--error)', background: 'rgba(239,68,68,0.06)',
                color: 'var(--error)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Stop</button>
            )}
          </div>

          {/* ── PIPELINE LOG ───────────────────────────────────────────── */}
          {(steps.length > 0 || error || result) && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              {/* Phase progress bar */}
              {(running || result) && currentPhaseIdx >= 0 && (
                <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: result ? 'var(--success)' : currentPhaseColor }}>
                        {result ? '✓ All steps complete' : currentPhase}
                      </span>
                      {!result && steps.length > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 7 }}>
                          {steps[steps.length - 1].phaseDesc}
                        </span>
                      )}
                    </div>
                    {running && <Spinner />}
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: result ? 'var(--success)' : currentPhaseColor,
                      width: `${Math.round(((currentPhaseIdx + 1) / phaseSteps.length) * 100)}%`,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Step {currentPhaseIdx + 1} of {phaseSteps.length}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{Math.round(((currentPhaseIdx + 1) / phaseSteps.length) * 100)}%</span>
                  </div>
                </div>
              )}

              {/* Log output */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '10px 16px 14px',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                {steps.map((s, i) => {
                  const isLast    = i === steps.length - 1
                  const isDetail  = s.msg.startsWith('  ')
                  const isPhaseHdr = !isDetail && (i === 0 || steps[i - 1].phase !== s.phase)

                  return (
                    <div key={i}>
                      {/* Phase section header */}
                      {isPhaseHdr && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          marginTop: i === 0 ? 0 : 10, marginBottom: 4,
                          paddingBottom: 4, borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: isLast && running ? s.phaseColor : 'var(--border-mid)',
                          }} />
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: isLast && running ? s.phaseColor : 'var(--text-secondary)',
                          }}>
                            {s.phase}
                          </span>
                          {s.phaseDesc && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                              — {s.phaseDesc}
                            </span>
                          )}
                          {isLast && running && <Spinner />}
                        </div>
                      )}

                      {/* Log line */}
                      <div style={{
                        display: 'flex', gap: 7, alignItems: 'flex-start',
                        paddingLeft: isDetail ? 16 : 0,
                        opacity: isLast && running ? 1 : 0.75,
                      }}>
                        <span style={{
                          fontSize: 10, marginTop: 2, flexShrink: 0, lineHeight: 1,
                          color: s.warn ? 'var(--warning)' : isDetail ? 'var(--text-muted)' : 'var(--success)',
                        }}>
                          {s.warn ? '⚠' : isDetail ? '·' : '✓'}
                        </span>
                        <span style={{
                          fontSize: 11, lineHeight: 1.55,
                          fontFamily: 'var(--font-mono)',
                          color: s.warn ? 'var(--warning)' : isDetail ? 'var(--text-muted)' : 'var(--text-secondary)',
                          wordBreak: 'break-all',
                        }}>
                          {s.msg.trim()}
                        </span>
                      </div>
                    </div>
                  )
                })}

                {/* Running indicator on last line */}
                {running && steps.length === 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                    <Spinner />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Initialising pipeline…</span>
                  </div>
                )}

                <div ref={logEndRef} />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  margin: '0 16px 14px', background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
                  padding: '12px 14px', fontSize: 11.5, color: 'var(--error)',
                  fontFamily: 'var(--font-mono)', lineHeight: 1.6, wordBreak: 'break-all', flexShrink: 0,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>✕ Pipeline failed</div>
                  {error}
                </div>
              )}

              {/* Success result */}
              {result && !running && (
                <div style={{
                  margin: '0 16px 16px', background: 'var(--accent-light)',
                  border: '1px solid rgba(37,99,235,0.22)', borderRadius: 8,
                  padding: '14px 16px', flexShrink: 0,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
                    ✓ Layer ready
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 14 }}>
                    {[
                      ['Features', result.featureCount.toLocaleString()],
                      ['Tiles',    result.tileCount.toLocaleString()],
                      ['Zoom',     `z0 – z${maxZoom}`],
                      ['Name',     result.name],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <a href={`/api/stac/${result.name}/viewer`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', textAlign: 'center', padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'none', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)' }}
                    >Open standalone viewer ↗</a>

                    {!r2Url ? (
                      <button onClick={handleR2Upload} disabled={r2Uploading} style={{
                        width: '100%', padding: '6px 0', borderRadius: 6,
                        border: '1px solid var(--border-mid)', background: 'transparent',
                        color: 'var(--text-secondary)', fontSize: 12,
                        cursor: r2Uploading ? 'wait' : 'pointer', transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                        onMouseEnter={e => { if (!r2Uploading) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' } }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        {r2Uploading && <Spinner />}
                        {r2Uploading ? 'Uploading…' : '☁ Upload PMTiles to Cloudflare R2'}
                      </button>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--success)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                        ✓ <a href={r2Url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{r2Url}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function Divider() { return <div style={{ height: 1, background: 'var(--border)' }} /> }
void Divider

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
      border: '2px solid var(--border-mid)', borderTopColor: 'var(--accent)',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7,
  padding: '8px 11px', fontSize: 13, color: 'var(--text-primary)', width: '100%',
  outline: 'none', fontFamily: 'var(--font-sans)', transition: 'border-color 0.15s',
}
