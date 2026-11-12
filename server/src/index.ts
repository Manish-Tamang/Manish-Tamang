import { Hono, type Context } from 'hono'
import { env } from 'hono/adapter'
import { sendFollowersEmail, sendStarEmail, type MailConfig } from './lib/email.js'
import {
  getUser,
  listFollowers,
  readState,
  safeEqual,
  verifySignature,
  writeState,
  type GitHubUser,
} from './lib/github.js'

type Env = {
  RESEND_API_KEY: string
  EMAIL_TO?: string
  EMAIL_FROM?: string
  GITHUB_USERNAME?: string
  GITHUB_TOKEN: string
  GITHUB_WEBHOOK_SECRET: string
  GIST_ID: string
  CRON_SECRET: string
}

function config(c: Context) {
  const e = env<Env>(c)
  const mail: MailConfig = {
    apiKey: e.RESEND_API_KEY,
    to: e.EMAIL_TO || 'hi@manishtamang.com',
    from: e.EMAIL_FROM || 'GitHub <github@manishtamang.com>',
  }
  return { ...e, username: e.GITHUB_USERNAME || 'Manish-Tamang', mail }
}

const app = new Hono()

app.get('/', (c) => c.text('github-notifier ok'))

/**
 * GitHub webhook (GitHub App or per-repo webhook), content type application/json.
 * Handles `star` events; everything else (ping, installation, …) is acknowledged and ignored.
 */
app.post('/webhooks/github', async (c) => {
  const cfg = config(c)
  if (!cfg.GITHUB_WEBHOOK_SECRET) return c.text('GITHUB_WEBHOOK_SECRET not set', 500)

  const raw = await c.req.text()
  if (!(await verifySignature(cfg.GITHUB_WEBHOOK_SECRET, raw, c.req.header('x-hub-signature-256')))) {
    return c.text('invalid signature', 401)
  }

  const event = c.req.header('x-github-event')
  if (event !== 'star') return c.json({ ignored: event })

  const payload = JSON.parse(raw) as {
    action: 'created' | 'deleted'
    sender: GitHubUser
    repository: { full_name: string; html_url: string; stargazers_count: number }
  }
  if (payload.action !== 'created') return c.json({ ignored: `star.${payload.action}` })
  if (payload.sender.login.toLowerCase() === cfg.username.toLowerCase()) return c.json({ ignored: 'self-star' })

  const user = (await getUser(payload.sender.login, cfg.GITHUB_TOKEN)) ?? payload.sender
  await sendStarEmail(cfg.mail, user, payload.repository)
  return c.json({ sent: 'star', from: user.login, repo: payload.repository.full_name })
})

/**
 * Called by the GitHub Action on a schedule. GitHub has no webhook for follows,
 * so we diff the follower list against the last snapshot stored in a gist.
 */
app.post('/cron/followers', async (c) => {
  const cfg = config(c)
  if (!cfg.CRON_SECRET) return c.text('CRON_SECRET not set', 500)
  if (!safeEqual(c.req.header('authorization') ?? '', `Bearer ${cfg.CRON_SECRET}`)) {
    return c.text('unauthorized', 401)
  }

  const [current, state] = await Promise.all([
    listFollowers(cfg.username, cfg.GITHUB_TOKEN),
    readState(cfg.GIST_ID, cfg.GITHUB_TOKEN),
  ])
  const logins = current.map((u) => u.login)

  // First run: record existing followers without emailing about all of them.
  if (!state) {
    await writeState(cfg.GIST_ID, cfg.GITHUB_TOKEN, logins)
    return c.json({ seeded: logins.length })
  }

  const known = new Set(state.followers.map((l) => l.toLowerCase()))
  const fresh = current.filter((u) => !known.has(u.login.toLowerCase()))

  if (fresh.length) {
    const shown = await Promise.all(
      fresh.slice(0, 10).map(async (u) => (await getUser(u.login, cfg.GITHUB_TOKEN)) ?? u),
    )
    // Email first: if it fails, the snapshot isn't updated and the next run retries.
    await sendFollowersEmail(cfg.mail, shown, fresh.length)
  }

  // No new logins + same count => identical set; skip the write to avoid gist revision spam.
  if (fresh.length || logins.length !== state.followers.length) {
    await writeState(cfg.GIST_ID, cfg.GITHUB_TOKEN, logins)
  }

  return c.json({ followers: logins.length, new: fresh.map((u) => u.login) })
})

app.onError((err, c) => {
  console.error(err)
  return c.text(err.message, 500)
})

export default app
