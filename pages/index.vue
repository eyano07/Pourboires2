<template>
  <div>
    <v-card class="mb-4 text-center" color="primary" variant="tonal">
      <v-card-text>
        <div class="text-title-medium">Caisse des pourboires du {{ data?.date }}</div>
        <div class="text-display-medium font-weight-bold my-2" data-testid="total">{{ money(data?.total ?? 0) }}</div>
        <div class="text-body-small">Mise à jour automatique toutes les 10 secondes</div>
      </v-card-text>
    </v-card>

    <v-card v-if="me?.role === 'caissier'" class="mb-4">
      <v-card-title>Ajouter un pourboire</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="add">
          <v-text-field
            v-model="amount" label="Montant ($)" inputmode="decimal" prepend-inner-icon="mdi-cash"
            :error-messages="formError"
          />
          <v-btn type="submit" color="primary" block :loading="saving">Enregistrer</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Saisies du jour ({{ data?.entries.length ?? 0 }})</v-card-title>
      <v-list v-if="data?.entries.length">
        <v-list-item v-for="e in [...data.entries].reverse()" :key="e.id" :title="money(e.amount)"
                     :subtitle="e.username">
          <template v-if="me?.role === 'caissier' && e.username === me.username" #append>
            <v-btn icon="mdi-delete" variant="text" aria-label="Supprimer" @click="toDelete = e" />
          </template>
        </v-list-item>
      </v-list>
      <v-card-text v-else>Aucun pourboire enregistré aujourd'hui.</v-card-text>
    </v-card>

    <v-dialog :model-value="!!toDelete" max-width="380" @update:model-value="toDelete = null">
      <v-card :title="`Supprimer ${money(toDelete?.amount ?? 0)} ?`" text="Cette saisie sera retirée de la caisse du jour.">
        <v-card-actions>
          <v-spacer /><v-btn @click="toDelete = null">Annuler</v-btn>
          <v-btn color="error" @click="confirmRemove">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
interface Entry { id: string, username: string, amount: number }
interface TipsData { date: string, total: number, entries: Entry[] }

const me = useMe()
const { data, refresh, error } = await useFetch<TipsData>('/api/tips', { headers: useRequestHeaders(['cookie']) })

// Session expirée, compte supprimé ou mot de passe changé ailleurs : retour à la connexion.
watch(error, async (e) => {
  if (e?.statusCode === 401 || e?.statusCode === 403) {
    me.value = null
    await navigateTo('/login')
  }
})
const amount = ref('')
const formError = ref('')
const saving = ref(false)

const money = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)

async function add() {
  formError.value = ''
  saving.value = true
  try {
    await $fetch('/api/tips', { method: 'POST', body: { amount: amount.value } })
    amount.value = ''
    await refresh()
  } catch (e: any) {
    formError.value = e?.data?.statusMessage || 'Enregistrement impossible'
  } finally { saving.value = false }
}

const toDelete = ref<Entry | null>(null)
async function confirmRemove() {
  const id = toDelete.value?.id
  toDelete.value = null
  if (id) await $fetch(`/api/tips/${id}`, { method: 'DELETE' }).catch(() => {})
  await refresh()
}

let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => refresh(), 10000) })
onBeforeUnmount(() => clearInterval(timer))
</script>
