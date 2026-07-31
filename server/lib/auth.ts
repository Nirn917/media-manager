import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'
import {
  SESSION_COOKIE, SESSION_OPTIONS, encodeSessionCookie, parseSessionCookie,
  type SessionPayload,
} from '~/server/lib/session'
import { sign, verify } from '~/server/lib/crypto'

// Read + verify the session cookie. Returns the parsed payload or null.
export function readSession(event: H3Event): SessionPayload | null {
  const raw = getCookie(event, SESSION_COOKIE)
  if (!raw) return null
  const verified = verify(raw)
  if (!verified) return null
  return parseSessionCookie(verified)
}

// Persist a freshly-authenticated Jellyfin session in a signed httpOnly cookie.
export function writeSession(event: H3Event, payload: SessionPayload): void {
  setCookie(event, SESSION_COOKIE, sign(encodeSessionCookie(payload)), SESSION_OPTIONS)
}

export function clearSession(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}