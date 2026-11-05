<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable" flat>
      <v-app-bar-title>
        <span class="font-weight-bold">Pourboires</span><span class="d-none d-sm-inline font-weight-light"> chez Biso</span>
      </v-app-bar-title>
      <template v-if="me" #append>
        <v-chip class="mr-2 d-none d-md-flex" variant="flat" color="white" prepend-icon="mdi-account">
          {{ prettyName(me.username) }} · {{ roleLabel(me.role) }}
        </v-chip>
        <template v-if="!me.mustChangePassword">
          <v-btn v-if="me.role === 'admin'" icon="mdi-account-group" aria-label="Utilisateurs" to="/admin" />
          <v-btn v-if="me.role === 'caissier'" icon="mdi-account-multiple-check" aria-label="Partage" to="/partage" />
          <v-btn icon="mdi-home" aria-label="Caisse" to="/" />
          <v-btn icon="mdi-key" aria-label="Changer mon mot de passe" to="/password" />
        </template>
        <v-btn icon="mdi-logout" aria-label="Déconnexion" @click="logout" />
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
