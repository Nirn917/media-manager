<script setup lang="ts">
import { Button } from '~/components/ui/button'

useHead({ title: 'Jobs — media-manager' })

type Job = {
  id: number
  type: 'restore' | 'archive' | 'delete_everywhere'
  path: string | null
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number | null
  started_at: string | null
  finished_at: string | null
  error: string | null
  media_id: number | null
  category: string
}

const jobs = ref<Job[]>([])
const loading = ref(true)
const message = ref('')

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ jobs: Job[] }>('/api/jobs')
    jobs.value = res.jobs
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'failed to load'
  } finally {
    loading.value = false
  }
}

async function retry(job: Job) {
  message.value = ''
  try {
    await $fetch(`/api/jobs/${job.id}/retry`, { method: 'POST' })
    message.value = 'Replay the action from the Movies/Series/Anime tab to retry.'
    await load()
  } catch (e) {
    message.value = e instanceof Error ? e.message : 'retry failed'
  }
}

const statusMeta = {
  queued: { class: 'bg-gray-100 text-gray-700', label: 'Queued' },
  running: { class: 'bg-blue-100 text-blue-700', label: 'Running' },
  done: { class: 'bg-green-100 text-green-700', label: 'Done' },
  failed: { class: 'bg-red-100 text-red-700', label: 'Failed' },
} as const

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Jobs</h1>
      <Button variant="outline" size="sm" @click="load">Refresh</Button>
    </div>
    <div v-if="message" class="text-sm text-muted-foreground">{{ message }}</div>
    <div v-if="loading" class="text-sm text-muted-foreground">Loading…</div>
    <div v-else-if="!jobs.length" class="text-sm text-muted-foreground">No jobs yet.</div>
    <div v-else class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/40 text-left">
          <tr>
            <th class="p-2">#</th>
            <th class="p-2">Type</th>
            <th class="p-2">Category</th>
            <th class="p-2">Path</th>
            <th class="p-2">Status</th>
            <th class="p-2">Progress</th>
            <th class="p-2">Started</th>
            <th class="p-2">Finished</th>
            <th class="p-2">Error</th>
            <th class="p-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.id" class="border-t">
            <td class="p-2">{{ j.id }}</td>
            <td class="p-2">{{ j.type }}</td>
            <td class="p-2">{{ j.category }}</td>
            <td class="max-w-xs truncate p-2">{{ j.path }}</td>
            <td class="p-2">
              <span :class="['rounded-full px-2 py-0.5 text-xs', statusMeta[j.status].class]">{{ statusMeta[j.status].label }}</span>
            </td>
            <td class="p-2">{{ j.status === 'running' || j.status === 'done' ? `${j.progress ?? 0}%` : '—' }}</td>
            <td class="p-2 whitespace-nowrap">{{ j.started_at ?? '—' }}</td>
            <td class="p-2 whitespace-nowrap">{{ j.finished_at ?? '—' }}</td>
            <td class="max-w-xs truncate p-2 text-destructive">{{ j.error ?? '' }}</td>
            <td class="p-2">
              <Button v-if="j.status === 'failed'" size="sm" variant="ghost" @click="retry(j)">Retry</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>