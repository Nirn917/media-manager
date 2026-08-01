import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'
import {
  SESSION_COOKIE, SESSION_OPTIONS, encodeSessionCookie, parseSessionCookie,
  type SessionPayload,
} from '~/server/lib/session'
import { decrypt, encrypt } from '~/server/lib/crypto'

// Read + decrypt the session cookie. Returns the parsed payload or null.
// Invalid, tampered, or corrupted cookies fail closed (return null) so callers
// treat the request as unauthenticated rather than surfacing a 500.
export function readSession(event: H3Event): SessionPayload | null {
  const raw = getCookie(event, SESSION_COOKIE)
  if (!raw) return null
  try {
    const decrypted = decrypt(raw)
    return parseSessionCookie(decrypted)
  } catch {
    return null
  }
}

// Persist a freshly-authenticated Jellyfin session in an encrypted httpOnly cookie.
export function writeSession(event: H3Event, payload: SessionPayload): void {
  setCookie(event, SESSION_COOKIE, encrypt(encodeSessionCookie(payload)), SESSION_OPTIONS)
}

export function clearSession(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}