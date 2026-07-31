<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  type?: string
  placeholder?: string
  class?: string
  disabled?: boolean
  id?: string
}>(), { type: 'text' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', typeof v === 'string' ? v : String(v)),
})
</script>

<template>
  <input
    :id="id"
    v-model="value"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', props.class)"
  />
</template>