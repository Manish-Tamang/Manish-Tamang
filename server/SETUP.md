# github-notifier

Hono server that emails `hi@manishtamang.com` (via Resend) when someone:

- **stars a repo** → GitHub `star` webhook → `POST /webhooks/github` (instant)
- **follows me** → GitHub has no follow webhook, so a Cloudflare Cron Trigger runs the follower check
  every 15 min. The server compares the follower list with a snapshot in a secret gist.

## 1. Resend
- Verify `manishtamang.com` (or whatever domain `EMAIL_FROM` uses) in Resend → Domains.
- Create an API key → `RESEND_API_KEY`.

## 2. GitHub token + gist
- Create a **secret** gist at https://gist.github.com with one file `followers.json` containing `{}`.
  The ID in its URL → `GIST_ID`. On the first run the server saves your current followers there without emailing.
- Create a fine-grained PAT: Account permissions → **Gists: Read and write** → `GITHUB_TOKEN`.

## 3. Deploy the server
Any runtime works (`src/index.ts` default-exports the Hono app).

**Cloudflare Workers (recommended):** entry is `src/worker.ts`, config in `wrangler.jsonc`.
A Cron Trigger runs the follower check every 15 min.

**Auto-deploy (GitHub Actions):** `.github/workflows/deploy-notifier.yml` deploys on every push to `main`
that touches `server/` (or manually from the Actions tab), then pushes the secrets below into the Worker.
GitHub repo secrets are the single source of truth — edit them there, re-run the workflow.

Repo → Settings → Secrets and variables → Actions → New repository secret:

| Repo secret | Becomes Worker secret |
|---|---|
| `CLOUDFLARE_API_TOKEN` | — (Cloudflare → My Profile → API Tokens → template "Edit Cloudflare Workers") |
| `CLOUDFLARE_ACCOUNT_ID` | — (`npx wrangler whoami`, or Workers overview sidebar) |
| `RESEND_API_KEY` | `RESEND_API_KEY` |
| `NOTIFIER_GITHUB_TOKEN` | `GITHUB_TOKEN` (GitHub forbids repo secrets starting with `GITHUB_`) |
| `GIST_ID` | `GIST_ID` |
| `WEBHOOK_SECRET` | `GITHUB_WEBHOOK_SECRET` |
| `CRON_SECRET` | `CRON_SECRET` |

**Manual deploy (alternative):**

```bash
npx wrangler login
for s in RESEND_API_KEY GITHUB_TOKEN GITHUB_WEBHOOK_SECRET GIST_ID CRON_SECRET; do npx wrangler secret put $s; done
npm run deploy
```
URL: `https://github-notifier.<your-subdomain>.workers.dev` (or add a custom domain in the dashboard).
Logs: `npx wrangler tail`. Local: put vars in `.dev.vars`, run `npm run cf:dev`, trigger cron with
`curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"`.

**Elsewhere (Vercel, Node, …):** works too, but there's no built-in cron. Have some scheduler send
`POST /cron/followers` with header `Authorization: Bearer $CRON_SECRET` every 15 min.

**Local:** `cp .env.example .env`, fill it in, then `npm run dev` (port 8787).

## 4. Star webhook: GitHub App (covers every repo, including future ones)
GitHub → Settings → Developer settings → GitHub Apps → New:
- Webhook URL: `https://<your-server>/webhooks/github`
- Webhook secret: same as `GITHUB_WEBHOOK_SECRET`
- Repository permissions → **Metadata: Read-only**
- Subscribe to events → **Star**
- Where can it be installed: Only this account

Then click **Install App** → All repositories.

(Or add a webhook to a single repo: repo Settings → Webhooks, content type `application/json`, "Stars" event only.)

## 5. Check it works
Run the follower check once by hand (or wait up to 15 min for the cron):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-server>/cron/followers
```
The first run replies `{"seeded":N}`; later runs reply `{"followers":N,"new":[...]}`.
Cron runs show up in `npx wrangler tail` as `followers check 200 …`.
