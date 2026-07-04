/**
 * POST /api/r2/publish
 * Body: { datasets: string[] }
 *
 * Publishes a Radiant Earth STAC-Browser-compatible catalog to Cloudflare R2.
 *
 * STAC hierarchy (all links are absolute R2 public URLs):
 *
 *   tilebase/catalog.json            ← root Catalog
 *     └── child → collection.json   ← Collection (one per publish)
 *           └── item → {name}/item.json  ← Item per dataset
 *
 * R2 layout:
 *   tilebase/catalog.json
 *   tilebase/collection.json
 *   tilebase/{name}/item.json
 *   tilebase/{name}/data.pmtiles
 *   tilebase/{name}/data.parquet    (if present)
 *   tilebase/style.json             ← MapLibre GL style (PMTiles sources)
 *
 * Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

const R2_BUCKET = 'streamgl'
const R2_PUBLIC = 'https://pub-bb20ce11def241fda9bd57de004f9be3.r2.dev'
const R2_PREFIX = 'tilebase'

const LAYER_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16']

export async function POST(req: NextRequest) {
  const { datasets } = (await req.json()) as { datasets: string[] }

  if (!datasets?.length) {
    return NextResponse.json({ error: 'Missing datasets array' }, { status: 400 })
  }

  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(
    k => !process.env[k]
  )
  if (missing.length) {
    return NextResponse.json({ error: `Missing env vars: ${missing.join(', ')}` }, { status: 503 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { S3Client, PutObjectCommand, PutBucketCorsCommand } = await import('@aws-sdk/client-s3' as never as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = new (S3Client as any)({
      region:   'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })

    // CORS — allow Radiant Earth STAC Browser + pmtiles.io + any origin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await r2.send(new (PutBucketCorsCommand as any)({
      Bucket: R2_BUCKET,
      CORSConfiguration: {
        CORSRules: [{
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders:  ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag'],
          MaxAgeSeconds:  86400,
        }],
      },
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const put = async (key: string, body: Buffer | string, contentType: string) =>
      r2.send(new (PutObjectCommand as any)({
        Bucket:       R2_BUCKET,
        Key:          key,
        Body:         typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
        ContentType:  contentType,
        CacheControl: 'public, max-age=3600',
      }))

    // ── Absolute URLs ─────────────────────────────────────────────────────────
    const now           = new Date().toISOString()
    const catalogKey    = `${R2_PREFIX}/catalog.json`
    const collectionKey = `${R2_PREFIX}/collection.json`
    const catalogUrl    = `${R2_PUBLIC}/${catalogKey}`
    const collectionUrl = `${R2_PUBLIC}/${collectionKey}`
    const collectionId  = 'tilebase-basemap'

    const uploaded: string[] = []

    // ── Per-dataset: upload PMTiles + GeoParquet + STAC item.json ────────────
    interface LocalItem {
      bbox?:       number[]
      geometry?:   unknown
      properties?: Record<string, unknown>
    }

    const publishedItems: Array<{
      name:     string
      itemUrl:  string
      pmUrl:    string
      parquetUrl: string | null
      bbox:     number[]
      props:    Record<string, unknown>
    }> = []

    for (const name of datasets) {
      const dir     = path.join(DATA_DIR, name)
      const pmKey   = `${R2_PREFIX}/${name}/data.pmtiles`
      const pqKey   = `${R2_PREFIX}/${name}/data.parquet`
      const itemKey = `${R2_PREFIX}/${name}/item.json`
      const pmUrl   = `${R2_PUBLIC}/${pmKey}`
      const pqUrl   = `${R2_PUBLIC}/${pqKey}`
      const itemUrl = `${R2_PUBLIC}/${itemKey}`

      // PMTiles
      let pmUploaded = false
      try {
        const buf = await readFile(path.join(dir, 'data.pmtiles'))
        await put(pmKey, buf, 'application/vnd.pmtiles')
        uploaded.push(pmUrl)
        pmUploaded = true
      } catch { /* not yet processed */ }

      // GeoParquet (optional — upload if present)
      let parquetUploaded = false
      try {
        await stat(path.join(dir, 'data.parquet'))
        const buf = await readFile(path.join(dir, 'data.parquet'))
        await put(pqKey, buf, 'application/x-parquet')
        uploaded.push(pqUrl)
        parquetUploaded = true
      } catch { /* not present */ }

      // STAC item.json — spec-compliant with absolute URLs
      try {
        const local = JSON.parse(
          await readFile(path.join(dir, 'item.json'), 'utf8')
        ) as LocalItem

        const props = local.properties ?? {}
        const maxzoom = Number(props['streamgl:maxzoom'] ?? 14)
        const minzoom = Number(props['streamgl:minzoom'] ?? 0)

        // Build assets — only include what actually got uploaded
        const assets: Record<string, object> = {}
        if (pmUploaded) {
          assets['pmtiles'] = {
            href:  pmUrl,
            type:  'application/vnd.pmtiles',
            title: `${name} — Vector tiles (PMTiles)`,
            roles: ['data'],
            'tilebase:minzoom': minzoom,
            'tilebase:maxzoom': maxzoom,
          }
        }
        if (parquetUploaded) {
          assets['geoparquet'] = {
            href:  pqUrl,
            type:  'application/x-parquet',
            title: `${name} — GeoParquet`,
            roles: ['data'],
          }
        }

        const item = {
          type:            'Feature',
          stac_version:    '1.0.0',
          stac_extensions: [],
          id:              name,
          collection:      collectionId,
          bbox:            local.bbox ?? [-180, -90, 180, 90],
          geometry:        local.geometry,
          properties: {
            datetime:              now,
            title:                 name,
            'tilebase:minzoom':    minzoom,
            'tilebase:maxzoom':    maxzoom,
            'tilebase:features':   Number(props['streamgl:features'] ?? 0),
            'tilebase:tiles':      Number(props['streamgl:tiles']    ?? 0),
          },
          links: [
            { rel: 'self',       href: itemUrl,       type: 'application/json' },
            { rel: 'root',       href: catalogUrl,    type: 'application/json', title: 'TileBase Catalog' },
            { rel: 'parent',     href: collectionUrl, type: 'application/json', title: 'TileBase Basemap' },
            { rel: 'collection', href: collectionUrl, type: 'application/json', title: 'TileBase Basemap' },
          ],
          assets,
        }

        await put(itemKey, JSON.stringify(item, null, 2), 'application/json')
        uploaded.push(itemUrl)

        publishedItems.push({
          name,
          itemUrl,
          pmUrl,
          parquetUrl: parquetUploaded ? pqUrl : null,
          bbox:       item.bbox,
          props:      item.properties,
        })
      } catch { /* skip item if local data missing */ }
    }

    // ── STAC Collection ───────────────────────────────────────────────────────
    const bboxes = publishedItems.map(i => i.bbox)
    const mergedBbox = bboxes.length === 0 ? [-180, -90, 180, 90] : [
      Math.min(...bboxes.map(b => b[0])),
      Math.min(...bboxes.map(b => b[1])),
      Math.max(...bboxes.map(b => b[2])),
      Math.max(...bboxes.map(b => b[3])),
    ]
    const totalFeatures = publishedItems.reduce((s, i) => s + Number(i.props['tilebase:features'] ?? 0), 0)
    const totalTiles    = publishedItems.reduce((s, i) => s + Number(i.props['tilebase:tiles']    ?? 0), 0)

    // Collection assets: one PMTiles entry per dataset + style.json
    const collectionAssets: Record<string, object> = {}
    for (const pi of publishedItems) {
      collectionAssets[`pmtiles-${pi.name}`] = {
        href:  pi.pmUrl,
        type:  'application/vnd.pmtiles',
        title: `${pi.name} — Vector tiles (PMTiles)`,
        roles: ['data'],
      }
      if (pi.parquetUrl) {
        collectionAssets[`geoparquet-${pi.name}`] = {
          href:  pi.parquetUrl,
          type:  'application/x-parquet',
          title: `${pi.name} — GeoParquet`,
          roles: ['data'],
        }
      }
    }
    collectionAssets['style'] = {
      href:  `${R2_PUBLIC}/${R2_PREFIX}/style.json`,
      type:  'application/json',
      title: 'MapLibre GL Style',
      roles: ['overview'],
    }

    const collection = {
      type:            'Collection',
      id:              collectionId,
      stac_version:    '1.0.0',
      stac_extensions: [],
      title:           'TileBase Basemap',
      description:     `Vector tile basemap with ${publishedItems.length} layer${publishedItems.length !== 1 ? 's' : ''}: ${datasets.join(', ')}. Generated by Geosolvix TileBase.`,
      extent: {
        spatial:  { bbox: [mergedBbox] },
        temporal: { interval: [[now, null]] },
      },
      license:  'proprietary',
      keywords: datasets,
      summaries: {
        'tilebase:layers':   datasets,
        'tilebase:features': totalFeatures,
        'tilebase:tiles':    totalTiles,
      },
      links: [
        { rel: 'self',   href: collectionUrl, type: 'application/json', title: 'TileBase Basemap' },
        { rel: 'root',   href: catalogUrl,    type: 'application/json', title: 'TileBase Catalog' },
        { rel: 'parent', href: catalogUrl,    type: 'application/json', title: 'TileBase Catalog' },
        ...publishedItems.map(i => ({
          rel:   'item',
          href:  i.itemUrl,
          type:  'application/json',
          title: i.name,
        })),
      ],
      assets: collectionAssets,
    }

    await put(collectionKey, JSON.stringify(collection, null, 2), 'application/json')
    uploaded.push(collectionUrl)

    // ── Root STAC Catalog ─────────────────────────────────────────────────────
    // Catalog links only to child collections — items are NOT listed here.
    // This matches the Radiant Earth traversal pattern: catalog → collection → items.
    const catalog = {
      type:         'Catalog',
      id:           'tilebase',
      stac_version: '1.0.0',
      title:        'TileBase',
      description:  'Vector tile datasets published by Geosolvix TileBase.',
      links: [
        { rel: 'self',   href: catalogUrl,    type: 'application/json', title: 'TileBase Catalog' },
        { rel: 'root',   href: catalogUrl,    type: 'application/json', title: 'TileBase Catalog' },
        { rel: 'child',  href: collectionUrl, type: 'application/json', title: 'TileBase Basemap' },
      ],
    }

    await put(catalogKey, JSON.stringify(catalog, null, 2), 'application/json')
    uploaded.push(catalogUrl)

    // ── MapLibre GL style.json ────────────────────────────────────────────────
    const styleKey = `${R2_PREFIX}/style.json`
    const styleUrl = `${R2_PUBLIC}/${styleKey}`

    const styleSources: Record<string, object> = {}
    for (const pi of publishedItems) {
      styleSources[pi.name] = {
        type:    'vector',
        url:     `pmtiles://${pi.pmUrl}`,
        minzoom: Number(pi.props['tilebase:minzoom'] ?? 0),
        maxzoom: Number(pi.props['tilebase:maxzoom'] ?? 14),
      }
    }

    const mapLayers: object[] = []
    datasets.forEach((name, i) => {
      const color = LAYER_COLORS[i % LAYER_COLORS.length]
      mapLayers.push(
        { id: `${name}-fill`,    type: 'fill',   source: name, 'source-layer': name,
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint:  { 'fill-color': color, 'fill-opacity': 0.35 } },
        { id: `${name}-outline`, type: 'line',   source: name, 'source-layer': name,
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint:  { 'line-color': color, 'line-width': 1.5, 'line-opacity': 0.9 } },
        { id: `${name}-line`,    type: 'line',   source: name, 'source-layer': name,
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
          paint:  { 'line-color': color, 'line-width': 1.8 } },
        { id: `${name}-circle`,  type: 'circle', source: name, 'source-layer': name,
          filter: ['==', ['geometry-type'], 'Point'],
          paint:  { 'circle-color': color, 'circle-radius': 5,
                    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } },
      )
    })

    const glStyle = {
      version: 8,
      name:    `TileBase — ${datasets.join(', ')}`,
      glyphs:  'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sprite:  'https://openmaptiles.github.io/osm-bright-gl-style/sprite',
      sources: styleSources,
      layers:  mapLayers,
    }

    await put(styleKey, JSON.stringify(glStyle, null, 2), 'application/json')
    uploaded.push(styleUrl)

    const stacBrowserUrl =
      `https://radiantearth.github.io/stac-browser/#/external/${encodeURIComponent(catalogUrl)}`

    return NextResponse.json({
      success:        true,
      uploaded,
      catalogUrl,
      collectionUrl,
      styleUrl,
      stacBrowserUrl,
    })
  } catch (err: unknown) {
    const msg = String(err)
    if (msg.includes("Cannot find module '@aws-sdk/client-s3'")) {
      return NextResponse.json({ error: 'Run: npm install @aws-sdk/client-s3' }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
