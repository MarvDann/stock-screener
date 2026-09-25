import { computed, ref, type Ref } from "vue";
import { cacheGet, cacheSet } from "../utils/persistentCache";

/** Matches the server's price cache, so refetching sooner can't return anything newer. */
export const RESOURCE_TTL_MS = 5 * 60 * 1000;

interface Entry<T> {
  data: T;
  fetchedAt: number;
}

// In-memory copy so returning to a page renders instantly, with IndexedDB
// behind it so a reload does too.
const memory = new Map<string, Entry<unknown>>();

/** Test hook, also used on logout: forget everything held in memory. */
export function resetCachedResources(): void {
  memory.clear();
}

/**
 * A request whose last response is shown straight away from cache, and only
 * refetched once it's older than `ttlMs` (or when forced by a Refresh).
 */
export function useCachedResource<T>(key: string, fetcher: () => Promise<T>, ttlMs = RESOURCE_TTL_MS) {
  const initial = memory.get(key) as Entry<T> | undefined;
  const data = ref(initial?.data ?? null) as Ref<T | null>;
  const fetchedAt = ref<number | null>(initial?.fetchedAt ?? null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  function show(entry: Entry<T>) {
    data.value = entry.data;
    fetchedAt.value = entry.fetchedAt;
  }

  async function load({ force = false } = {}) {
    error.value = null;
    if (data.value === null) {
      const stored = await cacheGet<Entry<T>>(key);
      if (stored && data.value === null) {
        memory.set(key, stored);
        show(stored);
      }
    }
    const fresh = fetchedAt.value !== null && Date.now() - fetchedAt.value <= ttlMs;
    if (fresh && !force) return;

    loading.value = true;
    try {
      const entry = { data: await fetcher(), fetchedAt: Date.now() };
      memory.set(key, entry);
      show(entry);
      void cacheSet(key, entry);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Request failed";
    } finally {
      loading.value = false;
    }
  }

  const updatedLabel = computed(() => {
    if (fetchedAt.value === null) return "";
    const minutes = Math.floor((Date.now() - fetchedAt.value) / 60_000);
    return minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago`;
  });

  return { data, fetchedAt, loading, error, load, updatedLabel };
}
