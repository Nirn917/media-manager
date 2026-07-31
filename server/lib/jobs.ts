import { useSqlite } from '~/server/db'
import { jobs, type Job } from '~/server/db/schema'
import { getAllSettings } from '~/server/lib/settings'
import { arrGetMedia, ROOT_FOLDER, type ArrInstance } from '~/server/lib/arr'
import { rcloneRemoteBase, spawnRcloneCopy } from '~/server/lib/rclone'
import type { H3Event } from 'h3'
import type { Category } from '~/types/media'

const ROOT_BY_CATEGORY: Record<Category, string> = {
  movies: ROOT_FOLDER.movies,
  series: ROOT_FOLDER.series,
  anime: ROOT_FOLDER.anime,
}

// Resolve the arr instance for a category and fetch the media item by ID.
export async function resolveArrMedia(event: H3Event, category: Category, mediaId: number) {
  const { radarr, sonarr } = await getAllSettings()
  if (!radarr || !sonarr) throw createError({ statusCode: 400, statusMessage: 'not configured' })

  const inst: ArrInstance = category === 'movies'
    ? { ...radarr, type: 'radarr' }
    : { ...sonarr, type: 'sonarr' }

  const item = await arrGetMedia(inst, mediaId)
  if ((item.rootFolderPath || '').replace(/\/$/, '') !== ROOT_BY_CATEGORY[category].replace(/\/$/, '')) {
    throw createError({ statusCode: 400, statusMessage: 'media not in this category (root folder mismatch)' })
  }

  const localPath = item.path || item.movieFile?.path || ''
  if (!localPath) throw createError({ statusCode: 400, statusMessage: 'media has no on-disk path' })

  // pCloud layout mirrors /data/media/<cat>/<rest...>; rclone lsf keys use
  // paths relative to `pcloud:media/`, so the first segment is the category.
  const stripped = localPath.replace(/^\/data\//, '')
  const remotePath = `${rcloneRemoteBase()}/${stripped}`

  return { inst, item, localPath, remotePath, stripped }
}

// Insert a job row ("running") for type/category/path and return its ID.
export async function createJob(opts: {
  type: 'restore' | 'archive' | 'delete_everywhere'
  path: string
  mediaId: number
  category: Category
}): Promise<number> {
  const sqlite = useSqlite()
  const stmt = sqlite.prepare(
    `INSERT INTO jobs (type, path, status, progress, started_at, media_id, category)
     VALUES (?, ?, 'running', 0, datetime('now'), ?, ?)`,
  )
  const r = stmt.run(opts.type, opts.path, opts.mediaId, opts.category) as { lastInsertRowid: number }
  return Number(r.lastInsertRowid)
}

export async function finishJob(id: number, status: 'done' | 'failed', error?: string) {
  const sqlite = useSqlite()
  sqlite.prepare(
    `UPDATE jobs SET status=?, error=?, finished_at=datetime('now') WHERE id=?`,
  ).run(status, error ?? null, id)
}

export async function updateJobProgress(id: number, pct: number) {
  const sqlite = useSqlite()
  sqlite.prepare(`UPDATE jobs SET progress=? WHERE id=?`).run(Math.min(100, Math.max(0, Math.round(pct))), id)
}

// Look up running jobs for a given local path (used by the one-job-per-path lock).
export function runningJobForPath(path: string): Job[] {
  const sqlite = useSqlite()
  const stmt = sqlite.prepare(`SELECT * FROM jobs WHERE path=? AND status='running'`)
  return stmt.all(path) as Job[]
}

// Mark every job that is still 'running' at boot as 'failed' so the UI can retry.
export function failStuckJobs() {
  const sqlite = useSqlite()
  sqlite.prepare(`UPDATE jobs SET status='failed', error='app restart', finished_at=datetime('now') WHERE status='running'`).run()
}