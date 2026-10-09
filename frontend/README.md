# Fiftythree: frontend

Next.js (App Router, TypeScript strict) frontend built on Cloudscape. See the root
[README](../README.md) for setup, commands, and architecture.

```bash
npm ci
npm run dev        # http://localhost:3000, proxies /api/* to API_INTERNAL_BASE_URL
npm run lint
npm run typecheck
npm run test
npm run build      # set API_INTERNAL_BASE_URL first; rewrites are resolved at build time
```
