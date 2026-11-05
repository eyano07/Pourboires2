<template>
  <div v-if="tips">
    <!-- ===== Bandeau principal ===== -->
    <section class="hero mb-4" :class="heroClass" data-testid="hero">
      <div class="d-flex align-center justify-space-between mb-3">
        <div>
          <div class="hero__eyebrow">{{ heroEyebrow }}</div>
          <div class="hero__title">{{ heroTitle }}</div>
        </div>
        <v-chip size="small" variant="flat" :color="live === 'on' ? 'white' : 'warning'" class="hero__live" data-testid="live">
          <span class="dot" :class="{ 'dot--on': live === 'on' }" />{{ live === 'on' ? 'En direct' : 'Reconnexion…' }}
        </v-chip>
      </div>

      <!-- Caisse en cours (caissier, admin, agent coché) -->
      <template v-if="tips.canSeeTill && tips.shift">
        <MoneyPair :totals="tips.totals" big testid="total" />
      </template>
      <!-- Gain de l'agent : affiché jusqu'à ce qu'un caissier le sélectionne de nouveau -->
      <template v-else-if="tips.lastEarning">
        <MoneyPair :totals="tips.lastEarning.amounts" big testid="earnings" />
        <div class="hero__note mt-3">
          Service {{ tips.lastEarning.shift }} du {{ frDate(tips.lastEarning.date) }} · caisse partagée entre {{ tips.lastEarning.people }}
        </div>
      </template>
      <!-- Ni coché, ni gain -->
      <div v-else class="hero__empty" data-testid="not-selected">
        <v-icon icon="mdi-lock-outline" size="28" class="mb-1" />
        <div>{{ tips.shift ? 'Vous ne faites pas partie du partage de ce service.' : 'Journée clôturée.' }}</div>
        <div class="text-body-small mt-1" style="opacity:.85">Les montants sont visibles uniquement par les personnes sélectionnées.</div>
      </div>
    </section>

    <v-alert v-if="!tips.shift" type="success" variant="tonal" class="mb-4" icon="mdi-check-decagram" data-testid="day-closed">
      Journée clôturée : tous les services ont été partagés. La caisse rouvre demain.
    </v-alert>

    <!-- ===== Caissier : saisie ===== -->
    <template v-if="me?.role === 'caissier' && tips.shift">
      <v-card class="mb-4 pa-4">
        <div class="section-title mb-3"><v-icon icon="mdi-cash-plus" class="mr-2" color="primary" />Ajouter un pourboire</div>
        <v-form @submit.prevent="add">
          <v-btn-toggle v-model="currency" mandatory color="primary" variant="outlined" divided class="mb-3 w-100" rounded="lg" density="comfortable">
            <v-btn value="USD" class="flex-grow-1" data-testid="cur-USD">$ Dollar</v-btn>
            <v-btn value="CDF" class="flex-grow-1" data-testid="cur-CDF">FC Franc</v-btn>
          </v-btn-toggle>
          <v-text-field
            v-model="amount" :label="currency === 'USD' ? 'Montant en dollars' : 'Montant en francs congolais'"
            inputmode="decimal" :suffix="currency === 'USD' ? '$' : 'FC'" :error-messages="formError"
            data-testid="amount" hide-details="auto" class="mb-3"
          />
          <v-btn type="submit" color="primary" size="large" block :loading="saving" prepend-icon="mdi-plus">Enregistrer</v-btn>
        </v-form>
      </v-card>

      <!-- ===== Caissier : partage ===== -->
      <v-card class="mb-4 pa-4">
        <div class="d-flex align-center mb-3">
          <div class="section-title"><v-icon icon="mdi-account-group" class="mr-2" color="primary" />Partage — {{ tips.shift }}</div>
          <v-spacer />
          <v-chip v-if="tips.shareWith.length" size="small" color="primary" variant="tonal">{{ tips.shareWith.length }} pers.</v-chip>
        </div>

        <div v-if="tips.shareWith.length" data-testid="share-summary">
          <div class="people mb-3">
            <div v-for="p in preview" :key="p.username" class="person">
              <PersonAvatar :name="nameOf(p.username)" />
              <div class="person__text">
                <div class="person__name">{{ nameOf(p.username) }}</div>
                <div v-if="hasMoney(tips.totals)" class="person__amount">{{ moneyTotals(p.amounts) }}</div>
              </div>
            </div>
          </div>
        </div>
        <v-alert v-else type="warning" variant="tonal" density="compact" class="mb-3">
          Personne n'est sélectionné : personne ne voit la caisse ni n'est alerté.
        </v-alert>

        <div class="actions">
          <v-btn variant="tonal" color="primary" size="large" prepend-icon="mdi-account-check" to="/partage" block>
            {{ tips.shareWith.length ? 'Modifier la sélection' : 'Choisir les personnes' }}
          </v-btn>
          <v-btn color="error" variant="flat" size="large" prepend-icon="mdi-cash-remove" block data-testid="close-btn"
                 :disabled="!hasMoney(tips.totals)" @click="closeDialog = true">
            Vider la caisse
          </v-btn>
        </div>
      </v-card>
    </template>

    <!-- ===== Saisies en cours ===== -->
    <v-card v-if="tips.canSeeTill && tips.shift" class="mb-4">
      <div class="section-title pa-4 pb-1">Saisies en cours ({{ tips.entries.length }})</div>
      <v-list v-if="tips.entries.length" lines="one" class="py-0">
        <v-list-item v-for="e in [...tips.entries].reverse()" :key="e.id">
          <template #prepend>
            <v-avatar :color="e.currency === 'USD' ? 'primary' : 'secondary'" variant="tonal" size="36" class="font-weight-bold">
              {{ e.currency === 'USD' ? '$' : 'FC' }}
            </v-avatar>
          </template>
          <v-list-item-title class="font-weight-bold">{{ money(e.amount, e.currency) }}</v-list-item-title>
          <v-list-item-subtitle>par {{ nameOf(e.username) }}</v-list-item-subtitle>
          <template v-if="me?.role === 'caissier' && e.username === me.username" #append>
            <v-btn icon="mdi-delete-outline" variant="text" color="error" aria-label="Supprimer" @click="toDelete = e" />
          </template>
        </v-list-item>
      </v-list>
      <div v-else class="pa-4 pt-1 text-medium-emphasis">Aucun pourboire dans la caisse.</div>
    </v-card>

    <!-- ===== Partages du jour (caissier / admin) ===== -->
    <v-card v-if="tips.closes.length" class="mb-4" data-testid="closes">
      <div class="section-title pa-4 pb-0">Partages d'aujourd'hui</div>
      <div v-for="c in tips.closes" :key="c.shift" class="pa-4 close" data-testid="close-item">
        <div class="d-flex align-center flex-wrap ga-2 mb-2">
          <v-chip color="primary" size="small" variant="flat">{{ c.shift }}</v-chip>
          <strong>{{ moneyTotals(c.totals) }}</strong>
          <span class="text-medium-emphasis text-body-small">· vidée par {{ nameOf(c.by) }}</span>
        </div>
        <div class="people">
          <div v-for="s in c.shares" :key="s.username" class="person">
            <PersonAvatar :name="nameOf(s.username)" :size="32" />
            <div class="person__text">
              <div class="person__name">{{ nameOf(s.username) }}</div>
              <div class="person__amount">{{ moneyTotals(s.amounts) }}</div>
            </div>
          </div>
        </div>
      </div>
    </v-card>

    <!-- ===== Notifications ===== -->
    <v-card v-if="me?.role !== 'admin'" class="pa-4 d-flex align-center ga-3" variant="tonal" color="primary">
      <v-icon icon="mdi-bell-ring-outline" />
      <div class="text-body-small flex-grow-1">
        <template v-if="pushStatus === 'on'">Alertes activées sur cet appareil.</template>
        <template v-else-if="pushStatus === 'denied'">Alertes bloquées dans les réglages du navigateur.</template>
        <template v-else-if="pushStatus === 'unsupported'">Alertes affichées quand l'appli est ouverte (appli fermée : site HTTPS requis).</template>
        <template v-else>Recevoir les alertes même appli fermée.</template>
      </div>
      <v-btn v-if="pushStatus === 'off'" color="primary" variant="flat" size="small" :loading="pushBusy" @click="togglePush(true)">Activer</v-btn>
      <v-btn v-if="pushStatus === 'on'" variant="text" size="small" :loading="pushBusy" @click="togglePush(false)">Désactiver</v-btn>
    </v-card>
    <v-alert v-if="pushError" type="error" variant="tonal" density="compact" class="mt-2">{{ pushError }}</v-alert>

    <!-- ===== Dialogues ===== -->
    <v-dialog :model-value="!!toDelete" max-width="380" @update:model-value="toDelete = null">
      <v-card :title="`Supprimer ${toDelete ? money(toDelete.amount, toDelete.currency) : ''} ?`" text="Cette saisie sera retirée de la caisse.">
        <v-card-actions>
          <v-spacer /><v-btn @click="toDelete = null">Annuler</v-btn>
          <v-btn color="error" variant="flat" @click="confirmRemove">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="closeDialog" max-width="440">
      <v-card class="pa-2">
        <v-card-title class="text-wrap">Vider la caisse — {{ tips.shift }}</v-card-title>
        <v-card-text>
          <template v-if="tips.shareWith.length">
            <MoneyPair :totals="tips.totals" class="mb-3 till-preview" />
            <div class="mb-2">Partagé à parts égales entre {{ preview.length }} :</div>
            <div class="people mb-3">
              <div v-for="p in preview" :key="p.username" class="person">
                <PersonAvatar :name="nameOf(p.username)" :size="32" />
                <div class="person__text">
                  <div class="person__name">{{ nameOf(p.username) }}</div>
                  <div class="person__amount">{{ moneyTotals(p.amounts) }}</div>
                </div>
              </div>
            </div>
            <div class="text-body-small text-medium-emphasis">
              Chacun sera notifié de sa part.
              {{ isLastShift ? "C'est le dernier service : la journée sera clôturée." : 'Le caissier du service suivant choisira ses propres personnes.' }}
            </div>
          </template>
          <v-alert v-else type="warning" variant="tonal">Choisissez d'abord les personnes qui partagent le pourboire.</v-alert>
          <v-alert v-if="closeError" type="error" variant="tonal" class="mt-2">{{ closeError }}</v-alert>
        </v-card-text>
        <v-card-actions class="flex-column ga-2 px-4 pb-4">
          <v-btn v-if="tips.shareWith.length" color="error" variant="flat" size="large" block :loading="closing"
                 data-testid="close-confirm" @click="closeTill">Confirmer le vidage</v-btn>
          <v-btn v-else color="primary" variant="flat" size="large" block to="/partage">Choisir les personnes</v-btn>
          <v-btn variant="text" block @click="closeDialog = false">Annuler</v-btn>
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

