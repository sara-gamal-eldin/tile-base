'use client'

import { useState } from 'react'
import type { LayerConfig } from '@/lib/types'

interface Props {
  layers: LayerConfig[]
}

type ActiveModal = 'qgis' | 'arcgis' | 'maplibre' | null

// ── Brand logos (official images) ────────────────────────────────────────────

const QgisLogo = ({ size = 18 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="https://dl.flathub.org/media/org/qgis/qgis.desktop/7035c8f06da487a2a289a2320c6d55b2/icons/128x128@2/org.qgis.qgis.desktop.png"
    width={size} height={size} alt="QGIS"
    style={{ borderRadius: 4, display: 'block', objectFit: 'contain' }}
  />
)

const ArcGISLogo = ({ size = 18 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="https://images.g2crowd.com/uploads/product/image/large_detail/large_detail_64636a5c446c22391d4ed719e0987cd2/arcgis-pro.png"
    width={size} height={size} alt="ArcGIS Pro"
    style={{ borderRadius: 4, display: 'block', objectFit: 'contain' }}
  />
)

const MapLibreLogo = ({ size = 18 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="https://media.licdn.com/dms/image/v2/D4D0BAQF84Hb7RtSAkw/company-logo_200_200/company-logo_200_200/0/1698080592071/maplibre_logo?e=2147483647&v=beta&t=s4LLEv0T5q6yKF6GWVSg-J9LKCHLQFF6SBdYpKK4hfc"
    width={size} height={size} alt="MapLibre GL"
    style={{ borderRadius: 4, display: 'block', objectFit: 'contain' }}
  />
)

/** STAC — indigo grid of 4 squares */
const StacLogo = () => (
  <svg width="15" height="15" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="4" fill="#6366F1"/>
    <rect x="5"  y="5"  width="9" height="9" rx="1.5" fill="white" opacity="0.9"/>
    <rect x="18" y="5"  width="9" height="9" rx="1.5" fill="white" opacity="0.9"/>
    <rect x="5"  y="18" width="9" height="9" rx="1.5" fill="white" opacity="0.9"/>
    <rect x="18" y="18" width="9" height="9" rx="1.5" fill="white" opacity="0.5"/>
  </svg>
)

const CloudIcon = () => (
  <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
    <path d="M16.5 9.4a5.002 5.002 0 0 0-9.9-1A4 4 0 0 0 4 16h12.5a3.5 3.5 0 0 0 0-6.6z"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 2a1 1 0 011 1v9.586l2.293-2.293a1 1 0 011.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V3a1 1 0 011-1z"/>
    <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
  </svg>
)

export default function ExportBar({ layers }: Props) {
  const [copiedXyz,  setCopiedXyz]  = useState(false)
  const [modal,      setModal]      = useState<ActiveModal>(null)
  const [publishing, setPublishing] = useState(false)
  const [published,  setPublished]  = useState<{ catalogUrl: string; stacBrowserUrl: string; styleUrl: string } | null>(null)

  if (layers.length === 0) return null

  const origin       = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const datasetParam = layers.map(l => l.name).join(',')
  const layerLabel   = layers.length === 1 ? layers[0].name : layers.map(l => l.name).join(', ')

  const xyzUrl      = `${origin}/api/basemap/{z}/{x}/{y}?datasets=${datasetParam}`
  const styleUrl    = `${origin}/api/basemap/style.json?datasets=${datasetParam}`
  // Local STAC browser — always shows only the current layer-panel layers
  const stacBrowserUrl_local = `${origin}/api/stac/browser?datasets=${datasetParam}`

  const totalFeatures = layers.reduce((a, l) => a + l.featureCount, 0)
  const totalTiles    = layers.reduce((a, l) => a + l.tileCount, 0)

  const copy = (url: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(url).then(() => { setFn(true); setTimeout(() => setFn(false), 2000) })
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res  = await fetch('/api/r2/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasets: layers.map(l => l.name) }),
      })
      const json = await res.json() as { catalogUrl?: string; stacBrowserUrl?: string; styleUrl?: string; error?: string }
      if (json.catalogUrl && json.stacBrowserUrl) {
        setPublished({ catalogUrl: json.catalogUrl, stacBrowserUrl: json.stacBrowserUrl, styleUrl: json.styleUrl ?? '' })
      }
    } finally {
      setPublishing(false)
    }
  }

  const downloadBasemapHtml = () => {
    // Build merged bounds across all visible layers
    const allBounds = layers.filter(l => l.visible)
    const w = allBounds.length > 0 ? Math.min(...allBounds.map(l => l.bounds[0])) : -180
    const s = allBounds.length > 0 ? Math.min(...allBounds.map(l => l.bounds[1])) : -90
    const e = allBounds.length > 0 ? Math.max(...allBounds.map(l => l.bounds[2])) : 180
    const n = allBounds.length > 0 ? Math.max(...allBounds.map(l => l.bounds[3])) : 90

    // Build per-layer MapLibre GL layers using the symbology from the layer panel
    const mapLayers = layers.filter(l => l.visible).flatMap(l => {
      const sym = l.symbology
      const fill   = sym.fill
      const stroke = sym.stroke
      return [
        `{ id: ${JSON.stringify(l.name + '-fill')}, type: 'fill', source: 'basemap', 'source-layer': ${JSON.stringify(l.name)},
           filter: ['==', ['geometry-type'], 'Polygon'],
           paint: { 'fill-color': ${JSON.stringify(fill)}, 'fill-opacity': ${sym.fillOpacity} } }`,
        `{ id: ${JSON.stringify(l.name + '-outline')}, type: 'line', source: 'basemap', 'source-layer': ${JSON.stringify(l.name)},
           filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
           paint: { 'line-color': ${JSON.stringify(stroke)}, 'line-width': ${sym.strokeWidth}, 'line-opacity': ${sym.strokeOpacity} } }`,
        `{ id: ${JSON.stringify(l.name + '-line')}, type: 'line', source: 'basemap', 'source-layer': ${JSON.stringify(l.name)},
           filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
           paint: { 'line-color': ${JSON.stringify(stroke)}, 'line-width': ${sym.strokeWidth}, 'line-opacity': ${sym.strokeOpacity} } }`,
        `{ id: ${JSON.stringify(l.name + '-circle')}, type: 'circle', source: 'basemap', 'source-layer': ${JSON.stringify(l.name)},
           filter: ['==', ['geometry-type'], 'Point'],
           paint: { 'circle-color': ${JSON.stringify(fill)}, 'circle-radius': ${sym.circleRadius}, 'circle-opacity': ${sym.circleOpacity},
                    'circle-stroke-color': ${JSON.stringify(stroke)}, 'circle-stroke-width': 1 } }`,
      ]
    }).join(',\n        ')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TileBase — ${layerLabel}</title>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100vh}
#badge{position:fixed;top:16px;left:16px;z-index:9;background:rgba(11,18,33,0.9);
  backdrop-filter:blur(10px);border:1px solid #1A2C47;border-radius:10px;
  padding:14px 18px;font-family:system-ui,sans-serif;color:#E4EDFF;min-width:200px}
#badge h1{font-size:15px;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px}
#badge p{font-size:11px;color:#6B84AA}
#badge .tag{display:inline-block;margin-top:8px;padding:2px 7px;border-radius:4px;
  font-size:10px;background:#1A2C47;color:#4A90F5;font-family:monospace}
</style>
</head>
<body>
<div id="map"></div>
<div id="badge">
  <h1>${layerLabel}</h1>
  <p>${totalFeatures.toLocaleString()} features · ${layers.filter(l => l.visible).length} layer${layers.filter(l => l.visible).length !== 1 ? 's' : ''}</p>
  <span class="tag">TileBase · MapLibre GL</span>
</div>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script>
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  bounds: [[${w},${s}],[${e},${n}]],
  fitBoundsOptions: { padding: 60 }
});
map.on('load', () => {
  map.addSource('basemap', {
    type: 'vector',
    tiles: ['${xyzUrl.replace('{z}/{x}/{y}', '{z}/{x}/{y}')}'],
    minzoom: 0, maxzoom: 14,
  });
  const layers = [
        ${mapLayers}
  ];
  layers.forEach(l => map.addLayer(l));
  layers.forEach(l => {
    map.on('click', l.id, e => {
      const props = e.features?.[0]?.properties ?? {};
      const rows = Object.entries(props).filter(([,v]) => v != null).slice(0,25)
        .map(([k,v]) => '<div style="display:flex;gap:10px;margin-bottom:4px"><span style="color:#6AA6FF;min-width:80px;flex-shrink:0;font-size:11px">'+k+'</span><span style="color:#94B4D8;word-break:break-all">'+v+'</span></div>').join('');
      new maplibregl.Popup({maxWidth:'340px'})
        .setLngLat(e.lngLat)
        .setHTML('<div style="background:#0B1221;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;color:#E4EDFF;max-height:260px;overflow-y:auto">'+( rows||'<em style=opacity:.5>No properties</em>')+'</div>')
        .addTo(map);
    });
    map.on('mouseenter', l.id, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', l.id, () => map.getCanvas().style.cursor = '');
  });
});
</script>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tilebase-${datasetParam}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadStyleJson = () => {
    const sources: Record<string, object> = {
      basemap: {
        type: 'vector',
        tiles: [xyzUrl],
        minzoom: 0,
        maxzoom: Math.max(...layers.map(l => l.maxZoom)),
      },
    }
    const mapLayers = layers.flatMap(l => {
      const sym = l.symbology
      return [
        { id: `${l.name}-fill`,    type: 'fill',   source: 'basemap', 'source-layer': l.name,
          minzoom: l.minZoom, maxzoom: l.maxZoom,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint:  { 'fill-color': sym.fill, 'fill-opacity': sym.fillOpacity } },
        { id: `${l.name}-outline`, type: 'line',   source: 'basemap', 'source-layer': l.name,
          minzoom: l.minZoom, maxzoom: l.maxZoom,
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint:  { 'line-color': sym.stroke, 'line-width': sym.strokeWidth, 'line-opacity': sym.strokeOpacity } },
        { id: `${l.name}-line`,    type: 'line',   source: 'basemap', 'source-layer': l.name,
          minzoom: l.minZoom, maxzoom: l.maxZoom,
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
          paint:  { 'line-color': sym.stroke, 'line-width': sym.strokeWidth, 'line-opacity': sym.strokeOpacity } },
        { id: `${l.name}-circle`,  type: 'circle', source: 'basemap', 'source-layer': l.name,
          minzoom: l.minZoom, maxzoom: l.maxZoom,
          filter: ['==', ['geometry-type'], 'Point'],
          paint:  { 'circle-color': sym.fill, 'circle-radius': sym.circleRadius, 'circle-opacity': sym.circleOpacity,
                    'circle-stroke-color': sym.stroke, 'circle-stroke-width': sym.strokeWidth } },
      ]
    })
    const style = {
      version: 8,
      name: `TileBase — ${layerLabel}`,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources,
      layers: mapLayers,
    }
    const blob = new Blob([JSON.stringify(style, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tilebase-${datasetParam}-style.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--bg-panel)', borderTop: '1px solid var(--border)',
        flexShrink: 0, zIndex: 20, position: 'relative', minHeight: 50,
      }}>

        {/* ── LEFT: Vector Tiles ───────────────────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 6, padding: '0 10px 0 14px',
          background: 'rgba(59,130,246,0.025)',
          borderRight: '1px solid var(--border)',
        }}>
          <Tag color="#3B82F6" bg="rgba(59,130,246,0.1)" border="rgba(59,130,246,0.2)">
            Vector Tiles
          </Tag>

          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>XYZ</span>
          <input readOnly value={xyzUrl} style={inputStyle} title={xyzUrl} />
          <CopyBtn copied={copiedXyz} onClick={() => copy(xyzUrl, setCopiedXyz)} />

          <VDivider />

          {/* Tool badges */}
          <ToolBadge label="QGIS"        active={modal === 'qgis'}     onClick={() => setModal(modal === 'qgis'     ? null : 'qgis')}><QgisLogo /></ToolBadge>
          <ToolBadge label="ArcGIS Pro"  active={modal === 'arcgis'}   onClick={() => setModal(modal === 'arcgis'   ? null : 'arcgis')}><ArcGISLogo /></ToolBadge>
          <ToolBadge label="MapLibre GL" active={modal === 'maplibre'} onClick={() => setModal(modal === 'maplibre' ? null : 'maplibre')}><MapLibreLogo /></ToolBadge>
        </div>

        {/* ── RIGHT: Cloud Publish ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px',
          background: 'rgba(99,102,241,0.025)', flexShrink: 0,
        }}>
          {/* Publish to Cloud */}
          <button onClick={handlePublish} disabled={publishing} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 11px', borderRadius: 6, fontWeight: 700,
            border: `1px solid ${published ? 'var(--success)' : 'rgba(99,102,241,0.5)'}`,
            background: published ? 'rgba(16,185,129,0.07)' : 'rgba(99,102,241,0.1)',
            color: published ? 'var(--success)' : '#6366F1',
            fontSize: 11, cursor: publishing ? 'wait' : 'pointer',
            whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0,
          }}
            onMouseEnter={e => { if (!publishing && !published) e.currentTarget.style.background = 'rgba(99,102,241,0.2)' }}
            onMouseLeave={e => { if (!published) e.currentTarget.style.background = 'rgba(99,102,241,0.1)' }}
          >
            {published ? <>✓ Published</> : publishing ? <>… Publishing</> : <><CloudIcon /> Publish to Cloud</>}
          </button>

          {/* Browse STAC Catalog on Radiant Earth — opens after publishing to R2 */}
          {published ? (
            <a href={published.stacBrowserUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid rgba(16,185,129,0.4)',
              color: 'var(--success)', fontSize: 11, fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
              background: 'rgba(16,185,129,0.06)', flexShrink: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.14)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.06)' }}
            >
              <StacLogo /> Browse STAC Catalog ↗
            </a>
          ) : null}

          <VDivider />

          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {layers.length}L · {totalFeatures.toLocaleString()} feat · {totalTiles.toLocaleString()} tiles
          </span>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {modal && (
        <>
          <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
          <div style={{
            position: 'fixed', bottom: 58, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-panel)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-md)',
            padding: '18px 20px', zIndex: 101, minWidth: 500, maxWidth: 600,
            animation: 'fadeIn 0.15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {modal === 'qgis'     && <QgisLogo />}
              {modal === 'arcgis'   && <ArcGISLogo />}
              {modal === 'maplibre' && <MapLibreLogo />}
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {modal === 'qgis'     ? 'Connect to QGIS'
                : modal === 'arcgis'  ? 'Connect to ArcGIS Pro'
                :                      'Use with MapLibre GL'}
              </span>
              <button onClick={() => setModal(null)} style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 2,
              }}>×</button>
            </div>

            {modal === 'qgis' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* ── Method 1: Vector Tile Layer (live XYZ URL) ───────── */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: 'rgba(59,130,246,0.06)', borderBottom: '1px solid var(--border)' }}>
                    <MethodBadge color="#2563EB">Vector Tile Layer</MethodBadge>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Live XYZ — auto-updates</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>recommended</span>
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <LabelRow label="Tile URL" value={xyzUrl} />
                    <pre style={{ ...preStyle, margin: '8px 0' }}>{`1. Layer menu → Add Layer → Add Vector Tile Layer
2. Click "New" → Source type: Generic (URL)
3. Paste URL above → Min zoom: 0, Max zoom: 14
4. Click OK → Add

Source-layer names: ${layers.map(l => l.name).join(', ')}`}</pre>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Apply symbology from app:</span>
                      <button onClick={downloadStyleJson} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                        border: '1px solid rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.07)',
                        color: '#2563EB', fontSize: 11, fontWeight: 600,
                      }}><DownloadIcon /> style.json</button>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ Layer Properties → Symbology → Style → Load Style → From File</span>
                    </div>
                  </div>
                </div>

                {/* ── Method 2: PMTiles ────────────────────────────────── */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: 'rgba(234,88,12,0.06)', borderBottom: '1px solid var(--border)' }}>
                    <MethodBadge color="#EA580C">PMTiles File</MethodBadge>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Offline — QGIS 3.26+</span>
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {layers.map(l => (
                        <a key={l.name} href={`/api/stac/${l.name}/data.pmtiles`} download style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                          borderRadius: 5, border: '1px solid rgba(234,88,12,0.35)',
                          background: 'rgba(234,88,12,0.07)', color: '#EA580C',
                          fontSize: 11, fontWeight: 600, textDecoration: 'none',
                        }}><DownloadIcon /> {l.name}.pmtiles</a>
                      ))}
                    </div>
                    <pre style={preStyle}>{`1. Download .pmtiles file above
2. Layer menu → Add Layer → Add Vector Tile Layer
3. Click "New" → Source type: File
4. Browse to downloaded .pmtiles file → OK → Add

Note: re-process dataset to regenerate PMTiles after changes.`}</pre>
                  </div>
                </div>
              </div>
            )}

            {modal === 'arcgis' && (<>
              <Alert>Add as a <strong>Vector Tile Layer</strong> using the tile URL below, then import the style file for exact symbology.</Alert>
              <LabelRow label="Tile URL" value={xyzUrl} />
              <pre style={preStyle}>{`Method A — Add Data from path:
  Map → Add Data → Data From Path
  Paste: ${xyzUrl}

Method B — Vector Tile Server connection:
  Insert → Connections → New Vector Tile Server
  URL: ${xyzUrl}
  → OK → drag layer onto map

Source-layer names: ${layers.map(l => l.name).join(', ')}`}</pre>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Symbology (MapLibre style):</span>
                <button onClick={downloadStyleJson} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                  border: '1px solid rgba(37,99,235,0.4)', background: 'rgba(37,99,235,0.07)',
                  color: '#2563EB', fontSize: 11, fontWeight: 600,
                }}><DownloadIcon /> style.json</button>
              </div>
            </>)}

            {modal === 'maplibre' && (<>
              {published?.styleUrl && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Tag color="#10B981" bg="rgba(16,185,129,0.08)" border="rgba(16,185,129,0.25)">R2 Cloud</Tag>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosted style — uses PMTiles from Cloudflare R2</span>
                  </div>
                  <LabelRow label="Style (R2)" value={published.styleUrl} />
                </div>
              )}
              <LabelRow label="Style (local)" value={styleUrl} />
              <LabelRow label="XYZ (local)"   value={xyzUrl} />
              <pre style={preStyle}>{published?.styleUrl
? `// Load cloud-hosted style (PMTiles from R2):
const map = new maplibregl.Map({
  container: 'map',
  style: '${published.styleUrl}',
});`
: `// Load local style:
const map = new maplibregl.Map({
  container: 'map',
  style: '${styleUrl}',
});`}

{`// Or manual XYZ source:
map.addSource('basemap', {
  type: 'vector',
  tiles: ['${xyzUrl}'],
  minzoom: 0, maxzoom: 14,
});
// source-layer names:
${layers.map(l => `//   '${l.name}'`).join('\n')}`}</pre>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={downloadBasemapHtml} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 6,
                  border: '1px solid rgba(59,130,246,0.4)',
                  background: 'rgba(59,130,246,0.07)',
                  color: '#3B82F6', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  <DownloadIcon /> Download basemap.html
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Self-contained HTML with all visible layers &amp; symbology
                </span>
              </div>
              {!published && (
                <div style={{
                  marginTop: 10, fontSize: 11, color: 'var(--text-muted)',
                  padding: '7px 10px', borderRadius: 6,
                  background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                }}>
                  Publish to Cloud (STAC section) to get a cloud-hosted style.json with PMTiles sources.
                </div>
              )}
            </>)}
          </div>
        </>
      )}
    </>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MethodBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      color, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
      background: `${color}18`, border: `1px solid ${color}44`,
    }}>{children}</span>
  )
}

