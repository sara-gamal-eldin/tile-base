/**
 * /api/tiles/[z]/[x]/[y]
 *
 * On-demand MVT (Mapbox Vector Tile) endpoint.
 *
 * Flow per request:
 *   1. Parse tile coordinates → compute WGS84 bbox
 *   2. Query DuckDB Spatial — only rows that intersect the bbox are returned
 *   3. Encode result as MVT using geojson-vt + vt-pbf
 *   4. Return binary protobuf with correct Content-Type
 *
 * MapLibre GL points its vector source at this endpoint and requests tiles
 * as the user pans/zooms. Zero pre-processing happens anywhere.
 */

import { NextRequest, NextResponse } from 'next/server'
import { tileToBBox } from '@/lib/tile-math'
import { queryTile } from '@/lib/duckdb'
import geojsonVt from 'geojson-vt'
import vtpbf from 'vt-pbf'

type Params = { z: string; x: string; y: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { z: zStr, x: xStr, y: yStr } = await params
  const z = parseInt(zStr, 10)
  const x = parseInt(xStr, 10)
  const y = parseInt(yStr, 10)

  if ([z, x, y].some(n => isNaN(n))) {
    return new NextResponse('Invalid tile coordinates', { status: 400 })
  }

  // Read query config from URL search params
  const url       = new URL(req.url)
  const source    = url.searchParams.get('source')
  const geomCol   = url.searchParams.get('geomCol')  ?? 'geom'
  const propsRaw  = url.searchParams.get('properties') ?? ''
  const properties = propsRaw ? propsRaw.split(',').map(p => p.trim()) : []

  if (!source) {
    return new NextResponse('Missing ?source= parameter', { status: 400 })
  }

  const bbox = tileToBBox(z, x, y)

  try {
    const start = Date.now()

    const rows = await queryTile({
      source,
      geomCol,
      properties,
      ...bbox,
    })

    if (rows.length === 0) {
      // No features — return empty tile (204)
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
      })
    }

    // Build a GeoJSON FeatureCollection from DuckDB rows
    const features: GeoJSON.Feature[] = rows
      .flatMap(row => {
        try {
          return [{
            type: 'Feature' as const,
            geometry: JSON.parse(row.geojson) as GeoJSON.Geometry,
            properties: row.properties,
          }]
        } catch {
          return []
        }
      })

    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    }

    // Slice into tile using geojson-vt
    const tileIndex = geojsonVt(collection, {
      maxZoom: 22,
      tolerance: 3,
      extent: 4096,
      buffer: 64,
      indexMaxZoom: z,
      indexMaxPoints: 0,
    })

    const tile = tileIndex.getTile(z, x, y)

    if (!tile) {
      return new NextResponse(null, { status: 204, headers: corsHeaders() })
    }

    // Encode as binary MVT protobuf
    const buffer = Buffer.from(
      vtpbf.fromGeojsonVt({ streamgl: tile }, { version: 2 })
    )

    const elapsed = Date.now() - start

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-protobuf',
        'X-Tile-Features': String(features.length),
        'X-Tile-Ms': String(elapsed),
        ...corsHeaders(),
      },
    })
  } catch (err) {
    console.error(`Tile ${z}/${x}/${y} error:`, err)
    return new NextResponse(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control': 'public, max-age=60',
  }
}
