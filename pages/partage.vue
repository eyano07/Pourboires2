<template>
  <div class="partage">
    <div class="mb-4">
      <div class="eyebrow">Service : {{ tips?.shift ?? '—' }}</div>
      <h1 class="text-headline-small font-weight-bold">Qui partage ce service ?</h1>
      <p class="text-body-medium text-medium-emphasis mt-1">
        Les personnes sélectionnées voient la caisse, sont alertées à chaque pourboire et se partagent
        la caisse à parts égales au moment du vidage.
      </p>
    </div>

    <v-alert v-if="tips && !tips.shift" type="success" variant="tonal" class="mb-4">Journée clôturée : la sélection reprendra demain.</v-alert>

    <v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Rechercher" hide-details clearable density="comfortable" class="mb-3" />

    <div class="d-flex flex-wrap ga-2 mb-3">
      <v-chip variant="tonal" color="primary" prepend-icon="mdi-check-all" @click="selected = staff?.map(s => s.username) ?? []">Tous</v-chip>
      <v-chip variant="tonal" color="success" prepend-icon="mdi-access-point" @click="selected = (staff ?? []).filter(s => s.online).map(s => s.username)">En ligne</v-chip>
      <v-chip variant="tonal" prepend-icon="mdi-close" @click="selected = []">Aucun</v-chip>
    </div>

    <div v-if="filtered.length" class="staff">
      <button v-for="s in filtered" :key="s.username" type="button" class="staff__item"
              :class="{ 'staff__item--on': selected.includes(s.username) }" :aria-label="s.username"
              :aria-pressed="selected.includes(s.username)" :data-testid="`pick-${s.username}`" @click="toggle(s.username)">
        <div class="position-relative">
          <PersonAvatar :name="s.name" :size="42" />
          <span class="presence" :class="{ 'presence--on': s.online }" />
        </div>
        <div class="staff__text">
          <div class="staff__name">{{ prettyName(s.name) }}</div>
          <div class="staff__meta">{{ roleLabel(s.role) }} · {{ s.online ? 'en ligne' : 'hors ligne' }}</div>
        </div>
        <v-icon :icon="selected.includes(s.username) ? 'mdi-check-circle' : 'mdi-circle-outline'"
                :color="selected.includes(s.username) ? 'primary' : 'grey-lighten-1'" size="26" />
      </button>
    </div>
    <v-card v-else class="pa-4 text-medium-emphasis">
      {{ staff?.length ? 'Aucun résultat.' : "Aucun compte. L'administrateur doit d'abord créer les comptes du personnel." }}
    </v-card>

    <v-alert v-if="error" type="error" variant="tonal" class="mt-3">{{ error }}</v-alert>

    <!-- Barre d'action fixe en bas -->
    <div class="bottom-bar">
      <div class="bottom-bar__inner">
        <div class="bottom-bar__info">
          <strong>{{ selected.length }}</strong> sélectionné(s)
          <div v-if="selected.length && hasMoney(tips?.totals)" class="text-body-small">≈ {{ moneyTotals(preview[0]?.amounts) }} chacun</div>
        </div>
        <v-btn color="primary" variant="flat" size="large" :loading="saving" :disabled="!tips?.shift"
               data-testid="save-share" prepend-icon="mdi-check" @click="save">Valider</v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Staff { username: string, name: string, role: Me['role'], online: boolean, selected: boolean }

const headers = useRequestHeaders(['cookie'])
const tips = useTips()
const presence = usePresenceTick()
const { data: staff, refresh } = await useFetch<Staff[]>('/api/staff', { headers })
if (!tips.value) { const { data } = await useFetch<TipsData>('/api/tips', { headers }); tips.value = data.value }
const selected = ref<string[]>(staff.value?.filter(s => s.selected).map(s => s.username) ?? [])
// Indicateur « en ligne » mis à jour quand quelqu'un se connecte ou se déconnecte (sans interrogation).
watch(presence, () => refresh())

const search = ref('')
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/_/g, ' ')
const filtered = computed(() => {
  const q = norm(search.value ?? '')
  return (staff.value ?? []).filter(s => !q || norm(s.name).includes(q) || norm(s.username).includes(q))
})
const preview = computed(() => splitEqually(tips.value?.totals, selected.value))
function toggle(u: string) {
  selected.value = selected.value.includes(u) ? selected.value.filter(x => x !== u) : [...selected.value, u]
}

const saving = ref(false)
const error = ref('')
async function save() {
  saving.value = true; error.value = ''
  try {
    await $fetch('/api/tips/share', { method: 'PUT', body: { usernames: selected.value } })
    await navigateTo('/')
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Enregistrement impossible' } finally { saving.value = false }
}
</script>

<style scoped>
.partage { padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
.eyebrow { font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgb(var(--v-theme-primary)); }
.staff { display: grid; gap: 8px; }
.staff__item {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 10px 12px; border-radius: 16px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); border: 1.5px solid rgba(var(--v-theme-on-surface), .12);
  transition: border-color .15s, background .15s; cursor: pointer;
  scroll-margin-bottom: 120px; /* jamais caché sous la barre « Valider » */
}
.staff__item--on { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); }
.staff__text { flex: 1; min-width: 0; }
.staff__name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.staff__meta { font-size: .78rem; color: rgba(var(--v-theme-on-surface), .6); }
.presence { position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px; border-radius: 50%; background: #94a3b8; border: 2px solid rgb(var(--v-theme-surface)); }
.presence--on { background: #16a34a; }
.bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); border-top: 1px solid rgba(var(--v-theme-on-surface), .12); padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); }
.bottom-bar__inner { max-width: 640px; margin: 0 auto; display: flex; align-items: center; gap: 12px; }
.bottom-bar__info { flex: 1; min-width: 0; }
</style>
