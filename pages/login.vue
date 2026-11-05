<template>
  <v-card class="mx-auto mt-8" max-width="420">
    <v-card-title>Connexion</v-card-title>
    <v-card-text>
      <v-form @submit.prevent="submit">
        <v-text-field v-model="username" label="Nom d'utilisateur" autocomplete="username" autofocus />
        <v-text-field v-model="password" label="Mot de passe" type="password" autocomplete="current-password" />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
        <v-btn type="submit" color="primary" block :loading="loading">Se connecter</v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const me = useMe()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    me.value = await $fetch<Me>('/api/auth/login', {
      method: 'POST', body: { username: username.value, password: password.value },
    })
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'Connexion impossible'
  } finally {
    loading.value = false
  }
}
</script>
