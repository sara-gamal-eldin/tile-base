/**
 * GET /api/xyz/[name]/[z]/[x]/[y]
 * Serves individual MVT tiles from a local PMTiles file.
 */
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'
import { readTile } from '@/lib/pmtiles-reader'

type Params = { name: string; z: string; x: string; y: string }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name, z: zStr, x: xStr, y: yStr } = await params
  const z = parseInt(zStr, 10)
  const x = parseInt(xStr, 10)
  const y = parseInt(yStr, 10)

  if ([z, x, y].some(n => isNaN(n))) {
    return new NextResponse('Invalid tile coordinates', { status: 400 })
  }

  const filePath = path.join(DATA_DIR, name, 'data.pmtiles')

  try {
    const tile = await readTile(filePath, z, x, y)

    if (!tile) {
      return new NextResponse(null, { status: 204, headers: corsHeaders() })
    }

    return new NextResponse(new Uint8Array(tile), {
      status: 200,
      headers: {
        'Content-Type': 'application/x-protobuf',
        ...corsHeaders(),
      },
    })
  } catch (err: unknown) {
    const msg = String(err)
    if (msg.includes('ENOENT') || msg.includes('no such file')) {
      return new NextResponse('Dataset not found', { status: 404 })
    }
    console.error(`Tile ${name}/${z}/${x}/${y} error:`, err)
    return new NextResponse(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control':                'public, max-age=3600',
  }
}
