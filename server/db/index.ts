import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: Database.Database | null = null

function dbPath(): string {
  const dir = process.env.APP_DATA_DIR || (useRuntimeConfig?.()?.dataDir as string | undefined) || './data'
  return resolve(dir, 'app.db')
}

export function useDb() {
  if (_db) return _db

  const path = dbPath()
  mkdirSync(dirname(path), { recursive: true })

  _sqlite = new Database(path)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  _sqlite.pragma('busy_timeout = 5000')

  _db = drizzle(_sqlite, { schema })
  return _db
}

// Raw better-sqlite3 handle - useful for bulk inserts / transactions /
// `PRAGMA`s that are awkward through the Drizzle builder.
export function useSqlite(): Database.Database {
  if (_sqlite) return _sqlite
  useDb()
  return _sqlite!
}

// Initialise schema at boot (idempotent - uses CREATE TABLE IF NOT EXISTS).
export function ensureSchema() {
  const sqlite = _sqlite ?? (() => { useDb(); return _sqlite! })()
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pcloud_index (
      path      TEXT PRIMARY KEY,
      size      INTEGER NOT NULL,
      modtime   TEXT,
      hash      TEXT,
      category  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jellyfin_index (
      path          TEXT PRIMARY KEY,
      item_id       TEXT NOT NULL,
      title         TEXT,
      played        INTEGER NOT NULL DEFAULT 0,
      last_played   TEXT,
      jellyfin_url  TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,
      path        TEXT,
      status      TEXT NOT NULL DEFAULT 'queued',
      progress    INTEGER DEFAULT 0,
      started_at  TEXT,
      finished_at TEXT,
      error       TEXT,
      media_id    INTEGER,
      category    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS autoarchive_rules (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled             INTEGER NOT NULL DEFAULT 0,
      category            TEXT,
      days_after_played   INTEGER,
      min_backup_count    INTEGER NOT NULL DEFAULT 1,
      last_run_at         TEXT
    );
  `)
}