<template>
  <div>
    <v-card class="mb-4 pa-2">
      <v-card-title class="font-weight-bold">Créer un utilisateur</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="create">
          <v-text-field v-model="form.name" label="Noms" placeholder="ex. Grace Mantekila" autocomplete="off" data-testid="new-name" class="mb-2" />
          <v-text-field v-model="form.username" label="Identifiant de connexion" placeholder="ex. grace" autocomplete="off"
                        hint="Lettres, chiffres, . _ - (sans espace)" persistent-hint class="mb-2" />
          <v-select v-model="form.role" label="Type de compte" :items="roles" item-title="label" item-value="value" />
          <v-text-field
            v-model="form.password" label="Mot de passe par défaut" autocomplete="off"
            hint="L'utilisateur devra le remplacer à sa première connexion" persistent-hint
            append-inner-icon="mdi-dice-multiple" @click:append-inner="form.password = generate()"
          />
          <v-alert v-if="error" type="error" variant="tonal" class="my-4">{{ error }}</v-alert>
          <v-alert v-if="info" type="success" variant="tonal" class="my-4">{{ info }}</v-alert>
          <v-btn type="submit" color="primary" size="large" block class="mt-4" :loading="saving">Créer le compte</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title class="font-weight-bold pt-4">Utilisateurs ({{ users?.length ?? 0 }})</v-card-title>
      <v-list>
        <v-list-item v-for="u in users" :key="u.username" :title="prettyName(u.name)"
                     :subtitle="`${u.username} · ${roleLabel(u.role)}${u.mustChangePassword ? ' · mot de passe par défaut' : ''}`">
          <template #prepend><PersonAvatar :name="u.name" class="mr-3" /></template>
          <template #append>
            <v-menu location="bottom end">
              <template #activator="{ props }">
                <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" :aria-label="`Actions pour ${u.name}`" :data-testid="`menu-${u.username}`" />
              </template>
              <v-list density="compact" rounded="lg">
                <v-list-item prepend-icon="mdi-pencil-outline" title="Modifier les noms" @click="editName(u)" />
                <v-list-item prepend-icon="mdi-lock-reset" title="Réinitialiser le mot de passe" @click="reset(u.username)" />
                <v-list-item prepend-icon="mdi-delete-outline" title="Supprimer le compte" base-color="error"
                             :disabled="u.username === me?.username" @click="remove(u.username)" />
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-dialog v-model="nameDialog" max-width="420">
      <v-card :title="`Noms de ${nameUser?.username}`">
        <v-card-text>
          <v-text-field v-model="nameValue" label="Noms" data-testid="edit-name" />
          <v-alert v-if="nameError" type="error" variant="tonal">{{ nameError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer /><v-btn @click="nameDialog = false">Annuler</v-btn>
          <v-btn color="primary" variant="flat" @click="saveName">Enregistrer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
interface U { username: string, name: string, role: Me['role'], mustChangePassword: boolean }

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

const form = reactive({ name: '', username: '', role: 'caissier', password: '' })
const error = ref('')
const info = ref('')
const saving = ref(false)

async function create() {
  error.value = ''; info.value = ''; saving.value = true
  try {
    const u = await $fetch<U>('/api/users', { method: 'POST', body: { ...form } })
    info.value = `Compte de ${u.name} (identifiant « ${u.username} ») créé. Mot de passe par défaut à lui communiquer : ${form.password}`
    form.name = ''; form.username = ''; form.password = ''
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

const nameDialog = ref(false)
const nameUser = ref<U | null>(null)
const nameValue = ref('')
const nameError = ref('')
function editName(u: U) { nameUser.value = u; nameValue.value = u.name; nameError.value = ''; nameDialog.value = true }
async function saveName() {
  try {
    await $fetch(`/api/users/${encodeURIComponent(nameUser.value!.username)}/name`, { method: 'PUT', body: { name: nameValue.value } })
    nameDialog.value = false
    await refresh()
  } catch (e: any) { nameError.value = e?.data?.statusMessage || 'Échec' }
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
