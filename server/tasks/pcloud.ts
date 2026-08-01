import { useSqlite } from '~/server/db'
import { rcloneLsf, rcloneRemoteBase, type RcloneListEntry } from '~/server/lib/rclone'

// Nitro scheduled task: `pcloud:index`.
// Runs hourly (see nuxt.config.nitro.scheduledTasks) + can be triggered
// manually via POST /api/pcloud/resync.
//
// Scans `rclone lsf pcloud:media --recursive --json --checksum`, parses each
// JSON line, derives `category` from the first path segment, and atomically
// replaces the `pcloud_index` table.
export default defineTask({
  meta: { name: 'pcloud', description: 'Reindex pCloud via rclone lsf' },
  async run(): Promise<{ result: { count: number; log: string[]; success: boolean } }> {
    const log: string[] = []
    const started = Date.now()
    console.log('[cron] pcloud:index started')
    try {
      log.push('running rclone lsjson…')
      const entries = await rcloneLsf(rcloneRemoteBase())
      const rows = entries
        .filter((e: RcloneListEntry) => e.Path && !e.IsDir)
        .map((e: RcloneListEntry) => {
          const p = e.Path as string
          const category = (p.split('/')[0] || 'movies') as 'movies' | 'series' | 'anime'
          return {
            path: p,
            size: e.Size ?? 0,
            modtime: e.ModTime ?? null,
            hash: e.Hash ?? null,
            category,
          }
        })

      // Run the replace inside a transaction using the underlying
      // better-sqlite3 handle (synchronous - fast even for ~10k files).
      const sqlite = useSqlite()
      sqlite.exec('BEGIN')
      try {
        sqlite.exec('DELETE FROM pcloud_index')
        const stmt = sqlite.prepare(
          'INSERT INTO pcloud_index (path, size, modtime, hash, category) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(path) DO UPDATE SET size=excluded.size, modtime=excluded.modtime, hash=excluded.hash, category=excluded.category',
        )
        for (const r of rows) stmt.run([r.path, r.size, r.modtime, r.hash, r.category])
        sqlite.exec('COMMIT')
      } catch (err) {
        sqlite.exec('ROLLBACK')
        throw err
      }

      const elapsed = ((Date.now() - started) / 1000).toFixed(1)
      log.push(`indexed ${rows.length} entries`)
      console.log(`[cron] pcloud:index done - ${rows.length} entries in ${elapsed}s`)
      return { result: { count: rows.length, log, success: true } }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const elapsed = ((Date.now() - started) / 1000).toFixed(1)
      log.push(`failed: ${msg}`)
      console.error(`[cron] pcloud:index failed in ${elapsed}s - ${msg}`)
      return { result: { count: 0, log, success: false } }
    }
  },
})