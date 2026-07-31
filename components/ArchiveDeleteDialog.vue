<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import type { MediaRow } from '~/types/media'

const props = defineProps<{
  row: MediaRow | null
  action: 'archive' | 'delete' | null
  deleteInput: string
}>()
const emit = defineEmits<{
  'update:deleteInput': [v: string]
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div v-if="props.row" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    @click.self="emit('cancel')">
    <div class="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
      <h2 v-if="props.action === 'archive'" class="text-lg font-semibold">
        Archive "{{ props.row.title }}"?
      </h2>
      <h2 v-else class="text-lg font-semibold text-destructive">
        Delete "{{ props.row.title }}" everywhere?
      </h2>
      <p class="mt-2 text-sm text-muted-foreground">
        <template v-if="props.action === 'archive'">
          This will stop the torrent seed and delete the local copy. The pCloud backup is kept.
        </template>
        <template v-else>
          This will archive the local copy AND permanently delete the pCloud backup. Irreversible.
        </template>
      </p>
      <div v-if="props.row.watched.state !== 'played'" class="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
        ⚠ This media is not fully watched. The action is still allowed.
      </div>
      <div v-if="props.action === 'delete'" class="mt-3">
        <label class="text-sm font-medium">Type <code>supprimer</code> to confirm</label>
        <Input :model-value="props.deleteInput" @update:model-value="emit('update:deleteInput', $event)" class="mt-1" autofocus />
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button variant="ghost" @click="emit('cancel')">Cancel</Button>
        <Button v-if="props.action === 'archive'" @click="emit('confirm')">Archive</Button>
        <Button v-else variant="destructive"
          :disabled="props.deleteInput.trim().toLowerCase() !== 'supprimer'"
          @click="emit('confirm')">Delete everywhere</Button>
      </div>
    </div>
  </div>
</template>