// POST /api/jellyfin/resync -> trigger the jellyfin:index Nitro task now.
export default defineEventHandler(async () => {
  const res = await runTask('jellyfin')
  return res
})