import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

interface RcloneConfig {
  configPath?: string
}

function rcloneConfigPath(): string {
  if (process.env.RCLONE_CONFIG) return process.env.RCLONE_CONFIG
  const rc = useRuntimeConfig?.()
  return rc?.rcloneConfig || '/config/rclone/rclone.conf'
}

// Shared base args for every rclone invocation: explicit config + JSON logging.
function baseArgs(extra: string[]): string[] {
  return ['--config', rcloneConfigPath(), '--use-json-log', ...extra]
}

export type RcloneListEntry = {
  Path?: string
  Name?: string
  IsDir?: boolean
  Size?: number
  ModTime?: string
  Hash?: string
  IDs?: string
}

// `rclone lsjson pcloud:media --recursive --hash`
// Outputs a single JSON array of objects with Path, Name, IsDir, Size,
// ModTime, Hash. This is the portable way to get structured output with
// hashes — `lsf --json --checksum` is not available on older rclone builds.
export async function rcloneLsf(remoteRoot = 'pcloud:media'): Promise<RcloneListEntry[]> {
  const args = baseArgs(['lsjson', remoteRoot, '--recursive', '--hash'])
  return new Promise((resolve, reject) => {
    const proc = spawn('rclone', args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`rclone lsjson exit ${code}: ${stderr}`))
      try {
        const parsed = JSON.parse(stdout)
        resolve(Array.isArray(parsed) ? parsed : [])
      } catch (err) {
        reject(new Error(`rclone lsjson parse error: ${err}`))
      }
    })
  })
}

// `rclone check` - compare local vs remote for a single file/path.
// Returns true if the remote file matches the local one (same hash) or if the
// remote entry exists with identical modtime/size. Non-existent local file
// still reports "matching" if the remote exists (the spec only gates on the
// remote backup being present, not on the local file existing).
export async function rcloneCheckMatch(localPath: string, remotePath: string): Promise<{ exists: boolean; matches: boolean; error?: string }> {
  try {
    const { stdout } = await execFileP('rclone', baseArgs(['check', localPath, remotePath]))
    const json = parseRcloneLog(stdout)
    const matched = (json as Array<{ level?: string; checks?: { matches?: number }; hash?: { matches?: number } }>)
      .some((l) => l.checks?.matches || l.hash?.matches)
    return { exists: true, matches: matched }
  } catch (err: unknown) {
    const e = err as { stdout?: string; code?: number }
    // rclone check exits non-zero on mismatch; parse the log to decide.
    if (e.stdout) {
      const log = parseRcloneLog(e.stdout)
      const has = log.some((l: Record<string, unknown>) => l.checks || l.hash)
      return { exists: has, matches: false, error: 'mismatch' }
    }
    return { exists: false, matches: false, error: 'rclone error' }
  }
}

export function spawnRcloneCopy(remotePath: string, localPath: string) {
  const args = baseArgs([
    'copy', remotePath, localPath, '--progress', '--stats', '2s', '--transfers', '2', '--checkers', '4',
  ])
  return spawn('rclone', args)
}

export function spawnRcloneDelete(remotePath: string) {
  const args = baseArgs(['deletefile', remotePath])
  return spawn('rclone', args)
}

// Push a single JSON log line into a callback (used by the SSE handler).
export type RcloneLogLine = Record<string, unknown>

export function parseRcloneLog(stream: string): RcloneLogLine[] {
  const out: RcloneLogLine[] = []
  for (const line of stream.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t) as RcloneLogLine) }
    catch { /* not a JSON log line */ }
  }
  return out
}

export function rcloneRemoteBase(): string {
  return 'pcloud:media'
}