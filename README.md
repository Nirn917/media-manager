# media-manager

Storage-tiering manager between OVH VPS (hot storage) and pCloud (cold backup).
Sits on top of the existing *arr stack (Radarr / Sonarr), Jellyfin and
rclone-pCloud. Authenticates via Jellyfin SSO. Built with Nuxt 3 + Drizzle ORM
on SQLite.

See [`media-manager-design.md`](./media-manager-design.md) for the full design
spec, and [`k8s/80-media-manager.yaml`](./k8s/80-media-manager.yaml) for the
Kubernetes deployment manifest.

## Development

```bash
pnpm install           # or npm install
pnpm dev               # http://localhost:3000
```

Required env vars (see `nuxt.config.ts → runtimeConfig`):
- `APP_MASTER_KEY` — 32 random bytes (base64). Encrypts settings + signs the
  auth cookie. Generate with `openssl rand -base64 32`.
- `APP_DATA_DIR` — where SQLite lives (default `/app/data`).
- `RCLONE_CONFIG` — path to `rclone.conf` (default `/config/rclone/rclone.conf`).

## Build / Docker

```bash
docker build -t media-manager:latest .
docker run --rm -p 3000:3000 \
  -v $PWD/data:/app/data \
  -v /data/media:/data \
  -v $HOME/.config/rclone:/config/rclone:ro \
  -e APP_MASTER_KEY=$(openssl rand -base64 32) \
  media-manager:latest
```