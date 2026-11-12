// Local / self-hosted Node entry. Vercel, Cloudflare Workers and Bun use the default export of index.ts directly.
import { serve } from '@hono/node-server'
import app from './index.js'

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => console.log(`github-notifier on http://localhost:${info.port}`))
