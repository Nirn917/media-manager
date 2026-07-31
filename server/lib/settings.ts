import { eq } from 'drizzle-orm'
import { settings } from '../db/schema'
import { useDb } from '../db'
import { decryptJSON, encryptJSON } from './crypto'

// Keys stored in the settings table (encrypted blob in the value column).
export const SETTING_KEYS = {
  JELLYFIN: 'jellyfin',           // { url, adminUserId?, adminUsername?, adminPassword? }
  RADARR: 'radarr',               // { url, apiKey }
  SONARR: 'sonarr',               // { url, apiKey }
  ADMIN: 'admin',                 // { jellyfinUserId, jellyfinUsername }
} as const

export type JellyfinSettings = { url: string; adminUsername?: string; adminPassword?: string; adminUserId?: string }
export type RadarrSettings = { url: string; apiKey: string }
export type SonarrSettings = { url: string; apiKey: string }
export type AdminSettings = { jellyfinUserId: string; jellyfinUsername: string }

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = useDb()
  const blob = encryptJSON(value)
  await db.insert(settings).values({ key, value: blob })
    .onConflictDoUpdate({ target: settings.key, set: { value: blob } })
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const db = useDb()
  const row = await db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row) return null
  return decryptJSON<T>(row.value)
}

export async function getAllSettings(): Promise<{
  jellyfin: JellyfinSettings | null
  radarr: RadarrSettings | null
  sonarr: SonarrSettings | null
  admin: AdminSettings | null
}> {
  const [jellyfin, radarr, sonarr, admin] = await Promise.all([
    getSetting<JellyfinSettings>(SETTING_KEYS.JELLYFIN),
    getSetting<RadarrSettings>(SETTING_KEYS.RADARR),
    getSetting<SonarrSettings>(SETTING_KEYS.SONARR),
    getSetting<AdminSettings>(SETTING_KEYS.ADMIN),
  ])
  return { jellyfin, radarr, sonarr, admin }
}

// True until the setup wizard has been completed (Jellyfin + Radarr + Sonarr configured).
export async function isSetupComplete(): Promise<boolean> {
  const { jellyfin, radarr, sonarr } = await getAllSettings()
  return !!(jellyfin?.url && radarr?.apiKey && sonarr?.apiKey)
}