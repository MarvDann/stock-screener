<script setup lang="ts">
import { onMounted } from "vue";
import { useTheme } from "../composables/useTheme";
import ThemeSwitcher from "./ThemeSwitcher.vue";
import BrandLogo from "./BrandLogo.vue";

defineProps<{ subtitle: string }>();

const { initTheme } = useTheme();
onMounted(initTheme);
</script>

<template>
  <div class="auth-page">
    <ThemeSwitcher class="theme-toggle" />
    <div class="auth-card">
      <!-- Signed out, "/" leads to the welcome page. -->
      <h1 class="auth-title"><RouterLink to="/" class="home-link" aria-label="StockWatch home"><BrandLogo size="lg" /></RouterLink></h1>
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
  display: flex;
  justify-content: center;
}
.home-link {
  text-decoration: none;
}
.auth-subtitle {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
</style>
