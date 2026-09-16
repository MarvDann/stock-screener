<script setup lang="ts">
defineProps<{
  page: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  (e: "update:page", page: number): void;
}>();
</script>

<template>
  <div v-if="totalPages > 1" class="pagination">
    <button :disabled="page <= 1" @click="emit('update:page', page - 1)">&lsaquo; Prev</button>
    <span class="page-info">{{ page }} / {{ totalPages }}</span>
    <button :disabled="page >= totalPages" @click="emit('update:page', page + 1)">Next &rsaquo;</button>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
}

.pagination button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
  padding: 6px 14px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.pagination button:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-info {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 60px;
  text-align: center;
}
</style>
