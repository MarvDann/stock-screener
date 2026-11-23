<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { computed, onMounted, ref, watch } from "vue";
import { Menu, X } from "lucide-vue-next";
import { authClient, clearSessionCache, getSessionUser } from "./auth";
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

// Admin-only links. Re-checked on navigation, since the session changes on sign-in and sign-out.
const isAdmin = ref(false);
watch(
  () => route.fullPath,
  async () => {
    isAdmin.value = !route.meta.public && ((await getSessionUser())?.isAdmin ?? false);
  },
  { immediate: true }
);

// On phones the nav collapses behind a menu button; picking a page closes it.
const menuOpen = ref(false);
watch(() => route.fullPath, () => (menuOpen.value = false));

async function logout() {
  await authClient.signOut().catch(() => undefined);
  clearSessionCache();
  resetStockCardCache();
  resetCachedResources();
  void cacheClear();
  router.push("/welcome");
}
</script>

<template>
  <div v-if="showSidebar" class="app-shell">
    <nav class="sidebar" :class="{ open: menuOpen }">
      <div class="sidebar-top">
        <RouterLink to="/" class="brand" aria-label="StockWatch home"><BrandLogo /></RouterLink>
        <button
          type="button"
          class="menu-toggle"
          :aria-expanded="menuOpen"
          aria-controls="nav-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          @click="menuOpen = !menuOpen"
        >
          <component :is="menuOpen ? X : Menu" :size="20" />
        </button>
      </div>
      <div id="nav-menu" class="nav-menu">
        <div class="nav-links">
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
          <RouterLink v-if="isAdmin" to="/users" class="nav-link">Users</RouterLink>
        </div>
        <div class="sidebar-bottom">
          <RouterLink to="/account" class="nav-link">Account</RouterLink>
          <ThemeSwitcher />
          <button class="logout-btn" @click="logout">Log out</button>
        </div>
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
.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.menu-toggle {
  display: none;
}
.nav-menu,
.nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-menu {
  flex: 1;
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
/* On narrow screens the sidebar becomes a top bar with a menu button that
   drops the links down over the page, so the content gets the full width. */
@media (max-width: 760px) {
  .app-shell {
    flex-direction: column;
  }
  .sidebar {
    width: auto;
    height: auto;
    padding: 0;
    border-right: none;
    border-bottom: 1px solid var(--border-subtle);
    overflow: visible;
    z-index: 20;
  }
  .sidebar-top {
    padding: 10px 16px;
    min-height: 56px;
  }
  .brand {
    margin: 0;
  }
  .menu-toggle {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
  }
  .nav-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: calc(100dvh - 57px);
    overflow-y: auto;
    padding: 12px 16px 16px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
  }
  .sidebar.open .nav-menu {
    display: flex;
  }
  .nav-links {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .nav-link {
    padding: 12px;
    font-size: 15px;
  }
  .sidebar-bottom {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
  }
  .sidebar-bottom .nav-link {
    grid-column: 1 / -1;
  }
  .logout-btn {
    font-size: 14px;
  }
  .content {
    padding: 20px 16px;
  }
}
</style>
