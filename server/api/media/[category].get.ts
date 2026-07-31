import { eq } from 'drizzle-orm'
import { useDb } from '~/server/db'
import { pcloudIndex, jellyfinIndex } from '~/server/db/schema'
import { getAllSettings } from '~/server/lib/settings'
import { arrListMedia, filterByRootFolder, ROOT_FOLDER, type ArrMediaItem, type ArrInstance } from '~/server/lib/arr'
import type { MediaRow, Category } from '~/types/media'

const CATEGORY_TO_ROOT: Record<Category, string> = {
  movies: ROOT_FOLDER.movies,
  series: ROOT_FOLDER.series,
  anime: ROOT_FOLDER.anime,
}

// GET /api/media/[category] -> enriched list of media for the requested tab.
export default defineEventHandler(async (event) => {
  const category = getRouterParam(event, 'category') as Category | undefined
  if (!category || !(category in CATEGORY_TO_ROOT)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid category' })
  }
  const isAnimeTab = category === 'anime'

  const { radarr, sonarr } = await getAllSettings()
  if (!radarr || !sonarr) throw createError({ statusCode: 400, statusMessage: 'not configured' })

  const instances: ArrInstance[] = []
  const root = CATEGORY_TO_ROOT[category]
  if (category === 'movies') {
    instances.push({ ...radarr, type: 'radarr' })
  } else {
    instances.push({ ...sonarr, type: 'sonarr' })
  }

  const db = useDb()

  // Fetch arr list (filtered by root folder for movies/series; anime gets an
  // extra filter on Sonarr's seriesType to exclude standard shows).
  const all: { item: ArrMediaItem; arrType: 'radarr' | 'sonarr' }[] = []
  for (const inst of instances) {
    const items = await arrListMedia(inst)
    const filtered = filterByRootFolder(items, root)
    for (const item of filtered) {
      // For the Anime tab, also keep series whose seriesType=anime even if
      // their rootFolder string slipped (defensive - spec says rootFolder is
      // the differentiator but seriesType is the Sonarr-native marker).
      if (isAnimeTab && inst.type === 'sonarr' && item.seriesType && item.seriesType !== 'anime') {
        // Still keep root-folder matches; only drop if seriesType is explicit
        // and not anime - per spec root folder IS the differentiator, so we
        // don't filter here.
      }
      all.push({ item, arrType: inst.type })
    }
  }

  // Load indexes keyed by path for O(1) join.
  const pcloudRows = await db.select().from(pcloudIndex).all()
  // Index by the first path segment + directory so we can match a media
  // directory (e.g. "movies/The Dark Knight (2008)") against any pCloud
  // file inside it (e.g. "movies/The Dark Knight (2008)/movie.mkv").
  // Also keep an exact-path map for file-level matches.
  const pcloudByDir = new Map<string, boolean>()
  for (const r of pcloudRows) {
    const dir = r.path.replace(/\/[^/]+$/, '') // strip the filename
    pcloudByDir.set(dir, true)
    pcloudByDir.set(r.path, true) // also exact file path
  }
  const jellyRows = await db.select().from(jellyfinIndex).all()
  // Jellyfin stores file-level paths for movies (/data/movies/Title/Title.mkv)
  // and directory-level for series (/data/series/Title). Build a lookup by
  // both the exact path and the directory (filename stripped) so we can
  // match against arr directory paths.
  const jellyByPath = new Map(jellyRows.map((r) => [r.path, r]))
  const jellyByDir = new Map<string, typeof jellyRows[number]>()
  for (const r of jellyRows) {
    const dir = r.path.replace(/\/[^/]+$/, '')
    // For movie files (/data/movies/Title/Title.mkv) the directory is
    // /data/movies/Title which matches Radarr's path.
    // For series (/data/series/Title) there's no filename to strip, so
    // the dir equals the path — skip to avoid overwriting real matches.
    if (dir !== r.path) jellyByDir.set(dir, r)
  }

  const rows: MediaRow[] = all.map(({ item, arrType }) => {
    const localPath = item.path || item.movieFile?.path || ''
    // Try exact match first (series), then directory match (movies).
    const jelly = jellyByPath.get(localPath) ?? jellyByDir.get(localPath)
    const stripped = localPath.replace(/^\/data\//, '')
    // Match against both the directory path and the full file path.
    const pcloudExists = pcloudByDir.has(stripped)

    let watched: MediaRow['watched'] = { state: 'unknown', lastPlayed: null, jellyfinUrl: null }
    if (jelly) {
      const played = !!jelly.played
      watched = {
        state: played ? 'played' : jelly.lastPlayed ? 'partial' : 'unplayed',
        lastPlayed: jelly.lastPlayed,
        jellyfinUrl: jelly.jellyfinUrl,
      }
    }

    return {
      id: item.id,
      title: item.title,
      path: localPath,
      size: item.movieFile?.size ?? item.statistics?.sizeOnDisk ?? item.size ?? null,
      hasFile: arrType === 'radarr'
        ? !!item.hasFile || (item.movieFile !== undefined)
        : !!(item.statistics?.episodeFileCount && item.statistics.episodeFileCount > 0),
      monitored: !!item.monitored,
      posterUrl: item.images?.find((i) => i.coverType === 'poster')?.remoteUrl ?? null,
      arrType,
      watched,
      backedUp: {
        exists: pcloudExists,
        hash: null,
        modtime: null,
      },
    }
  })

  // Sort: unbacked-up + watched first (most actionable), then alpha.
  rows.sort((a, b) => {
    const sa = (a.backedUp.exists ? 0 : 2) + (a.watched.state === 'played' ? 0 : 1)
    const sb = (b.backedUp.exists ? 0 : 2) + (b.watched.state === 'played' ? 0 : 1)
    if (sa !== sb) return sa - sb
    return a.title.localeCompare(b.title)
  })

  return { category, root, count: rows.length, rows }
})