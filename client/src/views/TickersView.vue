<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { addTicker, deleteTicker, fetchTickers, updateTicker } from "../api";
import type { Ticker } from "../types";

const tickers = ref<Ticker[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const newSymbol = ref("");
const newName = ref("");
const adding = ref(false);
const addError = ref<string | null>(null);

const filter = ref("");
const editingSymbol = ref<string | null>(null);
const editName = ref("");
const rowError = ref<string | null>(null);

const filtered = computed(() => {
  const q = filter.value.trim().toUpperCase();
  if (!q) return tickers.value;
  return tickers.value.filter((t) =>
    [t.symbol, t.name, t.sector ?? "", t.industry ?? ""].some((field) => field.toUpperCase().includes(q))
  );
});

/** null = the server hasn't looked it up yet; "" = Yahoo has none. */
function categoryLabel(value: string | null): string {
  if (value === null) return "Pending…";
  return value || "—";
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    tickers.value = await fetchTickers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load tickers";
  } finally {
    loading.value = false;
  }
}

async function add() {
  if (!newSymbol.value.trim()) return;
  adding.value = true;
  addError.value = null;
  try {
    const ticker = await addTicker(newSymbol.value.trim(), newName.value.trim() || undefined);
    tickers.value = [...tickers.value, ticker].sort((a, b) => a.symbol.localeCompare(b.symbol));
    newSymbol.value = "";
    newName.value = "";
  } catch (err) {
    addError.value = err instanceof Error ? err.message : "Failed to add ticker";
  } finally {
    adding.value = false;
  }
}

function startEdit(ticker: Ticker) {
  editingSymbol.value = ticker.symbol;
  editName.value = ticker.name;
  rowError.value = null;
}

function cancelEdit() {
  editingSymbol.value = null;
}

async function saveEdit(ticker: Ticker) {
  rowError.value = null;
  try {
    const updated = await updateTicker(ticker.symbol, editName.value.trim());
    ticker.name = updated.name;
    editingSymbol.value = null;
  } catch (err) {
    rowError.value = err instanceof Error ? err.message : "Failed to rename ticker";
  }
}

async function remove(ticker: Ticker) {
  if (!confirm(`Remove ${ticker.symbol} from the screener?`)) return;
  rowError.value = null;
  try {
    await deleteTicker(ticker.symbol);
    tickers.value = tickers.value.filter((t) => t.symbol !== ticker.symbol);
  } catch (err) {
    rowError.value = err instanceof Error ? err.message : "Failed to remove ticker";
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Tickers</h2>
      <span class="count">{{ tickers.length }} symbols</span>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load tickers — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <template v-else>
      <form class="add-form" @submit.prevent="add">
        <input v-model="newSymbol" class="symbol-input" placeholder="Symbol, e.g. BRK-B" aria-label="Symbol" />
        <input v-model="newName" class="name-input" placeholder="Name (optional — looked up if blank)" aria-label="Name" />
        <button type="submit" class="btn-primary" :disabled="adding || !newSymbol.trim()">
          {{ adding ? "Checking…" : "Add" }}
        </button>
      </form>
      <p v-if="addError" class="inline-error add-error">{{ addError }}</p>

      <input v-model="filter" class="filter-input" placeholder="Filter by symbol, name, or sector" aria-label="Filter" />
      <p v-if="rowError" class="inline-error row-error">{{ rowError }}</p>

      <p v-if="loading" class="muted">Loading…</p>
      <table v-else class="tickers">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Sector</th>
            <th>Sub-sector</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in filtered" :key="t.symbol">
            <td class="symbol">
              <RouterLink :to="{ name: 'stock-detail', params: { symbol: t.symbol } }">{{ t.symbol }}</RouterLink>
            </td>
            <td>
              <form v-if="editingSymbol === t.symbol" class="edit-form" @submit.prevent="saveEdit(t)">
                <input v-model="editName" class="edit-input" aria-label="Edit name" @keydown.esc="cancelEdit" />
                <button type="submit" class="btn-primary">Save</button>
                <button type="button" class="btn-ghost" @click="cancelEdit">Cancel</button>
              </form>
              <span v-else>{{ t.name || "—" }}</span>
            </td>
            <td class="category" :class="{ muted: t.sector === null }">{{ categoryLabel(t.sector) }}</td>
            <td class="category" :class="{ muted: t.industry === null }">{{ categoryLabel(t.industry) }}</td>
            <td class="actions">
              <template v-if="editingSymbol !== t.symbol">
                <button class="btn-ghost edit-btn" @click="startEdit(t)">Rename</button>
                <button class="btn-ghost remove-btn" @click="remove(t)">Remove</button>
              </template>
            </td>
          </tr>
          <tr v-if="filtered.length === 0">
            <td colspan="5" class="muted">No tickers match.</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.count {
  color: var(--text-secondary);
  font-size: 13px;
}
.add-form,
.edit-form {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-form {
  margin-bottom: 8px;
}
input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 6px 10px;
}
input:focus {
  outline: none;
  border-color: var(--accent);
}
.symbol-input {
  width: 160px;
  text-transform: uppercase;
  font-family: var(--font-mono);
}
.name-input {
  flex: 1;
  max-width: 320px;
}
.filter-input {
  width: 100%;
  max-width: 320px;
  margin: 16px 0 12px;
}
.edit-input {
  flex: 1;
  max-width: 280px;
  padding: 4px 8px;
}
.inline-error {
  color: var(--negative);
  font-size: 13px;
  margin: 4px 0;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.btn-ghost:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
.remove-btn:hover {
  color: var(--negative);
  border-color: var(--negative);
}
.tickers {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.tickers th,
.tickers td {
  padding: 8px 12px;
  text-align: left;
  color: var(--text-primary);
}
.tickers thead {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tickers tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.tickers tbody tr:hover td {
  background: var(--surface-hover);
}
.symbol {
  font-family: var(--font-mono);
  width: 120px;
}
.symbol a {
  color: var(--accent);
  text-decoration: none;
}
.category {
  color: var(--text-secondary);
  white-space: nowrap;
}
.actions {
  width: 170px;
  text-align: right;
  white-space: nowrap;
}
.actions .btn-ghost + .btn-ghost {
  margin-left: 6px;
}
</style>
