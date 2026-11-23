<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { computed, onMounted } from "vue";
import { authClient, clearSessionCache } from "./auth";
import { useTheme } from "./composables/useTheme";
import ThemeSwitcher from "./components/ThemeSwitcher.vue";
import BrandLogo from "./components/BrandLogo.vue";
import { resetStockCardCache } from "./composables/useStockCards";
import { resetCachedResources } from "./composables/useCachedResource";
import { cacheClear } from "./utils/persistentCache";

const router = useRouter();
const route = useRoute();
const { initTheme } = useTheme();

// The login and password reset screens are full-page, without the sidebar.
const showSidebar = computed(() => !route.meta.public);

onMounted(initTheme);

async function logout() {
  await authClient.signOut().catch(() => undefined);
  clearSessionCache();
  resetStockCardCache();
  resetCachedResources();
  void cacheClear();
  router.push("/login");
}
</script>

<template>
  <div v-if="showSidebar" class="app-shell">
    <nav class="sidebar">
      <RouterLink to="/" class="brand" aria-label="StockWatch home"><BrandLogo /></RouterLink>
      <RouterLink to="/" class="nav-link">Home</RouterLink>
      <RouterLink to="/stock-charts" class="nav-link">Stock Charts</RouterLink>
      <RouterLink to="/etfs" class="nav-link">ETFs</RouterLink>
      <RouterLink to="/watchlists" class="nav-link">Watchlists</RouterLink>
      <RouterLink to="/earnings" class="nav-link">Earnings</RouterLink>
      <RouterLink to="/volatility" class="nav-link">Volatility</RouterLink>
      <RouterLink to="/breakout" class="nav-link">Breakout</RouterLink>
      <RouterLink to="/sector-rotation" class="nav-link">Sector Rotation</RouterLink>
      <RouterLink to="/sector-drilldown" class="nav-link">Sector Drilldown</RouterLink>
      <RouterLink to="/industry-groups" class="nav-link">Industry Groups</RouterLink>
      <RouterLink to="/tickers" class="nav-link">Tickers</RouterLink>
      <div class="sidebar-bottom">
        <RouterLink to="/account" class="nav-link">Account</RouterLink>
        <ThemeSwitcher />
        <button class="logout-btn" @click="logout">Log out</button>
      </div>
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
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.brand {
  display: block;
  text-decoration: none;
  margin: 2px 0 18px;
  padding: 0 4px;
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
  color: var(--on-accent);
}
.content {
  flex: 1;
  /* Without this the column can't shrink below its widest child, so charts
     (which size to their container) never get narrower when the window does. */
  min-width: 0;
  padding: 32px;
  background: var(--bg);
}
.sidebar-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
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
/* On narrow screens the sidebar becomes a scrolling top bar, so the page
   content (and its charts) gets the full width. */
@media (max-width: 760px) {
  .app-shell {
    flex-direction: column;
  }
  .sidebar {
    width: auto;
    height: auto;
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
    padding: 10px 16px;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    z-index: 10;
  }
  .brand {
    margin: 0 8px 0 0;
    flex-shrink: 0;
  }
  .nav-link,
  .logout-btn {
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sidebar-bottom {
    margin-top: 0;
    margin-left: auto;
    flex-direction: row;
    align-items: center;
  }
  .content {
    padding: 20px 16px;
  }
}
</style>
