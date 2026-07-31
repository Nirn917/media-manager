// Client-side auth state, hydrated once from /api/auth/me on first load.
// The global middleware reads `authed` to decide the /login redirect.

type Me = { authed: boolean; user?: { id: string; name: string; isAdmin: boolean } }

// useState must be called inside a Nuxt-context function (setup, composable,
// plugin). Calling it at module scope crashes SSR with "instance unavailable".
// We lazily resolve it via useNuxtApp() inside each composable so the state
// is created on first use within a valid Nuxt context (and shared via the
// `nuxt-app` payload key across server + client).

const STATE_KEY = 'mm-me'

function useMe() {
  return useState<Me>(STATE_KEY, () => ({ authed: false }))
}

export function useAuthState() {
  return computed(() => useMe().value.authed)
}

export function useAuthUser() {
  return computed(() => useMe().value.user)
}

export function useAuth() {
  const me = useMe()
  return {
    async login(username: string, password: string) {
      const res = await $fetch<Me & { ok?: boolean }>('/api/auth/login', { method: 'POST', body: { username, password } })
      me.value = { authed: true, user: res.user }
      return res
    },
    async logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      me.value = { authed: false }
    },
    async refresh() {
      const res = await $fetch<Me>('/api/auth/me')
      me.value = res
      return res
    },
  }
}