export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['vuetify-nuxt-module'],
  css: ['@mdi/font/css/materialdesignicons.css'],
  vuetify: {
    vuetifyOptions: {
      theme: { defaultTheme: 'light' },
      icons: { defaultSet: 'mdi' },
    },
  },
  app: {
    head: {
      title: 'Pourboires chez Biso',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#1867c0' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icon-180.png' },
      ],
    },
  },
  devtools: { enabled: false },
})
