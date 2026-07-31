// Global route middleware. Handles:
//   /        -> /movies (or /setup if DB empty)
//   unauthed -> /login
//   /login   -> /movies (if already authed)
//
// On the server we read the session cookie directly. On the client we
// hydrate the auth state once on first load, then trust the reactive state
// for subsequent navigations (no per-navigation round-trip).

import { useAuth, useAuthState } from '~/composables/useAuth'

let clientHydrated = false

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

  // Always allow /setup through to avoid redirect loops.
  if (to.path === '/setup') return

  // Determine auth state.
  if (process.server) {
    const cookie = useCookie('mm_session').value
    if (!cookie && to.path !== '/login') {
      return navigateTo('/login', { replace: true })
    }
    if (cookie && to.path === '/login') {
      return navigateTo('/movies', { replace: true })
    }
    return
  }

  // Client: hydrate once on first navigation, then trust the reactive state.
  if (process.client && !clientHydrated) {
    clientHydrated = true
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