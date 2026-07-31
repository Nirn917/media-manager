import { setSetting, SETTING_KEYS } from '~/server/lib/settings'
import { jellyfinAuthenticate } from '~/server/lib/jellyfin'

// POST /api/setup/save
// Persists Jellyfin + Radarr + Sonarr config (encrypted) and the admin user.
// Body:
//   { jellyfin: { url, adminUsername, adminPassword, adminUserId? },
//     radarr:   { url, apiKey },
//     sonarr:   { url, apiKey } }
//
// If `jellyfin.adminUserId` was not filled by the wizard's "Test connection"
// step (the user skipped it), we re-authenticate against Jellyfin here to
// resolve the admin user's id. This keeps the wizard usable without forcing
// the test button.
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    jellyfin?: { url?: string; adminUsername?: string; adminPassword?: string; adminUserId?: string }
    radarr?: { url?: string; apiKey?: string }
    sonarr?: { url?: string; apiKey?: string }
  }>(event)

  const j = body.jellyfin || {}
  const r = body.radarr || {}
  const s = body.sonarr || {}

  // Helpful per-field validation so the UI shows what's missing instead of
  // a bare "missing fields".
  const missing: string[] = []
  if (!j.url) missing.push('jellyfin.url')
  if (!j.adminUsername) missing.push('jellyfin.adminUsername')
  if (!j.adminPassword) missing.push('jellyfin.adminPassword')
  if (!r.url) missing.push('radarr.url')
  if (!r.apiKey) missing.push('radarr.apiKey')
  if (!s.url) missing.push('sonarr.url')
  if (!s.apiKey) missing.push('sonarr.apiKey')
  if (missing.length) {
    throw createError({ statusCode: 400, statusMessage: `missing fields: ${missing.join(', ')}` })
  }

  // Resolve the Jellyfin admin user id if the wizard didn't already.
  let adminUserId = (j.adminUserId || '').trim()
  if (!adminUserId) {
    try {
      const auth = await jellyfinAuthenticate(j.url!.replace(/\/$/, ''), j.adminUsername!, j.adminPassword!)
      adminUserId = auth.user.id
    } catch (err) {
      throw createError({
        statusCode: 400,
        statusMessage: `could not resolve Jellyfin admin user: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  await setSetting(SETTING_KEYS.JELLYFIN, {
    url: j.url!.replace(/\/$/, ''),
    adminUserId,
    adminUsername: j.adminUsername!,
    adminPassword: j.adminPassword!,
  })
  await setSetting(SETTING_KEYS.RADARR, { url: r.url!.replace(/\/$/, ''), apiKey: r.apiKey!.trim() })
  await setSetting(SETTING_KEYS.SONARR, { url: s.url!.replace(/\/$/, ''), apiKey: s.apiKey!.trim() })
  await setSetting(SETTING_KEYS.ADMIN, { jellyfinUserId: adminUserId, jellyfinUsername: j.adminUsername! })

  return { ok: true }
})