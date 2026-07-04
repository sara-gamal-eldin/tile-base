/**
 * GET /api/basemap/[z]/[x]/[y]?datasets=layer1,layer2
 *
 * Merged MVT endpoint — reads tiles from each listed dataset's PMTiles file
 * and concatenates the raw protobuf bytes. Valid because MVT layers are
 * repeated proto messages at field 3; protobuf concatenation is well-defined.
 */
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'
import { readTile } from '@/lib/pmtiles-reader'

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

  const datasetsParam = new URL(req.url).searchParams.get('datasets') ?? ''
  const datasets = datasetsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (datasets.length === 0) {
    return new NextResponse('Missing ?datasets= parameter', { status: 400 })
  }

  const parts: Buffer[] = []

  await Promise.all(
    datasets.map(async (name) => {
      const filePath = path.join(DATA_DIR, name, 'data.pmtiles')
      try {
        const tile = await readTile(filePath, z, x, y)
        if (tile) parts.push(tile)
      } catch { /* skip missing datasets */ }
    })
  )

  if (parts.length === 0) {
    return new NextResponse(null, { status: 204, headers: corsHeaders() })
  }

  const merged = parts.length === 1 ? parts[0] : Buffer.concat(parts)

  return new NextResponse(new Uint8Array(merged), {
    status: 200,
    headers: {
      'Content-Type': 'application/x-protobuf',
      ...corsHeaders(),
    },
  })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control':                'public, max-age=3600',
  }
}
