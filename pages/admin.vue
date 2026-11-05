<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Créer un utilisateur</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="create">
          <v-text-field v-model="form.username" label="Nom d'utilisateur" autocomplete="off" />
          <v-select v-model="form.role" label="Type de compte" :items="roles" item-title="label" item-value="value" />
          <v-text-field
            v-model="form.password" label="Mot de passe par défaut" autocomplete="off"
            hint="L'utilisateur devra le remplacer à sa première connexion" persistent-hint
            append-inner-icon="mdi-dice-multiple" @click:append-inner="form.password = generate()"
          />
          <v-alert v-if="error" type="error" variant="tonal" class="my-4">{{ error }}</v-alert>
          <v-alert v-if="info" type="success" variant="tonal" class="my-4">{{ info }}</v-alert>
          <v-btn type="submit" color="primary" block class="mt-4" :loading="saving">Créer le compte</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Utilisateurs ({{ users?.length ?? 0 }})</v-card-title>
      <v-list>
        <v-list-item v-for="u in users" :key="u.username" :title="u.username"
                     :subtitle="roleLabel(u.role) + (u.mustChangePassword ? ' · mot de passe par défaut non changé' : '')">
          <template #append>
            <v-btn icon="mdi-lock-reset" variant="text" aria-label="Réinitialiser le mot de passe" @click="reset(u.username)" />
            <v-btn icon="mdi-delete" variant="text" aria-label="Supprimer" :disabled="u.username === me?.username"
                   @click="remove(u.username)" />
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog v-model="resetDialog" max-width="420">
      <v-card :title="`Réinitialiser ${resetUser}`">
        <v-card-text>
          <v-text-field v-model="resetPassword" label="Nouveau mot de passe par défaut"
                        append-inner-icon="mdi-dice-multiple" @click:append-inner="resetPassword = generate()" />
          <v-alert v-if="resetError" type="error" variant="tonal">{{ resetError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="resetDialog = false">Annuler</v-btn>
          <v-btn color="primary" @click="confirmReset">Réinitialiser</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card :title="`Supprimer ${deleteTarget} ?`" text="Cette action est définitive.">
        <v-card-actions>
          <v-spacer /><v-btn @click="deleteDialog = false">Annuler</v-btn>
          <v-btn color="error" @click="confirmDelete">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
interface U { username: string, role: Me['role'], mustChangePassword: boolean }

const me = useMe()
const { data: users, refresh } = await useFetch<U[]>('/api/users', { headers: useRequestHeaders(['cookie']) })
const roles = [
  { value: 'caissier', label: 'Caissier (ajoute les pourboires)' },
  { value: 'lecteur', label: 'Lecteur (consulte la caisse)' },
  { value: 'admin', label: 'Administrateur' },
]

// Mot de passe par défaut lisible (sans caractères ambigus).
function generate() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(8)
  crypto.getRandomValues(a)
  return Array.from(a, n => chars[n % chars.length]).join('')
}

const form = reactive({ username: '', role: 'caissier', password: '' })
const error = ref('')
const info = ref('')
const saving = ref(false)

async function create() {
  error.value = ''; info.value = ''; saving.value = true
  try {
    const u = await $fetch<U>('/api/users', { method: 'POST', body: { ...form } })
    info.value = `Compte « ${u.username} » créé. Mot de passe par défaut à lui communiquer : ${form.password}`
    form.username = ''; form.password = ''
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Création impossible'
  } finally { saving.value = false }
}

const resetDialog = ref(false)
const resetUser = ref('')
const resetPassword = ref('')
const resetError = ref('')
function reset(username: string) {
  resetUser.value = username; resetPassword.value = generate(); resetError.value = ''; resetDialog.value = true
}
async function confirmReset() {
  try {
    await $fetch(`/api/users/${encodeURIComponent(resetUser.value)}/reset`, { method: 'POST', body: { password: resetPassword.value } })
    resetDialog.value = false
    info.value = `Mot de passe de « ${resetUser.value} » réinitialisé à : ${resetPassword.value}`
    await refresh()
  } catch (e: any) { resetError.value = e?.data?.statusMessage || 'Échec' }
}

const deleteDialog = ref(false)
const deleteTarget = ref('')
function remove(username: string) { deleteTarget.value = username; deleteDialog.value = true }
async function confirmDelete() {
  try {
    await $fetch(`/api/users/${encodeURIComponent(deleteTarget.value)}`, { method: 'DELETE' })
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Suppression impossible' }
  deleteDialog.value = false
  await refresh()
}
</script>
