// Extracts a human-readable message from a Nuxt/ofetch FetchError.
// $fetch errors look like `[POST] "/api/...": 400` as the `.message` but the
// actual server-side message is nested in `data.statusMessage` or
// `response._data.statusMessage`. This surfaces the real reason so users
// see e.g. "could not resolve Jellyfin admin user: fetch failed" instead of
// a bare "400".

type FetchErrorLike = {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: { statusMessage?: string; message?: string }
  response?: { _data?: { statusMessage?: string; message?: string } }
}

export function extractFetchError(e: unknown): string {
  if (!e) return 'Unknown error'
  const err = e as FetchErrorLike
  return (
    err.data?.statusMessage ||
    err.data?.message ||
    err.response?._data?.statusMessage ||
    err.response?._data?.message ||
    err.statusMessage ||
    err.message ||
    (typeof e === 'string' ? e : 'Request failed')
  )
}