// The Flask backend (backend/app.py) listens on port 5001. Keep this default in
// sync with it so `/api/*` proxies correctly in local dev with zero config.
const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001"

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
