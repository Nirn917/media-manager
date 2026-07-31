<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { useAuth } from '~/composables/useAuth'
import { extractFetchError } from '~/composables/extractFetchError'

definePageMeta({ layout: 'blank' })
useHead({ title: 'Login — media-manager' })

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const { login } = useAuth()
const router = useRouter()

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await login(username.value.trim(), password.value)
    await router.push('/movies')
  } catch (e) {
    error.value = extractFetchError(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>media-manager</CardTitle>
        <CardDescription>Sign in with your Jellyfin account.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <form class="space-y-3" @submit.prevent="submit">
          <label class="text-sm font-medium">Username</label>
          <Input v-model="username" autocomplete="username" autofocus />
          <label class="text-sm font-medium">Password</label>
          <Input v-model="password" type="password" autocomplete="current-password" />
          <Button type="submit" class="w-full" :disabled="loading || !username">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </Button>
          <div v-if="error" class="text-sm text-destructive">{{ error }}</div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>