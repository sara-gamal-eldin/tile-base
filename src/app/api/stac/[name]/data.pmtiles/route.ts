/**
 * GET /api/stac/[name]/data.pmtiles
 *
 * Serves a PMTiles file with full HTTP byte-range support.
 * pmtiles.io and MapLibre PMTiles plugin require:
 *   - Accept-Ranges: bytes header
 *   - Content-Length header
 *   - 206 Partial Content responses for Range requests
 */
import { NextRequest, NextResponse } from 'next/server'
import { open, stat } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

type Params = { name: string }

const cors = {
  'Access-Control-Allow-Origin':   '*',
  'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':  'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors })
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name } = await params
  try {
    const { size } = await stat(path.join(DATA_DIR, name, 'data.pmtiles'))
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type':   'application/vnd.pmtiles',
        'Content-Length': String(size),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name } = await params
  const filePath  = path.join(DATA_DIR, name, 'data.pmtiles')

  let fileSize: number
  try {
    fileSize = (await stat(filePath)).size
  } catch {
    return NextResponse.json({ error: 'PMTiles not found' }, { status: 404 })
  }

  const base = {
    ...cors,
    'Content-Type':  'application/vnd.pmtiles',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
  }

  const rangeHeader = req.headers.get('range')

  if (rangeHeader) {
    // Parse "bytes=start-end"
    const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!m) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }
    const start      = parseInt(m[1], 10)
    const end        = m[2] ? Math.min(parseInt(m[2], 10), fileSize - 1) : fileSize - 1
    const chunkSize  = end - start + 1

    if (start > end || start >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      })
    }

    const fd  = await open(filePath, 'r')
    const buf = Buffer.alloc(chunkSize)
    try {
      await fd.read(buf, 0, chunkSize, start)
    } finally {
      await fd.close()
    }

    return new NextResponse(new Uint8Array(buf), {
      status: 206,
      headers: {
        ...base,
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(chunkSize),
      },
    })
  }

  // No Range header — full file
  const fd  = await open(filePath, 'r')
  const buf = Buffer.alloc(fileSize)
  try {
    await fd.read(buf, 0, fileSize, 0)
  } finally {
    await fd.close()
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      ...base,
      'Content-Length':      String(fileSize),
      'Content-Disposition': `attachment; filename="${name}.pmtiles"`,
    },
  })
}
