import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import type { Router } from "vue-router";
import WatchlistsView from "../WatchlistsView.vue";
import { routerAt } from "../../__tests__/testRouter";
import Pagination from "../../components/Pagination.vue";
import SymbolPicker from "../../components/SymbolPicker.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import type { StockCard, Watchlist } from "../../types";

const api = vi.hoisted(() => ({
  fetchWatchlists: vi.fn(),
  createWatchlist: vi.fn(),
  renameWatchlist: vi.fn(),
  deleteWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
  fetchTickers: vi.fn(),
  fetchEtfs: vi.fn(),
  fetchStocks: vi.fn(),
}));
vi.mock("../../api", () =>
  Object.fromEntries(Object.keys(api).map((k) => [k, (...args: unknown[]) => api[k as keyof typeof api](...args)]))
);

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

const TECH: Watchlist = { id: 1, name: "Tech", symbols: ["NVDA", "AAPL"] };
const DIVIDENDS: Watchlist = { id: 2, name: "Dividends", symbols: ["KO"] };

let router: Router;

// Cards render their actions slot, so the remove buttons can be clicked.
const CardStub = {
  props: ["candidate", "showState"],
  template: '<div class="card-stub" :data-symbol="candidate.symbol"><slot name="actions" /></div>',
};

async function mountView() {
  const wrapper = shallowMount(WatchlistsView, {
    global: { plugins: [router], stubs: { CandidateCard: CardStub } },
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountView>>;

const cardSymbols = (wrapper: Wrapper) => wrapper.findAll(".card-stub").map((c) => c.attributes("data-symbol"));
const chipNames = (wrapper: Wrapper) => wrapper.findAll(".chip:not(.new-chip)").map((r) => r.find(".chip-name").text());
const title = (wrapper: Wrapper) => wrapper.find(".title").text();

async function pick(wrapper: Wrapper, symbol: string) {
  wrapper.findComponent(SymbolPicker).vm.$emit("pick", symbol);
  await flushPromises();
}

beforeEach(async () => {
  router = await routerAt();
  resetStockCardCache();
  for (const fn of Object.values(api)) fn.mockReset();
  // Sorted by name, as the server returns them.
  api.fetchWatchlists.mockResolvedValue([DIVIDENDS, TECH]);
  api.fetchTickers.mockResolvedValue([{ symbol: "AAPL", name: "Apple Inc.", sector: null, industry: null }]);
  api.fetchEtfs.mockResolvedValue({ categories: [], etfs: [{ symbol: "SPY", name: "SPDR S&P 500", category: "US Market" }] });
  api.fetchStocks.mockImplementation((symbols: string[]) => Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WatchlistsView", () => {
  it("lists every watchlist as chips and opens the first", async () => {
    const wrapper = await mountView();

    expect(chipNames(wrapper)).toEqual(["Dividends", "Tech"]);
    expect(wrapper.findAll(".chip-count").map((c) => c.text())).toEqual(["1", "2"]);
    expect(wrapper.find(".chip:not(.new-chip).active").text()).toContain("Dividends");
    expect(title(wrapper)).toBe("Dividends");
    expect(wrapper.find(".subtitle").text()).toBe("1 stock");
    expect(cardSymbols(wrapper)).toEqual(["KO"]);
  });

  it("switches lists from the chips, keeping the choice in the URL", async () => {
    const wrapper = await mountView();

    await wrapper.findAll(".chip:not(.new-chip)")[1].trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ list: "1" });
    expect(wrapper.find(".chip:not(.new-chip).active").text()).toContain("Tech");
    expect(title(wrapper)).toBe("Tech");
    expect(wrapper.find(".subtitle").text()).toBe("2 stocks");
    expect(cardSymbols(wrapper)).toEqual(["NVDA", "AAPL"]);
  });

  it("restores the open list from the URL", async () => {
    router = await routerAt({ list: "1" });
    const wrapper = await mountView();
    expect(title(wrapper)).toBe("Tech");
  });

  it("offers tracked tickers and ETFs to add, leaving out what's already on the list", async () => {
    router = await routerAt({ list: "1" });
    const wrapper = await mountView();
    const picker = wrapper.findComponent(SymbolPicker);
    expect(picker.props("options")).toEqual([
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "SPY", name: "SPDR S&P 500" },
    ]);
    expect(picker.props("exclude")).toEqual(["NVDA", "AAPL"]);
  });

  it("leads with creating a list when there are none", async () => {
    api.fetchWatchlists.mockResolvedValue([]);
    api.createWatchlist.mockResolvedValue({ id: 3, name: "Semis", symbols: [] });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Create your first watchlist");
    expect(wrapper.find(".chips").exists()).toBe(false);

    await wrapper.find(".empty-start input").setValue(" Semis ");
    await wrapper.find(".empty-start form").trigger("submit");
    await flushPromises();

    expect(api.createWatchlist).toHaveBeenCalledWith("Semis");
    expect(router.currentRoute.value.query).toEqual({ list: "3" });
    expect(title(wrapper)).toBe("Semis");
    expect(wrapper.find(".empty-list").text()).toContain("Nothing on Semis yet");
  });

  it("creates another list from the chips and opens it", async () => {
    api.createWatchlist.mockResolvedValue({ id: 3, name: "Energy", symbols: [] });
    const wrapper = await mountView();

    await wrapper.find(".new-chip").trigger("click");
    await wrapper.find(".chip-create input").setValue("Energy");
    await wrapper.find(".chip-create").trigger("submit");
    await flushPromises();

    expect(chipNames(wrapper)).toEqual(["Dividends", "Energy", "Tech"]);
    expect(title(wrapper)).toBe("Energy");
    expect(wrapper.find(".chip-create").exists()).toBe(false);
  });

  it("shows why a list couldn't be created", async () => {
    api.createWatchlist.mockRejectedValue(new Error('You already have a watchlist called "Tech"'));
    const wrapper = await mountView();

    await wrapper.find(".new-chip").trigger("click");
    await wrapper.find(".chip-create input").setValue("tech");
    await wrapper.find(".chip-create").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".inline-error").text()).toBe('You already have a watchlist called "Tech"');
    expect(wrapper.find(".chip-create").exists()).toBe(true);
  });

  it("adds a picked stock and charts it", async () => {
    api.addToWatchlist.mockResolvedValue({ ...DIVIDENDS, symbols: ["KO", "PEP"] });
    const wrapper = await mountView();

    await pick(wrapper, "PEP");

    expect(api.addToWatchlist).toHaveBeenCalledWith(2, "PEP");
    expect(cardSymbols(wrapper)).toEqual(["KO", "PEP"]);
    expect(wrapper.find(".subtitle").text()).toBe("2 stocks");
    expect(wrapper.find(".chip:not(.new-chip).active .chip-count").text()).toBe("2");
  });

  it("jumps to the last page when an added stock lands there", async () => {
    const symbols = Array.from({ length: 6 }, (_, i) => `S${i}`);
    api.fetchWatchlists.mockResolvedValue([{ id: 1, name: "Big", symbols }]);
    api.addToWatchlist.mockResolvedValue({ id: 1, name: "Big", symbols: [...symbols, "S6"] });
    const wrapper = await mountView();

    await pick(wrapper, "S6");

    expect(wrapper.findComponent(Pagination).props("page")).toBe(2);
    expect(cardSymbols(wrapper)).toEqual(["S6"]);
  });

  it("shows the server's reason when a stock can't be added", async () => {
    api.addToWatchlist.mockRejectedValue(new Error("ZZZZ isn't a tracked ticker or ETF"));
    const wrapper = await mountView();

    await pick(wrapper, "ZZZZ");

    expect(wrapper.find(".inline-error").text()).toBe("ZZZZ isn't a tracked ticker or ETF");
    expect(cardSymbols(wrapper)).toEqual(["KO"]);
  });

  it("removes a stock from its card, with an undo that puts it back in place", async () => {
    router = await routerAt({ list: "1" });
    api.removeFromWatchlist.mockResolvedValue({ ...TECH, symbols: ["AAPL"] });
    api.addToWatchlist.mockResolvedValue(TECH);
    const wrapper = await mountView();

    await wrapper.find('.card-remove[aria-label="Remove NVDA from Tech"]').trigger("click");
    await flushPromises();
    expect(api.removeFromWatchlist).toHaveBeenCalledWith(1, "NVDA");
    expect(cardSymbols(wrapper)).toEqual(["AAPL"]);
    expect(wrapper.find(".undo-bar").text()).toContain("Removed NVDA");

    await wrapper.find(".undo-btn").trigger("click");
    await flushPromises();
    expect(api.addToWatchlist).toHaveBeenCalledWith(1, "NVDA", 0);
    expect(cardSymbols(wrapper)).toEqual(["NVDA", "AAPL"]);
    expect(wrapper.find(".undo-bar").exists()).toBe(false);
  });

  it("hides the undo after a few seconds", async () => {
    vi.useFakeTimers();
    api.removeFromWatchlist.mockResolvedValue({ ...DIVIDENDS, symbols: [] });
    const wrapper = await mountView();

    await wrapper.find(".card-remove").trigger("click");
    await flushPromises();
    expect(wrapper.find(".undo-bar").exists()).toBe(true);

    vi.advanceTimersByTime(6000);
    await flushPromises();
    expect(wrapper.find(".undo-bar").exists()).toBe(false);
  });

  it("lists stocks that couldn't be charted, so they can still be removed", async () => {
    router = await routerAt({ list: "1" });
    api.fetchStocks.mockResolvedValue({ stocks: [makeCard("AAPL")], warnings: [] });
    api.removeFromWatchlist.mockResolvedValue({ ...TECH, symbols: ["AAPL"] });
    const wrapper = await mountView();

    const row = wrapper.find(".uncharted li");
    expect(row.text()).toContain("NVDA");
    expect(row.text()).toContain("No longer tracked");

    await row.find("button").trigger("click");
    await flushPromises();
    expect(api.removeFromWatchlist).toHaveBeenCalledWith(1, "NVDA");
    expect(wrapper.find(".uncharted").exists()).toBe(false);
  });

  it("renames the list by editing its title", async () => {
    api.renameWatchlist.mockResolvedValue({ ...DIVIDENDS, name: "Income" });
    const wrapper = await mountView();

    await wrapper.find(".title").trigger("click");
    const input = wrapper.find(".title-input");
    expect((input.element as HTMLInputElement).value).toBe("Dividends");
    await input.setValue("Income");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(api.renameWatchlist).toHaveBeenCalledWith(2, "Income");
    expect(title(wrapper)).toBe("Income");
    expect(chipNames(wrapper)).toEqual(["Income", "Tech"]);
  });

  it("cancels a rename on Escape", async () => {
    const wrapper = await mountView();

    await wrapper.find(".rename-btn").trigger("click");
    await wrapper.find(".title-input").setValue("Nope");
    await wrapper.find(".title-input").trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(api.renameWatchlist).not.toHaveBeenCalled();
    expect(title(wrapper)).toBe("Dividends");
  });

  it("doesn't save a rename that changes nothing", async () => {
    const wrapper = await mountView();
    await wrapper.find(".rename-btn").trigger("click");
    await wrapper.find(".title-input").trigger("blur");
    expect(api.renameWatchlist).not.toHaveBeenCalled();
  });

  it("deletes the open list after confirming, then opens the next", async () => {
    api.deleteWatchlist.mockResolvedValue(undefined);
    const wrapper = await mountView();

    await wrapper.find(".delete-btn").trigger("click");
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledWith('Delete the watchlist "Dividends" and its 1 stock?');
    expect(api.deleteWatchlist).toHaveBeenCalledWith(2);
    expect(chipNames(wrapper)).toEqual(["Tech"]);
    expect(title(wrapper)).toBe("Tech");
  });

  it("keeps the list when deletion isn't confirmed", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const wrapper = await mountView();
    await wrapper.find(".delete-btn").trigger("click");
    expect(api.deleteWatchlist).not.toHaveBeenCalled();
  });

  it("pages through long lists", async () => {
    const symbols = Array.from({ length: 8 }, (_, i) => `S${i}`);
    api.fetchWatchlists.mockResolvedValue([{ id: 1, name: "Big", symbols }]);
    const wrapper = await mountView();

    expect(cardSymbols(wrapper)).toEqual(symbols.slice(0, 6));
    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["S6", "S7"]);
  });

  it("shows a retry when loading fails", async () => {
    api.fetchWatchlists.mockRejectedValueOnce(new Error("boom"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(title(wrapper)).toBe("Dividends");
  });
});
