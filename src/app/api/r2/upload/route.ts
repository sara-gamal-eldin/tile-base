/**
 * POST /api/r2/upload
 * Body: { name: string }
 * Uploads a single layer's data.pmtiles to Cloudflare R2.
 *
 * Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * Bucket: streamgl (hardcoded)
 * Public URL base: https://pub-bb20ce11def241fda9bd57de004f9be3.r2.dev
 *
 * Install: npm install @aws-sdk/client-s3
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { DATA_DIR } from '@/lib/pipeline'

const R2_BUCKET     = 'streamgl'
const R2_PUBLIC_URL = 'https://pub-bb20ce11def241fda9bd57de004f9be3.r2.dev'

export async function POST(req: NextRequest) {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter(
    k => !process.env[k]
  )
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing env vars: ${missing.join(', ')}` },
      { status: 503 }
    )
  }

  const { name } = (await req.json()) as { name: string }
  const pmtilesPath = path.join(DATA_DIR, name, 'data.pmtiles')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3' as never as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = new (S3Client as any)({
      region:      'auto',
      endpoint:    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })

    const data = await readFile(pmtilesPath)
    const key  = `tilebase/${name}/data.pmtiles`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await r2.send(new (PutObjectCommand as any)({
      Bucket:       R2_BUCKET,
      Key:          key,
      Body:         data,
      ContentType:  'application/vnd.pmtiles',
      CacheControl: 'public, max-age=86400',
    }))

    return NextResponse.json({ url: `${R2_PUBLIC_URL}/${key}`, key })
  } catch (err: unknown) {
    const msg = String(err)
    if (msg.includes("Cannot find module '@aws-sdk/client-s3'")) {
      return NextResponse.json({ error: 'Run: npm install @aws-sdk/client-s3' }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
