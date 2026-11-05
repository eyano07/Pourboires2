<template>
  <div>
    <v-card class="mb-4 text-center" color="primary" variant="tonal">
      <v-card-text>
        <div class="text-subtitle-1">Caisse des pourboires du {{ data?.date }}</div>
        <div class="text-h2 font-weight-bold my-2" data-testid="total">{{ money(data?.total ?? 0) }}</div>
        <div class="text-caption">Mise à jour automatique toutes les 10 secondes</div>
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
                     :subtitle="`${e.username} · ${hour(e.time)}`">
          <template v-if="me?.role === 'caissier' && e.username === me.username" #append>
            <v-btn icon="mdi-delete" variant="text" aria-label="Supprimer" @click="remove(e.id)" />
          </template>
        </v-list-item>
      </v-list>
      <v-card-text v-else>Aucun pourboire enregistré aujourd'hui.</v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
interface Entry { id: string, username: string, amount: number, time: string }
interface TipsData { date: string, total: number, entries: Entry[] }

const me = useMe()
const { data, refresh } = await useFetch<TipsData>('/api/tips', { headers: useRequestHeaders(['cookie']) })
const amount = ref('')
const formError = ref('')
const saving = ref(false)

const money = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)
const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kinshasa' })

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

async function remove(id: string) {
  await $fetch(`/api/tips/${id}`, { method: 'DELETE' })
  await refresh()
}

let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => refresh(), 10000) })
onBeforeUnmount(() => clearInterval(timer))
</script>
