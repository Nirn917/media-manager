import { arrSystemStatus } from '~/server/lib/arr'
import { assertSafeTargetUrlResolved, UnsafeUrlError } from '~/server/lib/url-safety'

// POST /api/setup/test/radarr  | /api/setup/test/sonarr
// Body: { url, apiKey }
export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string; apiKey?: string }>(event)
  const url = (body.url || '').trim().replace(/\/$/, '')
  const apiKey = (body.apiKey || '').trim()
  if (!url || !apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'url + apiKey required' })
  }

  try {
    await assertSafeTargetUrlResolved(url)
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : 'invalid target URL'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  // Detect which route we're on to set the correct arr type.
  const isSonarr = event.path.includes('/sonarr')
  const instance = { url, apiKey, type: isSonarr ? 'sonarr' : 'radarr' } as const
  try {
    const status = await arrSystemStatus(instance)
    return { ok: true, ...status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})