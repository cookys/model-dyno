<script setup lang="ts">
// The header row of a folded row's sub-table. Every column is a sort button, so the
// five boards that fold routes cannot drift into having five different affordances.
import type { FoldColumn, FoldSort } from '@/lib/foldSort'

defineProps<{ columns: FoldColumn[]; sort: FoldSort }>()
</script>

<template>
  <tr>
    <th
      v-for="col in columns"
      :key="col.key"
      scope="col"
      :aria-sort="sort.ariaSort(col.key)"
      :class="['px-2 py-1.5 font-semibold', col.num ? 'text-right' : 'text-left']"
    >
      <button
        type="button"
        :class="['inline-flex items-center gap-0.5 hover:text-foreground', sort.sortKey.value === col.key ? 'text-foreground' : '']"
        @click="sort.toggle(col)"
      >
        {{ col.label }}<span class="font-mono">{{ sort.arrow(col.key) }}</span>
      </button>
    </th>
  </tr>
</template>
