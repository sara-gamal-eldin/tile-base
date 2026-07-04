/**
 * DuckDB singleton for server-side tile generation.
 * Uses @duckdb/node-api — the official async Node.js driver.
 *
 * The spatial extension is installed and loaded once on first access.
 * All tile queries go through getConnection(), which returns a ready
 * connection with spatial already loaded.
 */

import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'

let instance: DuckDBInstance | null = null
let connection: DuckDBConnection | null = null
let ready = false

async function bootstrap(): Promise<DuckDBConnection> {
  if (ready && connection) return connection

  // Reset any partial state from a previous failed bootstrap
  instance   = null
  connection = null
  ready      = false

  const { DuckDBInstance } = await import('@duckdb/node-api')

  instance   = await DuckDBInstance.create(':memory:')
  connection = await instance.connect()

  // Install + load spatial extension (downloads once, cached by DuckDB)
  await connection.run(`INSTALL spatial; LOAD spatial;`)

  // httpfs ships with spatial in recent DuckDB versions — load it if available
  try {
    await connection.run(`LOAD httpfs;`)
  } catch {
    // ignore — httpfs may not be needed or may already be auto-loaded
  }

  ready = true
  return connection
}

// Reset singleton so the next call retries from scratch
export function resetConnection(): void {
  ready      = false
  connection = null
  instance   = null
}

export async function getConnection(): Promise<DuckDBConnection> {
  return bootstrap()
}

export interface QueryRow {
  [column: string]: unknown
}

/**
 * Run a SQL query and return all rows as plain objects.
 * Column names are used as keys.
 */
export async function runQuery(sql: string): Promise<QueryRow[]> {
  const conn   = await getConnection()
  const result = await conn.runAndReadAll(sql)
  const cols   = result.columnNames()
  const rows   = result.getRows()

  return rows.map(row =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]]))
  )
}

/**
 * Run a spatial tile query.
 *
 * Wraps the user's base SQL in a bbox filter and requests geometry
 * as GeoJSON text so we can encode it into MVT on the way out.
 *
 * @param baseTable  A FROM clause value — either a file path
 *                   ('s3://…/buildings.parquet') or a subquery.
 * @param geomCol    Name of the geometry column (default: 'geom').
 * @param properties Column names to include as tile properties.
 * @param west/south/east/north  Tile bbox in WGS84 degrees.
 * @param limit      Max features per tile (default 50 000).
 */
export async function queryTile(params: {
  source:     string
  geomCol?:   string
  properties: string[]
  west:       number
  south:      number
  east:       number
  north:      number
  limit?:     number
}): Promise<{ geojson: string; properties: Record<string, unknown> }[]> {
  const {
    source,
    geomCol = 'geom',
    properties,
    west, south, east, north,
    limit = 50_000,
  } = params

  const propList = properties.length
    ? ', ' + properties.map(p => `"${p}"`).join(', ')
    : ''

  const bbox = `ST_MakeEnvelope(
    ${west}::DOUBLE, ${south}::DOUBLE,
    ${east}::DOUBLE, ${north}::DOUBLE
  )`

  const sql = `
    SELECT
      ST_AsGeoJSON(
        ST_Intersection("${geomCol}", ${bbox})
      ) AS __geojson__
      ${propList}
    FROM ${source}
    WHERE ST_Intersects("${geomCol}", ${bbox})
    LIMIT ${limit}
  `

  const conn   = await getConnection()
  const result = await conn.runAndReadAll(sql)
  const cols   = result.columnNames()
  const rows   = result.getRows()

  return rows.map(row => {
    const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    const geojson = obj['__geojson__'] as string
    const props: Record<string, unknown> = {}
    for (const p of properties) {
      if (p in obj) props[p] = obj[p]
    }
    return { geojson, properties: props }
  }).filter(r => r.geojson)
}

/**
 * Run an arbitrary user-supplied SQL query and stream back GeoJSON features.
 * The query MUST select a geometry column called `geom` and may select
 * any other columns (they become feature properties).
 *
 * Returns an async generator so the API route can stream rows to the client
 * as they arrive rather than buffering everything first.
 */
export async function* streamQueryAsGeoJSON(
  sql: string
): AsyncGenerator<string> {
  const conn = await getConnection()

  // Wrap user query to get GeoJSON geometry + all other columns
  const wrapped = `
    SELECT
      ST_AsGeoJSON(geom::GEOMETRY) AS __geojson__,
      * EXCLUDE (geom)
    FROM (${sql}) __user__
    WHERE geom IS NOT NULL
    LIMIT 500000
  `

  const result = await conn.runAndReadAll(wrapped)
  const cols   = result.columnNames()
  const rows   = result.getRows()

  for (const row of rows) {
    const obj = Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    const geojsonGeom = obj['__geojson__'] as string | null
    if (!geojsonGeom) continue

    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k !== '__geojson__') props[k] = v
    }

    const feature = {
      type: 'Feature',
      geometry: JSON.parse(geojsonGeom),
      properties: props,
    }

    yield JSON.stringify(feature)
  }
}
