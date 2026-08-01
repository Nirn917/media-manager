# media-manager — Design Spec

## Overview

**media-manager** is a web application (Nuxt 3) that manages the media library on the VPS (`vps-792d8b35.vps.ovh.ca`). It acts as a **storage tiering manager** between the VPS (hot storage, limited space) and pCloud (cold backup, unlimited). It integrates with the existing *arr stack (Radarr, Sonarr), Jellyfin, and rclone/pCloud.

The app never touches `/data/downloads` — Deluge auto-cleans torrents after 10h of seed (handled by a separate systemd cron, not this app).

---

## Deployment

| Element | Value |
|---------|-------|
| Hostname | `media-manager.mayson-youyou.uk` |
| Namespace k8s | `media-manager` |
| Gateway | `eg-public` (Envoy Gateway), listener `https-apps` (wildcard `*.mayson-youyou.uk` cert) |
| TLS | Terminated at Envoy Gateway (existing wildcard cert) |
| ExternalDNS | Auto-creates A record on HTTPRoute creation |
| Image | `linuxserver/` style or custom Docker image (Nuxt SSR) |
| Storage | 2 PVCs: `config` (SQLite, local-path RWO 1Gi) + `media` (hostPath `/data/media`, ReadWrite — needed for Restore) |
| rclone config | Mounted via hostPath `/home/ubuntu/.config/rclone/rclone.conf` (ReadOnly) |

### K8s manifest structure (to create)

- Namespace `media-manager`
- Secret `media-manager-secrets` (env var `APP_MASTER_KEY` = 32 random bytes, base64)
- PVC `media-manager-config` (1Gi, local-path, RWO) → mounted at `/app/data` (SQLite lives here)
- hostPath `/data/media` → mounted at `/data` (ReadWrite — app reads library and writes restored files, Radarr/Sonarr handle other writes)
- hostPath `/home/ubuntu/.config/rclone` → mounted at `/config/rclone` (ReadOnly)
- Deployment (replicas: 1, strategy: Recreate)
- ClusterIP Service (port 3000 → containerPort 3000, Nuxt default)
- HTTPRoute `media-manager-ui` (host `media-manager.mayson-youyou.uk`, parentRef `eg-public/envoy-gateway-system/https-apps`, PathPrefix `/`)

### Files pattern

Follows the existing repo conventions at `~/k8s-manifests/`:
- `80-media-manager.yaml` — full manifest (namespace, secret, PVC, deployment, service, HTTPRoute)
- README entry added to `~/k8s-manifests/README.yaml`

---

## Authentication

**Jellyfin SSO.** The app does not manage its own user database — it delegates auth to Jellyfin.

Flow:
1. User submits username + password to `/api/auth/login`
2. Backend calls Jellyfin `POST /Users/AuthenticateByName` with `{ Username, Pw }` and header `X-Emby-Authorization: MediaBrowser Client="media-manager", Device="...", DeviceId="...", Version="..."`
3. Jellyfin returns `{ User: {...}, SessionInfo: {...}, AccessToken }` — JWT-like token
4. Backend stores the token in an httpOnly cookie (signed with `APP_MASTER_KEY`)
5. Middleware validates the token on every request by calling Jellyfin `GET /Users/Me` (or caches the validation for the session)

Logout: clear the cookie.

The **admin** user (configured in the setup wizard) has access to the Settings page. Other Jellyfin users can browse but not perform destructive actions (Archive / Delete everywhere) — only the admin can.

---

## Setup wizard (first boot)

At first boot, `settings` table is empty → app redirects to `/setup`.

Wizard collects:
- **Jellyfin**: URL (e.g. `http://jellyfin.jellyfin.svc.cluster.local:8096`) + admin username/password (used to authenticate the app and fetch user list)
- **Radarr**: URL (e.g. `http://radarr.radarr.svc.cluster.local:7878`) + API key (test via `GET /api/v3/system/status`)
- **Sonarr**: URL (e.g. `http://sonarr.sonarr.svc.cluster.local:8989`) + API key (test via `GET /api/v3/system/status`)

Each step has a **"Test connection"** button that validates the credentials in real time.

On save:
- Settings are encrypted with **AES-256-GCM** using `APP_MASTER_KEY` (from k8s Secret) and stored in the `settings` table.
- User is redirected to `/login`.

A `/settings` page (accessible to admin only, post-auth) allows editing any of these values later.

---

## Tabs / Categories

Three top-level tabs in the UI:

| Tab | API | Filter |
|-----|-----|--------|
| **Movies** | Radarr | `rootFolderPath` = `/data/movies` |
| **Series** | Sonarr | `rootFolderPath` = `/data/series` |
| **Anime** | Sonarr | `rootFolderPath` = `/data/anime` |

