/**
 * Shared types for TileForge.
 * LayerConfig drives both the Map renderer and the Layer panel.
 */

export const PALETTE = [
  '#2563EB', '#D97706', '#059669', '#DC2626',
  '#7C3AED', '#0891B2', '#D946EF', '#EA580C',
]

export interface LayerSymbology {
  fill:          string   // hex
  fillOpacity:   number   // 0–1
  stroke:        string
  strokeWidth:   number   // px
  strokeOpacity: number
  circleRadius:  number   // px
  circleOpacity: number
}

export interface LayerConfig {
  name:         string
  bounds:       [number, number, number, number]
  center:       [number, number, number]
  visible:      boolean
  minZoom:      number
  maxZoom:      number
  symbology:    LayerSymbology
  featureCount: number
  tileCount:    number
  r2Url?:       string
}

export function defaultSymbology(color: string): LayerSymbology {
  return {
    fill:          color,
    fillOpacity:   0.3,
    stroke:        color,
    strokeWidth:   1.5,
    strokeOpacity: 0.9,
    circleRadius:  5,
    circleOpacity: 0.85,
  }
}
