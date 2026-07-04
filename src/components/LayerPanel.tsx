'use client'

import { useState } from 'react'
import type { LayerConfig, LayerSymbology } from '@/lib/types'

interface Props {
  layers:     LayerConfig[]
  onUpdate:   (layers: LayerConfig[]) => void
  onRemove:   (name: string) => void
  onAddClick: () => void
}

export default function LayerPanel({ layers, onUpdate, onRemove, onAddClick }: Props) {
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set())
  const [codeViewNames, setCodeViewNames] = useState<Set<string>>(new Set())
  const [editingName, setEditingName]     = useState<string | null>(null)
  const [editValue, setEditValue]         = useState('')

  const toggleExpand = (name: string) => {
    setExpandedNames(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleCodeView = (name: string) => {
    setCodeViewNames(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleVisible = (name: string) => {
    onUpdate(layers.map(l => l.name === name ? { ...l, visible: !l.visible } : l))
  }

  const updateSymbology = (name: string, patch: Partial<LayerSymbology>) => {
    onUpdate(layers.map(l =>
      l.name === name ? { ...l, symbology: { ...l.symbology, ...patch } } : l
    ))
  }

  const updateZoom = (name: string, key: 'minZoom' | 'maxZoom', val: number) => {
    onUpdate(layers.map(l => l.name === name ? { ...l, [key]: val } : l))
  }

  const moveLayer = (index: number, dir: 'up' | 'down') => {
    const next = [...layers]
    const swap = dir === 'up' ? index - 1 : index + 1
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    onUpdate(next)
  }

  const startEdit = (name: string) => {
    setEditingName(name)
    setEditValue(name)
  }

  const commitEdit = (oldName: string) => {
    const trimmed = editValue.trim().replace(/[^a-z0-9-_]/gi, '-').toLowerCase()
    if (trimmed && trimmed !== oldName) {
      onUpdate(layers.map(l => l.name === oldName ? { ...l, name: trimmed } : l))
    }
    setEditingName(null)
  }

  // Reversed for display (top of list = top of map)
  const displayLayers = [...layers].reverse()

  return (
    <div style={{
      width: 260,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border)',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
          Layers
        </span>
        {layers.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            borderRadius: 10,
            padding: '1px 7px',
          }}>
            {layers.length}
          </span>
        )}
        <button
          onClick={onAddClick}
          title="Add dataset"
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)' }}
        >
          + Add
        </button>
      </div>

      {/* Layer list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {layers.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 8,
            padding: 20,
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>⬡</span>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              No layers yet.<br />Click <strong>+ Add</strong> to get started.
            </p>
          </div>
        ) : (
          displayLayers.map((layer, displayIdx) => {
            const realIdx = layers.length - 1 - displayIdx
            const isExpanded = expandedNames.has(layer.name)
            const isCodeView = codeViewNames.has(layer.name)
            const isEditing  = editingName === layer.name
            const sym = layer.symbology

            return (
              <div
                key={layer.name}
                style={{
                  marginBottom: 4,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--bg-raised)',
                  animation: 'fadeIn 0.15s ease',
                }}
              >
                {/* Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 6px',
                }}>
                  {/* Drag handle */}
                  <span style={{
                    color: 'var(--text-muted)',
                    fontSize: 14,
                    cursor: 'grab',
                    userSelect: 'none',
                    lineHeight: 1,
                    padding: '0 2px',
                  }}>
                    ⠿
                  </span>

                  {/* Visibility toggle */}
                  <button
                    onClick={() => toggleVisible(layer.name)}
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 2,
                      color: layer.visible ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontSize: 13,
                      lineHeight: 1,
                      opacity: layer.visible ? 1 : 0.4,
                    }}
                  >
                    {layer.visible ? '👁' : '👁'}
                  </button>

                  {/* Color swatch */}
                  <label
                    title="Change color"
                    style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: sym.fill,
                      border: '1px solid rgba(0,0,0,0.15)',
                    }} />
                    <input
                      type="color"
                      value={sym.fill}
                      onChange={e => {
                        const c = e.target.value
                        updateSymbology(layer.name, { fill: c, stroke: c })
                      }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                  </label>

                  {/* Layer name */}
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(layer.name)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(layer.name)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      style={{
                        flex: 1,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        padding: '1px 4px',
                        outline: 'none',
                        background: '#fff',
                        color: 'var(--text-primary)',
                        minWidth: 0,
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startEdit(layer.name)}
                      title="Double-click to rename"
                      style={{
                        flex: 1,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        cursor: 'default',
                        minWidth: 0,
                      }}
                    >
                      {layer.name}
                    </span>
                  )}

                  {/* Up/down */}
                  <button
                    onClick={() => moveLayer(realIdx, 'up')}
                    disabled={realIdx === layers.length - 1}
                    title="Move up (top of map)"
                    style={arrowBtnStyle(realIdx === layers.length - 1)}
                  >↑</button>
                  <button
                    onClick={() => moveLayer(realIdx, 'down')}
                    disabled={realIdx === 0}
                    title="Move down (bottom of map)"
                    style={arrowBtnStyle(realIdx === 0)}
                  >↓</button>

                  {/* Delete */}
                  <button
                    onClick={() => onRemove(layer.name)}
                    title="Remove layer"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 14,
                      padding: '0 2px',
                      lineHeight: 1,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    ×
                  </button>

                  {/* Expand chevron */}
                  <button
                    onClick={() => toggleExpand(layer.name)}
                    title={isExpanded ? 'Collapse' : 'Expand symbology'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      padding: '0 2px',
                      transition: 'transform 0.15s',
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                    }}
                  >
                    ›
                  </button>
                </div>

                {/* Expanded: symbology editor */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                    {/* Tab bar */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                      {(['Symbology', 'CSS'] as const).map(tab => {
                        const active = tab === 'CSS' ? isCodeView : !isCodeView
                        return (
                          <button key={tab}
                            onClick={() => { if (tab === 'CSS' && !isCodeView) toggleCodeView(layer.name); if (tab === 'Symbology' && isCodeView) toggleCodeView(layer.name) }}
                            style={{
                              flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700,
                              letterSpacing: '0.05em', textTransform: 'uppercase',
                              border: 'none', cursor: 'pointer', transition: 'all 0.12s',
                              background: active ? 'var(--accent-light)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-muted)',
                              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                            }}
                          >{tab}</button>
                        )
                      })}
                    </div>

                    {!isCodeView ? (
                      /* ── Symbology visual editor ── */
                      <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <SectionLabel>Fill (Polygon)</SectionLabel>
                        <ColorRow label="Color" value={sym.fill} onChange={v => updateSymbology(layer.name, { fill: v })} />
                        <SliderRow label="Opacity" min={0} max={100} step={1}
                          value={Math.round(sym.fillOpacity * 100)} display={`${Math.round(sym.fillOpacity * 100)}%`}
                          onChange={v => updateSymbology(layer.name, { fillOpacity: v / 100 })} />
                        <Divider />
                        <SectionLabel>Stroke / Line</SectionLabel>
                        <ColorRow label="Color" value={sym.stroke} onChange={v => updateSymbology(layer.name, { stroke: v })} />
                        <SliderRow label="Width" min={0.5} max={5} step={0.5}
                          value={sym.strokeWidth} display={`${sym.strokeWidth}px`}
                          onChange={v => updateSymbology(layer.name, { strokeWidth: v })} />
                        <SliderRow label="Opacity" min={0} max={100} step={1}
                          value={Math.round(sym.strokeOpacity * 100)} display={`${Math.round(sym.strokeOpacity * 100)}%`}
                          onChange={v => updateSymbology(layer.name, { strokeOpacity: v / 100 })} />
                        <Divider />
                        <SectionLabel>Circle (Point)</SectionLabel>
                        <ColorRow label="Color" value={sym.fill} onChange={v => updateSymbology(layer.name, { fill: v })} />
                        <SliderRow label="Radius" min={2} max={20} step={0.5}
                          value={sym.circleRadius} display={`${sym.circleRadius}px`}
                          onChange={v => updateSymbology(layer.name, { circleRadius: v })} />
                        <SliderRow label="Opacity" min={0} max={100} step={1}
                          value={Math.round(sym.circleOpacity * 100)} display={`${Math.round(sym.circleOpacity * 100)}%`}
                          onChange={v => updateSymbology(layer.name, { circleOpacity: v / 100 })} />
                        <Divider />
                        <SectionLabel>Zoom Range</SectionLabel>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 50 }}>Min</span>
                          <input type="number" min={0} max={22} value={layer.minZoom}
                            onChange={e => updateZoom(layer.name, 'minZoom', Number(e.target.value))}
                            style={numInputStyle} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 50 }}>Max</span>
                          <input type="number" min={0} max={22} value={layer.maxZoom}
                            onChange={e => updateZoom(layer.name, 'maxZoom', Number(e.target.value))}
                            style={numInputStyle} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                          <Stat label="Features" value={layer.featureCount.toLocaleString()} />
                          <Stat label="Tiles" value={layer.tileCount.toLocaleString()} />
                        </div>
                      </div>
                    ) : (
                      /* ── CSS / MapLibre GL JSON view ── */
                      <div style={{ padding: '10px 10px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                          MapLibre GL paint properties
                        </div>
                        <CssCodeBlock name={layer.name} sym={sym} minZoom={layer.minZoom} maxZoom={layer.maxZoom}
                          onApply={patch => updateSymbology(layer.name, patch)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}>
      {children}
    </span>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 52 }}>{label}</span>
      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          display: 'inline-block',
          width: 20,
          height: 20,
          borderRadius: 4,
          background: value,
          border: '1px solid var(--border-mid)',
        }} />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {value}
        </span>
      </label>
    </div>
  )
}

