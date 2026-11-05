<template>
  <v-app>
    <v-app-bar color="bar" density="comfortable" flat>
      <v-app-bar-title>
        <span class="font-weight-bold">Pourboires</span><span class="d-none d-sm-inline font-weight-light"> chez Biso</span>
      </v-app-bar-title>
      <template #append>
        <template v-if="me && !me.mustChangePassword">
          <v-btn v-if="me.role === 'admin'" icon="mdi-account-group" aria-label="Utilisateurs" to="/admin" />
          <v-btn v-if="me.role === 'caissier'" icon="mdi-account-multiple-check" aria-label="Partage" to="/partage" />
          <v-btn icon="mdi-home" aria-label="Caisse" to="/" />
        </template>
        <!-- Menu du compte : nom, mode nuit, mot de passe, déconnexion -->
        <v-menu v-if="me" location="bottom end" :close-on-content-click="false">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon aria-label="Mon compte" data-testid="account-menu">
              <PersonAvatar :name="me.name" :size="32" />
            </v-btn>
          </template>
          <v-card min-width="250" class="pa-1">
            <v-list density="comfortable">
              <v-list-item :title="prettyName(me.name)" :subtitle="`${me.username} · ${roleLabel(me.role)}`">
                <template #prepend><PersonAvatar :name="me.name" class="mr-3" /></template>
              </v-list-item>
              <v-divider class="my-1" />
              <v-list-item :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
                           :title="isDark ? 'Mode jour' : 'Mode nuit'" data-testid="theme-toggle" @click="toggleTheme" />
              <v-list-item v-if="!me.mustChangePassword" prepend-icon="mdi-key-outline" title="Changer mon mot de passe" to="/password" />
              <v-list-item prepend-icon="mdi-logout" title="Déconnexion" base-color="error" @click="logout" />
            </v-list>
          </v-card>
        </v-menu>
        <!-- Avant connexion : simple bouton jour/nuit -->
        <v-btn v-else :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" :aria-label="isDark ? 'Mode jour' : 'Mode nuit'"
               data-testid="theme-toggle" @click="toggleTheme" />
      </template>
    </v-app-bar>
    <v-main>
      <v-container class="pt-4 pb-12" style="max-width: 640px">
        <NuxtPage />
      </v-container>
    </v-main>
    <v-snackbar :model-value="!!notices.length" color="primary" location="top" :timeout="6000"
                multi-line rounded="lg" @update:model-value="v => !v && notices.shift()">
      <div class="font-weight-bold">{{ notices[0]?.title }}</div>
      <div>{{ notices[0]?.body }}</div>
      <template #actions><v-btn variant="text" @click="notices.shift()">OK</v-btn></template>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
const me = useMe()
const notices = useNotices()
const { isDark, initFromCookie, followSystem, toggle: toggleTheme } = useThemeMode()
initFromCookie() // choix mémorisé : appliqué dès le rendu du serveur (pas de flash)
onMounted(followSystem) // sinon : réglage jour/nuit du téléphone

// Connexion en direct ouverte dès qu'un utilisateur est connecté (et a changé son mot de passe).
onMounted(() => watch(me, (m) => { m && !m.mustChangePassword ? startLive() : stopLive() }, { immediate: true }))

async function logout() {
  stopLive()
  if (pushSupported()) await disablePush().catch(() => {})
  await $fetch('/api/auth/logout', { method: 'POST' })
  me.value = null
  await navigateTo('/login')
}
</script>