function VDivider() {
  return <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0, alignSelf: 'center' }} />
}

function Tag({ color, bg, border, children }: { color: string; bg: string; border: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
      color, padding: '2px 6px', borderRadius: 3,
      background: bg, border: `1px solid ${border}`, flexShrink: 0,
    }}>{children}</span>
  )
}

function CopyBtn({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', borderRadius: 5,
      border: '1px solid var(--border)',
      background: copied ? 'var(--success)' : 'var(--bg-raised)',
      color: copied ? '#fff' : 'var(--text-secondary)',
      fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0,
      transition: 'all 0.15s',
    }}>{copied ? '✓' : 'Copy'}</button>
  )
}

function ToolBadge({ label, active, onClick, children }: {
  label: string; active: boolean; onClick: () => void; children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 8px 3px 5px', borderRadius: 6,
        border: `1px solid ${active || hover ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-light)' : hover ? 'var(--bg-raised)' : 'transparent',
        color: active || hover ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.12s', flexShrink: 0,
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function LabelRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, width: 80, flexShrink: 0, letterSpacing: '0.02em' }}>{label}</span>
      <input readOnly value={value} style={{ ...inputStyle, flex: 1 }} />
      <button onClick={() => {
        navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      }} style={{
        padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)',
        background: copied ? 'var(--success)' : 'var(--bg-raised)',
        color: copied ? '#fff' : 'var(--text-secondary)',
        fontSize: 11, cursor: 'pointer', flexShrink: 0, fontWeight: 600,
      }}>{copied ? '✓' : 'Copy'}</button>
    </div>
  )
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6,
      background: 'var(--accent-light)', border: '1px solid #BFDBFE',
      borderRadius: 7, padding: '8px 11px',
    }}>{children}</div>
  )
}

// ── Shared styles ────────────────────────────────────────────────────────────


const inputStyle: React.CSSProperties = {
  width: 230, minWidth: 0,
  border: '1px solid var(--border)', borderRadius: 5,
  padding: '3px 9px', fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-secondary)',
  background: 'var(--bg-raised)', outline: 'none',
}

const preStyle: React.CSSProperties = {
  background: 'var(--bg-raised)', border: '1px solid var(--border)',
  borderRadius: 7, padding: '11px 14px',
  fontSize: 11.5, fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)', lineHeight: 1.7,
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
}
