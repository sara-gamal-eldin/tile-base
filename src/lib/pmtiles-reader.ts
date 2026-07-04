/**
 * Read a single tile from a local PMTiles v3 file.
 *
 * PMTiles v3 directory wire format (column-oriented, per spec):
 *   varint  numEntries
 *   varint[numEntries]  tileId deltas  (0 → prev+1, N → prev+N)
 *   varint[numEntries]  runLengths     (0 = leaf dir pointer, 1 = single tile, >1 = run)
 *   varint[numEntries]  lengths
 *   varint[numEntries]  offsets        (0 → prev.offset+prev.length, N → absolute N-1)
 *
 * findEntry: returns the last entry with tileId ≤ target (per spec).
 *   runLength = 0  → leaf directory; offset relative to leaf_dirs_offset
 *   runLength ≥ 1  → tile/run; valid if target < tileId + runLength
 *
 * PMTiles v3 header layout (127 bytes):
 *   8  → root_dir_offset     16 → root_dir_len
 *   24 → metadata_offset     32 → metadata_len
 *   40 → leaf_dirs_offset    48 → leaf_dirs_len
 *   56 → tile_data_offset    64 → tile_data_len   ← often overlooked
 *   72 → num_addressed       80 → num_entries     88 → num_contents
 *   96 → clustered           97 → internal_compression (1=none, 2=gzip, 3=brotli, 4=zstd)
 *   98 → tile_compression    99 → tile_type
 *   100 → min_zoom           101 → max_zoom
 *   (bounds / center follow)
 *
 * Note: we detect directory compression from magic bytes rather than the
 * header flag so old custom-writer files (which lack tile_data_len and
 * store the flag at byte 89) are also handled transparently.
 */

import { open } from 'fs/promises'
import { gunzip } from 'zlib'
import { promisify } from 'util'
import { tileId } from './pmtiles-writer'

const gunzipAsync = promisify(gunzip)

const HEADER_SIZE = 127

function readVarint(buf: Buffer, pos: number): { value: bigint; read: number } {
  let result = 0n
  let shift  = 0n
  let i = 0
  while (pos + i < buf.length) {
    const byte = buf[pos + i++]
    result |= BigInt(byte & 0x7f) << shift
    shift += 7n
    if ((byte & 0x80) === 0) break
  }
  return { value: result, read: i }
}

interface DirEntry {
  tileId:    bigint
  offset:    bigint
  length:    bigint
  runLength: bigint
}

/**
 * Parse a PMTiles v3 directory from a (decompressed) buffer.
 * The format is column-oriented — all fields for all entries are stored
 * in separate runs, not interleaved per-entry.
 */
function parseDir(buf: Buffer): DirEntry[] {
  let pos = 0

  // Leading entry count
  const countR = readVarint(buf, pos); pos += countR.read
  const n = Number(countR.value)
  if (n === 0) return []

  const tileIds:    bigint[] = new Array(n)
  const runLengths: bigint[] = new Array(n)
  const lengths:    bigint[] = new Array(n)
  const offsets:    bigint[] = new Array(n)

  // Column 1 — tileId deltas
  // delta = 0 (and i > 0) means consecutive (+1); otherwise prev + delta
  let lastId = 0n
  for (let i = 0; i < n; i++) {
    const r = readVarint(buf, pos); pos += r.read
    if (i > 0 && r.value === 0n) lastId += 1n
    else                          lastId += r.value
    tileIds[i] = lastId
  }

  // Column 2 — runLengths
  for (let i = 0; i < n; i++) {
    const r = readVarint(buf, pos); pos += r.read
    runLengths[i] = r.value
  }

  // Column 3 — lengths
  for (let i = 0; i < n; i++) {
    const r = readVarint(buf, pos); pos += r.read
    lengths[i] = r.value
  }

  // Column 4 — offsets
  // 0 (and i > 0) means "immediately follows previous entry" (prev.offset + prev.length)
  // N means absolute offset N - 1  (+1 bias)
  for (let i = 0; i < n; i++) {
    const r = readVarint(buf, pos); pos += r.read
    if (r.value === 0n && i > 0) offsets[i] = offsets[i - 1] + lengths[i - 1]
    else                          offsets[i] = r.value - 1n
  }

  const entries: DirEntry[] = new Array(n)
  for (let i = 0; i < n; i++) {
    entries[i] = { tileId: tileIds[i], runLength: runLengths[i], length: lengths[i], offset: offsets[i] }
  }
  return entries
}

/**
 * Binary search: last entry with tileId ≤ target.
 * - runLength = 0  → leaf directory pointer
 * - runLength ≥ 1  → tile valid if target < tileId + runLength
 */
function findEntry(entries: DirEntry[], target: bigint): DirEntry | null {
  let lo = 0, hi = entries.length - 1
  let result: DirEntry | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const e   = entries[mid]
    if (e.tileId <= target) { result = e; lo = mid + 1 }
    else                      hi = mid - 1
  }
  if (!result) return null
  if (result.runLength === 0n) return result                        // leaf dir
  if (target < result.tileId + result.runLength) return result     // tile or run
  return null                                                       // gap — tile missing
}

/** Detect and decompress gzip data by magic bytes (0x1f 0x8b). */
async function maybeDecompress(buf: Buffer): Promise<Buffer> {
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return Buffer.from(await gunzipAsync(buf))
  }
  return buf
}

export async function readTile(
  filePath: string,
  z: number, x: number, y: number
): Promise<Buffer | null> {
  const target = tileId(z, x, y)
  const fd = await open(filePath, 'r')

  try {
    const hdr = Buffer.alloc(HEADER_SIZE)
    await fd.read(hdr, 0, HEADER_SIZE, 0)

    if (hdr.toString('ascii', 0, 7) !== 'PMTiles') throw new Error('Not a PMTiles file')
    if (hdr.readUInt8(7) !== 3)                    throw new Error('Only PMTiles v3 supported')

    const rootDirOff  = Number(hdr.readBigUInt64LE(8))
    const rootDirLen  = Number(hdr.readBigUInt64LE(16))
    const leafDirsOff = Number(hdr.readBigUInt64LE(40))
    const tileDataOff = Number(hdr.readBigUInt64LE(56))
    // internal_compression is at byte 97 in spec-compliant files (tile_data_len
    // occupies 64-71, shifting all subsequent single-byte fields by +8).
    // We detect compression from magic bytes instead so both old and new files work.

    // ── Root directory ────────────────────────────────────────────────────
    let dirBuf: Buffer = Buffer.alloc(rootDirLen)
    await fd.read(dirBuf, 0, rootDirLen, rootDirOff)
    dirBuf = await maybeDecompress(dirBuf)

    let entry = findEntry(parseDir(dirBuf), target)
    if (!entry) return null

    // ── Leaf directory (runLength = 0) ───────────────────────────────────
    if (entry.runLength === 0n) {
      let leafBuf: Buffer = Buffer.alloc(Number(entry.length))
      await fd.read(leafBuf, 0, Number(entry.length), leafDirsOff + Number(entry.offset))
      leafBuf = await maybeDecompress(leafBuf)

      entry = findEntry(parseDir(leafBuf), target)
      if (!entry || entry.runLength === 0n) return null
    }

    // ── Tile data ────────────────────────────────────────────────────────
    let tileBuf: Buffer = Buffer.alloc(Number(entry.length))
    await fd.read(tileBuf, 0, Number(entry.length), tileDataOff + Number(entry.offset))

    // Decompress tile if needed (gzip = tippecanoe default); return raw MVT
    tileBuf = await maybeDecompress(tileBuf)

    return tileBuf
  } finally {
    await fd.close()
  }
}
