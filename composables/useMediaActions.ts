import type { MediaRow } from '~/types/media'

const confirmText = 'supprimer'

// Drives the MediaList card buttons to the right API endpoint and shows
// inline result/error toasts (just a reactive message for now, no library).
export function useMediaActions(category: 'movies' | 'series' | 'anime', reload: () => Promise<void>) {
  const busy = ref<Record<number, 'restore' | 'archive' | 'delete'>>({})
  const message = ref('')
  const pending = ref<MediaRow | null>(null)
  const pendingAction = ref<'archive' | 'delete' | null>(null)
  const deleteInput = ref('')

  async function restore(row: MediaRow) {
    // Archive already happens with a job; Restore spawns an rclone copy + SSE.
    if (busy.value[row.id]) return
    busy.value[row.id] = 'restore'
    message.value = ''
    try {
      const res = await $fetch<{ jobId: number; message?: string }>(`/api/restore/${category}/${row.id}`, { method: 'POST' })
      message.value = `Restore queued as job #${res.jobId}. Follow /jobs for progress.`
      // Navigate to jobs view so the SSE progress is visible.
      await navigateTo('/jobs')
    } catch (e) {
      message.value = `Restore failed: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      delete busy.value[row.id]
    }
  }

  function archive(row: MediaRow) {
    pending.value = row
    pendingAction.value = 'archive'
    deleteInput.value = ''
  }

  function startDelete(row: MediaRow) {
    pending.value = row
    pendingAction.value = 'delete'
    deleteInput.value = ''
  }

  async function confirmArchive() {
    if (!pending.value || pendingAction.value !== 'archive') return
    const row = pending.value
    busy.value[row.id] = 'archive'
    try {
      await $fetch(`/api/archive/${category}/${row.id}`, { method: 'POST' })
      message.value = `Archived "${row.title}".`
      closeDialog()
      await reload()
    } catch (e) {
      message.value = `Archive failed: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      delete busy.value[row.id]
    }
  }

  async function confirmDelete() {
    if (!pending.value || pendingAction.value !== 'delete') return
    if (deleteInput.value.trim().toLowerCase() !== confirmText) {
      message.value = `Type "${confirmText}" to confirm.`
      return
    }
    const row = pending.value
    busy.value[row.id] = 'delete'
    try {
      await $fetch(`/api/delete/${category}/${row.id}`, {
        method: 'POST',
        headers: { 'X-Confirm': confirmText },
      })
      message.value = `Deleted "${row.title}" everywhere (pCloud backup removed).`
      closeDialog()
      await reload()
    } catch (e) {
      message.value = `Delete failed: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      delete busy.value[row.id]
    }
  }

  function closeDialog() {
    pending.value = null
    pendingAction.value = null
    deleteInput.value = ''
  }

  return {
    busy, message, pending, pendingAction, deleteInput,
    restore, archive, startDelete, confirmArchive, confirmDelete, closeDialog,
  }
}