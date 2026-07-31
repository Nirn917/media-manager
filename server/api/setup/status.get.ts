import { isSetupComplete } from '~/server/lib/settings'

// GET /api/setup/status -> { setupComplete: boolean }
// Used by /setup (to skip if done) and by the redirect middleware (root path).
export default defineEventHandler(async () => {
  return { setupComplete: await isSetupComplete() }
})