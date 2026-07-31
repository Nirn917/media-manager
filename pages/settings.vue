<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { useAuthUser } from '~/composables/useAuth'
import { extractFetchError } from '~/composables/extractFetchError'

definePageMeta({ middleware: ['admin'] })
useHead({ title: 'Settings — media-manager' })

const user = useAuthUser()

type Settings = {
  jellyfin: { url: string; adminUserId: string; adminUsername: string; hasPassword: boolean } | null
  radarr: { url: string; apiKey: string } | null
  sonarr: { url: string; apiKey: string } | null
}

const jellyfin = reactive({ url: '', adminUserId: '', adminUsername: '', adminPassword: '' })
const radarr = reactive({ url: '', apiKey: '' })
const sonarr = reactive({ url: '', apiKey: '' })
const message = ref('')
const saving = ref(false)

const loaded = ref<Settings | null>(null)

async function load() {
  try {
    const res = await $fetch<Settings>('/api/settings')
    loaded.value = res
    if (res.jellyfin) {
      jellyfin.url = res.jellyfin.url
      jellyfin.adminUserId = res.jellyfin.adminUserId
      jellyfin.adminUsername = res.jellyfin.adminUsername
    }
    if (res.radarr) { radarr.url = res.radarr.url; radarr.apiKey = res.radarr.apiKey }
    if (res.sonarr) { sonarr.url = res.sonarr.url; sonarr.apiKey = res.sonarr.apiKey }
  } catch (e) {
    message.value = extractFetchError(e)
  }
}

async function save() {
  saving.value = true
  message.value = ''
  try {
    await $fetch('/api/settings', {
      method: 'POST',
      body: {
        jellyfin: {
          url: jellyfin.url,
          adminUserId: jellyfin.adminUserId,
          adminUsername: jellyfin.adminUsername,
          ...(jellyfin.adminPassword ? { adminPassword: jellyfin.adminPassword } : {}),
        },
        radarr,
        sonarr,
      },
    })
    jellyfin.adminPassword = ''
    message.value = 'Saved.'
    await load()
  } catch (e) {
    message.value = extractFetchError(e)
  } finally {
    saving.value = false
  }
}

async function resync() {
  message.value = 'Reindexing pCloud… (this can take a minute)'
  try {
    const res = await $fetch<{ result?: { count?: number; log?: string[]; success?: boolean } }>('/api/pcloud/resync', { method: 'POST' })
    const tail = res.result?.log?.filter((l) => l.startsWith('failed:'))[0]
    message.value = res.result?.success
      ? `pCloud reindex: ${res.result?.count ?? 0} entries`
      : `pCloud reindex failed${tail ? `: ${tail}` : ''}`
  } catch (e) {
    message.value = extractFetchError(e)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Settings <span class="text-sm text-muted-foreground">(admin: {{ user?.name }})</span></h1>
    <form class="space-y-4" @submit.prevent="save">
      <Card>
        <CardHeader>
          <CardTitle>Jellyfin</CardTitle>
          <CardDescription>SSO provider + admin user for the watched-status index cron.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <label class="text-sm font-medium">URL</label>
          <Input v-model="jellyfin.url" placeholder="http://jellyfin.jellyfin.svc.cluster.local:8096" />
          <label class="text-sm font-medium">Admin username</label>
          <Input v-model="jellyfin.adminUsername" />
          <label class="text-sm font-medium">Admin password</label>
          <Input v-model="jellyfin.adminPassword" type="password" placeholder="leave blank to keep current" />
          <label class="text-sm font-medium">Admin Jellyfin user ID</label>
          <Input v-model="jellyfin.adminUserId" placeholder="used by the index cron" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Radarr</CardTitle>
          <CardDescription>Movies (rootFolder /data/movies).</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <label class="text-sm font-medium">URL</label>
          <Input v-model="radarr.url" placeholder="http://radarr.radarr.svc.cluster.local:7878" />
          <label class="text-sm font-medium">API key</label>
          <Input v-model="radarr.apiKey" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sonarr</CardTitle>
          <CardDescription>Series + Anime (rootFolder /data/series, /data/anime).</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <label class="text-sm font-medium">URL</label>
          <Input v-model="sonarr.url" placeholder="http://sonarr.sonarr.svc.cluster.local:8989" />
          <label class="text-sm font-medium">API key</label>
          <Input v-model="sonarr.apiKey" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>pCloud backup index</CardTitle>
          <CardDescription>Hourly rclone scan of pcloud:media. Trigger a full resync now.</CardDescription>
        </CardHeader>
        <CardFooter class="pt-6">
          <Button type="button" variant="outline" @click="resync">Resync now</Button>
        </CardFooter>
      </Card>

      <div class="flex items-center gap-3">
        <Button type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save settings' }}</Button>
        <span v-if="message" class="text-sm text-muted-foreground">{{ message }}</span>
      </div>
    </form>
  </div>
</template>