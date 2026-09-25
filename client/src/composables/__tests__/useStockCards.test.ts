import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { CARD_TTL_MS, resetStockCardCache, useStockCards } from "../useStockCards";
import { resetPersistentCacheConnection } from "../../utils/persistentCache";
import type { StockCard } from "../../types";

const fetchStocks = vi.fn();
vi.mock("../../api", () => ({
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
}));

let version = 0;
function makeCard(symbol: string): StockCard {
  return { symbol, name: `${symbol} v${version}`, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

const page = (...symbols: string[]) => ref(symbols.map((symbol) => ({ symbol })));
const names = (cards: StockCard[]) => cards.map((c) => c.name);

/** fake-indexeddb completes requests on later macrotasks, so give it a few real ticks. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

let now = 1_000_000;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersistentCacheConnection();
  resetStockCardCache();
  version = 1;
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStockCards", () => {
  it("fetches the page's cards and reuses them on another page view", async () => {
    const first = useStockCards(page("AAPL", "MSFT"));
    await settle();
    expect(fetchStocks).toHaveBeenCalledWith(["AAPL", "MSFT"]);
    expect(names(first.pageCards.value)).toEqual(["AAPL v1", "MSFT v1"]);

    const second = useStockCards(page("MSFT", "NVDA"));
    await settle();
    expect(fetchStocks).toHaveBeenLastCalledWith(["NVDA"]);
    expect(names(second.pageCards.value)).toEqual(["MSFT v1", "NVDA v1"]);
  });

  it("follows the page as it changes", async () => {
    const paged = page("AAPL");
    const cards = useStockCards(paged);
    await settle();

    paged.value = [{ symbol: "TSLA" }];
    await settle();
    expect(fetchStocks).toHaveBeenLastCalledWith(["TSLA"]);
    expect(names(cards.pageCards.value)).toEqual(["TSLA v1"]);
  });

  it("shows stale cards immediately while refetching only the stale ones", async () => {
    useStockCards(page("AAPL"));
    await settle();
    now += CARD_TTL_MS - 1000;
    useStockCards(page("MSFT"));
    await settle();

    now += 2000; // AAPL is now stale, MSFT isn't
    version = 2;
    let resolve!: (v: unknown) => void;
    fetchStocks.mockImplementationOnce((symbols: string[]) => new Promise((r) => (resolve = () => r({ stocks: symbols.map(makeCard), warnings: [] }))));

    const cards = useStockCards(page("AAPL", "MSFT"));
    await settle();
    expect(fetchStocks).toHaveBeenLastCalledWith(["AAPL"]);
    expect(names(cards.pageCards.value)).toEqual(["AAPL v1", "MSFT v1"]);
    expect(cards.refreshing.value).toBe(true);
    expect(cards.loading.value).toBe(false);

    resolve(undefined);
    await settle();
    expect(names(cards.pageCards.value)).toEqual(["AAPL v2", "MSFT v1"]);
    expect(cards.refreshing.value).toBe(false);
  });

  it("refetches everything on the page when forced", async () => {
    const cards = useStockCards(page("AAPL", "MSFT"));
    await settle();

    await cards.load({ force: true });
    expect(fetchStocks).toHaveBeenCalledTimes(2);
    expect(fetchStocks).toHaveBeenLastCalledWith(["AAPL", "MSFT"]);
  });

  it("keeps cached cards on screen when a refresh fails", async () => {
    const cards = useStockCards(page("AAPL"));
    await settle();

    fetchStocks.mockRejectedValueOnce(new Error("rate limited"));
    await cards.load({ force: true });
    expect(cards.error.value).toBe("rate limited");
    expect(names(cards.pageCards.value)).toEqual(["AAPL v1"]);
  });

  it("restores cards from IndexedDB after a reload", async () => {
    useStockCards(page("AAPL"));
    await settle();

    resetStockCardCache(); // simulates a page reload: memory gone, IndexedDB kept
    const cards = useStockCards(page("AAPL"));
    await settle();
    expect(fetchStocks).toHaveBeenCalledTimes(1);
    expect(names(cards.pageCards.value)).toEqual(["AAPL v1"]);
  });

  it("still works when IndexedDB is unavailable", async () => {
    // @ts-expect-error -- simulating a browser without IndexedDB
    delete globalThis.indexedDB;
    resetPersistentCacheConnection();

    const cards = useStockCards(page("AAPL"));
    await settle();
    expect(names(cards.pageCards.value)).toEqual(["AAPL v1"]);
  });
});
