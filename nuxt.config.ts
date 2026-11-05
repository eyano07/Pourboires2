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
  app: { head: { title: 'Pourboires chez Biso', htmlAttrs: { lang: 'fr' } } },
  devtools: { enabled: false },
})
