/**
 * StreamGL ingestion pipeline.
 *
 * Step 1  Download source (GeoJSON / GeoPackage / Shapefile / CSV) via DuckDB ST_Read().
 * Step 2  Export to GeoParquet → data/stac/{name}/data.parquet
 * Step 3  Stream features from parquet via NDJSON file (memory-efficient, no BigInt issues).
 * Step 4  Tile with geojson-vt (zoom 0 → maxZoom) within data bbox.
 * Step 5  Encode each tile as MVT using vt-pbf. Layer name = dataset name.
 * Step 6  Write PMTiles v3 file.
 * Step 7  Write STAC item.json + update root catalog.json.
 * Step 8  Write standalone HTML viewer.
 *
 * Yields progress strings; the SSE route wraps them in text/event-stream.
 */

import path from 'path'
import { mkdir, writeFile, readFile, unlink, open } from 'fs/promises'
import { spawn } from 'child_process'
import { getConnection } from './duckdb'

export const DATA_DIR = path.join(process.cwd(), 'data', 'stac')

export interface PipelineResult {
  name:         string
  parquet:      string
  pmtiles:      string
  stacItem:     string
  stacCatalog:  string
  viewerHtml:   string
  bounds:       [number, number, number, number]
  center:       [number, number, number]
  tileCount:    number
  featureCount: number
}

// ── STAC catalog helpers ─────────────────────────────────────────────────────

interface StacLink {
  rel:   string
  href:  string
  type:  string
  title?: string
}

interface StacCatalog {
  type:          string
  id:            string
  stac_version:  string
  title?:        string
  description:   string
  links:         StacLink[]
}

async function loadOrCreateCatalog(catalogPath: string): Promise<StacCatalog> {
  try {
    return JSON.parse(await readFile(catalogPath, 'utf8')) as StacCatalog
  } catch {
    return {
      type:         'Catalog',
      id:           'tilebase',
      stac_version: '1.0.0',
      title:        'TileBase',
      description:  'Vector tile datasets — Geosolvix TileBase',
      links: [
        { rel: 'self',   href: './catalog.json', type: 'application/json' },
        { rel: 'root',   href: './catalog.json', type: 'application/json' },
      ],
    }
  }
}

async function updateCatalog(name: string): Promise<string> {
  const catalogPath = path.join(DATA_DIR, 'catalog.json')
  await mkdir(DATA_DIR, { recursive: true })

  const catalog = await loadOrCreateCatalog(catalogPath)
  // Remove any existing entry for this dataset, then add fresh
  catalog.links = catalog.links.filter(
    l => !(l.rel === 'item' && l.title === name)
  )
  catalog.links.push({
    rel:   'item',
    href:  `./${name}/item.json`,
    type:  'application/json',
    title: name,
  })

  await writeFile(catalogPath, JSON.stringify(catalog, null, 2))
  return catalogPath
}

// ── HTML viewer template ─────────────────────────────────────────────────────

function buildViewerHtml(
  name: string,
  featureCount: number,
  bounds: [number, number, number, number],
): string {
  const [w, s, e, n] = bounds
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TileBase — ${name}</title>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100vh}
#badge{
  position:fixed;top:16px;left:16px;z-index:9;
  background:rgba(11,18,33,0.9);backdrop-filter:blur(10px);
  border:1px solid #1A2C47;border-radius:10px;
  padding:14px 18px;font-family:system-ui,sans-serif;color:#E4EDFF;
  min-width:200px;
}
#badge h1{font-size:15px;font-weight:700;letter-spacing:-0.01em;margin-bottom:4px}
#badge p{font-size:11px;color:#6B84AA}
#badge .tag{display:inline-block;margin-top:8px;padding:2px 7px;border-radius:4px;
  font-size:10px;background:#1A2C47;color:#4A90F5;font-family:monospace}
</style>
</head>
<body>
<div id="map"></div>
<div id="badge">
  <h1>${name}</h1>
  <p>${featureCount.toLocaleString()} features</p>
  <span class="tag">TileBase · PMTiles · MapLibre GL</span>
</div>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script>
const SERVER = window.location.origin;
const NAME   = ${JSON.stringify(name)};
const LAYER  = NAME; // MVT source-layer name matches dataset name

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  bounds: [[${w},${s}],[${e},${n}]],
  fitBoundsOptions: { padding: 60 }
});