const nameOf = (u: string) => prettyName(tips.value?.names?.[u] ?? u)
const preview = computed(() => splitEqually(tips.value?.totals, tips.value?.shareWith ?? []))
const isLastShift = computed(() => !!tips.value && tips.value.closes.length === tips.value.shifts.length - 1)

const heroMode = computed(() => {
  const t = tips.value!
  if (t.canSeeTill && t.shift) return 'till'
  if (t.lastEarning) return 'earnings'
  return 'locked'
})
const heroClass = computed(() => `hero--${heroMode.value}`)
const heroEyebrow = computed(() => (tips.value!.shift ? `Service : ${tips.value!.shift}` : 'Journée clôturée'))
const heroTitle = computed(() => ({ till: 'Caisse des pourboires', earnings: 'Votre gain', locked: 'Pourboires' })[heroMode.value])
const frDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

const currency = ref<Currency>('USD')
const amount = ref('')
const formError = ref('')
const saving = ref(false)
async function add() {
  formError.value = ''
  saving.value = true
  try {
    await $fetch('/api/tips', { method: 'POST', body: { amount: amount.value, currency: currency.value } })
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

<style scoped>
.hero { border-radius: 24px; padding: 18px; color: #fff; box-shadow: 0 10px 30px -12px rgba(24, 103, 192, .5); }
.hero--till { background: linear-gradient(135deg, #1e7ad6 0%, #1867c0 50%, #0f4c96 100%); }
.hero--earnings { background: linear-gradient(135deg, #4f46e5 0%, #1867c0 100%); }
.hero--locked { background: linear-gradient(135deg, #475569 0%, #334155 100%); box-shadow: none; }
.hero__eyebrow { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; opacity: .85; }
.hero__title { font-size: 1.15rem; font-weight: 700; }
.hero__live { color: #1867c0 !important; font-weight: 600; }
.hero__note { background: rgba(255, 255, 255, .14); border-radius: 12px; padding: 8px 12px; font-size: .9rem; }
.hero__empty { text-align: center; padding: 18px 8px 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block; margin-right: 6px; }
.dot--on { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, .25); }
.section-title { font-weight: 700; font-size: 1.05rem; display: flex; align-items: center; }
.people { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.person { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: rgba(var(--v-theme-on-surface), .05); min-width: 0; }
.person__text { min-width: 0; }
.person__name { font-weight: 600; font-size: .92rem; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person__amount { font-size: .8rem; color: rgb(var(--v-theme-primary)); font-weight: 600; }
.actions { display: grid; gap: 8px; }
.close + .close { border-top: 1px solid rgba(var(--v-theme-on-surface), .1); }
.till-preview { color: rgb(var(--v-theme-primary)); }
.till-preview :deep(.money-pair__item) { background: rgba(var(--v-theme-primary), .1); }
</style>
