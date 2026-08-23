<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{ warnings: string[] }>();
const dismissed = ref(false);

watch(
  () => props.warnings,
  () => {
    dismissed.value = false;
  }
);
</script>

<template>
  <div v-if="props.warnings.length > 0 && !dismissed" class="banner">
    <div class="text">
      <strong>{{ props.warnings.length }} symbol(s) skipped:</strong>
      {{ props.warnings.join("; ") }}
    </div>
    <button class="dismiss" @click="dismissed = true">Dismiss</button>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  color: var(--warning-text);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 20px;
}
.dismiss {
  background: none;
  border: none;
  color: var(--warning-text);
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
</style>