function SliderRow({
  label, min, max, step, value, display, onChange,
}: {
  label: string; min: number; max: number; step: number
  value: number; display: string; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 52, flexShrink: 0 }}>{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)', height: 2 }}
      />
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent)', width: 36, textAlign: 'right' }}>
        {display}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

const arrowBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? 'var(--border-mid)' : 'var(--text-muted)',
  fontSize: 11,
  padding: '0 1px',
  lineHeight: 1,
})

const numInputStyle: React.CSSProperties = {
  width: 48,
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '2px 5px',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)',
  background: 'var(--bg-raised)',
  outline: 'none',
}

function buildLayersJson(name: string, sym: LayerSymbology, minZoom: number, maxZoom: number): string {
  return JSON.stringify([
    {
      id: `${name}-fill`, type: 'fill', source: name, 'source-layer': name,
      minzoom: minZoom, maxzoom: maxZoom,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': sym.fill, 'fill-opacity': sym.fillOpacity },
    },
    {
      id: `${name}-outline`, type: 'line', source: name, 'source-layer': name,
      minzoom: minZoom, maxzoom: maxZoom,
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'line-color': sym.stroke, 'line-width': sym.strokeWidth, 'line-opacity': sym.strokeOpacity },
    },
    {
      id: `${name}-line`, type: 'line', source: name, 'source-layer': name,
      minzoom: minZoom, maxzoom: maxZoom,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      paint: { 'line-color': sym.stroke, 'line-width': sym.strokeWidth, 'line-opacity': sym.strokeOpacity },
    },
    {
      id: `${name}-circle`, type: 'circle', source: name, 'source-layer': name,
      minzoom: minZoom, maxzoom: maxZoom,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': sym.fill, 'circle-radius': sym.circleRadius,
        'circle-opacity': sym.circleOpacity, 'circle-stroke-color': sym.stroke,
        'circle-stroke-width': sym.strokeWidth,
      },
    },
  ], null, 2)
}

