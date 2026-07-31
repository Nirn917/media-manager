import { useSqlite } from '~/server/db'

// GET /api/jobs -> recent jobs (newest first, capped at 200).
export default defineEventHandler(() => {
  const sqlite = useSqlite()
  const rows = sqlite.prepare(
    `SELECT id, type, path, status, progress, started_at, finished_at, error, media_id, category
     FROM jobs ORDER BY id DESC LIMIT 200`,
  ).all() as Array<{
    id: number; type: string; path: string | null; status: string; progress: number | null
    started_at: string | null; finished_at: string | null; error: string | null
    media_id: number | null; category: string
  }>
  return { jobs: rows }
})