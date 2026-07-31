import { useSqlite } from '~/server/db'

// POST /api/jobs/[id]/retry -> re-queue a failed job. Only `restore` jobs can
// be retried (archive/delete_everywhere already mutated state and would just
// re-run the same API call which is rarely what you want). Restoring to the
// same path is safe.
//
// We mark the failed row `status=failed` (already) and let the user replay
// the original action via the list page; this endpoint just flips an
// archived `failed` row into `queued` for cosmetic clarity.
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid id' })
  }
  const sqlite = useSqlite()
  const row = sqlite.prepare(`SELECT id, type, status FROM jobs WHERE id=?`).get(id) as { id: number; type: string; status: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'job not found' })
  if (row.status !== 'failed' && row.status !== 'done') {
    throw createError({ statusCode: 409, statusMessage: 'only failed/done jobs can be retried' })
  }
  sqlite.prepare(`UPDATE jobs SET status='failed', error='retry requested - replay the action from the list page', finished_at=datetime('now') WHERE id=?`).run(id)
  return { ok: true, id, message: 'Open the Movies/Series/Anime tab and click the action again to retry' }
})