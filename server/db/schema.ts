import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Settings (wizard) - encrypted blob (AES-256-GCM via APP_MASTER_KEY).
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// pCloud index (cron hourly + manual resync). path is relative to pcloud:media/
export const pcloudIndex = sqliteTable('pcloud_index', {
  path: text('path').primaryKey(),
  size: integer('size').notNull(),
  modtime: text('modtime'),
  hash: text('hash'),
  category: text('category').notNull(), // movies | series | anime
})

// Jellyfin index (cron hourly) - for watched status badges.
export const jellyfinIndex = sqliteTable('jellyfin_index', {
  path: text('path').primaryKey(),
  itemId: text('item_id').notNull(),
  title: text('title'),
  played: integer('played').notNull().default(0),
  lastPlayed: text('last_played'),
  jellyfinUrl: text('jellyfin_url'),
})

// Job queue (restore, archive, delete_everywhere).
export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // restore | archive | delete_everywhere
  path: text('path'),
  status: text('status').notNull().default('queued'), // queued | running | done | failed
  progress: integer('progress').default(0),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  error: text('error'),
  mediaId: integer('media_id'),
  category: text('category').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// v2 (prepared, not active in MVP).
export const autoarchiveRules = sqliteTable('autoarchive_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  enabled: integer('enabled').notNull().default(0),
  category: text('category'),
  daysAfterPlayed: integer('days_after_played'),
  minBackupCount: integer('min_backup_count').notNull().default(1),
  lastRunAt: text('last_run_at'),
})

export type Settings = typeof settings.$inferSelect
export type PcloudIndex = typeof pcloudIndex.$inferSelect
export type JellyfinIndex = typeof jellyfinIndex.$inferSelect
export type Job = typeof jobs.$inferSelect
export type AutoarchiveRule = typeof autoarchiveRules.$inferSelect

export const JOB_TYPE = {
  RESTORE: 'restore',
  ARCHIVE: 'archive',
  DELETE_EVERYWHERE: 'delete_everywhere',
} as const

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const

export const CATEGORY = {
  MOVIES: 'movies',
  SERIES: 'series',
  ANIME: 'anime',
} as const