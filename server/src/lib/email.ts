import { Resend } from 'resend'
import type { GitHubUser } from './github.js'

export type MailConfig = { apiKey: string; from: string; to: string }

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

async function send(cfg: MailConfig, { subject, html, text }: Email) {
  const { error } = await new Resend(cfg.apiKey).emails.send({ from: cfg.from, to: cfg.to, subject, html, text })
  if (error) throw new Error(`Resend: ${error.message}`)
}

function userCard(u: GitHubUser): string {
  const name = u.name ? `<strong>${esc(u.name)}</strong> ` : ''
  const stats =
    u.followers !== undefined ? `<div style="color:#6b7280;font-size:13px">${u.followers.toLocaleString("en-US")} followers · ${u.public_repos ?? 0} repos</div>` : ''
  const bio = u.bio ? `<div style="color:#374151;font-size:14px;margin-top:4px">${esc(u.bio)}</div>` : ''
  return `
<table cellpadding="0" cellspacing="0" style="margin:12px 0"><tr>
  <td style="vertical-align:top;padding-right:12px">
    <img src="${esc(u.avatar_url)}&s=96" width="48" height="48" alt="" style="border-radius:50%;display:block">
  </td>
  <td style="vertical-align:top">
    <div>${name}<a href="${esc(u.html_url)}" style="color:#2563eb;text-decoration:none">@${esc(u.login)}</a></div>
    ${bio}${stats}
  </td>
</tr></table>`
}

const layout = (heading: string, body: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
  <h2 style="font-size:18px;margin:0 0 8px">${heading}</h2>
  ${body}
</div>`

export type Email = { subject: string; html: string; text: string }
type Repo = { full_name: string; html_url: string; stargazers_count: number }

export function starEmail(user: GitHubUser, repo: Repo): Email {
  const heading = `⭐ @${esc(user.login)} starred <a href="${esc(repo.html_url)}" style="color:#2563eb">${esc(repo.full_name)}</a>`
  const body = `${userCard(user)}<p style="color:#6b7280;font-size:13px">${esc(repo.full_name)} now has ${repo.stargazers_count} stars.</p>`
  return {
    subject: `⭐ ${user.login} starred ${repo.full_name}`,
    html: layout(heading, body),
    text: `${user.login} (${user.html_url}) starred ${repo.full_name} — now ${repo.stargazers_count} stars.`,
  }
}

export function followersEmail(users: GitHubUser[], total: number): Email {
  const subject = total === 1 ? `👋 ${users[0]!.login} followed you on GitHub` : `👋 ${total} new GitHub followers`
  const extra = total - users.length
  const more = extra > 0 ? `<p style="color:#6b7280;font-size:13px">…and ${extra} more.</p>` : ''
  return {
    subject,
    html: layout(esc(subject), users.map(userCard).join('') + more),
    text: users.map((u) => `${u.login} — ${u.html_url}`).join('\n') + (extra > 0 ? `\n…and ${extra} more` : ''),
  }
}

export const sendStarEmail = (cfg: MailConfig, user: GitHubUser, repo: Repo) => send(cfg, starEmail(user, repo))
export const sendFollowersEmail = (cfg: MailConfig, users: GitHubUser[], total: number) =>
  send(cfg, followersEmail(users, total))
