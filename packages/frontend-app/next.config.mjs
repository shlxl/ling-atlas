/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['@ling-atlas/shared'] }
}

export default nextConfig
