<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

definePageMeta({ layout: 'blank' })
useHead({ title: 'Setup — media-manager' })

const step = ref(0)
const steps = ['Jellyfin', 'Radarr', 'Sonarr'] as const

const jellyfin = reactive({ url: '', adminUsername: '', adminPassword: '', adminUserId: '' })
const radarr = reactive({ url: '', apiKey: '' })
const sonarr = reactive({ url: '', apiKey: '' })

const testing = ref(false)
const testResult = ref<{ ok: boolean; error?: string; users?: { id: string; name: string }[] } | null>(null)
const saving = ref(false)
const finished = ref(false)
const error = ref('')

async function testJellyfin() {
  testing.value = true
  testResult.value = null
  try {
    const res = await $fetch<{ ok: boolean; error?: string; adminUserId?: string; users?: { id: string; name: string }[] }>(
      '/api/setup/test/jellyfin', { method: 'POST', body: { url: jellyfin.url, username: jellyfin.adminUsername, password: jellyfin.adminPassword } },
    )
    testResult.value = res
    if (res.ok && res.adminUserId && !jellyfin.adminUserId) jellyfin.adminUserId = res.adminUserId
  } catch (e) {
    testResult.value = { ok: false, error: extractFetchError(e) }
  } finally {
    testing.value = false
  }
}

async function testArr() {
  testing.value = true
  testResult.value = null
  const service = steps[step.value]!.toLowerCase()
  const body = service === 'radarr' ? radarr : sonarr
  try {
    const res = await $fetch<{ ok: boolean; error?: string }>(`/api/setup/test/${service}`, { method: 'POST', body })
    testResult.value = res
  } catch (e) {
    testResult.value = { ok: false, error: extractFetchError(e) }
  } finally {
    testing.value = false
  }
}

function next() {
  testResult.value = null
  step.value++
}

function back() {
  testResult.value = null
  step.value--
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/setup/save', {
      method: 'POST',
      body: {
        jellyfin: { url: jellyfin.url, adminUsername: jellyfin.adminUsername, adminPassword: jellyfin.adminPassword, adminUserId: jellyfin.adminUserId },
        radarr,
        sonarr,
      },
    })
    finished.value = true
  } catch (e: unknown) {
    error.value = extractFetchError(e)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  // If already set up, bounce to login.
  try {
    const res = await $fetch<{ setupComplete: boolean }>('/api/setup/status')
    if (res.setupComplete) finished.value = true
  } catch { /* ignore - stay on wizard */ }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-xl">
      <CardHeader>
        <CardTitle>media-manager — setup</CardTitle>
        <CardDescription>
          Step {{ step + 1 }} / {{ steps.length }} — configure {{ steps[step] }}
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <template v-if="finished">
          <p class="text-sm text-muted-foreground">
            Setup complete. <NuxtLink to="/login" class="text-primary underline">Go to login →</NuxtLink>
          </p>
        </template>
        <template v-else>
          <!-- Step 0: Jellyfin -->
          <div v-if="step === 0" class="space-y-3">
            <label class="text-sm font-medium">Jellyfin URL</label>
            <Input v-model="jellyfin.url" placeholder="http://jellyfin.jellyfin.svc.cluster.local:8096" />
            <label class="text-sm font-medium">Admin username</label>
            <Input v-model="jellyfin.adminUsername" placeholder="admin" />
            <label class="text-sm font-medium">Admin password</label>
            <Input v-model="jellyfin.adminPassword" type="password" placeholder="••••••••" />
            <Button variant="outline" :disabled="testing || !jellyfin.url || !jellyfin.adminUsername" @click="testJellyfin">
              {{ testing ? 'Testing…' : 'Test connection' }}
            </Button>
            <div v-if="testResult" class="text-sm" :class="testResult.ok ? 'text-green-600' : 'text-destructive'">
              {{ testResult.ok ? `✓ Authenticated${testResult.users ? ` (${testResult.users.length} users)` : ''}` : `✗ ${testResult.error}` }}
            </div>
            <div v-if="testResult?.ok && testResult.users?.length" class="space-y-1">
              <label class="text-sm font-medium">Jellyfin admin user (for index cron)</label>
              <select v-model="jellyfin.adminUserId" class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                <option v-for="u in testResult.users" :key="u.id" :value="u.id">{{ u.name }}</option>
              </select>
            </div>
          </div>

          <!-- Step 1: Radarr -->
          <div v-else-if="step === 1" class="space-y-3">
            <label class="text-sm font-medium">Radarr URL</label>
            <Input v-model="radarr.url" placeholder="http://radarr.radarr.svc.cluster.local:7878" />
            <label class="text-sm font-medium">API key</label>
            <Input v-model="radarr.apiKey" placeholder="…" />
            <Button variant="outline" :disabled="testing || !radarr.url || !radarr.apiKey" @click="testArr">
              {{ testing ? 'Testing…' : 'Test connection' }}
            </Button>
            <div v-if="testResult" class="text-sm" :class="testResult.ok ? 'text-green-600' : 'text-destructive'">
              {{ testResult.ok ? '✓ Connected' : `✗ ${testResult.error}` }}
            </div>
          </div>

          <!-- Step 2: Sonarr -->
          <div v-else class="space-y-3">
            <label class="text-sm font-medium">Sonarr URL</label>
            <Input v-model="sonarr.url" placeholder="http://sonarr.sonarr.svc.cluster.local:8989" />
            <label class="text-sm font-medium">API key</label>
            <Input v-model="sonarr.apiKey" placeholder="…" />
            <Button variant="outline" :disabled="testing || !sonarr.url || !sonarr.apiKey" @click="testArr">
              {{ testing ? 'Testing…' : 'Test connection' }}
            </Button>
            <div v-if="testResult" class="text-sm" :class="testResult.ok ? 'text-green-600' : 'text-destructive'">
              {{ testResult.ok ? '✓ Connected' : `✗ ${testResult.error}` }}
            </div>
          </div>

          <div v-if="error" class="text-sm text-destructive">Save failed: {{ error }}</div>
        </template>
      </CardContent>
      <template v-if="!finished">
        <div class="flex items-center justify-between p-6 pt-0">
          <Button v-if="step > 0" variant="ghost" @click="back">Back</Button>
          <span v-else />
          <Button v-if="step < steps.length - 1" :disabled="testing" @click="next">Next</Button>
          <Button v-else :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Finish setup' }}</Button>
        </div>
      </template>
    </Card>
  </div>
</template>