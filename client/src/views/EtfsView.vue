<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { addEtf, deleteEtf, fetchEtfs, updateEtf } from "../api";
import type { Etf } from "../types";
import { useIsAdmin } from "../composables/useIsAdmin";
import CandidateCard from "../components/CandidateCard.vue";
import WarningsBanner from "../components/WarningsBanner.vue";
import Pagination from "../components/Pagination.vue";
import { usePagination } from "../composables/usePagination";
import { useQueryPage, useQueryParam, useUrlSearch } from "../composables/useQueryParam";
import { useStockCards } from "../composables/useStockCards";
import { filterAndRank } from "../utils/search";

const CARDS_PER_PAGE = 6;

const etfs = ref<Etf[]>([]);
// Renaming, moving or removing an ETF changes everyone's list, so only admins can; members can still add.
const isAdmin = useIsAdmin();
const categories = ref<string[]>([]);
const editableCategories = ref<string[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Filters live in the URL so the back button and reloads restore them.
/** "" means every category. */
const category = useQueryParam("category");
const { input: search, query } = useUrlSearch();

const categoryCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const e of etfs.value) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return counts;
});

const inCategory = computed(() =>
  category.value ? etfs.value.filter((e) => e.category === category.value) : etfs.value
);
const results = computed(() => filterAndRank(inCategory.value, query.value));
const pager = usePagination(results, CARDS_PER_PAGE, useQueryPage());
watch([query, category], pager.reset);

const { pageCards, loading: cardsLoading, error: cardsError, warnings, load: loadPageCards } = useStockCards(pager.paged);

// Edit mode swaps the chart cards for a table of the filtered ETFs.
const editing = ref(false);
const newSymbol = ref("");
const newName = ref("");
const newCategory = ref("");
const adding = ref(false);
const addError = ref<string | null>(null);
const renamingSymbol = ref<string | null>(null);
const renameValue = ref("");
const rowError = ref<string | null>(null);

const isEditable = (etf: Etf) => editableCategories.value.includes(etf.category);

/** Category display order, keeping each category's existing order (as the server does). */
function inCategoryOrder(list: Etf[]): Etf[] {
  return categories.value.flatMap((c) => list.filter((e) => e.category === c));
}

function startEditing() {
  editing.value = true;
  // Default new ETFs to the category being viewed, when it can take them.
  newCategory.value = editableCategories.value.includes(category.value) ? category.value : editableCategories.value[0];
  addError.value = null;
  rowError.value = null;
}

async function add() {
  if (!newSymbol.value.trim()) return;
  adding.value = true;
  addError.value = null;
  try {
    const etf = await addEtf(newSymbol.value.trim(), newCategory.value, newName.value.trim() || undefined);
    etfs.value = inCategoryOrder([...etfs.value, etf]);
    newSymbol.value = "";
    newName.value = "";
  } catch (err) {
    addError.value = err instanceof Error ? err.message : "Failed to add ETF";
  } finally {
    adding.value = false;
  }
}

/** Swaps in the server's copy of an edited ETF, re-sorting in case its category changed. */
function replaceEtf(updated: Etf) {
  etfs.value = inCategoryOrder(etfs.value.map((e) => (e.symbol === updated.symbol ? updated : e)));
}

function startRename(etf: Etf) {
  renamingSymbol.value = etf.symbol;
  renameValue.value = etf.name;
  rowError.value = null;
}

async function saveRename(etf: Etf) {
  rowError.value = null;
  try {
    replaceEtf(await updateEtf(etf.symbol, { name: renameValue.value.trim() }));
    renamingSymbol.value = null;
  } catch (err) {
    rowError.value = err instanceof Error ? err.message : "Failed to rename ETF";
  }
}

async function move(etf: Etf, to: string) {
  rowError.value = null;
  try {
    replaceEtf(await updateEtf(etf.symbol, { category: to }));
  } catch (err) {
    rowError.value = err instanceof Error ? err.message : "Failed to move ETF";
  }
}

