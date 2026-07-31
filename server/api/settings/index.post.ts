import { setSetting, getAllSettings, SETTING_KEYS } from '~/server/lib/settings'

// POST /api/settings -> update any of Jellyfin / Radarr / Sonarr / admin fields.
// Only sends fields present in the body; missing fields keep their existing value.
// Password only updates if a non-empty string is sent.
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    jellyfin?: { url?: string; adminUserId?: string; adminUsername?: string; adminPassword?: string }
    radarr?: { url?: string; apiKey?: string }
    sonarr?: { url?: string; apiKey?: string }
  }>(event)

  if (body.jellyfin) {
    // Merge with existing settings (so we don't lose the password if unset).
    const existing = (await getAllSettings()).jellyfin ?? {
      url: '', adminUserId: '', adminUsername: '', adminPassword: '',
    }
    await setSetting(SETTING_KEYS.JELLYFIN, {
      url: (body.jellyfin.url ?? existing.url).replace(/\/$/, ''),
      adminUserId: body.jellyfin.adminUserId ?? existing.adminUserId,
      adminUsername: body.jellyfin.adminUsername ?? existing.adminUsername,
      adminPassword: body.jellyfin.adminPassword
        ? body.jellyfin.adminPassword
        : existing.adminPassword,
    })
    if (body.jellyfin.adminUserId && body.jellyfin.adminUsername) {
      await setSetting(SETTING_KEYS.ADMIN, { jellyfinUserId: body.jellyfin.adminUserId, jellyfinUsername: body.jellyfin.adminUsername })
    }
  }
  if (body.radarr) {
    const existing = (await getAllSettings()).radarr ?? { url: '', apiKey: '' }
    await setSetting(SETTING_KEYS.RADARR, {
      url: (body.radarr.url ?? existing.url).replace(/\/$/, ''),
      apiKey: body.radarr.apiKey ?? existing.apiKey,
    })
  }
  if (body.sonarr) {
    const existing = (await getAllSettings()).sonarr ?? { url: '', apiKey: '' }
    await setSetting(SETTING_KEYS.SONARR, {
      url: (body.sonarr.url ?? existing.url).replace(/\/$/, ''),
      apiKey: body.sonarr.apiKey ?? existing.apiKey,
    })
  }
  return { ok: true }
})