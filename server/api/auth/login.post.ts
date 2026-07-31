import { jellyfinAuthenticate, jellyfinUsersMe } from '~/server/lib/jellyfin'
import { getAllSettings, SETTING_KEYS, getSetting } from '~/server/lib/settings'
import { writeSession } from '~/server/lib/auth'
import type { AdminSettings } from '~/server/lib/settings'

// POST /api/auth/login
// Body: { username, password }
// Flow: authenticate against Jellyfin -> store signed httpOnly cookie.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!username) throw createError({ statusCode: 400, statusMessage: 'username required' })

  const { jellyfin } = await getAllSettings()
  if (!jellyfin?.url) throw createError({ statusCode: 400, statusMessage: 'Jellyfin not configured' })

  const auth = await jellyfinAuthenticate(jellyfin.url, username, password)
  const me = await jellyfinUsersMe(jellyfin.url, auth.accessToken).catch(() => auth.user)

  const admin = await getSetting<AdminSettings>(SETTING_KEYS.ADMIN)
  const isAdmin = !!admin && admin.jellyfinUserId === me.id

  writeSession(event, {
    token: auth.accessToken,
    userId: me.id,
    username: me.name || username,
    isAdmin,
  })
  return { ok: true, user: { id: me.id, name: me.name, isAdmin } }
})