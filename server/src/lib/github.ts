const API = 'https://api.github.com'

export type GitHubUser = {
  login: string
  html_url: string
  avatar_url: string
  name?: string | null
  bio?: string | null
  followers?: number
  public_repos?: number
}

async function gh<T>(
  path: string,
  token: string | undefined,
  init: { method?: string; body?: string } = {},
): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-notifier',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

export async function listFollowers(username: string, token?: string): Promise<GitHubUser[]> {
  const all: GitHubUser[] = []
  for (let page = 1; ; page++) {
    const batch = await gh<GitHubUser[]>(
      `/users/${encodeURIComponent(username)}/followers?per_page=100&page=${page}`,
      token,
    )
    all.push(...batch)
    if (batch.length < 100) return all
  }
}

/** Full profile (name, bio, counts). Best effort: falls back to null. */
export async function getUser(login: string, token?: string): Promise<GitHubUser | null> {
  try {
    return await gh<GitHubUser>(`/users/${encodeURIComponent(login)}`, token)
  } catch {
    return null
  }
}

// ---- Follower snapshot, stored in a secret gist ----

const STATE_FILE = 'followers.json'

export type FollowerState = { followers: string[]; updatedAt: string }

type Gist = { files: Record<string, { content?: string; truncated?: boolean; raw_url: string } | null> }

/** Returns null when the gist has no snapshot yet (first run). */
export async function readState(gistId: string, token: string): Promise<FollowerState | null> {
  const gist = await gh<Gist>(`/gists/${gistId}`, token)
  const file = gist.files[STATE_FILE]
  if (!file) return null
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : (file.content ?? '')
  try {
    const parsed = JSON.parse(content)
    return Array.isArray(parsed?.followers) ? parsed : null
  } catch {
    return null
  }
}

export async function writeState(gistId: string, token: string, followers: string[]): Promise<void> {
  const state: FollowerState = { followers, updatedAt: new Date().toISOString() }
  await gh(`/gists/${gistId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [STATE_FILE]: { content: JSON.stringify(state, null, 2) } } }),
  })
}

// ---- Webhook signature ----

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifies GitHub's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body). */
export async function verifySignature(secret: string, body: string, header?: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
  return safeEqual(`sha256=${hex}`, header)
}