Anime are managed by Sonarr (series only) — Japanese anime *movies* go in Radarr (rootFolder `/data/movies`). The differentiation in Sonarr is purely by root folder path. The folder `/data/media/anime` already exists on the VPS; in Sonarr, anime series must be configured with root folder `/data/anime`.

---

## Actions

### 1. Restore

Brings back a file from pCloud to the VPS after it has been archived.

Flow:
1. `rclone copy pcloud:media/<category>/<path> /data/media/<category>/<path>` (spawned as child_process with `--use-json-log --progress`)
2. Progress is streamed to frontend via **SSE** (Server-Sent Events): `GET /api/restore/[jobId]/events` → `text/event-stream` parsing rclone JSON log lines
3. On completion: call Radarr/Sonarr `POST /api/v3/command { name: "RefreshMovie", movieId }` (or `RefreshSeries` for Sonarr) so *arr rescans the disk and re-marks the media as "possessed"
4. Job status updated in `jobs` table (`done` or `failed`)

Gate: simple button click (fully reversible — the backup stays on pCloud).

Restored files are **standalone** (no torrent, no hard link in `/downloads`) — they are plain files on disk.

### 2. Archive

Removes the local copy of a media file. The torrent seed is handled separately by Deluge auto-cleanup (10h systemd cron) — this app does NOT touch `/downloads`.

Flow:
1. Safety check: verify the file exists in `pcloud_index` (backup present). If not present or hash mismatch, disable the Archive button with message "Backup not verified"
2. Call Radarr `DELETE /api/v3/movie/{movieId}?deleteFiles=true&addImportExclusion=false` (or Sonarr equivalent for series/anime)
3. Radarr/Sonarr deletes `/data/media/<category>/<title>/...` and marks the media as "not possessed" (so it can be restored later)
4. The inode is freed when Deluge auto-cleanup has already removed the `/downloads` hard link (after 10h seed) OR when Radarr also requests Deluge to remove the torrent (Radarr handles the Deluge API cross-call internally if the queue entry still exists)

Gate: simple confirmation dialog ("This will stop the torrent seed and delete local copy. Backup kept on pCloud").

**Archive of unwatched media**: ALLOWED with a warning. The dialog shows a yellow warning if `played=false` in Jellyfin index, but does not block the action.

### 3. Delete everywhere

Same as Archive, plus it deletes the pCloud backup (irreversible).

Flow:
1. Perform Archive (Radarr DELETE)
2. `rclone deletefile pcloud:media/<category>/<path>`
3. Job logged as `delete_everywhere` in `jobs` table

Gate: **type-to-confirm** — user must type exactly `supprimer` in an input field to enable the Delete button. Backend re-validates: if header `X-Confirm` ≠ "supprimer", returns 400.

---

## Watched status (Jellyfin integration)

A cron job (hourly, internal to the app via Nitro scheduled tasks) fetches Jellyfin playback status and indexes it in SQLite.

API: `GET /Users/{adminUserId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=Path,UserData`

For each item, store:
- `path` (Jellyfin file path, e.g. `/data/movies/Movie (2024)/Movie.mkv`)
- `item_id`
- `title`
- `played` (boolean — `UserData.Played`)
- `last_played` (ISO timestamp — `UserData.LastPlayedDate`)
- `jellyfin_url` (deep link to Jellyfin web client)

The UI displays a badge for each media:
- **🟢 Vu** (played=true) → Archive/Restore enabled
- **🟠 Partiel** (playback position > 0 but < 90%) → warning on Archive
- **⚪ Non regardé** (played=false) → Archive allowed with warning, not blocked

---

## pCloud index

A cron job (hourly + manual "Resync now" button) scans pCloud via rclone and stores the index in SQLite.

Command: `rclone lsf pcloud:media --recursive --json --checksum --config /config/rclone/rclone.conf`

Parse output and store in `pcloud_index`:
- `path` (relative to `pcloud:media/`, e.g. `movies/The Dark Knight (2008)/Movie.mkv`)
- `size`
- `modtime`
- `hash`
- `category` (derived from first path segment: `movies`, `series`, `anime`)

The Archive button is **disabled** if the file is not found in `pcloud_index` or if the hash differs from the local file. A "Verify backup" action can run `rclone check` on demand for a specific file.

---

## Job queue

All long-running operations (Restore, Delete everywhere) are tracked in the `jobs` table. This allows:
- UI to poll/SSE for progress
- Crash recovery: on app restart, jobs marked `running` are flipped to `failed` and can be retried from the UI
- Concurrency: one job at a time per media file (lock by `path`)

---

## Database schema (SQLite, WAL mode)

