<template>
  <div>
    <v-card class="mb-4 text-center" color="primary" variant="tonal">
      <v-card-text>
        <div class="text-title-medium">Caisse des pourboires du {{ tips?.date }}</div>
        <div class="text-display-medium font-weight-bold my-2" data-testid="total">{{ money(tips?.total ?? 0) }}</div>
        <v-chip size="small" :color="live === 'on' ? 'success' : 'warning'" variant="flat" data-testid="live">
          <v-icon start :icon="live === 'on' ? 'mdi-access-point' : 'mdi-access-point-off'" />
          {{ live === 'on' ? 'En direct' : 'Reconnexion…' }}
        </v-chip>
      </v-card-text>
    </v-card>

    <v-alert v-if="me?.role !== 'admin' && iAmSelected" type="info" variant="tonal" class="mb-4" density="compact">
      Vous faites partie du partage d'aujourd'hui : vous êtes alerté à chaque nouveau pourboire.
    </v-alert>

    <v-card v-if="me?.role !== 'admin'" class="mb-4" variant="outlined">
      <v-card-text class="d-flex align-center flex-wrap ga-2">
        <v-icon icon="mdi-bell-ring" />
        <span v-if="pushStatus === 'on'">Notifications activées sur cet appareil.</span>
        <span v-else-if="pushStatus === 'denied'">Notifications bloquées dans les réglages du navigateur.</span>
        <span v-else-if="pushStatus === 'unsupported'" class="text-body-small">
          Les notifications sur téléphone (appli fermée) nécessitent un site en HTTPS. En attendant, les alertes s'affichent quand l'appli est ouverte.
        </span>
        <span v-else>Recevoir les alertes même quand l'appli est fermée.</span>
        <v-spacer />
        <v-btn v-if="pushStatus === 'off'" color="primary" variant="tonal" :loading="pushBusy" @click="togglePush(true)">Activer</v-btn>
        <v-btn v-if="pushStatus === 'on'" variant="text" :loading="pushBusy" @click="togglePush(false)">Désactiver</v-btn>
      </v-card-text>
      <v-alert v-if="pushError" type="error" variant="tonal" density="compact" class="mx-4 mb-4">{{ pushError }}</v-alert>
    </v-card>

    <template v-if="me?.role === 'caissier'">
      <v-card class="mb-4">
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

      <v-card class="mb-4">
        <v-card-title>Partage</v-card-title>
        <v-card-text>
          <div v-if="tips?.shareWith.length" data-testid="share-summary">
            {{ tips.shareWith.length }} personne(s) : {{ tips.shareWith.join(', ') }}
            <div v-if="tips.total" class="text-body-small mt-1">Soit environ {{ money(preview[0]?.amount ?? 0) }} chacun actuellement.</div>
          </div>
          <div v-else>Personne n'est encore coché pour le partage.</div>
        </v-card-text>
        <v-card-actions>
          <v-btn to="/partage" prepend-icon="mdi-account-multiple-check">Choisir les personnes</v-btn>
          <v-spacer />
          <v-btn color="error" variant="flat" prepend-icon="mdi-cash-remove" data-testid="close-btn"
                 :disabled="!tips?.total" @click="closeDialog = true">Vider la caisse</v-btn>
        </v-card-actions>
      </v-card>
    </template>

    <v-card v-if="tips?.lastClose" class="mb-4" color="success" variant="tonal" data-testid="last-close">
      <v-card-title>Dernier partage d'aujourd'hui</v-card-title>
      <v-card-text>
        {{ money(tips.lastClose.total) }} partagés entre {{ tips.lastClose.shares.length }} (caisse vidée par {{ tips.lastClose.by }})
        <v-list density="compact" bg-color="transparent">
          <v-list-item v-for="s in tips.lastClose.shares" :key="s.username" :title="s.username">
            <template #append><strong>{{ money(s.amount) }}</strong></template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Saisies en cours ({{ tips?.entries.length ?? 0 }})</v-card-title>
      <v-list v-if="tips?.entries.length">
        <v-list-item v-for="e in [...tips.entries].reverse()" :key="e.id" :title="money(e.amount)" :subtitle="e.username">
          <template v-if="me?.role === 'caissier' && e.username === me.username" #append>
            <v-btn icon="mdi-delete" variant="text" aria-label="Supprimer" @click="toDelete = e" />
          </template>
        </v-list-item>
      </v-list>
      <v-card-text v-else>Aucun pourboire dans la caisse.</v-card-text>
    </v-card>

    <v-dialog :model-value="!!toDelete" max-width="380" @update:model-value="toDelete = null">
      <v-card :title="`Supprimer ${money(toDelete?.amount ?? 0)} ?`" text="Cette saisie sera retirée de la caisse.">
        <v-card-actions>
          <v-spacer /><v-btn @click="toDelete = null">Annuler</v-btn>
          <v-btn color="error" @click="confirmRemove">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="closeDialog" max-width="420">
      <v-card title="Vider la caisse ?">
        <v-card-text>
          <template v-if="tips?.shareWith.length">
            <p class="mb-2">{{ money(tips.total) }} seront partagés à parts égales, puis le compteur sera remis à zéro :</p>
            <v-list density="compact">
              <v-list-item v-for="s in preview" :key="s.username" :title="s.username">
                <template #append><strong>{{ money(s.amount) }}</strong></template>
              </v-list-item>
            </v-list>
            <p class="text-body-small">Chaque personne sera notifiée de sa part.</p>
          </template>
          <v-alert v-else type="warning" variant="tonal">Cochez d'abord les personnes qui partagent le pourboire.</v-alert>
          <v-alert v-if="closeError" type="error" variant="tonal" class="mt-2">{{ closeError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="!tips?.shareWith.length" to="/partage">Choisir les personnes</v-btn>
          <v-spacer /><v-btn @click="closeDialog = false">Annuler</v-btn>
          <v-btn color="error" variant="flat" :disabled="!tips?.shareWith.length" :loading="closing"
                 data-testid="close-confirm" @click="closeTill">Vider</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
const me = useMe()
const tips = useTips()
const live = useLiveStatus()

// Premier affichage rendu par le serveur ; ensuite tout arrive par la connexion en direct.
const { data, error } = await useFetch<TipsData>('/api/tips', { headers: useRequestHeaders(['cookie']) })
if (data.value) tips.value = data.value
watch(error, async (e) => {
  if (e?.statusCode === 401 || e?.statusCode === 403) { me.value = null; await navigateTo('/login') }
})

const preview = computed(() => splitEqually(tips.value?.total ?? 0, tips.value?.shareWith ?? []))
const iAmSelected = computed(() => !!me.value && !!tips.value?.shareWith.some(u => u.toLowerCase() === me.value!.username.toLowerCase()))

const amount = ref('')
const formError = ref('')
const saving = ref(false)
async function add() {
  formError.value = ''
  saving.value = true
  try {
    await $fetch('/api/tips', { method: 'POST', body: { amount: amount.value } })
    amount.value = ''
  } catch (e: any) {
    formError.value = e?.data?.statusMessage || 'Enregistrement impossible'
  } finally { saving.value = false }
}

const toDelete = ref<Entry | null>(null)
async function confirmRemove() {
  const id = toDelete.value?.id
  toDelete.value = null
  if (id) await $fetch(`/api/tips/${id}`, { method: 'DELETE' }).catch(() => {})
}

const closeDialog = ref(false)
const closing = ref(false)
const closeError = ref('')
async function closeTill() {
  closing.value = true; closeError.value = ''
  try {
    await $fetch('/api/tips/close', { method: 'POST' })
    closeDialog.value = false
  } catch (e: any) {
    closeError.value = e?.data?.statusMessage || 'Vidage impossible'
  } finally { closing.value = false }
}

const pushStatus = ref<'unsupported' | 'denied' | 'on' | 'off'>('unsupported')
const pushBusy = ref(false)
const pushError = ref('')
onMounted(async () => { pushStatus.value = await pushState().catch(() => 'unsupported' as const) })
async function togglePush(on: boolean) {
  pushBusy.value = true; pushError.value = ''
  try { on ? await enablePush() : await disablePush() } catch (e: any) { pushError.value = e?.message || 'Échec' }
  pushStatus.value = await pushState().catch(() => 'unsupported' as const)
  pushBusy.value = false
}
</script>
