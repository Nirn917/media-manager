import { setResponseHeader } from 'h3'
import { jellyfinAuthenticate, jellyfinUsersMe } from '~/server/lib/jellyfin'
import { getAllSettings, SETTING_KEYS, getSetting } from '~/server/lib/settings'
import { writeSession } from '~/server/lib/auth'
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from '~/server/lib/rate-limit'
import type { AdminSettings } from '~/server/lib/settings'

// POST /api/auth/login
// Body: { username, password }
// Flow: authenticate against Jellyfin -> store signed httpOnly cookie.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!username) throw createError({ statusCode: 400, statusMessage: 'username required' })

  const limit = checkLoginRateLimit(event)
  if (!limit.allowed) {
    setResponseHeader(event, 'Retry-After', Math.ceil((limit.retryAfterMs ?? 0) / 1000))
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many failed login attempts. Please try again later.',
    })
  }

  const { jellyfin } = await getAllSettings()
  if (!jellyfin?.url) throw createError({ statusCode: 400, statusMessage: 'Jellyfin not configured' })

  let auth: Awaited<ReturnType<typeof jellyfinAuthenticate>>
  try {
    auth = await jellyfinAuthenticate(jellyfin.url, username, password)
  } catch (err) {
    recordLoginFailure(event)
    throw createError({
      statusCode: 401,
      statusMessage: `Jellyfin authentication failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  recordLoginSuccess(event)
  const me = await jellyfinUsersMe(jellyfin.url, auth.AccessToken).catch(() => auth.User)

  const admin = await getSetting<AdminSettings>(SETTING_KEYS.ADMIN)
  const isAdmin = !!admin && admin.jellyfinUserId === me.Id

  writeSession(event, {
    token: auth.AccessToken,
    userId: me.Id,
    username: me.Name || username,
    isAdmin,
  })
  return { ok: true, user: { id: me.Id, name: me.Name, isAdmin } }
})