<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { addToWatchlist, createWatchlist, fetchWatchlists, removeFromWatchlist } from "../api";
import type { Watchlist } from "../types";

const props = defineProps<{ symbol: string }>();

const open = ref(false);
const watchlists = ref<Watchlist[] | null>(null);
const error = ref<string | null>(null);
/** Ids of lists with a change in flight, so a double click can't send two. */
const busy = ref(new Set<number>());
const newName = ref("");
const root = ref<HTMLElement | null>(null);

const onCount = computed(() => watchlists.value?.filter((w) => w.symbols.includes(props.symbol)).length ?? 0);

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function load() {
  error.value = null;
  try {
    watchlists.value = await fetchWatchlists();
  } catch (err) {
    error.value = message(err, "Failed to load watchlists");
  }
}

function onOutsideClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) close();
}

function close() {
  open.value = false;
  document.removeEventListener("click", onOutsideClick);
}

function toggle() {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  document.addEventListener("click", onOutsideClick);
  // Reloaded on every open so changes made on the Watchlists page show up.
  void load();
}

async function toggleSymbol(list: Watchlist) {
  if (busy.value.has(list.id)) return;
  busy.value.add(list.id);
  error.value = null;
  try {
    const updated = list.symbols.includes(props.symbol)
      ? await removeFromWatchlist(list.id, props.symbol)
      : await addToWatchlist(list.id, props.symbol);
    watchlists.value = watchlists.value!.map((w) => (w.id === updated.id ? updated : w));
  } catch (err) {
    error.value = message(err, "Failed to update watchlist");
  } finally {
    busy.value.delete(list.id);
  }
}

/** Creates a list with this stock already on it. */
async function createWithSymbol() {
  const name = newName.value.trim();
  if (!name) return;
  error.value = null;
  try {
    const list = await createWatchlist(name);
    const updated = await addToWatchlist(list.id, props.symbol);
    watchlists.value = [...(watchlists.value ?? []), updated];
    newName.value = "";
  } catch (err) {
    error.value = message(err, "Failed to create watchlist");
    // The list may exist even if adding the stock failed, so show it either way.
    void load();
  }
}

onBeforeUnmount(close);
</script>

<template>
  <div ref="root" class="watchlist-menu">
    <button class="menu-btn" :class="{ on: onCount > 0 }" :aria-expanded="open" @click="toggle">
      {{ onCount > 0 ? "★" : "☆" }} Watchlists
    </button>
    <div v-if="open" class="popover" role="dialog" aria-label="Watchlists">
      <p v-if="watchlists === null && !error" class="muted">Loading…</p>
      <ul v-else-if="watchlists && watchlists.length > 0" class="lists">
        <li v-for="w in watchlists" :key="w.id">
          <label>
            <input
              type="checkbox"
              :checked="w.symbols.includes(props.symbol)"
              :disabled="busy.has(w.id)"
              @change="toggleSymbol(w)"
            />
            <span class="list-name">{{ w.name }}</span>
            <span class="count">{{ w.symbols.length }}</span>
          </label>
        </li>
      </ul>
      <p v-else-if="watchlists" class="muted">No watchlists yet.</p>

      <form class="create" @submit.prevent="createWithSymbol">
        <input v-model="newName" placeholder="New watchlist…" aria-label="New watchlist name" maxlength="60" />
        <button type="submit" class="btn-primary" :disabled="!newName.trim()">Add</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
      <RouterLink to="/watchlists" class="manage">Manage watchlists</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.watchlist-menu {
  position: relative;
}
.menu-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: var(--font-ui);
  padding: 6px 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.menu-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.menu-btn.on {
  color: var(--accent);
  border-color: var(--accent);
}
.popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  width: 260px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  font-size: 13px;
}
.lists {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}
.lists label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
}
.lists label:hover {
  background: var(--surface-hover);
}
.list-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}
.create {
  display: flex;
  gap: 6px;
}
.create input {
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 5px 8px;
  outline: none;
}
.create input:focus {
  border-color: var(--accent);
}
.muted {
  color: var(--text-secondary);
  margin: 4px 6px 8px;
}
.error {
  color: var(--negative);
  margin: 8px 0 0;
}
.manage {
  display: block;
  margin-top: 10px;
  color: var(--accent);
  font-size: 12px;
  text-decoration: none;
}
.manage:hover {
  color: var(--accent-hover);
}
</style>
