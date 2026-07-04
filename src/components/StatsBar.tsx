'use client'

interface Stats {
  features: number
  tiles: number
  lastTileMs: number | null
}

interface Props {
  stats: Stats
  streaming: boolean
  queryName: string
}

export default function StatsBar({ stats, streaming, queryName }: Props) {
  return (
    <div className="h-9 bg-[#060A16] border-t border-[#1c2333] flex items-center px-4 gap-6 text-xs font-mono">
      {/* Source */}
      <span className="text-[#4a5568] truncate max-w-[200px]">{queryName}</span>

      <div className="flex-1" />

      {/* Features streamed */}
      <Stat
        label="features"
        value={stats.features.toLocaleString()}
        active={streaming}
        highlight={stats.features > 0}
      />

      {/* Tile requests */}
      <Stat
        label="tile reqs"
        value={String(stats.tiles)}
        active={streaming}
        highlight={stats.tiles > 0}
      />

      {/* Last tile latency */}
      {stats.lastTileMs !== null && (
        <Stat
          label="tile ms"
          value={String(stats.lastTileMs)}
          highlight
        />
      )}

      {/* Status pill */}
      <div
        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
          streaming
            ? 'bg-[#00D4AA]/15 text-[#00D4AA]'
            : stats.features > 0
            ? 'bg-[#1c2333] text-[#6b7280]'
            : 'bg-[#1c2333] text-[#4a5568]'
        }`}
      >
        {streaming ? 'STREAMING' : stats.features > 0 ? 'LOADED' : 'READY'}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  active = false,
  highlight = false,
}: {
  label: string
  value: string
  active?: boolean
  highlight?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[#4a5568]">{label}</span>
      <span
        className={`tabular-nums transition-colors ${
          active
            ? 'text-[#00D4AA]'
            : highlight
            ? 'text-white'
            : 'text-[#4a5568]'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