function CssCodeBlock({ name, sym, minZoom, maxZoom, onApply }: {
  name: string
  sym: LayerSymbology
  minZoom: number
  maxZoom: number
  onApply: (patch: Partial<LayerSymbology>) => void
}) {
  const [copied,  setCopied]  = useState(false)
  const [applied, setApplied] = useState(false)
  const [value,   setValue]   = useState(() => buildLayersJson(name, sym, minZoom, maxZoom))
  const [jsonErr, setJsonErr] = useState<string | null>(null)

  const canonical = buildLayersJson(name, sym, minZoom, maxZoom)

  const handleChange = (v: string) => {
    setValue(v)
    try { JSON.parse(v); setJsonErr(null) }
    catch { setJsonErr('Invalid JSON') }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const handleReset = () => {
    setValue(canonical)
    setJsonErr(null)
  }

  const handleApply = () => {
    try {
      const layers = JSON.parse(value) as Array<Record<string, unknown>>
      const patch: Partial<LayerSymbology> = {}
      // First-write-wins per property: fill layer takes priority for fill/stroke,
      // so editing fill-color in the fill entry is not overwritten by circle-color.
      for (const l of layers) {
        const paint = (l.paint ?? {}) as Record<string, unknown>
        if (l.type === 'fill') {
          if (!('fill' in patch)        && typeof paint['fill-color'] === 'string')   patch.fill        = paint['fill-color']
          if (!('fillOpacity' in patch) && typeof paint['fill-opacity'] === 'number') patch.fillOpacity = paint['fill-opacity']
        }
        if (l.type === 'line') {
          if (!('stroke' in patch)       && typeof paint['line-color'] === 'string')   patch.stroke       = paint['line-color']
          if (!('strokeWidth' in patch)  && typeof paint['line-width'] === 'number')   patch.strokeWidth  = paint['line-width']
          if (!('strokeOpacity' in patch) && typeof paint['line-opacity'] === 'number') patch.strokeOpacity = paint['line-opacity']
        }
        if (l.type === 'circle') {
          if (!('fill' in patch)         && typeof paint['circle-color'] === 'string')        patch.fill         = paint['circle-color']
          if (!('circleRadius' in patch) && typeof paint['circle-radius'] === 'number')       patch.circleRadius = paint['circle-radius']
          if (!('circleOpacity' in patch) && typeof paint['circle-opacity'] === 'number')     patch.circleOpacity = paint['circle-opacity']
          if (!('stroke' in patch)       && typeof paint['circle-stroke-color'] === 'string') patch.stroke       = paint['circle-stroke-color']
          if (!('strokeWidth' in patch)  && typeof paint['circle-stroke-width'] === 'number') patch.strokeWidth  = paint['circle-stroke-width']
        }
      }
      if (Object.keys(patch).length > 0) {
        onApply(patch)
        setApplied(true)
        setTimeout(() => setApplied(false), 1800)
      }
    } catch { setJsonErr('Invalid JSON') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>
          {jsonErr
            ? <span style={{ color: 'var(--error)' }}>{jsonErr}</span>
            : 'MapLibre GL layer array — editable'}
        </span>
        <button onClick={handleReset} title="Reset to current symbology" style={{
          padding: '2px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
          border: '1px solid var(--border-mid)', background: 'var(--bg-raised)',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}>Reset</button>
        <button onClick={handleCopy} style={{
          padding: '2px 8px', fontSize: 10, fontWeight: 600, borderRadius: 4,
          border: '1px solid var(--border-mid)',
          background: copied ? 'var(--accent)' : 'var(--bg-raised)',
          color: copied ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', height: 260,
          fontSize: 10, fontFamily: 'var(--font-mono)',
          lineHeight: 1.55, color: jsonErr ? 'var(--error)' : 'var(--text-secondary)',
          background: 'var(--bg-code, #f6f8fa)',
          border: `1px solid ${jsonErr ? 'var(--error)' : 'var(--border)'}`,
          borderRadius: 6, padding: '8px 10px',
          resize: 'vertical', outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />
      <button
        onClick={handleApply}
        disabled={!!jsonErr}
        style={{
          width: '100%', padding: '6px 0', borderRadius: 6, cursor: jsonErr ? 'not-allowed' : 'pointer',
          border: `1px solid ${applied ? 'var(--success)' : jsonErr ? 'var(--border)' : 'var(--accent)'}`,
          background: applied ? 'rgba(16,185,129,0.1)' : jsonErr ? 'var(--bg-raised)' : 'var(--accent-light)',
          color: applied ? 'var(--success)' : jsonErr ? 'var(--text-muted)' : 'var(--accent)',
          fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
        }}
      >
        {applied ? '✓ Applied to map' : 'Apply to Map'}
      </button>
    </div>
  )
}
