<template>
  <div class="money-pair" :class="{ 'money-pair--big': big }">
    <div v-for="c in CURRENCIES" :key="c" class="money-pair__item" :data-testid="testid ? `${testid}-${c}` : undefined">
      <div class="money-pair__value">{{ money(totals?.[c] ?? 0, c) }}</div>
      <div class="money-pair__label">{{ c === 'USD' ? 'Dollars' : 'Francs congolais' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ totals?: Totals | null, big?: boolean, testid?: string }>()
</script>

<style scoped>
.money-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.money-pair__item { background: rgba(255, 255, 255, .14); border-radius: 14px; padding: 10px 12px; min-width: 0; }
.money-pair__value { font-weight: 700; font-size: 1.15rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.money-pair__label { font-size: .72rem; opacity: .8; text-transform: uppercase; letter-spacing: .06em; margin-top: 2px; }
.money-pair--big .money-pair__value { font-size: clamp(1.45rem, 7vw, 2.2rem); }
</style>
