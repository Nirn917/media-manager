import { clearSession } from '~/server/lib/auth'

// POST /api/auth/logout -> clears the session cookie.
export default defineEventHandler((event) => {
  clearSession(event)
  return { ok: true }
})