<script setup lang="ts">
import { Button } from '~/components/ui/button'
import type { MediaRow, Category } from '~/types/media'

type WatchedState = 'played' | 'partial' | 'unplayed' | 'unknown'

const emit = defineEmits<{
  restore: [row: MediaRow]
  archive: [row: MediaRow]
  delete: [row: MediaRow]
}>()

const props = defineProps<{
  rows: MediaRow[]
  category: Category
  loading?: boolean
}>()

const watchedMeta: Record<WatchedState, { dot: string; label: string }> = {
  played: { dot: 'bg-green-500', label: 'Vu' },
  partial: { dot: 'bg-orange-500', label: 'Partiel' },
  unplayed: { dot: 'bg-gray-300', label: 'Non regardé' },
  unknown: { dot: 'bg-gray-200', label: '—' },
}

function fmtSize(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
</script>

<template>
  <div v-if="loading" class="text-sm text-muted-foreground">Loading…</div>
  <div v-else-if="!rows.length" class="text-sm text-muted-foreground">
    No media found in this category on {{ category === 'movies' ? 'Radarr' : 'Sonarr' }}.
  </div>
  <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    <div
      v-for="row in props.rows" :key="row.id"
      class="rounded-lg border bg-card p-3 shadow-sm flex gap-3"
    >
      <div class="h-28 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        <img v-if="row.posterUrl" :src="row.posterUrl" :alt="row.title" class="h-full w-full object-cover" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="truncate font-medium">{{ row.title }}</div>
        <div class="text-xs text-muted-foreground truncate">{{ row.path }}</div>
        <div class="mt-1 flex flex-wrap gap-1 text-xs">
          <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            <span :class="['h-2 w-2 rounded-full', watchedMeta[row.watched.state].dot]" />
            {{ watchedMeta[row.watched.state].label }}
          </span>
          <span class="inline-flex items-center rounded-full px-2 py-0.5"
            :class="row.backedUp.exists ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
            📦 pCloud {{ row.backedUp.exists ? '✅' : '❌' }}
          </span>
          <span v-if="!row.hasFile" class="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">archived locally</span>
        </div>
        <div class="mt-auto flex flex-wrap gap-1 pt-2">
          <Button size="sm" variant="outline" :disabled="row.hasFile"
            :title="row.hasFile ? 'Already present locally' : 'Restore from pCloud'"
            @click="emit('restore', row)">Restore</Button>
          <Button size="sm" variant="outline" :disabled="!row.hasFile || !row.backedUp.exists"
            :title="!row.backedUp.exists ? 'Backup not verified' : 'Archive local copy'"
            @click="emit('archive', row)">Archive</Button>
          <Button size="sm" variant="destructive" :disabled="!row.hasFile && !row.backedUp.exists"
            @click="emit('delete', row)">Delete everywhere</Button>
        </div>
      </div>
    </div>
  </div>
</template>