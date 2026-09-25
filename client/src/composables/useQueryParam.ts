import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type WritableComputedRef } from "vue";
import { useRoute, useRouter, type LocationQuery, type Router } from "vue-router";

// Writes made in the same tick are merged into a single router.replace, so
// e.g. setting the search and resetting the page together can't clobber
// each other, and replaces run one at a time so a later one always builds
// on the query an earlier one produced. Until a write lands, reads see it.
interface PendingWrites {
  values: Map<string, string | undefined>;
  flushScheduled: boolean;
  queue: Promise<void>;
}
const pendingByRouter = new WeakMap<Router, PendingWrites>();

function pendingFor(router: Router): PendingWrites {
  let pending = pendingByRouter.get(router);
  if (!pending) {
    pending = { values: reactive(new Map<string, string | undefined>()), flushScheduled: false, queue: Promise.resolve() };
    pendingByRouter.set(router, pending);
  }
  return pending;
}

/**
 * A string kept in the URL's query (`?key=value`), so filters survive the
 * back button, reloads and shared links. Writes use `replace`, so changing
 * a filter doesn't add a history entry. The fallback is left out of the URL.
 */
export function useQueryParam(key: string, fallback = ""): WritableComputedRef<string> {
  const route = useRoute();
  const router = useRouter();
  const pending = pendingFor(router);
  /** The page this filter belongs to; writes are ignored once it's been left. */
  const ownPath = route.path;

  return computed({
    get() {
      if (pending.values.has(key)) return pending.values.get(key) ?? fallback;
      const value = route.query[key];
      return typeof value === "string" ? value : fallback;
    },
    set(value) {
      if (router.currentRoute.value.path !== ownPath) return;
      pending.values.set(key, value === fallback || value === "" ? undefined : value);
      if (pending.flushScheduled) return;
      pending.flushScheduled = true;
      pending.queue = pending.queue
        .then(() => nextTick())
        .then(async () => {
          pending.flushScheduled = false;
          const patch = new Map(pending.values);
          // Left the page before this landed (e.g. clicked through to a stock): drop it.
          if (router.currentRoute.value.path !== ownPath) {
            pending.values.clear();
            return;
          }
          const query: LocationQuery = { ...router.currentRoute.value.query };
          for (const [k, v] of patch) {
            if (v === undefined) delete query[k];
            else query[k] = v;
          }
          await router.replace({ query });
          for (const [k, v] of patch) if (pending.values.get(k) === v) pending.values.delete(k);
        })
        .catch(() => undefined);
    },
  });
}

/** A 1-based page number kept in the URL as `?page=N` (left out on page 1). */
export function useQueryPage(key = "page"): WritableComputedRef<number> {
  const param = useQueryParam(key, "1");
  return computed({
    get: () => Math.max(1, Number.parseInt(param.value, 10) || 1),
    set: (page) => (param.value = String(page)),
  });
}

/**
 * A search box whose committed text lives in the URL (`?q=`), updated a
 * moment after typing stops. `input` is for v-model; `query` is the
 * committed text, lowercased for matching.
 */
export function useUrlSearch(key = "q", debounceMs = 250) {
  const committed = useQueryParam(key);
  const input = ref(committed.value);
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(input, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      committed.value = value.trim();
    }, debounceMs);
  });
  // Follow URL changes made elsewhere, e.g. the sidebar link clearing the
  // filters — but never while typing is waiting to be committed.
  watch(committed, (value) => {
    if (timer === undefined && value !== input.value.trim()) input.value = value;
  });
  onBeforeUnmount(() => clearTimeout(timer));

  return { input, query: computed(() => committed.value.toLowerCase()) };
}
