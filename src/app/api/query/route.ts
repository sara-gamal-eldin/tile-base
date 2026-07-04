/**
 * /api/query
 *
 * Server-Sent Events stream of GeoJSON features from an arbitrary
 * DuckDB Spatial SQL query.
 *
 * Used by the "Run Query" button in the UI to stream features directly
 * onto the map as they arrive from DuckDB — without tile coordinates.
 * Good for exploratory queries on small-medium datasets (< 500k features).
 *
 * For large datasets at multiple zoom levels, use /api/tiles instead.
 *
 * Request:
 *   POST /api/query
 *   Body: { sql: string }
 *
 * Response: text/event-stream
 *   data: <GeoJSON Feature JSON>\n\n  (one per row)
 *   event: done\n data: {"count": N, "ms": N}\n\n
 *   event: error\n data: {"message": "..."}\n\n
 */

import { NextRequest } from 'next/server'
import { streamQueryAsGeoJSON } from '@/lib/duckdb'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const sql  = body?.sql as string | undefined

  if (!sql?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Missing sql in request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${data}\n\n`)
        )
      }

      const start = Date.now()
      let count = 0

      try {
        for await (const featureJson of streamQueryAsGeoJSON(sql)) {
          controller.enqueue(encoder.encode(`data: ${featureJson}\n\n`))
          count++
        }

        send('done', JSON.stringify({ count, ms: Date.now() - start }))
      } catch (err) {
        send('error', JSON.stringify({ message: String(err) }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
