// Radarr + Sonarr v3 REST clients (shared shape, differs only by root folder
// filter and a couple of command payloads).

type MediaType = 'movie' | 'series'

export type ArrMediaItem = {
  id: number
  title: string
  rootFolderPath: string
  path?: string
  size?: number
  hasFile?: boolean
  monitored?: boolean
  images?: { coverType: string; remoteUrl: string; url: string }[]
  // Sonarr-specific
  seriesType?: 'standard' | 'anime' | 'daily'
  // Radarr-specific
  movieFile?: { path: string; size: number }
}

export type ArrInstance = {
  url: string
  apiKey: string
  type: 'radarr' | 'sonarr'
}

function withKey(url: string, apiKey: string): string {
  const u = new URL(url)
  u.searchParams.set('apiKey', apiKey)
  return u.toString()
}

async function arrFetch<T = unknown>(instance: ArrInstance, path: string, init: RequestInit = {}): Promise<T> {
  const full = `${instance.url.replace(/\/$/, '')}${path}`
  const url = path.includes('apiKey=') ? full : withKey(full, instance.apiKey)
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${instance.type} ${path} failed (${res.status}): ${body}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function arrSystemStatus(instance: ArrInstance): Promise<{ appName?: string; version?: string }> {
  return arrFetch(instance, '/api/v3/system/status')
}

export async function arrListMedia(instance: ArrInstance): Promise<ArrMediaItem[]> {
  const path = instance.type === 'radarr' ? '/api/v3/movie' : '/api/v3/series'
  return arrFetch<ArrMediaItem[]>(instance, path)
}

export async function arrGetMedia(instance: ArrInstance, id: number): Promise<ArrMediaItem> {
  const path = instance.type === 'radarr' ? `/api/v3/movie/${id}` : `/api/v3/series/${id}`
  return arrFetch<ArrMediaItem>(instance, path)
}

export async function arrDeleteMedia(
  instance: ArrInstance,
  id: number,
  opts: { deleteFiles?: boolean; addImportExclusion?: boolean } = {},
): Promise<void> {
  const path = instance.type === 'radarr' ? `/api/v3/movie/${id}` : `/api/v3/series/${id}`
  const params = new URLSearchParams()
  if (opts.deleteFiles ?? true) params.set('deleteFiles', 'true')
  if (opts.addImportExclusion !== undefined) params.set('addImportExclusion', String(opts.addImportExclusion))
  await arrFetch(instance, `${path}?${params.toString()}`, { method: 'DELETE' })
}

export async function arrRefresh(instance: ArrInstance, mediaId: number): Promise<void> {
  const name = instance.type === 'radarr' ? 'RefreshMovie' : 'RefreshSeries'
  const idKey = instance.type === 'radarr' ? 'movieId' : 'seriesId'
  await arrFetch(instance, '/api/v3/command', {
    method: 'POST',
    body: JSON.stringify({ name, [idKey]: mediaId }),
  })
}

export async function arrRescanMovieFiles(instance: ArrInstance): Promise<void> {
  // "RescanMovieFolders" makes *arr look at the disk and pick up newly restored files.
  const name = instance.type === 'radarr' ? 'RescanMovieFolders' : 'RescanSeriesFolders'
  await arrFetch(instance, '/api/v3/command', { method: 'POST', body: JSON.stringify({ name }) })
}

// Resolve the configured root folder for a category.
export const ROOT_FOLDER = {
  movies: '/data/movies',
  series: '/data/series',
  anime: '/data/anime',
} as const

export function filterByRootFolder(items: ArrMediaItem[], rootFolder: string): ArrMediaItem[] {
  return items.filter((m) => (m.rootFolderPath || '').replace(/\/$/, '') === rootFolder.replace(/\/$/, ''))
}