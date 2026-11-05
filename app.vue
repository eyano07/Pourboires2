<template>
  <v-app>
    <v-app-bar color="primary" density="comfortable">
      <v-app-bar-title>Pourboires chez Biso</v-app-bar-title>
      <template v-if="me" #append>
        <v-chip class="mr-2" variant="flat" color="white" prepend-icon="mdi-account">
          {{ me.username }} · {{ me.role }}
        </v-chip>
        <v-btn icon="mdi-logout" aria-label="Déconnexion" @click="logout" />
      </template>
    </v-app-bar>
    <v-main>
      <v-container style="max-width: 720px">
        <NuxtPage />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
const me = useMe()
async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  me.value = null
  await navigateTo('/login')
}
</script>
