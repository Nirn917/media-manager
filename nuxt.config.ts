// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-08-01',
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss', 'shadcn-nuxt'],

  css: ['~/assets/css/tailwind.css'],

  runtimeConfig: {
    masterKey: process.env.APP_MASTER_KEY || '',
    dataDir: process.env.APP_DATA_DIR || '/app/data',
    rcloneConfig: process.env.RCLONE_CONFIG || '/config/rclone/rclone.conf',
    mediaRoot: '/data',     // Mount point of /data/media hostPath.
    public: {
      // Exposed to client - none sensitive here.
      siteName: 'media-manager',
    },
  },

  nitro: {
    // Nitro tasks are behind an experimental flag.
    experimental: { tasks: true },
    // Long-running rclone jobs + SSE need generous timeout.
    timing: false,
    routeRules: {
      '/api/restore/**/events': { cache: { maxAge: 0 }, cors: true },
    },
    scheduledTasks: {
      // Hourly cron jobs, internal to Nitro (no external scheduler needed).
      '0 * * * *': ['pcloud', 'jellyfin'],
    },
  },

  typescript: { strict: true },

  app: {
    head: {
      title: 'media-manager',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
})