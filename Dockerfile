# syntax=docker/dockerfile:1
# ============================================================================
# media-manager - Nuxt 3 SSR + rclone
# ----------------------------------------------------------------------------
# Build stage compiles the Nuxt server bundle. Prod stage installs rclone and
# runs the SSR server on :3000 with a non-root user (UID 1000 to match the
# mergerfs/fsGroup so writes to /data/media land under the right owner).
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Native deps for better-sqlite3 build.
RUN apk add --no-cache python3 make g++ build-base

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ----------------------------------------------------------------------------
FROM node:20-alpine AS prod

WORKDIR /app

# rclone is used for Restore (copy), Delete everywhere (deletefile), pCloud
# index (lsf) and Verify backup (check).
RUN apk add --no-cache rclone ca-certificates tini

ENV NODE_ENV=production \
    APP_DATA_DIR=/app/data \
    RCLONE_CONFIG=/config/rclone/rclone.conf \
    HOST=0.0.0.0 \
    PORT=3000

# Bring over the Nuxt build output + minimal prod node_modules.
COPY --from=builder /app/.output  ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json

# SQLite data dir (mounted as PVC - writable, fsGroup 1000).
RUN mkdir -p /app/data && chown -R 1000:1000 /app

USER 1000:1000

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]