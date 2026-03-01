// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/leaflet', '@vite-pwa/nuxt'],
  vite: {
    ssr: {
      external: ['@prisma/client']
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Thailand Disaster Watch',
      short_name: 'TH Disaster',
      description: 'ระบบพยากรณ์มวลน้ำและเตือนภัยน้ำท่วมด้วย AI',
      theme_color: '#030712',
      background_color: '#030712',
      display: 'standalone',
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}']
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  },
  app: {
    head: {
      title: 'Thailand Disaster Watch — ระบบเฝ้าระวังภัยพิบัติทั่วประเทศ',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'ระบบพยากรณ์มวลน้ำและเตือนภัยน้ำท่วมทั่วประเทศด้วย AI และ Open Data' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Noto+Sans+Thai:wght@300;400;500;600;700;800;900&display=swap' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    firmsMapKey: process.env.FIRMS_MAP_KEY || '',
    openweatherApiKey: process.env.OPENWEATHER_API_KEY || '',
    aqicnApiToken: process.env.AQICN_API_TOKEN || '',
  },
  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },
})
