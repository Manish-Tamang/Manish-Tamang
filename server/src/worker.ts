// Cloudflare Workers entry: HTTP routes + a Cron Trigger that runs the follower check
// (replaces the GitHub Action when deployed here).
import app from './index.js'

type Bindings = { CRON_SECRET: string }

export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Bindings, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(
      Promise.resolve(
        app.request('/cron/followers', { method: 'POST', headers: { Authorization: `Bearer ${env.CRON_SECRET}` } }, env),
      ).then(async (res) => console.log('followers check', res.status, await res.text())),
    )
  },
}
