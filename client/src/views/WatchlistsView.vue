<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  addToWatchlist,
  createWatchlist,
  deleteWatchlist,
  fetchEtfs,
  fetchTickers,
  fetchWatchlists,
  removeFromWatchlist,
  renameWatchlist,
} from "../api";
import type { Watchlist } from "../types";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import SymbolPicker from "../components/SymbolPicker.vue";
import { usePagination } from "../composables/usePagination";
import { useQueryPage, useQueryParam } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";

const CARDS_PER_PAGE = 6;
/** How long "Removed X · Undo" stays up. */
const UNDO_MS = 6000;

const watchlists = ref<Watchlist[]>([]);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
/** Inline error for whatever was last tried: creating, renaming, adding, removing. */
const actionError = ref<string | null>(null);

// The open list lives in the URL, so reloads and the back button keep it.
const listParam = useQueryParam("list");
/** The list in the URL, or the first one when the URL doesn't name one of yours. */
const selected = computed(
  () => watchlists.value.find((w) => String(w.id) === listParam.value) ?? watchlists.value[0] ?? null
);

/** Every tracked ticker and ETF, for the add box's suggestions. */
const suggestions = ref<{ symbol: string; name: string }[]>([]);
const names = computed(() => new Map(suggestions.value.map((s) => [s.symbol, s.name])));

const creating = ref(false);
const newName = ref("");
const createInput = ref<HTMLInputElement | null>(null);

const renaming = ref(false);
const renameValue = ref("");
const renameInput = ref<HTMLInputElement | null>(null);

const adding = ref(false);
const picker = ref<InstanceType<typeof SymbolPicker> | null>(null);

const undo = ref<{ listId: number; symbol: string; index: number } | null>(null);
let undoTimer: ReturnType<typeof setTimeout> | undefined;

const items = computed(() => (selected.value?.symbols ?? []).map((symbol) => ({ symbol })));
const pager = usePagination(items, CARDS_PER_PAGE, useQueryPage());
const { pageCards, loading: cardsLoading, error: cardsError, warnings, load: loadPageCards } = useStockCards(pager.paged);

/** Symbols on this page that came back without a chart, e.g. a ticker since dropped from the screener. */
const uncharted = computed(() => {
  if (cardsLoading.value || cardsError.value) return [];
  const charted = new Set(pageCards.value.map((c) => c.symbol));
  return pager.paged.value.map((t) => t.symbol).filter((s) => !charted.has(s));
});

const countLabel = (n: number) => `${n} ${n === 1 ? "stock" : "stocks"}`;

watch(
  () => selected.value?.id,
  (id, previous) => {
    renaming.value = false;
    actionError.value = null;
    if (previous !== undefined && id !== previous) pager.reset();
  }
);

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Swaps in the server's copy of a list after a change. */
function replace(updated: Watchlist) {
  watchlists.value = watchlists.value.map((w) => (w.id === updated.id ? updated : w));
}

