import { useSqlite } from '~/server/db'
import { resolveArrMedia, createJob, finishJob, runningJobForPath } from '~/server/lib/jobs'
import { arrDeleteMedia } from '~/server/lib/arr'
import type { Category } from '~/types/media'

// POST /api/archive/[category]/[mediaId]
// Verifies the backup exists in pcloud_index, then calls the *arr DELETE
// endpoint with deleteFiles=true which removes /data/media/<cat>/<...> and
// marks the media as "not possessed". Backend enforces admin-only via the
// 01-auth middleware (destructive verbs need the admin session).
export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category') as Category | undefined
  const mediaId = Number(getRouterParam(event, 'mediaId'))
  if (!category || !['movies', 'series', 'anime'].includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid category' })
  }
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid mediaId' })
  }

  const { item, inst, localPath, stripped } = await resolveArrMedia(event, category, mediaId)

  // Safety check: verify the backup is present in the pcloud_index.
  // Radarr/Sonarr return directory paths (e.g. movies/Title) but pCloud
  // index stores file paths (e.g. movies/Title/file.mkv). Match by prefix.
  const sqlite = useSqlite()
  const backupRow = sqlite.prepare(
    `SELECT path FROM pcloud_index WHERE path = ? OR path LIKE ? || '/%' LIMIT 1`,
  ).get(stripped, stripped) as { path: string } | undefined
  if (!backupRow) {
    throw createError({ statusCode: 409, statusMessage: 'Backup not verified - run a pCloud resync first' })
  }

  // One archive at a time per path.
  if (runningJobForPath(localPath).length) {
    throw createError({ statusCode: 409, statusMessage: 'A job is already running for this media' })
  }

  const jobId = await createJob({
    type: 'archive',
    path: localPath,
    mediaId: item.id,
    category,
  })

  try {
    await arrDeleteMedia(inst, item.id, { deleteFiles: true, addImportExclusion: false })
    finishJob(jobId, 'done')
    return { ok: true, jobId, message: `Archived "${item.title}" (local files removed, pCloud backup kept)` }
  } catch (err) {
    finishJob(jobId, 'failed', err instanceof Error ? err.message : String(err))
    throw createError({ statusCode: 502, statusMessage: err instanceof Error ? err.message : 'archive failed' })
  }
})