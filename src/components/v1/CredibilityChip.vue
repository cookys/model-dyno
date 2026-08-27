<script setup lang="ts">
/** Semantic alias for the 3-gate credibility badge — annotation only, never adjusts score. */
import { gatesBadge } from '@/components/CellHelpers'

defineProps<{ cell: unknown }>()
</script>

<template>
  <component :is="gatesBadge(cell)" />
</template>