```sql
-- Settings (wizard, encrypted with AES-256-GCM via APP_MASTER_KEY)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL    -- encrypted blob
);

-- pCloud index (cron hourly + manual resync)
CREATE TABLE pcloud_index (
  path      TEXT PRIMARY KEY,
  size      INTEGER NOT NULL,
  modtime   TEXT,
  hash      TEXT,
  category  TEXT NOT NULL    -- movies, series, anime
);

-- Jellyfin index (cron hourly — for watched status)
CREATE TABLE jellyfin_index (
  path          TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL,
  title         TEXT,
  played        INTEGER NOT NULL DEFAULT 0,
  last_played   TEXT,
  jellyfin_url  TEXT
);

-- Job queue (restore, archive, delete_everywhere)
CREATE TABLE jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,          -- restore, archive, delete_everywhere
  path        TEXT,
  status      TEXT NOT NULL,          -- queued, running, done, failed
  progress    INTEGER DEFAULT 0,      -- 0-100 (for restore SSE)
  started_at  TEXT,
  finished_at TEXT,
  error       TEXT,
  media_id    INTEGER,                -- Radarr/Sonarr ID
  category    TEXT NOT NULL           -- movies, series, anime
);

-- Prepared v2 (not active in MVP)
CREATE TABLE autoarchive_rules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled             INTEGER NOT NULL DEFAULT 0,
  category            TEXT,
  days_after_played   INTEGER,
  min_backup_count    INTEGER NOT NULL DEFAULT 1,
  last_run_at         TEXT
);
```

SQLite is stored on a dedicated PVC `local-path` RWO 1Gi, mounted at `/app/data/app.db`. **Never store SQLite on mergerfs** — it does not support POSIX locks and would corrupt.

Enable WAL mode on connect: `PRAGMA journal_mode=WAL;`

---

## Tech stack

| Component | Technology |
|-----------|------------|
| Framework | Nuxt 3 (Nitro server routes, monorepo) |
| UI | shadcn-nuxt + Tailwind CSS |
| ORM | Drizzle ORM (SQLite driver) |
| DB | SQLite (WAL mode) |
| Auth | Jellyfin SSO (JWT in httpOnly cookie, signed with APP_MASTER_KEY) |
| Cron | Nitro scheduled tasks (internal to the app) |
| rclone | Binary in the Docker image (FROM node:20 + apk add rclone) + config mounted as hostPath ReadOnly |
| Progress | SSE (Server-Sent Events) for restore progress |
| Deployment | K8s Deployment + 2 PVC + ClusterIP + HTTPRoute |

---

## Environment variables (from k8s Secret)

| Var | Description |
|-----|-------------|
| `APP_MASTER_KEY` | 32 random bytes (base64) used to encrypt settings in DB and derive session-cookie keys |

All other config (Jellyfin URL, Radarr/Sonarr API keys) is stored in the `settings` table (encrypted), not in env vars — so the user can change them via the Settings page without redeploying.

### Security considerations

The Jellyfin admin password and the Radarr/Sonarr API keys are stored **reversibly encrypted** in the SQLite database (AES-256-GCM with `APP_MASTER_KEY`). This is a deliberate functional requirement: the app must present these credentials to the upstream services on every request, so a one-way hash is not possible. Because of this, both `APP_MASTER_KEY` (in the `media-manager-secrets` Secret) and the SQLite database (in the `media-manager-config` PVC) must be treated as highly sensitive:

- Restrict Kubernetes RBAC so that only administrators can read `media-manager-secrets` or access a shell in the `media-manager` pod.
- Do not expose the `media-manager-config` PVC snapshots/backups to users or systems that do not need them.
- Rotate `APP_MASTER_KEY` only with a migration plan, because changing the key invalidates existing encrypted settings and session cookies.

---

## Internal API keys reference (for backend calls)

| Service | Endpoint | Auth |
|---------|----------|------|
| Jellyfin | `http://jellyfin.jellyfin.svc.cluster.local:8096` | `X-Emby-Authorization` header + user JWT |
| Radarr | `http://radarr.radarr.svc.cluster.local:7878` | `?apiKey=` query param |
| Sonarr | `http://sonarr.sonarr.svc.cluster.local:8989` | `?apiKey=` query param |
| pCloud | via `rclone` binary (config at `/config/rclone/rclone.conf`) | token in rclone.conf |

 Jellyfin `/Users/AuthenticateByName`, `/Users/Me`, `/Users/{id}/Items`
