<script setup lang="ts">
const route = useRoute()
const tabs = [
  { to: '/movies', label: 'Movies' },
  { to: '/series', label: 'Series' },
  { to: '/anime', label: 'Anime' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/settings', label: 'Settings' },
]
const links = tabs.map((t) => ({ ...t, active: computed(() => route.path.startsWith(t.to)) }))
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b">
      <div class="container mx-auto flex h-14 items-center gap-6 px-4">
        <NuxtLink to="/" class="font-semibold">media-manager</NuxtLink>
        <nav class="flex gap-1">
          <NuxtLink
            v-for="l in links" :key="l.to" :to="l.to"
            class="rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent"
            :class="l.active.value ? 'bg-accent font-medium' : 'text-muted-foreground'"
          >{{ l.label }}</NuxtLink>
        </nav>
        <div class="ml-auto">
          <slot name="actions" />
        </div>
      </div>
    </header>
    <main class="container mx-auto px-4 py-6">
      <slot />
    </main>
  </div>
</template>