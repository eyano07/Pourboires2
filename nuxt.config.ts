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
              primary: '#1867c0', secondary: '#f59e0b', error: '#dc2626', success: '#16a34a',
              warning: '#d97706', info: '#0284c7', background: '#f3f5f7', surface: '#ffffff',
              bar: '#1867c0', 'on-bar': '#ffffff',
            },
          },
          // Mode nuit : fonds sombres, bleu plus clair pour rester lisible
          bisoDark: {
            dark: true,
            colors: {
              primary: '#2f81f7', secondary: '#fbbf24', error: '#ef4444', success: '#4ade80',
              warning: '#fbbf24', info: '#38bdf8', background: '#0d1117', surface: '#161b22',
              bar: '#161b22', 'on-bar': '#e6edf3',
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