- Radarr: `GET /api/v3/movie`, `DELETE /api/v3/movie/{id}?deleteFiles=true`, `POST /api/v3/command {name: RefreshMovie, movieId}`
- Sonarr: `GET /api/v3/series`, `DELETE /api/v3/series/{id}?deleteFiles=true`, `POST /api/v3/command {name: RefreshSeries, seriesId}`
- rclone: `copy`, `deletefile`, `lsf --recursive --json`, `check`

---

## UI structure

```
/                   → redirect to /movies (or /setup if DB empty)
/setup              → first boot wizard
/login              → Jellyfin SSO login form
/movies             → Radarr movies list (rootFolder /data/movies)
/series             → Sonarr series list (rootFolder /data/series)
/anime              → Sonarr anime list (rootFolder /data/anime)
/settings           → edit API keys / Jellyfin config (admin only)
/jobs               → job queue history (restore/archive/delete status)
```

Each list page shows a table/cards with:
- Title + poster (from Radarr/Sonarr metadata)
- Status badges: 🟢 Vu / 🟠 Partiel / ⚪ Non regardé (from jellyfin_index)
- Backup status: 📦 pCloud ✅ / 📦 pCloud ❌ (from pcloud_index)
- Actions: [Restore] [Archive] [Delete everywhere]
- Click title → details panel (Jellyfin deep link, file size, last played, backup hash check)

---

## Hard links behavior (important context)

Radarr/Sonarr import via hard links by default:
- `/data/downloads/Movie.mkv` (inode X, link count 2)
- `/data/media/movies/Movie.mkv` (same inode X, link count 2)

When Deluge auto-cleanup runs (10h seed) → Deluge removes `/data/downloads/Movie.mkv` → link count → 1. The library copy stays intact.

When Archive (Radarr DELETE) runs → Radarr removes `/data/media/movies/Movie.mkv` → link count → 0 → inode freed → disk space reclaimed.

When Archive runs BEFORE Deluge cleanup → Radarr removes library copy → link count → 1 → inode NOT freed (Deluge still has `/downloads`). Space is reclaimed later when Deluge auto-cleanup removes the `/downloads` path.

The app does NOT need to handle hard links explicitly — Radarr/Sonarr + Deluge auto-cleanup handle it.

---

## Deluge cleanup (external to this app)

A separate systemd timer (already deployed on the VPS) runs hourly and removes Deluge torrents that have been seeding for >= 10h, including their files in `/data/downloads/`. This is handled by `75-deluge-seed-cleanup.sh` — the media-manager app does NOT talk to Deluge.

---

## Future v2 (prepared, not active)

**Auto-archive rules**: a cron checks `autoarchive_rules` table. For each rule enabled:
1. Find media in `jellyfin_index` WHERE `played=true AND last_played < date('now', '-N days')`
2. Verify backup present in `pcloud_index`
3. Call Archive (Radarr DELETE)

UI: Settings page "Auto-archive rules" (disabled in MVP, schema is ready).

---

## Files location on VPS

```
/data/media/
├── movies/     → Radarr rootFolder, backed up to pcloud:media/movies/
├── series/     → Sonarr rootFolder, backed up to pcloud:media/series/
├── anime/      → Sonarr rootFolder, backed up to pcloud:media/anime/
└── downloads/  → Deluge downloads (NOT backed up, auto-cleaned after 10h seed)
```

All four folders exist on the VPS (created during setup). The mergerfs pool (`/data/media`) is mounted into the pod as ReadWrite at `/data`. The app reads the library and writes restored files; Radarr/Sonarr/Deluge handle other writes.

---

## Checklist for implementation

- [ ] Create `80-media-manager.yaml` k8s manifest (namespace, secret, PVC, deployment, service, HTTPRoute)
- [ ] Initialize Nuxt 3 project with shadcn-nuxt + Tailwind + Drizzle ORM
- [ ] Dockerfile (FROM node:20-alpine, install rclone, build Nuxt, expose :3000)
- [ ] Setup wizard page (`/setup`) with connection tests
- [ ] Login page (Jellyfin SSO)
- [ ] Auth middleware (validate JWT cookie)
- [ ] Cron: pCloud index (hourly + manual resync)
- [ ] Cron: Jellyfin index (hourly)
- [ ] Movies list page (Radarr API)
- [ ] Series list page (Sonarr API, rootFolder filter)
- [ ] Anime list page (Sonarr API, rootFolder filter)
- [ ] Action: Restore (rclone child_process + SSE progress + RefreshMovie command)
- [ ] Action: Archive (Radarr/Sonarr DELETE with deleteFiles=true, simple confirm)
- [ ] Action: Delete everywhere (Archive + rclone deletefile, type "supprimer" gate)
- [ ] Settings page (edit API keys, admin only)
- [ ] Jobs page (history + retry failed)
- [ ] Auto-archive v2 schema (table, no UI yet)