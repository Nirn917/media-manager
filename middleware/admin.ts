// Route middleware: only allow the admin user (configured in setup wizard)
// to view /settings. Non-admins get bounced to /movies.
export default defineNuxtRouteMiddleware(async () => {
  const { refresh } = useAuth()
  const me = await refresh().catch(() => ({ authed: false }) as { authed: false; user?: undefined })
  if (!me.authed) return navigateTo('/login', { replace: true })
  if (!me.user?.isAdmin) {
    if (process.client) alert('Admin only')
    return navigateTo('/movies', { replace: true })
  }
})