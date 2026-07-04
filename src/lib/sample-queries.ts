export interface SampleQuery {
  name: string
  description: string
  source: string
  sql: string
  defaultZoom: number
  defaultCenter: [number, number] // [lng, lat]
  layerType: 'fill' | 'line' | 'circle'
  layerColor: string
}

/**
 * Overture Maps Foundation datasets are publicly available on S3.
 * These queries work without any authentication.
 *
 * DuckDB streams only the byte ranges it needs from these files —
 * no full download ever happens.
 */
export const SAMPLE_QUERIES: SampleQuery[] = [
  {
    name: 'Overture Buildings — London',
    description:
      'Stream building footprints for central London from Overture Maps ' +
      'GeoParquet on S3. No file download — DuckDB reads only the bytes ' +
      'that overlap your current map view.',
    source: `read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=buildings/type=building/**/*.parquet',
  hive_partitioning = true
)`,
    sql: `SELECT
  geom,
  names.primary AS name,
  height,
  num_floors,
  class
FROM read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=buildings/type=building/**/*.parquet',
  hive_partitioning = true
)
WHERE bbox.xmin > -0.15 AND bbox.xmax < 0.01
  AND bbox.ymin > 51.48 AND bbox.ymax < 51.55`,
    defaultZoom: 14,
    defaultCenter: [-0.09, 51.51],
    layerType: 'fill',
    layerColor: '#00D4AA',
  },
  {
    name: 'Overture Roads — Cairo',
    description:
      'Road network for Cairo from Overture Maps. Each tile is queried ' +
      'on demand — no Tippecanoe, no tile server.',
    source: `read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=transportation/type=segment/**/*.parquet',
  hive_partitioning = true
)`,
    sql: `SELECT
  geom,
  names.primary AS name,
  class,
  subtype
FROM read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=transportation/type=segment/**/*.parquet',
  hive_partitioning = true
)
WHERE bbox.xmin > 31.18 AND bbox.xmax < 31.35
  AND bbox.ymin > 29.98 AND bbox.ymax < 30.10`,
    defaultZoom: 13,
    defaultCenter: [31.24, 30.04],
    layerType: 'line',
    layerColor: '#00D4AA',
  },
  {
    name: 'Overture Places — New York',
    description:
      'Points of interest across New York City. Query filters, DuckDB ' +
      'spatial index handles the rest.',
    source: `read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=places/type=place/**/*.parquet',
  hive_partitioning = true
)`,
    sql: `SELECT
  geom,
  names.primary AS name,
  categories.primary AS category,
  confidence
FROM read_parquet(
  's3://overture-maps-us-west-2/release/2024-11-13.0/theme=places/type=place/**/*.parquet',
  hive_partitioning = true
)
WHERE bbox.xmin > -74.02 AND bbox.xmax < -73.96
  AND bbox.ymin >  40.70 AND bbox.ymax <  40.76
  AND confidence > 0.8`,
    defaultZoom: 14,
    defaultCenter: [-74.0, 40.73],
    layerType: 'circle',
    layerColor: '#00D4AA',
  },
  {
    name: 'Custom Query',
    description:
      'Write your own DuckDB Spatial query. Your SELECT must include a ' +
      'geometry column named `geom`. Any other columns become tile properties.',
    source: '',
    sql: `-- Example: load any GeoParquet file from S3 or a local path
SELECT
  geom,
  name,
  class
FROM read_parquet('s3://your-bucket/your-file.parquet')
WHERE ST_Within(
  geom,
  ST_MakeEnvelope(31.18, 29.98, 31.35, 30.10, 4326)
)
LIMIT 100000`,
    defaultZoom: 5,
    defaultCenter: [20, 30],
    layerType: 'fill',
    layerColor: '#00D4AA',
  },
]
