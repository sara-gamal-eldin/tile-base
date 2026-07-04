/**
 * POST /api/ingest
 * Body: { url: string, name: string, maxZoom?: number }
 *
 * Runs the full ingestion pipeline and streams progress as SSE:
 *   event: progress  data: "step message"
 *   event: done      data: JSON PipelineResult
 *   event: error     data: { message: string }
 */

import { NextRequest } from 'next/server'
import { runPipeline } from '@/lib/pipeline'
import { resetConnection } from '@/lib/duckdb'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.json() as { url?: string; name?: string; maxZoom?: number }

  if (!body.url || !body.name) {
    return new Response(JSON.stringify({ error: 'Missing url or name' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { url, name, maxZoom = 12 } = body

  const stream = new ReadableStream({
    async start(controller) {
      const enc = (event: string, data: string) =>
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`)
        )

      try {
        const gen = runPipeline(url, name, maxZoom)

        while (true) {
          let result: IteratorResult<string, import('@/lib/pipeline').PipelineResult>
          try {
            result = await gen.next()
          } catch (stepErr) {
            // Surface the exact step that failed; reset DuckDB so next request is clean
            resetConnection()
            enc('error', JSON.stringify({ message: String(stepErr) }))
            return
          }
          if (result.done) {
            enc('done', JSON.stringify(result.value))
            break
          }
          enc('progress', JSON.stringify(result.value))
        }
      } catch (err) {
        resetConnection()
        enc('error', JSON.stringify({ message: String(err) }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
