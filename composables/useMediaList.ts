import type { MediaRow, Category } from '~/types/media'

export function useMediaList(category: Category) {
  useHead({ title: `${category.charAt(0).toUpperCase()}${category.slice(1)} — media-manager` })

  const rows = ref<MediaRow[]>([])
  const loading = ref(true)
  const error = ref('')

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const res = await $fetch<{ rows: MediaRow[] }>('/api/media/'+category)
      rows.value = res.rows
    } catch (e) {
      error.value = extractFetchError(e)
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return { rows, loading, error, load }
}