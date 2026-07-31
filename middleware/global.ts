// Global route middleware. Handles:
//   /        -> /movies (or /setup if DB empty)
//   unauthed -> /login (client-side only; the server middleware 01-auth already
//              returns 401 for protected API routes which the app handles)
import { useAuth, useAuthState } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/api/') || to.path.startsWith('/_')) return

  // Root redirect - the most common entry point. Fires on both server + client.
  if (to.path === '/') {
    try {
      const res = await $fetch<{ setupComplete: boolean }>('/api/setup/status')
      return navigateTo(res.setupComplete ? '/movies' : '/setup', { replace: true })
    } catch {
      return navigateTo('/setup', { replace: true })
    }
  }

  // Hydrate the auth state once (client only). Mirrors /api/auth/me.
  if (process.client) {
    const { refresh } = useAuth()
    await refresh().catch(() => {})
  }

  const authed = useAuthState()
  if (to.path !== '/login' && to.path !== '/setup' && !authed.value) {
    return navigateTo('/login', { replace: true })
  }
  if (to.path === '/login' && authed.value) {
    return navigateTo('/movies', { replace: true })
  }
})