import { readSession } from '~/server/lib/auth'

// GET /api/auth/me -> { authed: bool, user?: {...}, isAdmin?: bool }
// Trusts the HMAC-signed cookie — does NOT re-validate against Jellyfin on
// every call. The cookie signature already proves it wasn't tampered. If the
// Jellyfin token inside expires, API calls that use it will 401 and the
// frontend can handle that (redirect to /login).
export default defineEventHandler((event) => {
  const session = readSession(event)
  if (!session) return { authed: false }
  return {
    authed: true,
    user: { id: session.userId, name: session.username, isAdmin: session.isAdmin },
  }
})