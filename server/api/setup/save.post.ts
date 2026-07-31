import { setSetting, SETTING_KEYS } from '~/server/lib/settings'

// POST /api/setup/save
// Persists Jellyfin + Radarr + Sonarr config (encrypted) and the admin user.
// Body schema:
//   {
//     jellyfin: { url, adminUsername, adminPassword, adminUserId },
//     radarr:   { url, apiKey },
//     sonarr:   { url, apiKey },
//   }
// Returns { ok: true }.
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    jellyfin?: { url?: string; adminUsername?: string; adminPassword?: string; adminUserId?: string }
    radarr?: { url?: string; apiKey?: string }
    sonarr?: { url?: string; apiKey?: string }
  }>(event)

  const j = body.jellyfin || {}
  const r = body.radarr || {}
  const s = body.sonarr || {}
  if (!j.url || !j.adminUserId || !j.adminUsername || !r.url || !r.apiKey || !s.url || !s.apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'missing fields' })
  }

  await setSetting(SETTING_KEYS.JELLYFIN, {
    url: j.url.replace(/\/$/, ''),
    adminUserId: j.adminUserId,
    adminUsername: j.adminUsername,
    adminPassword: j.adminPassword, // kept so the Jellyfin index cron can re-auth if needed
  })
  await setSetting(SETTING_KEYS.RADARR, { url: r.url.replace(/\/$/, ''), apiKey: r.apiKey.trim() })
  await setSetting(SETTING_KEYS.SONARR, { url: s.url.replace(/\/$/, ''), apiKey: s.apiKey.trim() })
  await setSetting(SETTING_KEYS.ADMIN, { jellyfinUserId: j.adminUserId, jellyfinUsername: j.adminUsername })

  return { ok: true }
})