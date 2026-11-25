export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  typescript: { strict: true, typeCheck: true },
  app: { baseURL: process.env.NUXT_APP_BASE_URL || '/' },
  runtimeConfig: { public: { legacyOrigin: process.env.NUXT_PUBLIC_LEGACY_ORIGIN || '' } },
  vite: { define: { 'process.env.DEBUG': false } }
})
