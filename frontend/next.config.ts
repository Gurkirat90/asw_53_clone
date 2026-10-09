import type { NextConfig } from "next";

// Same-origin API proxy (DECISIONS D4): the browser only calls relative /api/v1/... URLs and
// Next.js forwards them to FastAPI. Rewrites are resolved at build time, so API_INTERNAL_BASE_URL
// must be set before `next build` when the backend is not at the default address.
const apiInternalBaseUrl = (process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
