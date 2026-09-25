import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RESOURCE_TTL_MS, resetCachedResources, useCachedResource } from "../useCachedResource";
import { resetPersistentCacheConnection } from "../../utils/persistentCache";

/** fake-indexeddb completes requests on later macrotasks. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

let now = 1_000_000;
let calls = 0;
const fetcher = vi.fn(async () => ({ n: ++calls }));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersistentCacheConnection();
  resetCachedResources();
  calls = 0;
  now = 1_000_000;
  fetcher.mockClear();
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCachedResource", () => {
  it("fetches on first load and exposes the data", async () => {
    const r = useCachedResource("k", fetcher);
    await r.load();
    expect(r.data.value).toEqual({ n: 1 });
    expect(r.updatedLabel.value).toBe("Updated just now");
  });

  it("starts with in-memory data for a second user of the same key, and doesn't refetch while fresh", async () => {
    await useCachedResource("k", fetcher).load();
    const again = useCachedResource("k", fetcher);
    expect(again.data.value).toEqual({ n: 1 });
    await again.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetches once stale, keeping the old data visible meanwhile", async () => {
    const r = useCachedResource("k", fetcher);
    await r.load();
    now += RESOURCE_TTL_MS + 1;
    const pending = r.load();
    expect(r.data.value).toEqual({ n: 1 });
    expect(r.loading.value).toBe(true);
    await pending;
    expect(r.data.value).toEqual({ n: 2 });
  });

  it("always refetches when forced", async () => {
    const r = useCachedResource("k", fetcher);
    await r.load();
    await r.load({ force: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("restores from IndexedDB after a reload", async () => {
    await useCachedResource("k", fetcher).load();
    await settle();
    resetCachedResources(); // reload: memory gone

    const r = useCachedResource("k", fetcher);
    expect(r.data.value).toBeNull();
    await r.load();
    expect(r.data.value).toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the last data and reports the error when a refetch fails", async () => {
    const r = useCachedResource("k", fetcher);
    await r.load();
    fetcher.mockRejectedValueOnce(new Error("offline"));
    await r.load({ force: true });
    expect(r.error.value).toBe("offline");
    expect(r.data.value).toEqual({ n: 1 });
  });
});
