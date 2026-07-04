/**
 * Tile coordinate math — no external dependency needed.
 * All coordinates in WGS84 (EPSG:4326).
 */

export interface BBox {
  west: number
  south: number
  east: number
  north: number
}

/** Convert a tile (z/x/y) to its WGS84 bounding box. */
export function tileToBBox(z: number, x: number, y: number): BBox {
  const size = Math.pow(2, z)

  const west  = (x / size) * 360 - 180
  const east  = ((x + 1) / size) * 360 - 180
  const north = tileYToLat(y, size)
  const south = tileYToLat(y + 1, size)

  return { west, south, east, north }
}

function tileYToLat(y: number, size: number): number {
  const n = Math.PI - (2 * Math.PI * y) / size
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

/**
 * Project a WGS84 coordinate to tile-local pixel space [0, extent].
 * Used when encoding MVT geometry.
 */
export function projectToTile(
  lon: number,
  lat: number,
  bbox: BBox,
  extent = 4096
): [number, number] {
  const x = Math.round(((lon - bbox.west) / (bbox.east - bbox.west)) * extent)
  const y = Math.round(((bbox.north - lat) / (bbox.north - bbox.south)) * extent)
  return [x, y]
}

/** Clip a value to [0, extent] */
export function clamp(v: number, extent = 4096): number {
  return Math.max(0, Math.min(extent, v))
}
