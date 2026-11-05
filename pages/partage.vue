<template>
  <v-card>
    <v-card-title>Qui partage le service : {{ tips?.shift ?? '—' }} ?</v-card-title>
    <v-card-subtitle class="text-wrap">
      Cochez les personnes qui travaillent pendant ce service. Elles se partagent la caisse à parts égales
      au moment du vidage, et ce sont les seules à être alertées à chaque nouveau pourboire.
    </v-card-subtitle>
    <v-alert v-if="tips && !tips.shift" type="success" variant="tonal" class="mx-4">
      Journée clôturée : la sélection reprendra demain.
    </v-alert>
    <v-card-text>
      <div class="d-flex ga-2 mb-2">
        <v-btn size="small" variant="tonal" @click="selected = staff?.map(s => s.username) ?? []">Tout cocher</v-btn>
        <v-btn size="small" variant="tonal" @click="selected = (staff ?? []).filter(s => s.online).map(s => s.username)">Seulement en ligne</v-btn>
        <v-btn size="small" variant="text" @click="selected = []">Tout décocher</v-btn>
      </div>
      <v-list v-if="staff?.length" density="compact">
        <v-list-item v-for="s in staff" :key="s.username" @click="toggle(s.username)">
          <template #prepend>
            <v-checkbox-btn :model-value="selected.includes(s.username)" :aria-label="s.username" @click.stop="toggle(s.username)" />
          </template>
          <v-list-item-title>{{ s.username }}</v-list-item-title>
          <v-list-item-subtitle>{{ roleLabel(s.role) }}</v-list-item-subtitle>
          <template #append>
            <v-chip size="x-small" :color="s.online ? 'success' : undefined" variant="tonal">
              {{ s.online ? 'en ligne' : 'hors ligne' }}
            </v-chip>
          </template>
        </v-list-item>
      </v-list>
      <div v-else>Aucun compte. L'administrateur doit d'abord créer les comptes du personnel.</div>
      <v-alert v-if="selected.length" type="info" variant="tonal" density="compact" class="mt-2">
        {{ selected.length }} personne(s) — part actuelle : {{ money(preview[0]?.amount ?? 0) }} chacun
        (caisse : {{ money(tips?.total ?? 0) }})
      </v-alert>
      <v-alert v-if="error" type="error" variant="tonal" class="mt-2">{{ error }}</v-alert>
    </v-card-text>
    <v-card-actions>
      <v-btn to="/">Retour</v-btn>
      <v-spacer />
      <v-btn color="primary" variant="flat" :loading="saving" :disabled="!tips?.shift" data-testid="save-share" @click="save">Enregistrer</v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
interface Staff { username: string, role: Me['role'], online: boolean, selected: boolean }

const tips = useTips()
const presence = usePresenceTick()
const { data: staff, refresh } = await useFetch<Staff[]>('/api/staff', { headers: useRequestHeaders(['cookie']) })
const selected = ref<string[]>(staff.value?.filter(s => s.selected).map(s => s.username) ?? [])
// Indicateur « en ligne » mis à jour quand quelqu'un se connecte ou se déconnecte (sans interrogation).
watch(presence, () => refresh())
if (!tips.value) { const { data } = await useFetch<TipsData>('/api/tips', { headers: useRequestHeaders(['cookie']) }); tips.value = data.value }

const preview = computed(() => splitEqually(tips.value?.total ?? 0, selected.value))
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
