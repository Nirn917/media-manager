// Client-side auth state, hydrated once from /api/auth/me on first load.
// The global middleware reads `authed` to decide the /login redirect.

type Me = { authed: boolean; user?: { id: string; name: string; isAdmin: boolean } }

const me = useState<Me>('mm-me', () => ({ authed: false }))
let hydrated = false

export function useAuthState() {
  return computed(() => me.value.authed)
}

export function useAuthUser() {
  return computed(() => me.value.user)
}

export function useAuth() {
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

// Called from app.vue / a plugin on first render so `me` is populated.
export async function hydrateAuth() {
  if (hydrated) return
  hydrated = true
  try {
    await useAuth().refresh()
  } catch {
    // ignore network/SSR hiccups
  }
}