map.on('load', () => {
  map.addSource('streamgl', {
    type: 'vector',
    tiles: [SERVER + '/api/xyz/' + NAME + '/{z}/{x}/{y}'],
    minzoom: 0, maxzoom: 14,
  });

  map.addLayer({ id:'fill', type:'fill', source:'streamgl', 'source-layer':LAYER,
    filter:['==',['geometry-type'],'Polygon'],
    paint:{'fill-color':'#4A90F5','fill-opacity':0.3} });
  map.addLayer({ id:'outline', type:'line', source:'streamgl', 'source-layer':LAYER,
    filter:['==',['geometry-type'],'Polygon'],
    paint:{'line-color':'#6AA6FF','line-width':1.2,'line-opacity':0.9} });
  map.addLayer({ id:'line', type:'line', source:'streamgl', 'source-layer':LAYER,
    filter:['in',['geometry-type'],['literal',['LineString','MultiLineString']]],
    paint:{'line-color':'#6AA6FF','line-width':1.5,'line-opacity':0.85} });
  map.addLayer({ id:'circle', type:'circle', source:'streamgl', 'source-layer':LAYER,
    filter:['==',['geometry-type'],'Point'],
    paint:{'circle-color':'#4A90F5','circle-radius':5,'circle-opacity':0.9,
      'circle-stroke-color':'#1A2C47','circle-stroke-width':1} });

  const clickable = ['fill','line','circle'];
  clickable.forEach(id => {
    map.on('click', id, e => {
      const props = e.features?.[0]?.properties ?? {};
      const rows = Object.entries(props)
        .filter(([,v]) => v != null && v !== '')
        .slice(0,25)
        .map(([k,v]) => \`<div style="display:flex;gap:10px;margin-bottom:4px">
          <span style="color:#6AA6FF;min-width:80px;flex-shrink:0;font-size:11px">\${k}</span>
          <span style="color:#94B4D8;word-break:break-all">\${v}</span></div>\`)
        .join('');
      new maplibregl.Popup({maxWidth:'340px'})
        .setLngLat(e.lngLat)
        .setHTML(\`<div style="background:#0B1221;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;color:#E4EDFF;max-height:260px;overflow-y:auto">\${rows||'<em style=opacity:.5>No properties</em>'}</div>\`)
        .addTo(map);
    });
    map.on('mouseenter', id, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', id, () => map.getCanvas().style.cursor = '');
  });
});
</script>
</body>
</html>`
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function* runPipeline(
  url:      string,
  name:     string,
  maxZoom = 12
): AsyncGenerator<string, PipelineResult> {
  const dir        = path.join(DATA_DIR, name)
  const parquet    = path.join(dir, 'data.parquet')
  const ndjson     = path.join(dir, '_features.ndjson')
  const pmtiles    = path.join(dir, 'data.pmtiles')
  const itemPath   = path.join(dir, 'item.json')
  const viewerPath = path.join(dir, 'viewer.html')

  await mkdir(dir, { recursive: true })

  const conn = await getConnection()

  // ── Step 1: read source ────────────────────────────────────────────────────
  yield `Connecting to DuckDB…`

  yield `Reading source: ${url}`

  // DuckDB ST_Read uses GDAL which cannot reliably stream remote HTTPS files —
  // download to a local temp file first so GDAL reads from disk.
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  let localPath = url   // used as DuckDB path; will be overwritten for remote URLs
  let tempFile: string | null = null

  const isRemote = url.startsWith('http://') || url.startsWith('https://')
  if (isRemote) {
    yield `  Downloading ${url.length > 80 ? url.slice(0, 77) + '…' : url}…`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download source: HTTP ${res.status}`)
    const arrayBuf = await res.arrayBuffer()
    tempFile = path.join(dir, `_source.${ext || 'geojson'}`)
    await writeFile(tempFile, Buffer.from(arrayBuf))
    localPath = tempFile
    yield `  Downloaded ${(arrayBuf.byteLength / 1024 / 1024).toFixed(1)} MB`
  }

  const fromClause = ext === 'parquet'
    ? `read_parquet('${localPath}')`
    : `ST_Read('${localPath}')`

  // ── Step 2: feature count + bounds ────────────────────────────────────────
  const infoResult = await conn.runAndReadAll(`
    SELECT
      COUNT(*)        AS n,
      MIN(ST_XMin(geom)) AS xmin,
      MIN(ST_YMin(geom)) AS ymin,
      MAX(ST_XMax(geom)) AS xmax,
      MAX(ST_YMax(geom)) AS ymax
    FROM (SELECT geom FROM ${fromClause}) t
    WHERE geom IS NOT NULL
  `)
  const infoRow = infoResult.getRows()[0]
  const featureCount = Number(infoRow[0])
  const xmin = Number(infoRow[1])
  const ymin = Number(infoRow[2])
  const xmax = Number(infoRow[3])
  const ymax = Number(infoRow[4])

  if (featureCount === 0) throw new Error('No features found in source')

  yield `Found ${featureCount.toLocaleString()} features — bounds [${xmin.toFixed(3)}, ${ymin.toFixed(3)}, ${xmax.toFixed(3)}, ${ymax.toFixed(3)}]`

  // ── Step 3: export to GeoParquet ──────────────────────────────────────────
  yield `Exporting to GeoParquet…`
  await conn.run(`
    COPY (SELECT geom, * EXCLUDE (geom) FROM ${fromClause} WHERE geom IS NOT NULL)
    TO '${parquet}' (FORMAT PARQUET)
  `)
  yield `GeoParquet saved → ${path.relative(process.cwd(), parquet)}`

  // Clean up the downloaded temp source file — parquet has the data now
  if (tempFile) await unlink(tempFile).catch(() => null)

  // ── Step 4: stream features from parquet via NDJSON ───────────────────────
  // DuckDB COPY JSON outputs NDJSON (one object per line) with native number
  // types — no BigInt, no cast issues, no full result-set in Node.js RAM.

  yield `Building GeoJSON for tiling…`

  // Discover property columns (exclude geometry)
  const schemaRes  = await conn.runAndReadAll(`DESCRIBE SELECT * FROM read_parquet('${parquet}') LIMIT 0`)
  const schemaRows = schemaRes.getRows()
  const schemaCols = schemaRes.columnNames()
  const nameIdx    = schemaCols.indexOf('column_name')
  const propCols   = schemaRows
    .map(r => String(r[nameIdx]))
    .filter(n => n !== 'geom')
    .map(n => `"${n}"`)
    .join(', ')
  const selectProps = propCols ? `, ${propCols}` : ''

  // Reproject to WGS84 if data appears to be in a projected CRS
  const needsReproject = Math.abs(xmin) > 180.5 || Math.abs(xmax) > 180.5 ||
                         ymin < -90.5  || ymax > 90.5
  if (needsReproject) {
    yield `  Reprojecting to WGS84 (bounds suggest projected CRS)…`
  }

  // Simplify geometry in DuckDB before streaming to Node.js.
  // Complex datasets (world countries, coastlines) have millions of vertices
  // that exhaust Node.js heap when loaded as GeoJSON objects.
  // Tolerance: 1 pixel at the target zoom level in WGS84 degrees.
  //   pixel_deg = 360 / (256 * 2^maxZoom)
  // We use 4× that so geojson-vt still has room to simplify further per tile.
  // At maxZoom=12: ~0.0055°, clamped to 0.00001° minimum for very high zooms.
  const pixelDeg  = 360 / (256 * Math.pow(2, maxZoom))
  const tolerance = Math.max(pixelDeg * 4, 0.00001)

  const baseGeom = needsReproject
    ? `ST_Transform(geom, 'EPSG:4326')`
    : `geom`
  const geoExpr = `ST_AsGeoJSON(ST_SimplifyPreserveTopology(${baseGeom}, ${tolerance}))`

  yield `  Simplifying geometry (tolerance ${tolerance.toFixed(5)}°)…`

  // Write NDJSON to disk
  await conn.run(`
    COPY (
      SELECT ${geoExpr} AS __geo__ ${selectProps}
      FROM read_parquet('${parquet}')
      WHERE geom IS NOT NULL
    ) TO '${ndjson}' (FORMAT JSON)
  `)

  // Stream NDJSON line-by-line → build feature array incrementally
  const { createReadStream } = await import('fs')
  const { createInterface } = await import('readline')

  const features: GeoJSON.Feature[] = []
  let skipped = 0

  const rl = createInterface({
    input: createReadStream(ndjson, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const raw of rl) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      const geoVal = obj['__geo__']
      if (!geoVal) { skipped++; continue }
      // DuckDB JSON writer embeds a JSON-shaped VARCHAR as a nested object,
      // not as an escaped string — handle both forms.
      const geometry = (typeof geoVal === 'string'
        ? JSON.parse(geoVal)
        : geoVal) as GeoJSON.Geometry
      const props: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k !== '__geo__') props[k] = v
      }
      features.push({ type: 'Feature' as const, geometry, properties: props })
      if (features.length % 100_000 === 0) {
        yield `  Streaming features: ${features.length.toLocaleString()} loaded…`
      }
    } catch { skipped++ }
  }

  // Clean up temp file
  await unlink(ndjson).catch(() => null)

  if (features.length === 0) throw new Error('No valid features could be parsed from parquet')
  if (skipped > 0) yield `⚠ Skipped ${skipped} rows with missing/invalid geometry`
  yield `Loaded ${features.length.toLocaleString()} features for tiling`

  // ── Step 5: write temp GeoJSON for tippecanoe ─────────────────────────────
  const tempGeoJson = path.join(dir, '_tc_input.geojson')
  yield `  Writing ${features.length.toLocaleString()} features to temp GeoJSON…`
  await writeFile(tempGeoJson, JSON.stringify({ type: 'FeatureCollection', features }))

  // ── Step 6+7: tile + write PMTiles via tippecanoe ─────────────────────────
  // tippecanoe generates spec-compliant PMTiles v3 with gzip-compressed
  // directories and tiles — compatible with all viewers (pmtiles.io, QGIS, MapLibre).
  yield `Running tippecanoe (z0–z${maxZoom})…`

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('/usr/local/bin/tippecanoe', [
      '-o', pmtiles,
      `-Z0`, `-z${maxZoom}`,
      '-l', name,           // MVT source-layer name = dataset name
      '-f',                 // force overwrite
      '-pf',                // no per-tile feature limit
      '-pk',                // no tile size limit
      '--no-tile-stats',    // skip per-layer stats (speeds up generation)
      tempGeoJson,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })

    const errLines: string[] = []
    proc.stderr?.on('data', (chunk: Buffer) => {
      // tippecanoe progress goes to stderr; collect last few lines for error reporting
      const lines = chunk.toString().split('\n').filter(Boolean)
      errLines.push(...lines)
      if (errLines.length > 20) errLines.splice(0, errLines.length - 20)
    })

    proc.on('close', code => {
      if (code === 0) return resolve()
      reject(new Error(`tippecanoe failed (exit ${code}): ${errLines.slice(-5).join(' | ')}`))
    })
    proc.on('error', reject)
  })

  await unlink(tempGeoJson).catch(() => null)

  // Read tile count from PMTiles v3 header (byte 64 = num_addressed_tiles)
  const pmFd = await open(pmtiles, 'r')
  const hdrBuf = Buffer.alloc(72)
  await pmFd.read(hdrBuf, 0, 72, 0)
  await pmFd.close()
  const tileCount = Number(hdrBuf.readBigUInt64LE(64))

  yield `  PMTiles generated — ${tileCount.toLocaleString()} tiles (z0–z${maxZoom})`

  const bounds: [number, number, number, number] = [xmin, ymin, xmax, ymax]
  const centerZoom = Math.min(maxZoom, Math.max(2, Math.round(maxZoom / 2)))
  const center: [number, number, number] = [(xmin + xmax) / 2, (ymin + ymax) / 2, centerZoom]

  yield `PMTiles saved → ${path.relative(process.cwd(), pmtiles)}`

  // ── Step 8: STAC item.json ────────────────────────────────────────────────
  const item = {
    type:          'Feature',
    stac_version:  '1.0.0',
    id:            name,
    geometry: {
      type: 'Polygon',
      coordinates: [[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax],[xmin,ymin]]],
    },
    bbox: bounds,
    properties: {
      datetime:             new Date().toISOString(),
      'streamgl:name':      name,
      'streamgl:minzoom':   0,
      'streamgl:maxzoom':   maxZoom,
      'streamgl:features':  featureCount,
      'streamgl:tiles':     tileCount,
    },
    assets: {
      parquet: { href: `/api/stac/${name}/data.parquet`, type: 'application/x-parquet',         title: 'GeoParquet' },
      pmtiles: { href: `/api/stac/${name}/data.pmtiles`, type: 'application/vnd.pmtiles',        title: 'PMTiles' },
      viewer:  { href: `/api/stac/${name}/viewer`,       type: 'text/html',                       title: 'HTML Viewer' },
      tiles:   { href: `/api/xyz/${name}/{z}/{x}/{y}`,   type: 'application/vnd.mapbox-vector-tile', roles: ['tiles'], title: 'XYZ Tiles' },
    },
    links: [
      { rel: 'self',   href: './item.json',     type: 'application/json' },
      { rel: 'root',   href: '../catalog.json', type: 'application/json' },
      { rel: 'parent', href: '../catalog.json', type: 'application/json' },
    ],
  }

  await writeFile(itemPath, JSON.stringify(item, null, 2))
  yield `STAC item saved → ${path.relative(process.cwd(), itemPath)}`

  // ── Step 9: STAC catalog.json ─────────────────────────────────────────────
  const catalogPath = await updateCatalog(name)
  yield `STAC catalog updated → ${path.relative(process.cwd(), catalogPath)}`

  // ── Step 10: standalone HTML viewer ───────────────────────────────────────
  await writeFile(viewerPath, buildViewerHtml(name, featureCount, bounds))
  yield `HTML viewer saved → ${path.relative(process.cwd(), viewerPath)}`

  yield `Pipeline complete!`

  return {
    name,
    parquet,
    pmtiles,
    stacItem:    itemPath,
    stacCatalog: catalogPath,
    viewerHtml:  viewerPath,
    bounds,
    center,
    tileCount,
    featureCount,
  }
}
