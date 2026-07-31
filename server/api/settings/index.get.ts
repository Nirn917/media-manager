import { getAllSettings } from '~/server/lib/settings'

// GET /api/settings -> current settings (admin only via 01-auth middleware).
// Passwords are *not* echoed back - the UI shows placeholders.
export default defineEventHandler(async () => {
  const { jellyfin, radarr, sonarr, admin } = await getAllSettings()
  return {
    jellyfin: jellyfin ? {
      url: jellyfin.url,
      adminUserId: jellyfin.adminUserId,
      adminUsername: jellyfin.adminUsername,
      hasPassword: !!jellyfin.adminPassword,
    } : null,
    radarr: radarr ? { url: radarr.url, apiKey: radarr.apiKey } : null,
    sonarr: sonarr ? { url: sonarr.url, apiKey: sonarr.apiKey } : null,
    admin: admin ?? null,
  }
})