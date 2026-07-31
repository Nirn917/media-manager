import { jellyfinAuthenticate, jellyfinListUsers } from '~/server/lib/jellyfin'
import { arrSystemStatus } from '~/server/lib/arr'

// POST /api/setup/test/jellyfin
// Body: { url, username, password }
// Returns: { ok: true, adminUserId, users: [{...}] } on success, { ok: false, error } on failure.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string; username?: string; password?: string }>(event)
  const url = (body.url || '').trim().replace(/\/$/, '')
  const username = (body.username || '').trim()
  const password = body.password || ''
  if (!url || !username) {
    throw createError({ statusCode: 400, statusMessage: 'url + username required' })
  }
  try {
    const auth = await jellyfinAuthenticate(url, username, password)
    // List users so the wizard can pick the Jellyfin admin (used for the index cron).
    let users: { id: string; name: string }[] = []
    try {
      users = (await jellyfinListUsers(url, auth.accessToken)).map((u) => ({ id: u.id, name: u.name }))
    } catch { /* non-fatal - the wizard can still save */ }
    return { ok: true, adminUserId: auth.user.id, adminUsername: auth.user.name, users }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})