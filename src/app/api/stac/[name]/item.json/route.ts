/**
 * GET /api/stac/[name]/item.json
 *
 * Serves a STAC item with all relative hrefs rewritten to absolute URLs
 * so radiantearth STAC Browser can traverse them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

type Params = { name: string }

interface StacLink {
  rel:   string
  href:  string
  type?: string
  title?: string
}

interface StacAsset {
  href:  string
  [key: string]: unknown
}

interface StacItem {
  links?:  StacLink[]
  assets?: Record<string, StacAsset>
  [key: string]: unknown
}

function resolveHref(href: string, base: string, catalogBase: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('../')) return `${catalogBase}/${href.slice(3)}`
  if (href.startsWith('./'))  return `${base}/${href.slice(2)}`
  if (href.startsWith('/'))   return href  // already absolute path
  return `${base}/${href}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { name } = await params
  const url         = new URL(req.url)
  const origin      = `${url.protocol}//${url.host}`
  const base        = `${origin}/api/stac/${name}`
  const catalogBase = `${origin}/api/stac`

  try {
    const item = JSON.parse(
      await readFile(path.join(DATA_DIR, name, 'item.json'), 'utf8')
    ) as StacItem

    // Rewrite links
    if (item.links) {
      item.links = item.links.map(l => ({
        ...l,
        href: resolveHref(l.href, base, catalogBase),
      }))
    }

    // Rewrite asset hrefs (relative /api/... paths → absolute)
    if (item.assets) {
      for (const key of Object.keys(item.assets)) {
        const a = item.assets[key]
        if (a.href && !a.href.startsWith('http')) {
          a.href = `${origin}${a.href}`
        }
      }
    }

    return new NextResponse(JSON.stringify(item, null, 2), {
      headers: {
        'Content-Type':                 'application/json',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control':                'no-cache',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Item not found' },
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
