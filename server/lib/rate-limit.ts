import { getRequestIP, type H3Event } from 'h3'

// In-memory sliding-window rate limiter for failed login attempts.
//
// Rationale: this is a single-replica deployment (k8s/80-media-manager.yaml
// replicas: 1), so an in-process Map is sufficient. A persistent store is
// unnecessary and would add complexity.
//
// Limits chosen: 5 failed attempts per 15 minutes per IP. This throttles
// online password guessing while not inconveniencing a legitimate user who
// mistypes a few times. Successful logins reset the counter for the key.

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

type Bucket = {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

function getClientKey(event: H3Event): string {
  // Honour X-Forwarded-For because Envoy Gateway terminates TLS in front of
  // the app. Fall back to the direct connection IP.
  const ip = getRequestIP(event, { xForwardedFor: true })
  return ip || 'unknown'
}

function now(): number {
  return Date.now()
}

function cleanupIfNeeded() {
  // Simple periodic cleanup to prevent the Map from growing unbounded.
  // Run roughly once per 100 mutations.
  if (store.size % 100 !== 0) return
  const t = now()
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= t) store.delete(key)
  }
}

export function checkLoginRateLimit(event: H3Event): { allowed: boolean; retryAfterMs?: number } {
  cleanupIfNeeded()
  const key = `login:${getClientKey(event)}`
  const t = now()
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= t) {
    // Window expired or first attempt; start a fresh window lazily on failure.
    return { allowed: true }
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: bucket.resetAt - t }
  }

  return { allowed: true }
}

export function recordLoginFailure(event: H3Event): void {
  const key = `login:${getClientKey(event)}`
  const t = now()
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= t) {
    store.set(key, { count: 1, resetAt: t + WINDOW_MS })
  } else {
    bucket.count += 1
  }
}

export function recordLoginSuccess(event: H3Event): void {
  const key = `login:${getClientKey(event)}`
  store.delete(key)
}
