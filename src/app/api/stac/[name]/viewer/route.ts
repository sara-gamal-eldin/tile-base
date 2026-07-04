/**
 * GET /api/stac/[name]/viewer
 * Serves the standalone HTML viewer for a processed dataset.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

type Params = { name: string }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name } = await params
  const viewerPath = path.join(DATA_DIR, name, 'viewer.html')

  try {
    const html = await readFile(viewerPath, 'utf8')
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    return new NextResponse('Viewer not found — process the dataset first', { status: 404 })
  }
}