function sortByName(lists: Watchlist[]): Watchlist[] {
  return [...lists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function select(id: number) {
  listParam.value = String(id);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    watchlists.value = await fetchWatchlists();
    loaded.value = true;
  } catch (err) {
    error.value = message(err, "Failed to load watchlists");
  } finally {
    loading.value = false;
  }
}

/** Suggestions are a convenience, so a failure here is ignored — the server still validates. */
async function loadSuggestions() {
  const [tickers, etfs] = await Promise.allSettled([fetchTickers(), fetchEtfs()]);
  const all = new Map<string, string>();
  if (tickers.status === "fulfilled") for (const t of tickers.value) all.set(t.symbol, t.name);
  if (etfs.status === "fulfilled") for (const e of etfs.value.etfs) if (!all.has(e.symbol)) all.set(e.symbol, e.name);
  suggestions.value = [...all].map(([symbol, name]) => ({ symbol, name })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function startCreate() {
  creating.value = true;
  newName.value = "";
  actionError.value = null;
  await nextTick();
  createInput.value?.focus();
}

async function create() {
  if (!newName.value.trim()) return;
  actionError.value = null;
  try {
    const list = await createWatchlist(newName.value.trim());
    watchlists.value = sortByName([...watchlists.value, list]);
    creating.value = false;
    select(list.id);
    // A new list is empty, so the next thing to do is add to it.
    await nextTick();
    picker.value?.focus();
  } catch (err) {
    actionError.value = message(err, "Failed to create watchlist");
  }
}

async function startRename() {
  if (!selected.value) return;
  renaming.value = true;
  renameValue.value = selected.value.name;
  actionError.value = null;
  await nextTick();
  renameInput.value?.select();
}

async function saveRename() {
  const list = selected.value;
  if (!renaming.value || !list) return;
  const name = renameValue.value.trim();
  renaming.value = false;
  if (!name || name === list.name) return;
  actionError.value = null;
  try {
    const updated = await renameWatchlist(list.id, name);
    watchlists.value = sortByName(watchlists.value.map((w) => (w.id === updated.id ? updated : w)));
  } catch (err) {
    actionError.value = message(err, "Failed to rename watchlist");
  }
}

async function remove() {
  const list = selected.value;
  if (!list) return;
  const what = list.symbols.length > 0 ? `the watchlist "${list.name}" and its ${countLabel(list.symbols.length)}` : `the watchlist "${list.name}"`;
  if (!confirm(`Delete ${what}?`)) return;
  actionError.value = null;
  try {
    await deleteWatchlist(list.id);
    watchlists.value = watchlists.value.filter((w) => w.id !== list.id);
    listParam.value = "";
    clearUndo();
  } catch (err) {
    actionError.value = message(err, "Failed to delete watchlist");
  }
}

async function addSymbol(symbol: string) {
  const list = selected.value;
  if (!list) return;
  adding.value = true;
  actionError.value = null;
  try {
    replace(await addToWatchlist(list.id, symbol));
    // New stocks go on the end, so show the page they landed on.
    pager.goTo(pager.totalPages.value);
  } catch (err) {
    actionError.value = message(err, "Failed to add stock");
  } finally {
    adding.value = false;
  }
}

async function removeSymbol(symbol: string) {
  const list = selected.value;
  if (!list) return;
  const index = list.symbols.indexOf(symbol);
  actionError.value = null;
  try {
    replace(await removeFromWatchlist(list.id, symbol));
    clearUndo();
    undo.value = { listId: list.id, symbol, index };
    undoTimer = setTimeout(clearUndo, UNDO_MS);
  } catch (err) {
    actionError.value = message(err, "Failed to remove stock");
  }
}

async function undoRemove() {
  const last = undo.value;
  clearUndo();
  if (!last) return;
  try {
    // Back in the same spot, not on the end.
    replace(await addToWatchlist(last.listId, last.symbol, last.index));
  } catch (err) {
    actionError.value = message(err, `Couldn't put ${last.symbol} back`);
  }
}

function clearUndo() {
  clearTimeout(undoTimer);
  undo.value = null;
}

onMounted(() => {
  void load();
  void loadSuggestions();
});
onBeforeUnmount(() => clearTimeout(undoTimer));
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Watchlists</h2>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load your watchlists — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <p v-else-if="!loaded" class="muted">Loading…</p>

    <!-- First visit: nothing to pick from yet, so lead with creating a list. -->
    <div v-else-if="watchlists.length === 0" class="empty-start">
      <h3>Create your first watchlist</h3>
      <p class="muted">Group stocks and ETFs you want to keep an eye on, then see all their charts in one place.</p>
      <form class="inline-form" @submit.prevent="create">
        <input
          v-model="newName"
          class="text-input"
          placeholder="Name it, e.g. Semiconductors"
          aria-label="New watchlist name"
          maxlength="60"
        />
        <button type="submit" class="btn-primary" :disabled="!newName.trim()">Create</button>
      </form>
      <p v-if="actionError" class="inline-error">{{ actionError }}</p>
    </div>

    <template v-else>
      <nav class="chips" aria-label="Your watchlists">
        <button
          v-for="w in watchlists"
          :key="w.id"
          type="button"
          class="chip"
          :class="{ active: w.id === selected?.id }"
          :aria-current="w.id === selected?.id ? 'page' : undefined"
          @click="select(w.id)"
        >
          <span class="chip-name">{{ w.name }}</span>
          <span class="chip-count">{{ w.symbols.length }}</span>
        </button>

        <form v-if="creating" class="chip-create" @submit.prevent="create">
          <input
            ref="createInput"
            v-model="newName"
            class="text-input"
            placeholder="List name"
            aria-label="New watchlist name"
            maxlength="60"
            @keydown.esc="creating = false"
          />
          <button type="submit" class="btn-primary" :disabled="!newName.trim()">Create</button>
          <button type="button" class="btn-ghost" @click="creating = false">Cancel</button>
        </form>
        <button v-else type="button" class="chip new-chip" @click="startCreate">+ New list</button>
      </nav>

      <section v-if="selected" class="main">
        <header class="list-header">
          <div class="list-title">
            <input
              v-if="renaming"
              ref="renameInput"
              v-model="renameValue"
              class="title-input"
              aria-label="Watchlist name"
              maxlength="60"
              @keydown.enter.prevent="saveRename"
              @keydown.esc="renaming = false"
              @blur="saveRename"
            />
            <h3 v-else class="title" title="Click to rename" @click="startRename">{{ selected.name }}</h3>
            <span class="subtitle">{{ countLabel(selected.symbols.length) }}</span>
          </div>
          <div class="list-actions">
            <button class="btn-ghost rename-btn" @click="startRename">Rename</button>
            <button class="btn-ghost delete-btn" @click="remove">Delete</button>
          </div>
        </header>

        <div class="add-row">
          <SymbolPicker
            ref="picker"
            :options="suggestions"
            :exclude="selected.symbols"
            :disabled="adding"
            :placeholder="`Add a stock or ETF to ${selected.name}…`"
            @pick="addSymbol"
          />
        </div>

        <p v-if="actionError" class="inline-error">{{ actionError }}</p>
        <div v-if="undo" class="undo-bar" role="status">
          Removed {{ undo.symbol }}
          <button class="undo-btn" @click="undoRemove">Undo</button>
        </div>

        <div v-if="selected.symbols.length === 0" class="empty-list">
          <p>Nothing on {{ selected.name }} yet.</p>
          <p class="muted">Search above, or use the ☆ Watchlists button on any stock's page.</p>
        </div>

        <template v-else>
          <WarningsBanner :warnings="warnings" />
          <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />

          <div v-if="cardsError" class="error-state">
            <p>Couldn't load charts for this page.</p>
            <p class="detail">{{ cardsError }}</p>
            <button @click="loadPageCards()">Retry</button>
          </div>
          <p v-if="cardsLoading && pageCards.length === 0" class="muted">Loading charts…</p>
          <div v-if="pageCards.length > 0" class="card-grid">
            <CandidateCard v-for="c in pageCards" :key="c.symbol" :candidate="c" show-state>
              <template #actions>
                <button
                  class="card-remove"
                  :aria-label="`Remove ${c.symbol} from ${selected.name}`"
                  :title="`Remove from ${selected.name}`"
                  @click="removeSymbol(c.symbol)"
                >
                  ×
                </button>
              </template>
            </CandidateCard>
          </div>

          <ul v-if="uncharted.length > 0" class="uncharted">
            <li v-for="symbol in uncharted" :key="symbol">
              <span class="uncharted-symbol">{{ symbol }}</span>
              <span class="muted">{{ names.get(symbol) ?? "No longer tracked" }} — no chart available</span>
              <button class="btn-ghost" @click="removeSymbol(symbol)">Remove</button>
            </li>
          </ul>

          <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ── List chips ── */
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 24px;
}
.chip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  transition: color 0.15s, border-color 0.15s;
}
.chip:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.chip.active {
  color: var(--accent);
  border-color: var(--accent);
}
.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-count {
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-weight: 500;
}
.chip.active .chip-count {
  color: var(--accent);
}
.new-chip {
  background: none;
  border-style: dashed;
}
.new-chip:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.chip-create {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chip-create .text-input {
  padding: 4px 10px;
  width: 180px;
}

/* ── Selected list ── */
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.list-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.title,
.title-input {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text-primary);
}
.title {
  cursor: text;
  overflow-wrap: anywhere;
}
.title-input {
  font-family: var(--font-ui);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 0 8px;
  margin-left: -9px;
  outline: none;
  width: min(480px, 100%);
}
.subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}
.list-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.add-row {
  margin-bottom: 16px;
}

