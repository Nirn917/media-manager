import { readSession } from '~/server/lib/auth'

// Server middleware: protect API routes behind the signed session cookie.
// Allowed without auth:
//   - /api/setup/**       (wizard + connection tests)
//   - /api/auth/**         (login, logout, me)
//   - /api/setup/status    (root redirect helper)
// Admin-only (write-protected by is-admin flag in the session):
//   - POST/DELETE methods (archive, delete everywhere, settings save)
export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return

  // Skip auth on login/logout/setup/me endpoints.
  if (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/setup/') ||
    path === '/api/setup/status'
  ) return

  const session = readSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const method = event.method || 'GET'
  // Destructive verbs require the admin session (per spec: only the admin
  // configured in the setup wizard can Archive / Delete everywhere / save settings).
  if (method !== 'GET' && method !== 'HEAD' && !session.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin only' })
  }
})