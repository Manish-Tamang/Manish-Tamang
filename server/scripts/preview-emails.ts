// Renders the email templates with sample data to HTML files (nothing is sent).
// Usage: npx tsx scripts/preview-emails.ts [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { followersEmail, starEmail, type Email } from '../src/lib/email.js'
import type { GitHubUser } from '../src/lib/github.js'

const octocat: GitHubUser = {
  login: 'octocat',
  name: 'The Octocat',
  html_url: 'https://github.com/octocat',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  bio: 'GitHub mascot. Professional repo starrer.',
  followers: 21400,
  public_repos: 8,
}
const torvalds: GitHubUser = {
  login: 'torvalds',
  name: 'Linus Torvalds',
  html_url: 'https://github.com/torvalds',
  avatar_url: 'https://avatars.githubusercontent.com/u/1024025?v=4',
  followers: 260000,
  public_repos: 9,
}

const out = process.argv[2] ?? 'email-previews'
mkdirSync(out, { recursive: true })

const emails: Record<string, Email> = {
  star: starEmail(octocat, {
    full_name: 'Manish-Tamang/dittu',
    html_url: 'https://github.com/Manish-Tamang/dittu',
    stargazers_count: 42,
  }),
  'follow-one': followersEmail([octocat], 1),
  'follow-many': followersEmail([octocat, torvalds], 2),
}

// Wrap each email in an inbox-style frame showing the subject line.
const frame = (e: Email) => `<!doctype html><meta charset="utf-8"><title>${e.subject}</title>
<body style="margin:0;background:#f3f4f6;padding:24px 12px;font-family:system-ui,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
<div style="padding:12px 24px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">
From: GitHub &lt;github@manishtamang.com&gt; · To: hi@manishtamang.com<br>
<strong style="color:#111827;font-size:15px">${e.subject}</strong></div>${e.html}</div></body>`

writeFileSync(join(out, 'index.html'), Object.values(emails).map(frame).join('\n'))
for (const [name, e] of Object.entries(emails)) writeFileSync(join(out, `${name}.html`), frame(e))
console.log(`wrote ${Object.keys(emails).length} previews to ${out}/`)
