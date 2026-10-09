import type { NextConfig } from "next";

// Same-origin API proxy (DECISIONS D4): the browser only calls relative /api/v1/... URLs and
// Next.js forwards them to FastAPI. Rewrites are resolved at build time, so API_INTERNAL_BASE_URL
// must be set before `next build` when the backend is not at the default address.
const apiInternalBaseUrl = (process.env.API_INTERNAL_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  // Separate build output for the Playwright run (.next-e2e) so it never clobbers .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return {
      // beforeFiles: /api/* is proxied before any page (including the console catch-all) matches.
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${apiInternalBaseUrl}/api/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
