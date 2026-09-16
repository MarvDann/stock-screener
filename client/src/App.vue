<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { computed } from "vue";
import { isAuthenticated, clearToken } from "./api";

const router = useRouter();
const route = useRoute();

const showSidebar = computed(() => route.name !== "login");

function logout() {
  clearToken();
  router.push("/login");
}
</script>

<template>
  <div v-if="showSidebar" class="app-shell">
    <nav class="sidebar">
      <h1 class="brand">Stock Screener</h1>
      <RouterLink to="/breakout" class="nav-link">Breakout</RouterLink>
      <RouterLink to="/sector-rotation" class="nav-link">Sector Rotation</RouterLink>
      <div class="sidebar-spacer" />
      <button class="logout-btn" @click="logout">Log out</button>
    </nav>
    <main class="content">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.brand {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 16px;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 14px;
}
.nav-link:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.nav-link.router-link-active {
  background: var(--accent);
  color: #ffffff;
}
.content {
  flex: 1;
  padding: 32px;
  background: var(--bg);
}
.sidebar-spacer {
  flex: 1;
}
.logout-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
  padding: 8px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.logout-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
</style>
