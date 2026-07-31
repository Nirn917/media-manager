// Global route middleware. Handles:
//   /        -> /movies (or /setup if DB empty)
//   unauthed -> /login
//   /login   -> /movies (if already authed)
//
// On the server we read the session cookie directly (no need for a round-trip
// to /api/auth/me per request). On the client we hydrate from /api/auth/me
// once, then trust the reactive state.

import { useAuth, useAuthState } from '~/composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/api/') || to.path.startsWith('/_')) return

  // Root redirect — the most common entry point. Fires on both server + client.
  if (to.path === '/') {
    try {
      const res = await $fetch<{ setupComplete: boolean }>('/api/setup/status')
      return navigateTo(res.setupComplete ? '/movies' : '/setup', { replace: true })
    } catch {
      return navigateTo('/setup', { replace: true })
    }
  }

  // Always allow /setup and /login through to avoid redirect loops.
  if (to.path === '/setup') return

  // Determine auth state.
  if (process.server) {
    // On the server, read the signed cookie directly from the request.
    const cookie = useCookie('mm_session').value
    // The cookie is HMAC-signed; if it exists and is non-empty we treat the
    // user as authed. The 01-auth server middleware does the real signature
    // verification on API calls — here we just need to decide the redirect.
    if (!cookie && to.path !== '/login') {
      return navigateTo('/login', { replace: true })
    }
    if (cookie && to.path === '/login') {
      return navigateTo('/movies', { replace: true })
    }
    return
  }

  // Client: hydrate the auth state once, then trust the reactive state.
  if (process.client) {
    const { refresh } = useAuth()
    await refresh().catch(() => {})
  }

  const authed = useAuthState()
  if (to.path !== '/login' && !authed.value) {
    return navigateTo('/login', { replace: true })
  }
  if (to.path === '/login' && authed.value) {
    return navigateTo('/movies', { replace: true })
  }
})