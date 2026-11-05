<template>
  <v-avatar :size="size ?? 36" :color="avatarColor(name)" class="text-white font-weight-bold" :style="{ fontSize: `${(size ?? 36) * 0.38}px` }">
    {{ initials(name) }}
  </v-avatar>
</template>

<script setup lang="ts">
defineProps<{ name: string, size?: number }>()
</script>
