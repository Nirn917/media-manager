// POST /api/pcloud/resync -> trigger the pcloud:index Nitro task now.
// Returns the task result so the UI can show counts immediately.
export default defineEventHandler(async () => {
  const res = await runTask('pcloud:index')
  return res
})