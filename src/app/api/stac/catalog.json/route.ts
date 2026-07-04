/**
 * GET /api/stac/catalog.json?datasets=name1,name2
 *
 * Serves the root STAC catalog. If ?datasets= is provided, only item links
 * for those datasets are included. All relative hrefs are rewritten to absolute
 * URLs so radiantearth STAC Browser can traverse them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

interface StacLink {
  rel:    string
  href:   string
  type?:  string
  title?: string
}

interface StacCatalog {
  id?:    string
  title?: string
  links?: StacLink[]
  [key: string]: unknown
}

function resolveHref(href: string, base: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('../')) return `${base}/${href.slice(3)}`
  if (href.startsWith('./'))  return `${base}/${href.slice(2)}`
  return `${base}/${href}`
}

export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const origin   = `${url.protocol}//${url.host}`
  const base     = `${origin}/api/stac`
  const datasets = url.searchParams.get('datasets')?.split(',').map(s => s.trim()).filter(Boolean) ?? []

  try {
    const catalog = JSON.parse(
      await readFile(path.join(DATA_DIR, 'catalog.json'), 'utf8')
    ) as StacCatalog

    // Normalise id and title
    catalog.id    = 'tilebase'
    catalog.title = 'TileBase'

    if (catalog.links) {
      // Filter item links to only the requested datasets (if specified)
      catalog.links = catalog.links
        .filter(l => {
          if (l.rel !== 'item') return true   // keep non-item links
          if (datasets.length === 0) return true  // no filter → keep all
          return datasets.includes(l.title ?? '')
        })
        .map(l => ({ ...l, href: resolveHref(l.href, base) }))
    }

    return new NextResponse(JSON.stringify(catalog, null, 2), {
      headers: {
        'Content-Type':                 'application/json',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control':                'no-cache',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'No catalog found. Process a dataset first.' },
      { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
