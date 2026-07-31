import { useSqlite } from '~/server/db'
import { jellyfinStreamItems, jellyfinWebUrl, jellyfinAuthenticate } from '~/server/lib/jellyfin'
import { getAllSettings } from '~/server/lib/settings'

// Nitro scheduled task: `jellyfin:index`.
// Hourly - re-authenticates with the saved Jellyfin admin credentials, fetches
// every Movie + Series item with its UserData, and atomically replaces the
// `jellyfin_index` table.
//
// The UI reads this table to render the watched/partial/unwatched badge and
// the "last played" timestamp on each media card.
export default defineTask({
  meta: { name: 'jellyfin', description: 'Reindex Jellyfin playback status' },
  async run(): Promise<{ result: { count: number; log: string[]; success: boolean } }> {
    const log: string[] = []
    try {
      const { jellyfin, admin } = await getAllSettings()
      if (!jellyfin?.url || !admin?.jellyfinUserId) {
        log.push('jellyfin not configured - skipping')
        return { result: { count: 0, log, success: false } }
      }

      // The cron uses a fresh admin token; re-auth via the stored credentials.
      let token = ''
      if (jellyfin.adminUsername && jellyfin.adminPassword) {
        const auth = await jellyfinAuthenticate(jellyfin.url, jellyfin.adminUsername, jellyfin.adminPassword)
        token = auth.AccessToken
      } else {
        log.push('missing admin credentials - cannot index')
        return { result: { count: 0, log, success: false } }
      }

      const rows: { path: string; item_id: string; title: string; played: number; last_played: string; jellyfin_url: string }[] = []
      for await (const item of jellyfinStreamItems(jellyfin.url, admin.jellyfinUserId, token, { includeItemTypes: 'Movie,Series' })) {
        const p = item.Path
        if (!p) continue
        const ud = item.UserData
        rows.push({
          path: p,
          item_id: item.Id,
          title: item.Name,
          played: ud?.Played ? 1 : 0,
          last_played: ud?.LastPlayedDate ?? '',
          jellyfin_url: jellyfinWebUrl(jellyfin.url, item.Id),
        })
      }

      const sqlite = useSqlite()
      sqlite.exec('BEGIN')
      let count = 0
      try {
        sqlite.exec('DELETE FROM jellyfin_index')
        const stmt = sqlite.prepare(
          'INSERT INTO jellyfin_index (path, item_id, title, played, last_played, jellyfin_url) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(path) DO UPDATE SET item_id=excluded.item_id, title=excluded.title, played=excluded.played, last_played=excluded.last_played, jellyfin_url=excluded.jellyfin_url',
        )
        for (const r of rows) stmt.run([r.path, r.item_id, r.title ?? '', r.played, r.last_played, r.jellyfin_url])
        sqlite.exec('COMMIT')
        count = rows.length
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }

      log.push(`indexed ${count} items`)
      return { result: { count, log, success: true } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.push(`failed: ${msg}`)
      return { result: { count: 0, log, success: false } }
    }
  },
})