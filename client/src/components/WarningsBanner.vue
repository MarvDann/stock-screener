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
  background: #fef3c7;
  border: 1px solid #fcd34d;
  color: #92400e;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 20px;
}
.dismiss {
  background: none;
  border: none;
  color: #92400e;
  font-weight: 600;
  cursor: pointer;
  font-size: 13px;
}
</style>
