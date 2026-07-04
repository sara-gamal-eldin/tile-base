/**
 * GET /api/stac/[name]/data.parquet
 *
 * Serves the GeoParquet file for download.
 */
import { NextRequest, NextResponse } from 'next/server'
import { open, stat } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

type Params = { name: string }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name } = await params
  const filePath = path.join(DATA_DIR, name, 'data.parquet')

  let fileSize: number
  try {
    fileSize = (await stat(filePath)).size
  } catch {
    return NextResponse.json({ error: 'GeoParquet not found' }, { status: 404 })
  }

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
      'Content-Type':        'application/x-parquet',
      'Content-Length':      String(fileSize),
      'Content-Disposition': `attachment; filename="${name}.parquet"`,
      'Cache-Control':       'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
