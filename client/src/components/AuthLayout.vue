<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useTheme } from "../composables/useTheme";

defineProps<{ subtitle: string }>();

const { theme, toggleTheme, initTheme } = useTheme();
const themeIcon = computed(() => (theme.value === "dark" ? "☼" : "☾"));
onMounted(initTheme);
</script>

<template>
  <div class="auth-page">
    <button
      class="theme-toggle"
      @click="toggleTheme"
      :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`"
    >
      {{ themeIcon }}
    </button>
    <div class="auth-card">
      <h1 class="auth-title">Stock Screener</h1>
      <p class="auth-subtitle">{{ subtitle }}</p>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
  background: var(--bg);
  position: relative;
}
.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 16px;
  padding: 6px 10px;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s;
}
.theme-toggle:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.auth-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.auth-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}
.auth-subtitle {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
