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

export type FollowerChange = {
  gained: GitHubUser[] // profiles to show (capped)
  gainedTotal: number
  lost: GitHubUser[]
  lostTotal: number
  total: number // follower count now
}

/** One email covering new followers and unfollows found in the same check. */
export function followersEmail(ch: FollowerChange): Email {
  const g = ch.gainedTotal
  const l = ch.lostTotal
  const subject =
    g && l
      ? `👋 GitHub followers: ${g} new, ${l} unfollowed`
      : g
        ? g === 1
          ? `👋 ${ch.gained[0]!.login} followed you on GitHub`
          : `👋 ${g} new GitHub followers`
        : l === 1
          ? `💔 ${ch.lost[0]!.login} unfollowed you on GitHub`
          : `💔 ${l} people unfollowed you on GitHub`

  const both = g > 0 && l > 0
  const section = (title: string, users: GitHubUser[], count: number) => {
    if (!count) return { html: '', text: '' }
    const extra = count - users.length
    const heading = both ? `<h3 style="font-size:15px;margin:20px 0 4px">${title} (${count})</h3>` : ''
    const more = extra > 0 ? `<p style="color:#6b7280;font-size:13px">…and ${extra} more.</p>` : ''
    const text =
      `${title}:\n` + users.map((u) => `  ${u.login} — ${u.html_url}`).join('\n') + (extra > 0 ? `\n  …and ${extra} more` : '')
    return { html: heading + users.map(userCard).join('') + more, text }
  }
  const added = section('New followers', ch.gained, g)
  const removed = section('Unfollowed', ch.lost, l)
  const footer = `<p style="color:#6b7280;font-size:13px;margin-top:20px">You now have ${ch.total.toLocaleString('en-US')} followers.</p>`

  return {
    subject,
    html: layout(esc(subject), added.html + removed.html + footer),
    text: [added.text, removed.text, `You now have ${ch.total} followers.`].filter(Boolean).join('\n\n'),
  }
}

export const sendStarEmail = (cfg: MailConfig, user: GitHubUser, repo: Repo) => send(cfg, starEmail(user, repo))
export const sendFollowersEmail = (cfg: MailConfig, change: FollowerChange) => send(cfg, followersEmail(change))
