export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  modules: ['vuetify-nuxt-module'],
  css: ['@mdi/font/css/materialdesignicons.css'],
  vuetify: {
    vuetifyOptions: {
      theme: {
        defaultTheme: 'biso',
        themes: {
          biso: {
            dark: false,
            colors: {
              primary: '#0f766e', secondary: '#f59e0b', error: '#dc2626', success: '#16a34a',
              warning: '#d97706', info: '#0284c7', background: '#f3f5f7', surface: '#ffffff',
            },
          },
        },
      },
      icons: { defaultSet: 'mdi' },
      defaults: {
        VCard: { rounded: 'xl', elevation: 0, border: true },
        VBtn: { rounded: 'lg', class: 'text-none', style: 'letter-spacing: 0' },
        VTextField: { variant: 'outlined', rounded: 'lg' },
        VSelect: { variant: 'outlined', rounded: 'lg' },
        VCombobox: { variant: 'outlined', rounded: 'lg' },
        VAlert: { rounded: 'lg' },
        VChip: { rounded: 'pill' },
      },
    },
  },
  app: {
    head: {
      title: 'Pourboires chez Biso',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0f766e' },
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
