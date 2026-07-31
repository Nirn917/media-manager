import { getHeader } from 'h3'
import { useSqlite } from '~/server/db'
import { resolveArrMedia, createJob, finishJob, runningJobForPath } from '~/server/lib/jobs'
import { arrDeleteMedia } from '~/server/lib/arr'
import { rcloneRemoteBase, spawnRcloneDelete, parseRcloneLog } from '~/server/lib/rclone'
import type { Category } from '~/types/media'

const CONFIRM = 'supprimer'

// POST /api/delete/[category]/[mediaId]
// Same as Archive, plus it deletes the pCloud backup (irreversible).
// Gate: client must type "supprimer"; backend re-checks X-Confirm header.
export default defineEventHandler(async (event) => {
  const headerConfirm = (getHeader(event, 'x-confirm') || '').trim().toLowerCase()
  if (headerConfirm !== CONFIRM) {
    throw createError({ statusCode: 400, statusMessage: `X-Confirm header must equal "${CONFIRM}"` })
  }

  const category = getRouterParam(event, 'category') as Category | undefined
  const mediaId = Number(getRouterParam(event, 'mediaId'))
  if (!category || !['movies', 'series', 'anime'].includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid category' })
  }
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid mediaId' })
  }

  const { item, inst, localPath, stripped, remotePath } = await resolveArrMedia(event, category, mediaId)

  if (runningJobForPath(localPath).length) {
    throw createError({ statusCode: 409, statusMessage: 'A job is already running for this media' })
  }

  const jobId = await createJob({
    type: 'delete_everywhere',
    path: localPath,
    mediaId: item.id,
    category,
  })

  // Step 1: Archive the local copy via *arr (skip if already archived).
  try {
    await arrDeleteMedia(inst, item.id, { deleteFiles: true, addImportExclusion: false })
  } catch (err) {
    // If the *arr call fails because the movie is already gone, continue to
    // the pCloud delete - the user's intent is "remove everywhere".
    // eslint-disable-next-line no-console
    console.warn(`[delete #${jobId}] arr delete failed (continuing to pCloud):`, err)
  }

  // Step 2: Remove the pCloud backup.
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawnRcloneDelete(remotePath)
      let stderr = ''
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
      child.stdout?.on('data', (d: Buffer) => {
        for (const log of parseRcloneLog(d.toString())) {
          if (log.level === 'error') stderr += `${JSON.stringify(log)}\n`
        }
      })
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`rclone deletefile exit ${code}: ${stderr}`))))
    })

    // Drop all pCloud index rows for this media (directory + files inside it).
    const sqlite = useSqlite()
    sqlite.prepare(`DELETE FROM pcloud_index WHERE path = ? OR path LIKE ? || '/%'`).run(stripped, stripped)

    finishJob(jobId, 'done')
    return { ok: true, jobId, message: `Deleted "${item.title}" everywhere (local + pCloud backup)` }
  } catch (err) {
    finishJob(jobId, 'failed', err instanceof Error ? err.message : String(err))
    throw createError({ statusCode: 502, statusMessage: err instanceof Error ? err.message : 'pCloud delete failed' })
  }
})