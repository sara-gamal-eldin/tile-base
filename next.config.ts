import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@duckdb/node-api'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // MapLibre GL uses worker threads — prevent webpack from bundling them
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      }
    }
    return config
  },
}

export default nextConfig
