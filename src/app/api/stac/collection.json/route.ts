/**
 * GET /api/stac/collection.json?datasets=layer1,layer2
 *
 * Returns a STAC Collection representing the merged basemap.
 * Includes combined XYZ tile URL and individual PMTiles assets.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const datasetsParam = url.searchParams.get('datasets') ?? ''
  const datasets = datasetsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (datasets.length === 0) {
    return new NextResponse('Missing ?datasets= parameter', { status: 400 })
  }

  const origin = `${url.protocol}//${url.host}`

  // Read each layer's STAC item
  interface StacItem {
    bbox?: number[]
    properties?: Record<string, unknown>
  }

  const items: (StacItem | null)[] = await Promise.all(
    datasets.map(async (name) => {
      try {
        return JSON.parse(await readFile(path.join(DATA_DIR, name, 'item.json'), 'utf8')) as StacItem
      } catch { return null }
    })
  )
  const validItems = items.filter((i): i is StacItem => i !== null)

  // Merged extent from all layers
  const bboxes = validItems.map(i => i.bbox ?? [-180, -90, 180, 90]) as number[][]
  const mergedBbox = [
    Math.min(...bboxes.map(b => b[0])),
    Math.min(...bboxes.map(b => b[1])),
    Math.max(...bboxes.map(b => b[2])),
    Math.max(...bboxes.map(b => b[3])),
  ]

  const totalFeatures = validItems.reduce((s, i) => s + Number(i.properties?.['streamgl:features'] ?? 0), 0)
  const totalTiles    = validItems.reduce((s, i) => s + Number(i.properties?.['streamgl:tiles'] ?? 0), 0)

  const now = new Date().toISOString()

  const collection = {
    type:         'Collection',
    id:           `geoforge-basemap-${datasets.join('-')}`,
    stac_version: '1.0.0',
    title:        `TileBase Basemap — ${datasets.join(', ')}`,
    description:  `Merged basemap with ${datasets.length} layer(s): ${datasets.join(', ')}`,
    extent: {
      spatial:  { bbox: [mergedBbox] },
      temporal: { interval: [[now, null]] },
    },
    license: 'proprietary',
    links: [
      { rel: 'self',     href: `${origin}/api/stac/collection.json?datasets=${datasets.join(',')}`, type: 'application/json' },
      { rel: 'root',     href: `${origin}/api/stac/catalog.json`,                                    type: 'application/json' },
      { rel: 'tilejson', href: `${origin}/api/basemap/tilejson.json?datasets=${datasets.join(',')}`, type: 'application/json', title: 'TileJSON' },
    ],
    assets: {
      basemap_tiles: {
        href:  `${origin}/api/basemap/{z}/{x}/{y}?datasets=${datasets.join(',')}`,
        type:  'application/vnd.mapbox-vector-tile',
        title: 'Merged Basemap XYZ Tiles',
        roles: ['tiles'],
      },
      tilejson: {
        href:  `${origin}/api/basemap/tilejson.json?datasets=${datasets.join(',')}`,
        type:  'application/json',
        title: 'TileJSON Descriptor',
        roles: ['metadata'],
      },
      ...Object.fromEntries(
        datasets.map(name => [
          `pmtiles_${name}`,
          {
            href:  `${origin}/api/stac/${name}/data.pmtiles`,
            type:  'application/vnd.pmtiles',
            title: `${name} — PMTiles`,
            roles: ['data'],
          },
        ])
      ),
    },
    properties: {
      'geoforge:layers':   datasets,
      'geoforge:features': totalFeatures,
      'geoforge:tiles':    totalTiles,
      datetime:            now,
    },
    summaries: {
      layers: datasets,
    },
  }

  return NextResponse.json(collection, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  })
}
