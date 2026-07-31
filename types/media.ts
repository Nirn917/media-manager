export type WatchedState = 'played' | 'partial' | 'unplayed' | 'unknown'

export type MediaRow = {
  id: number
  title: string
  path: string
  size: number | null
  hasFile: boolean
  monitored: boolean
  posterUrl: string | null
  arrType: 'radarr' | 'sonarr'
  watched: { state: WatchedState; lastPlayed: string | null; jellyfinUrl: string | null }
  backedUp: { exists: boolean; hash: string | null; modtime: string | null }
}

export type Category = 'movies' | 'series' | 'anime'