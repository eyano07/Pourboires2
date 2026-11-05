<template>
  <v-card class="mx-auto mt-4" max-width="460">
    <v-card-title>Changer mon mot de passe</v-card-title>
    <v-card-text>
      <v-alert v-if="me?.mustChangePassword" type="warning" variant="tonal" class="mb-4">
        C'est votre première connexion : choisissez un nouveau mot de passe pour continuer.
      </v-alert>
      <v-form @submit.prevent="submit">
        <v-text-field v-model="current" label="Mot de passe actuel" type="password" autocomplete="current-password" />
        <v-text-field v-model="next" label="Nouveau mot de passe (6 caractères minimum)" type="password" autocomplete="new-password" />
        <v-text-field v-model="confirm" label="Confirmer le nouveau mot de passe" type="password" autocomplete="new-password" />
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
        <v-btn type="submit" color="primary" block :loading="loading">Enregistrer</v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const me = useMe()
const current = ref('')
const next = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (next.value.length < 6) { error.value = 'Le nouveau mot de passe doit contenir au moins 6 caractères'; return }
  if (next.value !== confirm.value) { error.value = 'La confirmation ne correspond pas'; return }
  loading.value = true
  try {
    me.value = await $fetch<Me>('/api/auth/password', { method: 'POST', body: { current: current.value, next: next.value } })
    await navigateTo('/')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Changement impossible'
  } finally {
    loading.value = false
  }
}
</script>
