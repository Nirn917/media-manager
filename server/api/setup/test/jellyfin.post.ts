import { jellyfinAuthenticate, jellyfinListUsers } from '~/server/lib/jellyfin'
import { assertSafeTargetUrlResolved, UnsafeUrlError } from '~/server/lib/url-safety'

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
    await assertSafeTargetUrlResolved(url)
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : 'invalid target URL'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  try {
    const auth = await jellyfinAuthenticate(url, username, password)
    // List users so the wizard can pick the Jellyfin admin (used for the index cron).
    let users: { id: string; name: string }[] = []
    try {
      users = (await jellyfinListUsers(url, auth.AccessToken)).map((u) => ({ id: u.Id, name: u.Name }))
    } catch { /* non-fatal - the wizard can still save */ }
    return { ok: true, adminUserId: auth.User.Id, adminUsername: auth.User.Name, users }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})