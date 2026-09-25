import { computed, ref, shallowReactive, watch, type Ref } from "vue";
import { fetchStocks } from "../api";
import type { StockCard } from "../types";
import { cacheGetByPrefix, cacheSet } from "../utils/persistentCache";

/** Matches the server's price cache, so refetching sooner can't return anything newer. */
export const CARD_TTL_MS = 5 * 60 * 1000;
const KEY_PREFIX = "card:";

interface CachedCard {
  card: StockCard;
  fetchedAt: number;
}

// Shared by every page and persisted to IndexedDB, so navigating between
// pages or reloading shows charts immediately instead of refetching them.
const cache = shallowReactive(new Map<string, CachedCard>());
let hydration: Promise<void> | null = null;

function hydrate(): Promise<void> {
  hydration ??= cacheGetByPrefix<CachedCard>(KEY_PREFIX)
    .then((entries) => {
      for (const entry of entries) {
        const current = cache.get(entry.card.symbol);
        if (!current || current.fetchedAt < entry.fetchedAt) cache.set(entry.card.symbol, entry);
      }
    })
    // Losing the persisted cache only means refetching; never let it block loading.
    .catch(() => undefined);
  return hydration;
}

function store(card: StockCard, fetchedAt: number) {
  const entry = { card, fetchedAt };
  cache.set(card.symbol, entry);
  void cacheSet(KEY_PREFIX + card.symbol, entry);
}

/** Test hook: empty the in-memory cache and re-read IndexedDB on next use. */
export function resetStockCardCache(): void {
  cache.clear();
  hydration = null;
}

/**
 * Chart cards for whichever symbols are on the current page. Cached cards
 * show straight away; only the page's missing or stale cards are fetched.
 */
export function useStockCards(paged: Ref<{ symbol: string }[]>) {
  /** True while some card on the page has nothing cached to show yet. */
  const loading = ref(false);
  /** True while cards already on screen are being refreshed in the background. */
  const refreshing = ref(false);
  const error = ref<string | null>(null);
  const warnings = ref<string[]>([]);
  let requestId = 0;

  const pageCards = computed(() =>
    paged.value.map((t) => cache.get(t.symbol)?.card).filter((c): c is StockCard => c !== undefined)
  );

  /** `force` refetches the whole page even if it's fresh (the Refresh button). */
  async function load({ force = false } = {}) {
    const id = ++requestId;
    const symbols = paged.value.map((t) => t.symbol);
    error.value = null;
    warnings.value = [];
    loading.value = symbols.some((s) => !cache.has(s));

    await hydrate();
    if (id !== requestId) return;

    const now = Date.now();
    const toFetch = symbols.filter((s) => {
      const entry = cache.get(s);
      return force || !entry || now - entry.fetchedAt > CARD_TTL_MS;
    });
    loading.value = toFetch.some((s) => !cache.has(s));
    refreshing.value = toFetch.length > 0 && !loading.value;
    if (toFetch.length === 0) return;

    try {
      const response = await fetchStocks(toFetch);
      // Kept even if the user has paged away — it's still valid data.
      const fetchedAt = Date.now();
      for (const card of response.stocks) store(card, fetchedAt);
      if (id !== requestId) return;
      warnings.value = response.warnings;
    } catch (err) {
      if (id !== requestId) return;
      error.value = err instanceof Error ? err.message : "Failed to load stocks";
    } finally {
      if (id === requestId) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  watch(() => paged.value.map((t) => t.symbol).join(","), () => load(), { immediate: true });

  return { pageCards, loading, refreshing, error, warnings, load };
}
