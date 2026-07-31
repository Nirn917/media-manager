// Jellyfin REST client. Handles AuthenticateByName, Users/Me, Users/{id}/Items.
import type { H3Event } from 'h3'
import { getCookie } from 'h3'
import { verify } from './crypto'

const DEVICE_ID = 'media-manager-001'
const CLIENT = 'media-manager'
const VERSION = '0.1.0'

export function jellyfinAuthHeader(token?: string): string {
  // Jellyfin/Emby expects the Emby authorization format:
  //   MediaBrowser Client="...", Device="...", DeviceId="...", Version="..."[, Token="..."]
  // Quoted, comma-separated — NOT URL-encoded params (URLSearchParams produces
  // & separators and + for spaces which Jellyfin rejects with a 400).
  const parts = [
    `Client="${CLIENT}"`,
    `Device="VPS pod"`,
    `DeviceId="${DEVICE_ID}"`,
    `Version="${VERSION}"`,
  ]
  if (token) parts.push(`Token="${token}"`)
  return `MediaBrowser ${parts.join(', ')}`
}

export type JellyfinUser = {
  Id: string
  Name: string
  Policy?: { IsAdministrator?: boolean }
}

export type JellyfinAuthResult = {
  User: JellyfinUser
  SessionInfo?: unknown
  AccessToken: string
}

export async function jellyfinAuthenticate(
  baseUrl: string,
  username: string,
  password: string,
): Promise<JellyfinAuthResult> {
  const res = await fetch(joinUrl(baseUrl, '/Users/AuthenticateByName'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Authorization': jellyfinAuthHeader(),
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Jellyfin auth failed (${res.status}): ${body}`)
  }
  return (await res.json()) as JellyfinAuthResult
}

export async function jellyfinUsersMe(baseUrl: string, token: string): Promise<JellyfinUser> {
  const res = await fetch(joinUrl(baseUrl, '/Users/Me'), {
    headers: { 'X-Emby-Authorization': jellyfinAuthHeader(token) },
  })
  if (!res.ok) throw new Error(`Jellyfin /Users/Me failed (${res.status})`)
  return (await res.json()) as JellyfinUser
}

export async function jellyfinListUsers(baseUrl: string, adminToken: string): Promise<JellyfinUser[]> {
  const res = await fetch(joinUrl(baseUrl, '/Users'), {
    headers: { 'X-Emby-Authorization': jellyfinAuthHeader(adminToken) },
  })
  if (!res.ok) throw new Error(`Jellyfin /Users failed (${res.status})`)
  return (await res.json()) as JellyfinUser[]
}

// Items endpoint for the Jellyfin index cron - movies + series with playback status.
export async function* jellyfinStreamItems(
  baseUrl: string,
  adminUserId: string,
  adminToken: string,
  opts: { includeItemTypes?: string } = {},
): AsyncGenerator<JellyfinIndexedItem> {
  const include = opts.includeItemTypes ?? 'Movie,Series'
  let startIndex = 0
  const limit = 500
  while (true) {
    const url = new URL(joinUrl(baseUrl, `/Users/${adminUserId}/Items`))
    url.searchParams.set('Recursive', 'true')
    url.searchParams.set('IncludeItemTypes', include)
    url.searchParams.set('Fields', 'Path,UserData')
    url.searchParams.set('StartIndex', String(startIndex))
    url.searchParams.set('Limit', String(limit))
    const res = await fetch(url, { headers: { 'X-Emby-Authorization': jellyfinAuthHeader(adminToken) } })
    if (!res.ok) throw new Error(`Jellyfin items failed (${res.status})`)
    const json = (await res.json()) as { Items?: JellyfinIndexedItem[]; TotalRecordCount?: number }
    for (const it of json.Items ?? []) yield it
    startIndex += limit
    if (startIndex >= (json.TotalRecordCount ?? 0)) break
  }
}

export type JellyfinIndexedItem = {
  Id: string
  Name: string
  Path?: string
  UserData?: { Played?: boolean; LastPlayedDate?: string; PlaybackPositionTicks?: number; RunTimeTicks?: number }
}

// Build a deep link to the Jellyfin web client.
export function jellyfinWebUrl(baseUrl: string, itemId: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}/web/index.html#/details?id=${itemId}`
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

// Helper for Nitro routes to read the user token from the signed cookie.
// We use our own HMAC scheme (see server/lib/crypto.ts) instead of h3's
// readSignedCookie so the same APP_MASTER_KEY signs both cookies and settings.
export function getCookieToken(event: H3Event): string | null {
  const raw = getCookie(event, 'mm_session')
  if (!raw) return null
  const verified = verify(raw)
  if (!verified) return null
  const [token] = verified.split('|')
  return token || null
}