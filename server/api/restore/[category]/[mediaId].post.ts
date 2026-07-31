import { spawnRcloneCopy, parseRcloneLog } from '~/server/lib/rclone'
import { arrRefresh, arrMonitor, type ArrInstance } from '~/server/lib/arr'
import { getAllSettings } from '~/server/lib/settings'
import { resolveArrMedia, createJob, finishJob, updateJobProgress, runningJobForPath } from '~/server/lib/jobs'
import { registerRestoreChild, markRestoreDone, getRestoreChild } from '~/server/lib/restore-registry'
import type { Category } from '~/types/media'

// In-process job registry lives in server/lib/restore-registry.ts.

function startRestoreJob(
  jobId: number,
  remotePath: string,
  localPath: string,
  meta: { mediaId: number; arrType: 'radarr' | 'sonarr' },
) {
  const child = spawnRcloneCopy(remotePath, localPath)
  registerRestoreChild(jobId, child)
  const entry = getRestoreChild(jobId)!

  let buf = ''
  const onChunk = (d: Buffer) => {
    buf += d.toString()
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      handleRcloneLog(jobId, line)
    }
  }
  child.stdout?.on('data', onChunk)
  child.stderr?.on('data', onChunk)
  child.on('error', (err) => {
    markRestoreDone(jobId, err.message)
    finishJob(jobId, 'failed', err.message)
  })
  child.on('close', async (code) => {
    markRestoreDone(jobId, code === 0 ? undefined : `rclone exit ${code}`)
    if (code === 0) {
      // Ask *arr to rescan so the media is re-marked as "possessed".
      // Also re-monitor so *arr tracks future changes after Archive unmonitored it.
      try {
        const { radarr, sonarr } = await getAllSettings()
        const inst: ArrInstance = meta.arrType === 'radarr'
          ? { ...radarr!, type: 'radarr' }
          : { ...sonarr!, type: 'sonarr' }
        await arrMonitor(inst, meta.mediaId, true)
        await arrRefresh(inst, meta.mediaId)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[restore #${jobId}] arr refresh failed:`, err)
      }
      updateJobProgress(jobId, 100)
      finishJob(jobId, 'done')
    } else {
      finishJob(jobId, 'failed', `rclone exit ${code}`)
    }
  })
}

function handleRcloneLog(jobId: number, line: string) {
  for (const log of parseRcloneLog(line)) {
    const pct = log.percentage
      ? Number(log.percentage)
      : (log.totalBytes != null && log.bytes != null)
        ? (Number(log.bytes) / Number(log.totalBytes)) * 100
        : null
    if (pct != null && Number.isFinite(pct)) updateJobProgress(jobId, pct)
  }
}

// POST /api/restore/[category]/[mediaId]
// Starts an rclone copy (pcloud:media/<cat>/<...> -> /data/<cat>/<...>) and
// returns the job ID. Progress is streamed via GET /api/restore/[jobId]/events.
export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category') as Category | undefined
  const mediaId = Number(getRouterParam(event, 'mediaId'))
  if (!category || !['movies', 'series', 'anime'].includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid category' })
  }
  if (!Number.isFinite(mediaId) || mediaId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid mediaId' })
  }

  const { item, localPath, remotePath } = await resolveArrMedia(event, category, mediaId)

  const running = runningJobForPath(localPath)
  if (running.length) {
    throw createError({ statusCode: 409, statusMessage: `Already running as job #${running[0]!.id}` })
  }

  const jobId = await createJob({
    type: 'restore',
    path: localPath,
    mediaId: item.id,
    category,
  })

  startRestoreJob(jobId, remotePath, localPath, {
    mediaId: item.id,
    arrType: category === 'movies' ? 'radarr' : 'sonarr',
  })

  return { jobId, message: `Restore queued from ${remotePath}` }
})