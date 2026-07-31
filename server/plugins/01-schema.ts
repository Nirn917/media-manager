import { ensureSchema } from '~/server/db'
import { failStuckJobs } from '~/server/lib/jobs'

// Ensures the SQLite schema exists before the first request is served, and
// flips any 'running' jobs left from a crash to 'failed' so the UI can retry.
export default defineNitroPlugin(() => {
  try {
    ensureSchema()
    failStuckJobs()
    // eslint-disable-next-line no-console
    console.log('[media-manager] schema ready')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[media-manager] schema init failed:', err)
  }
})