'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { SampleQuery } from '@/lib/sample-queries'

// Monaco loads lazily (it's large)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-[#4a5568] text-sm font-mono">
      Loading editor…
    </div>
  ),
})

interface Props {
  queries: SampleQuery[]
  activeQuery: SampleQuery
  onQueryChange: (q: SampleQuery) => void
  onRun: () => void
  streaming: boolean
}

export default function QueryPanel({
  queries,
  activeQuery,
  onQueryChange,
  onRun,
  streaming,
}: Props) {
  const [editedSql, setEditedSql] = useState(activeQuery.sql)

  // Keep editedSql in sync when switching presets
  const handlePresetChange = useCallback(
    (q: SampleQuery) => {
      onQueryChange(q)
      setEditedSql(q.sql)
    },
    [onQueryChange]
  )

  const handleRun = () => {
    // Pass edited SQL back up by mutating a shallow copy
    onQueryChange({ ...activeQuery, sql: editedSql })
    onRun()
  }

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#1c2333]">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#1c2333] flex items-center gap-2">
        <span className="text-[#00D4AA] font-bold text-sm tracking-widest">STREAMGL</span>
        <span className="text-[#4a5568] text-xs">by Geosolvix</span>
      </div>

      {/* ── Preset selector ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#1c2333]">
        <p className="text-[#6b7280] text-xs uppercase tracking-wider mb-2">
          Sample Datasets
        </p>
        <div className="flex flex-col gap-1">
          {queries.map(q => (
            <button
              key={q.name}
              onClick={() => handlePresetChange(q)}
              className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                activeQuery.name === q.name
                  ? 'bg-[#00D4AA]/15 text-[#00D4AA] border border-[#00D4AA]/30'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-white'
              }`}
            >
              <div className="font-medium">{q.name}</div>
              <div className="text-[10px] opacity-70 mt-0.5 leading-snug">
                {q.description.slice(0, 72)}…
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── SQL Editor ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-[#1c2333] flex items-center justify-between">
          <span className="text-[#6b7280] text-xs uppercase tracking-wider">DuckDB SQL</span>
          <span className="text-[#4a5568] text-[10px]">
            Geometry column must be named <code className="text-[#00D4AA]">geom</code>
          </span>
        </div>

        <div className="flex-1 min-h-0">
          <MonacoEditor
            height="100%"
            defaultLanguage="sql"
            value={editedSql}
            onChange={v => setEditedSql(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 12,
              fontFamily: 'Menlo, Monaco, Courier New, monospace',
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              wordWrap: 'on',
              tabSize: 2,
            }}
          />
        </div>
      </div>

      {/* ── Stack info ──────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-[#1c2333] text-[10px] text-[#4a5568] space-y-0.5">
        <div className="flex gap-2">
          <span className="text-[#00D4AA]">DuckDB Spatial</span>
          <span>→ in-process spatial SQL</span>
        </div>
        <div className="flex gap-2">
          <span className="text-[#00D4AA]">GeoParquet / S3</span>
          <span>→ HTTP range requests, zero download</span>
        </div>
        <div className="flex gap-2">
          <span className="text-[#00D4AA]">MapLibre GL</span>
          <span>→ GPU vector renderer</span>
        </div>
      </div>

      {/* ── Run button ──────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-[#1c2333]">
        <button
          onClick={handleRun}
          disabled={streaming}
          className={`w-full py-2.5 rounded font-bold text-sm tracking-wide transition-all ${
            streaming
              ? 'bg-[#00D4AA]/20 text-[#00D4AA]/50 cursor-not-allowed'
              : 'bg-[#00D4AA] text-[#060A16] hover:bg-[#00c4a0] active:scale-[0.98]'
          }`}
        >
          {streaming ? (
            <span className="flex items-center justify-center gap-2">
              <PulseIcon />
              Streaming…
            </span>
          ) : (
            '▶  Run Query'
          )}
        </button>
      </div>
    </div>
  )
}

function PulseIcon() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D4AA] opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00D4AA]" />
    </span>
  )
}