async function remove(etf: Etf) {
  if (!confirm(`Remove ${etf.symbol} from the ETF list?`)) return;
  rowError.value = null;
  try {
    await deleteEtf(etf.symbol);
    etfs.value = etfs.value.filter((e) => e.symbol !== etf.symbol);
  } catch (err) {
    rowError.value = err instanceof Error ? err.message : "Failed to remove ETF";
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const response = await fetchEtfs();
    etfs.value = response.etfs;
    categories.value = response.categories;
    editableCategories.value = response.editableCategories;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load ETFs";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>ETFs</h2>
      <div class="header-actions">
        <span v-if="etfs.length > 0" class="match-count">
          {{ results.length }} {{ results.length === 1 ? "match" : "matches" }}
        </span>
        <input
          v-model="search"
          type="search"
          placeholder="Search by symbol or name…"
          aria-label="Search ETFs"
          class="search"
        />
        <button v-if="etfs.length > 0 && !editing" type="button" class="btn-ghost edit-toggle" @click="startEditing">
          Edit list
        </button>
        <button v-else-if="editing" type="button" class="btn-primary edit-toggle" @click="editing = false">Done</button>
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load ETFs — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>

    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-else>
      <div class="chips" role="group" aria-label="Filter by category">
        <button type="button" class="chip" :class="{ active: category === '' }" @click="category = ''">
          All <span class="chip-count">{{ etfs.length }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: category === c }"
          @click="category = c"
        >
          {{ c }} <span class="chip-count">{{ categoryCounts.get(c) ?? 0 }}</span>
        </button>
      </div>

      <template v-if="editing">
        <form class="add-form" @submit.prevent="add">
          <input v-model="newSymbol" class="symbol-input" placeholder="Symbol, e.g. CSPX.L" aria-label="Symbol" />
          <input v-model="newName" class="name-input" placeholder="Name (optional — looked up if blank)" aria-label="Name" />
          <select v-model="newCategory" aria-label="Category">
            <option v-for="c in editableCategories" :key="c" :value="c">{{ c }}</option>
          </select>
          <button type="submit" class="btn-primary" :disabled="adding || !newSymbol.trim()">
            {{ adding ? "Checking…" : "Add" }}
          </button>
        </form>
        <p v-if="addError" class="inline-error">{{ addError }}</p>
        <p v-if="rowError" class="inline-error">{{ rowError }}</p>

        <div class="table-scroll">
          <table class="etf-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in results" :key="e.symbol">
                <td class="symbol">
                  <RouterLink :to="{ name: 'stock-detail', params: { symbol: e.symbol } }">{{ e.symbol }}</RouterLink>
                </td>
                <td>
                  <form v-if="renamingSymbol === e.symbol" class="rename-form" @submit.prevent="saveRename(e)">
                    <input v-model="renameValue" class="rename-input" aria-label="Edit name" @keydown.esc="renamingSymbol = null" />
                    <button type="submit" class="btn-primary">Save</button>
                    <button type="button" class="btn-ghost" @click="renamingSymbol = null">Cancel</button>
                  </form>
                  <span v-else>{{ e.name }}</span>
                </td>
                <td>
                  <select
                    v-if="isEditable(e) && isAdmin"
                    :value="e.category"
                    :aria-label="`Category for ${e.symbol}`"
                    @change="move(e, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="c in editableCategories" :key="c" :value="c">{{ c }}</option>
                  </select>
                  <span v-else class="muted">{{ e.category }}</span>
                </td>
                <td class="actions">
                  <template v-if="!isEditable(e)">
                    <span class="muted" title="These are the funds the Sector Rotation page ranks">Fixed</span>
                  </template>
                  <template v-else-if="isAdmin && renamingSymbol !== e.symbol">
                    <button type="button" class="btn-ghost" @click="startRename(e)">Rename</button>
                    <button type="button" class="btn-ghost remove-btn" @click="remove(e)">Remove</button>
                  </template>
                </td>
              </tr>
              <tr v-if="results.length === 0">
                <td colspan="4" class="muted">No ETFs match.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <WarningsBanner :warnings="warnings" />

        <p v-if="results.length === 0" class="muted">No ETFs match.</p>

        <template v-else>
          <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />

          <div v-if="cardsError" class="error-state">
            <p>Couldn't load charts for this page.</p>
            <p class="detail">{{ cardsError }}</p>
            <button @click="loadPageCards()">Retry</button>
          </div>
          <p v-if="cardsLoading && pageCards.length === 0" class="muted">Loading charts…</p>
          <div v-if="pageCards.length > 0" class="card-grid">
            <CandidateCard v-for="c in pageCards" :key="c.symbol" :candidate="c" show-state />
          </div>

          <Pagination :page="pager.page.value" :total-pages="pager.totalPages.value" @update:page="pager.goTo" />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}
.match-count {
  color: var(--text-secondary);
  font-size: 13px;
}
.search {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--font-ui);
  width: 260px;
  outline: none;
  transition: border-color 0.15s;
}
.search::placeholder {
  color: var(--text-muted);
}
.search:focus {
  border-color: var(--accent);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 20px;
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
.chip-count {
  color: var(--text-muted);
  font-weight: 500;
}
.chip.active .chip-count {
  color: var(--accent);
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
.edit-toggle {
  white-space: nowrap;
}
.add-form,
.rename-form {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-form {
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.add-form input,
.rename-form input,
.etf-table select,
.add-form select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 6px 10px;
}
.add-form input:focus,
.rename-form input:focus,
select:focus {
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
  min-width: 180px;
  max-width: 320px;
}
.rename-input {
  flex: 1;
  max-width: 280px;
}
.etf-table select {
  padding: 4px 8px;
}
.inline-error {
  color: var(--negative);
  font-size: 13px;
  margin: 4px 0;
}
.etf-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
  margin-top: 12px;
}
.etf-table th,
.etf-table td {
  padding: 8px 12px;
  text-align: left;
  color: var(--text-primary);
}
.etf-table thead {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.etf-table tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.etf-table tbody tr:hover td {
  background: var(--surface-hover);
}
.etf-table .symbol {
  font-family: var(--font-mono);
  width: 110px;
}
.etf-table .symbol a {
  color: var(--accent);
  text-decoration: none;
}
.etf-table .muted {
  font-size: 13px;
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
