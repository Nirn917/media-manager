// Session cookie format (encrypted with APP_MASTER_KEY via server/lib/crypto.encrypt):
//   mm_session = encrypt("<token>|<userId>|<username>|<isAdmin|0|1>")
// All fields are pipe-delimited. AES-256-GCM encryption provides both
// confidentiality and tamper detection for the whole payload.
export type SessionPayload = {
  token: string
  userId: string
  username: string
  isAdmin: boolean
}

export const SESSION_COOKIE = 'mm_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export function encodeSessionCookie(p: SessionPayload): string {
  return `${p.token}|${p.userId}|${p.username}|${p.isAdmin ? 1 : 0}`
}

export function parseSessionCookie(raw: string): SessionPayload | null {
  const parts = raw.split('|')
  if (parts.length !== 4) return null
  const [token, userId, username, isAdmin] = parts as [string, string, string, string]
  return { token, userId, username, isAdmin: isAdmin === '1' }
}

export const SESSION_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
  // secure: true in production - the.Envoy Gateway terminates TLS so the
  // browser always speaks https to us.
  secure: process.env.NODE_ENV === 'production',
}