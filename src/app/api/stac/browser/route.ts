/**
 * GET /api/stac/browser?datasets=layer1,layer2
 *
 * Serves a STAC-spec-compliant basemap catalog browser.
 * The page is centered on the BASEMAP as a whole (STAC Collection),
 * with the constituent datasets shown as STAC Items within it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

interface StacItem {
  id: string
  bbox?: number[]
  geometry?: unknown
  properties?: Record<string, unknown>
  assets?: Record<string, { href: string; type?: string; title?: string; roles?: string[] }>
}

interface CatalogLink { rel: string; href: string; title?: string; type?: string }
interface StacCatalog { id: string; description: string; links: CatalogLink[] }

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

export async function GET(req: NextRequest) {
  const url    = new URL(req.url)
  const origin = `${url.protocol}//${url.host}`
  const datasetsParam      = url.searchParams.get('datasets') ?? ''
  const requestedDatasets  = datasetsParam.split(',').map(s => s.trim()).filter(Boolean)

  // Load root catalog
  let catalog: StacCatalog = { id: 'tilebase', description: 'TileBase STAC Catalog', links: [] }
  try {
    catalog = JSON.parse(await readFile(path.join(DATA_DIR, 'catalog.json'), 'utf8')) as StacCatalog
  } catch { /* no catalog yet */ }

  // All dataset names from catalog
  const allNames = catalog.links
    .filter(l => l.rel === 'item' && l.title)
    .map(l => l.title as string)

  // Active basemap datasets — requested layers take priority; falls back to all catalog layers
  const activeNames = requestedDatasets.length > 0 ? requestedDatasets : allNames

  // Load STAC Items for active datasets
  const items: StacItem[] = []
  for (const name of activeNames) {
    try {
      items.push(JSON.parse(await readFile(path.join(DATA_DIR, name, 'item.json'), 'utf8')) as StacItem)
    } catch { /* skip missing */ }
  }

  // Merged basemap extent
  const bboxes     = items.map(i => i.bbox ?? [-180, -90, 180, 90])
  const mergedBbox = items.length === 0 ? [-180, -90, 180, 90] : [
    Math.min(...bboxes.map(b => b[0])),
    Math.min(...bboxes.map(b => b[1])),
    Math.max(...bboxes.map(b => b[2])),
    Math.max(...bboxes.map(b => b[3])),
  ]
  const totalFeatures = items.reduce((s, i) => s + Number(i.properties?.['streamgl:features'] ?? 0), 0)
  const totalTiles    = items.reduce((s, i) => s + Number(i.properties?.['streamgl:tiles'] ?? 0), 0)

  const xyzUrl        = activeNames.length > 0 ? `${origin}/api/basemap/{z}/{x}/{y}?datasets=${activeNames.join(',')}` : ''
  const tilejsonUrl   = activeNames.length > 0 ? `${origin}/api/basemap/tilejson.json?datasets=${activeNames.join(',')}` : ''
  const collectionUrl = activeNames.length > 0 ? `${origin}/api/stac/collection.json?datasets=${activeNames.join(',')}` : ''
  const catalogUrl    = `${origin}/api/stac/catalog.json`

  const now = new Date().toISOString().slice(0, 10)

  // Build item cards
  const itemRows = items.map(item => {
    const n        = item.id
    const features = Number(item.properties?.['streamgl:features'] ?? 0).toLocaleString()
    const tiles    = Number(item.properties?.['streamgl:tiles'] ?? 0).toLocaleString()
    const maxzoom  = Number(item.properties?.['streamgl:maxzoom'] ?? 14)
    const dt       = String(item.properties?.datetime ?? '').slice(0, 10)
    const bbox     = (item.bbox ?? []).map((v: number) => v.toFixed(4)).join(', ')
    return `
    <tr>
      <td><code class="mono">${esc(n)}</code></td>
      <td class="num">${features}</td>
      <td class="num">${tiles}</td>
      <td class="num">z0 – z${maxzoom}</td>
      <td class="mono dim">${bbox}</td>
      <td class="dim">${dt}</td>
      <td>
        <a href="${origin}/api/stac/${esc(n)}/item.json" target="_blank" class="asset-link json">item.json</a>
        <a href="${origin}/api/stac/${esc(n)}/data.pmtiles" class="asset-link pmtiles" download>PMTiles ↓</a>
        <a href="${origin}/api/stac/${esc(n)}/data.parquet" class="asset-link parquet" download>GeoParquet ↓</a>
        <a href="${origin}/api/stac/${esc(n)}/viewer" target="_blank" class="asset-link viewer">Viewer</a>
      </td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TileBase · STAC Catalog</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F1F5F9;color:#0F172A;font-size:13px;line-height:1.55}
a{color:inherit;text-decoration:none}

/* Header */
header{background:#fff;border-bottom:1px solid #E2E8F0;padding:0 28px;height:52px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.logo{width:28px;height:28px;border-radius:7px;background:#2563EB;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo svg{width:15px;height:15px}
.brand{font-weight:800;font-size:15px;letter-spacing:-.03em}
.brand-sep{color:#CBD5E1}
.brand-sub{color:#94A3B8;font-size:12px}
.hdr-right{margin-left:auto;display:flex;gap:8px;align-items:center}
.pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;border:1px solid #E2E8F0;font-size:11px;color:#475569;font-weight:600;background:#fff;transition:all .15s;cursor:pointer}
.pill:hover{border-color:#2563EB;color:#2563EB}
.pill.accent{background:#EFF6FF;border-color:#BFDBFE;color:#2563EB}
.stac-badge{font-size:10px;background:#F0FDF4;border:1px solid #BBF7D0;color:#166534;border-radius:4px;padding:2px 6px;font-weight:600;letter-spacing:.04em}

/* Main */
.main{max-width:1080px;margin:0 auto;padding:28px 24px}

/* Breadcrumb */
.breadcrumb{display:flex;align-items:center;gap:6px;font-size:11px;color:#94A3B8;margin-bottom:20px}
.breadcrumb a{color:#2563EB}
.breadcrumb span{color:#CBD5E1}

/* Collection header */
.collection-card{background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:22px 24px;margin-bottom:24px}
.collection-top{display:flex;align-items:flex-start;gap:14px;margin-bottom:18px}
.collection-icon{width:40px;height:40px;border-radius:10px;background:#EFF6FF;border:1px solid #BFDBFE;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.collection-meta{flex:1}
.collection-id{font-family:'SF Mono',Consolas,monospace;font-size:11px;color:#94A3B8;margin-bottom:3px}
.collection-title{font-weight:700;font-size:16px;color:#0F172A;letter-spacing:-.02em}
.collection-desc{font-size:12px;color:#64748B;margin-top:3px}
.stat-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.stat{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;min-width:100px}
.stat-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;margin-bottom:3px}
.stat-val{font-size:17px;font-weight:700;color:#0F172A;font-variant-numeric:tabular-nums}
.stat-sub{font-size:10px;color:#94A3B8;margin-top:1px}

/* Endpoints */
.endpoints{display:flex;flex-direction:column;gap:6px;margin-bottom:4px}
.ep-row{display:flex;align-items:center;gap:8px}
.ep-label{font-size:11px;font-weight:600;color:#475569;width:80px;flex-shrink:0}
.ep-val{font-family:'SF Mono',Consolas,monospace;font-size:11px;color:#2563EB;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:5px;padding:4px 10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy-btn{padding:3px 9px;border-radius:5px;border:1px solid #E2E8F0;background:#F8FAFC;color:#475569;font-size:11px;cursor:pointer;font-weight:600;flex-shrink:0;transition:all .15s}
.copy-btn:hover{border-color:#2563EB;color:#2563EB}

/* GIS notes */
.gis-note{margin-top:12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;font-size:11.5px;color:#92400E;line-height:1.7}
.gis-note strong{color:#78350F}
.gis-note code{font-family:'SF Mono',Consolas,monospace;background:#FEF3C7;padding:1px 4px;border-radius:3px;font-size:10.5px}

/* Links section */
.links-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid #F1F5F9}
.stac-link{font-size:11px;padding:4px 10px;border-radius:5px;border:1px solid #E2E8F0;color:#475569;transition:all .15s;display:inline-flex;align-items:center;gap:5px}
.stac-link:hover{border-color:#2563EB;color:#2563EB}
.stac-link .rel{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;font-weight:600}

/* Items table */
.section-label{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#94A3B8;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.section-label span{background:#E2E8F0;color:#64748B;border-radius:10px;padding:1px 7px;font-size:10px}
.table-wrap{background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:24px}
table{width:100%;border-collapse:collapse}
th{background:#F8FAFC;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#94A3B8;font-weight:600;border-bottom:1px solid #E2E8F0}
td{padding:9px 12px;border-bottom:1px solid #F1F5F9;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#FAFBFF}
.num{text-align:right;font-family:'SF Mono',Consolas,monospace;font-size:12px}
.mono{font-family:'SF Mono',Consolas,monospace;font-size:11.5px}
.dim{color:#94A3B8;font-size:11px}
.asset-link{display:inline-block;font-size:10px;padding:2px 7px;border-radius:4px;border:1px solid #E2E8F0;color:#475569;margin-right:3px;transition:all .15s}
.asset-link:hover{border-color:#2563EB;color:#2563EB}
.asset-link.json{border-color:#BFDBFE;color:#2563EB;background:#EFF6FF}
.asset-link.pmtiles{border-color:#BBF7D0;color:#166534;background:#F0FDF4}
.asset-link.parquet{border-color:#FDE68A;color:#92400E;background:#FFFBEB}
.asset-link.viewer{border-color:#EDE9FE;color:#5B21B6;background:#F5F3FF}

/* STAC spec section */
.spec-box{background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px 20px;margin-bottom:24px}
.spec-title{font-weight:700;font-size:12px;color:#0F172A;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.spec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.spec-item{padding:8px 10px;border:1px solid #F1F5F9;border-radius:6px;background:#FAFBFF}
.spec-key{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-bottom:2px}
.spec-val{font-family:'SF Mono',Consolas,monospace;font-size:11px;color:#0F172A;word-break:break-all}

/* Empty */
.empty{text-align:center;padding:60px 20px;color:#94A3B8;background:#fff;border:1px solid #E2E8F0;border-radius:10px}
.empty-icon{font-size:36px;margin-bottom:12px;opacity:.25}
</style>
</head>
<body>
<header>
  <div class="logo">
    <svg viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" fill="white" opacity=".9"/>
      <rect x="9" y="1" width="5" height="5" rx="1" fill="white" opacity=".6"/>
      <rect x="1" y="9" width="5" height="5" rx="1" fill="white" opacity=".6"/>
      <rect x="9" y="9" width="5" height="5" rx="1" fill="white" opacity=".35"/>
    </svg>
  </div>
  <span class="brand">TileBase</span>
  <span class="brand-sep">—</span>
  <span class="brand-sub">STAC Catalog Browser</span>
  <div class="hdr-right">
    <span class="stac-badge">STAC 1.0.0</span>
    <a href="${esc(catalogUrl)}" target="_blank" class="pill">catalog.json ↗</a>
    ${collectionUrl ? `<a href="${esc(collectionUrl)}" target="_blank" class="pill accent">collection.json ↗</a>` : ''}
  </div>
</header>

<div class="main">
  <div class="breadcrumb">
    <a href="${esc(catalogUrl)}" target="_blank">${esc(catalog.id)}</a>
    <span>›</span>
    <span>Basemap — ${esc(activeNames.join(', ') || 'no datasets')}</span>
  </div>

  ${activeNames.length === 0 ? `
  <div class="empty">
    <div class="empty-icon">⬡</div>
    <p>No datasets processed yet.<br>Go to TileBase and process your first vector layer.</p>
  </div>` : `

  <!-- STAC Collection -->
  <div class="collection-card">
    <div class="collection-top">
      <div class="collection-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="7" height="7" rx="1.5" fill="#2563EB" opacity=".8"/>
          <rect x="11" y="2" width="7" height="7" rx="1.5" fill="#2563EB" opacity=".4"/>
          <rect x="2" y="11" width="7" height="7" rx="1.5" fill="#2563EB" opacity=".4"/>
          <rect x="11" y="11" width="7" height="7" rx="1.5" fill="#2563EB" opacity=".2"/>
        </svg>
      </div>
      <div class="collection-meta">
        <div class="collection-id">STAC Collection · geoforge-basemap-${esc(activeNames.join('-'))}</div>
        <div class="collection-title">Basemap — ${esc(activeNames.join(', '))}</div>
        <div class="collection-desc">
          Merged vector tile basemap · ${activeNames.length} layer${activeNames.length !== 1 ? 's' : ''} ·
          Generated ${now}
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-row">
      <div class="stat">
        <div class="stat-label">Layers</div>
        <div class="stat-val">${activeNames.length}</div>
        <div class="stat-sub">datasets</div>
      </div>
      <div class="stat">
        <div class="stat-label">Features</div>
        <div class="stat-val">${totalFeatures.toLocaleString()}</div>
        <div class="stat-sub">total</div>
      </div>
      <div class="stat">
        <div class="stat-label">Tiles</div>
        <div class="stat-val">${totalTiles.toLocaleString()}</div>
        <div class="stat-sub">MVT tiles</div>
      </div>
      <div class="stat">
        <div class="stat-label">Extent</div>
        <div class="stat-val" style="font-size:12px;font-family:'SF Mono',monospace">[${mergedBbox.map(v => v.toFixed(1)).join(', ')}]</div>
        <div class="stat-sub">bbox WGS84</div>
      </div>
    </div>

    <!-- Endpoints -->
    <div class="endpoints">
      <div class="ep-row">
        <span class="ep-label">XYZ Tiles</span>
        <span class="ep-val" id="xyz-url">${esc(xyzUrl)}</span>
        <button class="copy-btn" onclick="copy('xyz-url',this)">Copy</button>
      </div>
      <div class="ep-row">
        <span class="ep-label">TileJSON</span>
        <span class="ep-val" id="tj-url">${esc(tilejsonUrl)}</span>
        <button class="copy-btn" onclick="copy('tj-url',this)">Copy</button>
      </div>
      <div class="ep-row">
        <span class="ep-label">Collection</span>
        <span class="ep-val" id="coll-url">${esc(collectionUrl)}</span>
        <button class="copy-btn" onclick="copy('coll-url',this)">Copy</button>
      </div>
    </div>

    <div class="gis-note">
      <strong>QGIS:</strong> Layer → Add Layer → <strong>Add Vector Tile Layer</strong> → New → Source type: Generic → URL: <code>${esc(tilejsonUrl)}</code><br>
      <strong>ArcGIS Pro:</strong> Map → Add Data → Data From Path → paste the <strong>TileJSON URL</strong><br>
      <strong>MapLibre GL:</strong> <code>map.addSource('basemap', { type: 'vector', url: '${esc(tilejsonUrl)}' })</code>
    </div>

    <!-- STAC links + Downloads -->
    <div class="links-row">
      <a href="${esc(catalogUrl)}" target="_blank" class="stac-link"><span class="rel">root</span> catalog.json</a>
      <a href="${esc(collectionUrl)}" target="_blank" class="stac-link"><span class="rel">self</span> collection.json</a>
      <a href="${esc(tilejsonUrl)}" target="_blank" class="stac-link"><span class="rel">tilejson</span> TileJSON</a>
      ${activeNames.length > 0 ? `<a href="${origin}/api/basemap/style.json?datasets=${activeNames.join(',')}" class="stac-link" download style="border-color:#BFDBFE;color:#2563EB;background:#EFF6FF"><span class="rel">download</span> style.json ↓</a>` : ''}
      ${activeNames.map(n => `<a href="${origin}/api/stac/${esc(n)}/item.json" target="_blank" class="stac-link"><span class="rel">item</span>${esc(n)}</a>`).join('')}
    </div>
  </div>

  <!-- STAC spec metadata -->
  <div class="spec-box">
    <div class="spec-title">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="2" stroke="#2563EB" stroke-width="1.5"/><path d="M4 6.5h5M4 4.5h5M4 8.5h3" stroke="#2563EB" stroke-width="1.2" stroke-linecap="round"/></svg>
      STAC Collection Metadata
    </div>
    <div class="spec-grid">
      <div class="spec-item"><div class="spec-key">type</div><div class="spec-val">Collection</div></div>
      <div class="spec-item"><div class="spec-key">stac_version</div><div class="spec-val">1.0.0</div></div>
      <div class="spec-item"><div class="spec-key">id</div><div class="spec-val">geoforge-basemap-${esc(activeNames.join('-'))}</div></div>
      <div class="spec-item"><div class="spec-key">extent.spatial</div><div class="spec-val">[${mergedBbox.map(v => v.toFixed(3)).join(', ')}]</div></div>
      <div class="spec-item"><div class="spec-key">extent.temporal</div><div class="spec-val">${now}</div></div>
      <div class="spec-item"><div class="spec-key">license</div><div class="spec-val">proprietary</div></div>
    </div>
  </div>

  <!-- Items table -->
  <div class="section-label">STAC Items <span>${items.length}</span></div>
  ${items.length === 0
    ? '<div class="empty"><div class="empty-icon">⬡</div><p>No items found.</p></div>'
    : `<div class="table-wrap"><table>
    <thead>
      <tr>
        <th>Dataset (source-layer)</th>
        <th style="text-align:right">Features</th>
        <th style="text-align:right">Tiles</th>
        <th style="text-align:right">Zoom Range</th>
        <th>Bbox (WGS84)</th>
        <th>Date</th>
        <th>Assets</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table></div>`}
  `}
</div>

<script>
function copy(id, btn) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.borderColor = '#2563EB';
    btn.style.color = '#2563EB';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  });
}
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
