import { setHeader, setResponseStatus } from 'h3'
import { useSqlite } from '~/server/db'
import { getRestoreChild } from '~/server/lib/restore-registry'

// GET /api/restore/[jobId]/events
// Server-Sent Events stream of restore progress + completion for the given job.
//
// Event format (one per line, SSE):
//   event: progress\ndata: {"pct":42,"bytes":123456}\n\n
//   event: done\ndata: {"error":null}\n\n   (or {"error":"rclone exit 1"})
export default defineEventHandler((event) => {
  const jobId = Number(getRouterParam(event, 'jobId'))
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid jobId' })
  }

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')
  setResponseStatus(event, 200)

  const sqlite = useSqlite()
  const stmt = sqlite.prepare(`SELECT progress, status, error FROM jobs WHERE id=?`)

  const send = (evt: string, data: unknown) => {
    event.node.res.write(`event: ${evt}\n`)
    event.node.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  let lastPct = -1
  let closed = false

  // Poll the jobs table (single replica, low frequency) and stream updates.
  const timer = setInterval(() => {
    if (closed) return
    const row = stmt.get(jobId) as { progress: number; status: string; error: string | null } | undefined
    if (!row) {
      send('error', { message: 'job not found' })
      return cleanup()
    }
    if (row.progress !== lastPct) {
      lastPct = row.progress
      send('progress', { pct: row.progress })
    }
    if (row.status === 'done') {
      send('done', { error: null })
      cleanup()
    } else if (row.status === 'failed') {
      send('done', { error: row.error ?? 'restore failed' })
      cleanup()
    }
  }, 1000)

  function cleanup() {
    if (closed) return
    closed = true
    clearInterval(timer)
    event.node.res.end()
  }

  event.node.req.on('close', cleanup)
  event.node.req.on('error', cleanup)

  // If the job already finished before the client subscribed, drain it now.
  const row = stmt.get(jobId) as { progress: number; status: string; error: string | null } | undefined
  if (row && (row.status === 'done' || row.status === 'failed')) {
    send(row.status === 'done' ? 'done' : 'error', { error: row.error })
    cleanup()
  }

  // Touch the registry so esbuild keeps the import live for the export map.
  void getRestoreChild(jobId)

  return // returning lets h3 know we've taken over the response
})