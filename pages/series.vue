<script setup lang="ts">
import MediaList from '~/components/MediaList.vue'
import ArchiveDeleteDialog from '~/components/ArchiveDeleteDialog.vue'
import { Button } from '~/components/ui/button'
import { useMediaList } from '~/composables/useMediaList'
import { useMediaActions } from '~/composables/useMediaActions'
import type { Category } from '~/types/media'

const category = 'series' as Category
const { rows, loading, error, load } = useMediaList(category)
const {
  message, pending, pendingAction, deleteInput,
  restore: onRestore, archive: onArchive, startDelete: onDelete,
  confirmArchive, confirmDelete, closeDialog,
} = useMediaActions(category, load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Series</h1>
      <Button variant="outline" size="sm" @click="load">Refresh</Button>
    </div>
    <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
    <div v-if="message" class="text-sm text-muted-foreground">{{ message }}</div>
    <MediaList :rows="rows" :category="category" :loading="loading" @restore="onRestore" @archive="onArchive" @delete="onDelete" />
    <ArchiveDeleteDialog :row="pending" :action="pendingAction" :delete-input="deleteInput"
      @update:delete-input="deleteInput = $event" @confirm="pendingAction === 'archive' ? confirmArchive() : confirmDelete()" @cancel="closeDialog" />
  </div>
</template>