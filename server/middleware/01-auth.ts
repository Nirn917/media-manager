import { readSession } from '~/server/lib/auth'
import { getSetting, isSetupComplete, SETTING_KEYS } from '~/server/lib/settings'
import type { AdminSettings } from '~/server/lib/settings'

// Server middleware: protect API routes behind the session cookie.
//
// Allowed without auth:
//   - /api/auth/**                          (login, logout, me)
//   - /api/setup/status                     (public boolean used by redirects)
//   - /api/setup/** ONLY while isSetupComplete() is false (first-run wizard)
//
// After setup is complete, setup routes (save, test connections) require a
// valid admin session in addition to the general session check.
//
// Admin-only (write-protected, re-validated against current admin setting):
//   - POST/DELETE methods (archive, delete everywhere, settings save)
export default defineEventHandler(async (event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return

  const method = event.method || 'GET'

  // Always public.
  if (path.startsWith('/api/auth/') || path === '/api/setup/status') return

  // First-run wizard: setup routes are public until setup is completed.
  if (path.startsWith('/api/setup/')) {
    const setupComplete = await isSetupComplete()
    if (!setupComplete) return

    // After setup, mutating setup endpoints require an authenticated admin.
    if (method !== 'GET' && method !== 'HEAD') {
      const session = readSession(event)
      if (!session) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
      }
      const admin = await getSetting<AdminSettings>(SETTING_KEYS.ADMIN)
      if (!admin || session.userId !== admin.jellyfinUserId) {
        throw createError({ statusCode: 403, statusMessage: 'Admin only' })
      }
    }
    return
  }

  const session = readSession(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Destructive verbs require the admin session. We revalidate against the
  // current admin setting rather than trusting the signed isAdmin flag.
  if (method !== 'GET' && method !== 'HEAD') {
    const admin = await getSetting<AdminSettings>(SETTING_KEYS.ADMIN)
    if (!admin || session.userId !== admin.jellyfinUserId) {
      throw createError({ statusCode: 403, statusMessage: 'Admin only' })
    }
  }
})