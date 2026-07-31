<script setup lang="ts">
// Root route is a placeholder — the global middleware redirects to
// /setup (first boot) or /movies (subsequent visits) before this page renders.
definePageMeta({ layout: 'blank' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    Loading…
  </div>
</template>