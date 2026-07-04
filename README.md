# TileBase

Cloud-native geospatial pipeline — drop a data URL, get GeoParquet, PMTiles, XYZ tiles, and a STAC catalog instantly.

**Stack:** Next.js 15 · DuckDB · MapLibre GL · PMTiles v3 · Cloudflare R2

---

## How it works

```
Data URL → GeoParquet (DuckDB) → PMTiles (vector tiles) → XYZ endpoints → STAC catalog
```

1. Paste any GeoJSON, GeoPackage, Shapefile, or Parquet URL
2. DuckDB converts it to cloud-optimized **GeoParquet**
3. Geometry is tiled into a single **PMTiles** archive (no tile server needed)
4. **XYZ endpoints** are exposed instantly — plug into QGIS, ArcGIS, or MapLibre
5. A **Radiant Earth-compatible STAC catalog** is generated with PMTiles, GeoParquet, and style.json bundled

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- npm >= 9

---

## Local setup

**1. Clone the repo**

```bash
git clone https://github.com/sara-gamal-eldin/tile-base.git
cd tile-base
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment**

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in your Cloudflare R2 credentials:

```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
```

> R2 is only needed for the **Publish to Cloud** feature. The pipeline and map viewer work without it.

**4. Run the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

1. Paste a vector data URL into the **Ingest** panel (GeoJSON, GeoPackage, Shapefile, or GeoParquet)
2. Click **Run Pipeline** — progress streams in real time
3. The layer appears on the map automatically
4. Use the **Export Bar** at the bottom to:
   - Copy XYZ tile URL for QGIS / ArcGIS / MapLibre
   - Download a self-contained `basemap.html` viewer
   - Browse the STAC catalog
   - Publish to Cloudflare R2

---

## Project structure

```
src/
  app/
    api/
      ingest/          # SSE pipeline endpoint
      xyz/[name]/      # XYZ tile serving from PMTiles
      stac/            # STAC catalog, items, parquet + pmtiles download
      r2/              # Cloudflare R2 publish
  components/          # Map, IngestPanel, LayerPanel, ExportBar, ...
  lib/
    pipeline.ts        # 10-step ingestion pipeline
    pmtiles-writer.ts  # PMTiles v3 writer (Hilbert curve, spec-compliant)
    pmtiles-reader.ts  # PMTiles v3 reader (byte-range)
    duckdb.ts          # DuckDB connection
```

---

## Built by [Geosolvix](https://geosolvix.com)
