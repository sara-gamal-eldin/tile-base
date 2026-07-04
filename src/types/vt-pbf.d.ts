declare module 'vt-pbf' {
  import type { Tile } from 'geojson-vt'
  function fromGeojsonVt(
    layers: Record<string, Tile>,
    options?: { version?: number }
  ): Uint8Array
  export = { fromGeojsonVt }
}
