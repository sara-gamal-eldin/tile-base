/**
 * GET /api/basemap/style.json?datasets=layer1,layer2[&r2=true]
 *
 * Returns a MapLibre GL style JSON.
 *   ?r2=true  → uses individual R2 PMTiles sources (pmtiles:// protocol)
 *   default   → uses the local merged XYZ endpoint
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

const R2_PUBLIC = 'https://pub-bb20ce11def241fda9bd57de004f9be3.r2.dev'

const LAYER_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
]

export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const origin   = `${url.protocol}//${url.host}`
  const datasets = url.searchParams.get('datasets')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const useR2    = url.searchParams.get('r2') === 'true'

  if (datasets.length === 0) {
    return new NextResponse('Missing ?datasets= parameter', { status: 400 })
  }

  // Read per-layer meta (best-effort)
  interface LayerMeta { minzoom?: number; maxzoom?: number }
  const metas: Record<string, LayerMeta> = {}
  await Promise.all(datasets.map(async name => {
    try {
      const item = JSON.parse(await readFile(path.join(DATA_DIR, name, 'item.json'), 'utf8')) as {
        properties?: Record<string, unknown>
      }
      metas[name] = {
        minzoom: Number(item.properties?.['streamgl:minzoom'] ?? 0),
        maxzoom: Number(item.properties?.['streamgl:maxzoom'] ?? 14),
      }
    } catch {
      metas[name] = { minzoom: 0, maxzoom: 14 }
    }
  }))

  // Build sources
  const sources: Record<string, object> = {}
  if (useR2) {
    for (const name of datasets) {
      sources[name] = {
        type:    'vector',
        url:     `pmtiles://${R2_PUBLIC}/tilebase/${name}/data.pmtiles`,
        minzoom: metas[name].minzoom,
        maxzoom: metas[name].maxzoom,
      }
    }
  } else {
    sources['basemap'] = {
      type:    'vector',
      tiles:   [`${origin}/api/basemap/{z}/{x}/{y}?datasets=${datasets.join(',')}`],
      minzoom: 0,
      maxzoom: Math.max(...datasets.map(n => metas[n].maxzoom ?? 14)),
    }
  }

  // Build layers
  const mapLayers: object[] = []
  datasets.forEach((name, i) => {
    const color = LAYER_COLORS[i % LAYER_COLORS.length]
    const src   = useR2 ? name : 'basemap'
    mapLayers.push(
      {
        id: `${name}-fill`, type: 'fill', source: src, 'source-layer': name,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint:  { 'fill-color': color, 'fill-opacity': 0.35 },
      },
      {
        id: `${name}-outline`, type: 'line', source: src, 'source-layer': name,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint:  { 'line-color': color, 'line-width': 1.5, 'line-opacity': 0.9 },
      },
      {
        id: `${name}-line`, type: 'line', source: src, 'source-layer': name,
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        paint:  { 'line-color': color, 'line-width': 1.8 },
      },
      {
        id: `${name}-circle`, type: 'circle', source: src, 'source-layer': name,
        filter: ['==', ['geometry-type'], 'Point'],
        paint:  {
          'circle-color': color, 'circle-radius': 5,
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
        },
      },
    )
  })

  const style = {
    version:  8,
    name:     `TileBase — ${datasets.join(', ')}`,
    glyphs:   'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sprite:   'https://openmaptiles.github.io/osm-bright-gl-style/sprite',
    sources,
    layers:   mapLayers,
  }

  return NextResponse.json(style, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Content-Disposition':          'attachment; filename="tilebase-style.json"',
      'Cache-Control':                'no-cache',
    },
  })
}