/* ── Shared bits ── */
.text-input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 7px 10px;
  outline: none;
  transition: border-color 0.15s;
}
.text-input:focus {
  border-color: var(--accent);
}
.text-input::placeholder {
  color: var(--text-muted);
}
.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
}
.btn-ghost:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.delete-btn:hover {
  color: var(--negative);
  border-color: var(--negative);
}
.inline-error {
  color: var(--negative);
  font-size: 13px;
  margin: 0 0 12px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}

.card-remove {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  width: 24px;
  height: 24px;
  cursor: pointer;
}
.card-remove:hover,
.card-remove:focus-visible {
  color: var(--negative);
  background: var(--negative-soft);
}

.undo-bar {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 6px 8px 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
}
.undo-btn {
  background: none;
  border: none;
  color: var(--accent);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.undo-btn:hover {
  color: var(--accent-hover);
}

.empty-start,
.empty-list {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 32px;
  text-align: center;
}
.empty-start h3 {
  margin: 0 0 6px;
  font-size: 20px;
  color: var(--text-primary);
}
.empty-start .inline-form {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 18px 0 8px;
}
.empty-start .text-input {
  width: 260px;
}
.empty-list p {
  margin: 0 0 4px;
  color: var(--text-primary);
}

.uncharted {
  list-style: none;
  margin: 0 0 20px;
  padding: 0;
}
.uncharted li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  margin-bottom: 6px;
}
.uncharted-symbol {
  font-family: var(--font-mono);
  font-size: 12px;
  min-width: 64px;
}
.uncharted .btn-ghost {
  margin-left: auto;
}
</style>
