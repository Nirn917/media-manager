import { spawn } from 'node:child_process'

// In-process registry of running rclone restore processes keyed by jobId.
// The POST endpoint pushes an entry here when it starts the rclone copy; the
// SSE endpoint reads it to decide whether to keep the stream open. The
// authoritative status (progress/done/failed/error) lives in the `jobs` table,
// this map only exists to surface live child state for diagnostics.
export const restoreJobs = new Map<number, { child: ReturnType<typeof spawn>; done: boolean; error?: string }>()

export function registerRestoreChild(jobId: number, child: ReturnType<typeof spawn>) {
  restoreJobs.set(jobId, { child, done: false })
}

export function markRestoreDone(jobId: number, error?: string) {
  const e = restoreJobs.get(jobId)
  if (e) { e.done = true; e.error = error }
}

export function getRestoreChild(jobId: number) {
  return restoreJobs.get(jobId)
}