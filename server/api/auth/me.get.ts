import { readSession } from '~/server/lib/auth'
import { jellyfinUsersMe } from '~/server/lib/jellyfin'
import { getAllSettings } from '~/server/lib/settings'

// GET /api/auth/me -> { authed: bool, user?: {...}, isAdmin?: bool }
// Validates the cookie by re-checking the Jellyfin token (server-side only).
// To lighten the load the validation is only performed on demand (this route);
// regular API calls trust the signed cookie signature instead.
export default defineEventHandler(async (event) => {
  const session = readSession(event)
  if (!session) return { authed: false }
  try {
    const { jellyfin } = await getAllSettings()
    if (jellyfin?.url) {
      await jellyfinUsersMe(jellyfin.url, session.token)
    }
  } catch {
    // Token expired / revoked -> treat as logged out.
    return { authed: false }
  }
  return {
    authed: true,
    user: { id: session.userId, name: session.username, isAdmin: session.isAdmin },
  }
})