import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import StockChartsView from "../StockChartsView.vue";
import type { Router } from "vue-router";
import { routerAt } from "../../__tests__/testRouter";
import CandidateCard from "../../components/CandidateCard.vue";
import Pagination from "../../components/Pagination.vue";
import WarningsBanner from "../../components/WarningsBanner.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import type { StockCard, Ticker } from "../../types";

const fetchTickers = vi.fn();
const fetchStocks = vi.fn();
vi.mock("../../api", () => ({
  fetchTickers: (...args: unknown[]) => fetchTickers(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
}));

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

/** Answers fetchStocks with a card for every requested symbol. */
function stocksFor(symbols: string[]) {
  return Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] });
}

const TICKERS: Ticker[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics" },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Technology", industry: "Semiconductors" },
  { symbol: "MSFT", name: "Microsoft", sector: "Technology", industry: "Software - Infrastructure" },
];

const MIXED_SECTORS: Ticker[] = [
  ...TICKERS,
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financial Services", industry: "Banks - Diversified" },
  { symbol: "SPY", name: "SPDR S&P 500", sector: "", industry: "" },
];

async function mountView() {
  const wrapper = shallowMount(StockChartsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

async function typeQuery(wrapper: Awaited<ReturnType<typeof mountView>>, text: string) {
  await wrapper.find("input.search").setValue(text);
  vi.advanceTimersByTime(250);
  await flushPromises();
}

const cardSymbols = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
  wrapper.findAllComponents(CandidateCard).map((c) => c.props("candidate").symbol);

let router: Router;

beforeEach(async () => {
  router = await routerAt();
  vi.useFakeTimers();
  resetStockCardCache();
  fetchTickers.mockReset().mockResolvedValue(TICKERS);
  fetchStocks.mockReset().mockImplementation(stocksFor);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StockChartsView", () => {
  it("lists every tracked ticker before anything is typed", async () => {
    const wrapper = await mountView();

    expect(fetchStocks).toHaveBeenCalledWith(["AAPL", "AMD", "MSFT"]);
    expect(cardSymbols(wrapper)).toEqual(["AAPL", "AMD", "MSFT"]);
    expect(wrapper.find(".match-count").text()).toBe("3 matches");
  });

  it("filters and ranks tracked tickers after the debounce", async () => {
    const wrapper = await mountView();

    await wrapper.find("input.search").setValue("micro");
    await flushPromises();
    expect(cardSymbols(wrapper)).toHaveLength(3); // not yet debounced

    vi.advanceTimersByTime(250);
    await flushPromises();
    // name prefix (Microsoft) outranks a name substring (Advanced Micro Devices)
    expect(cardSymbols(wrapper)).toEqual(["MSFT", "AMD"]);
    expect(wrapper.find(".match-count").text()).toBe("2 matches");
  });

  it("only fetches cards it hasn't already loaded", async () => {
    const wrapper = await mountView();
    fetchStocks.mockClear();

    await typeQuery(wrapper, "a");

    expect(fetchStocks).not.toHaveBeenCalled();
    expect(cardSymbols(wrapper)).toEqual(["AAPL", "AMD"]);
  });

  it("fetches cards one page at a time", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ symbol: `S${i}`, name: `Stock ${i}`, sector: null, industry: null }));
    fetchTickers.mockResolvedValue(many);
    const wrapper = await mountView();

    expect(fetchStocks).toHaveBeenLastCalledWith(["S0", "S1", "S2", "S3", "S4", "S5"]);

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(fetchStocks).toHaveBeenLastCalledWith(["S6", "S7"]);
    expect(cardSymbols(wrapper)).toEqual(["S6", "S7"]);
  });

  it("shows a no-matches message", async () => {
    const wrapper = await mountView();
    await typeQuery(wrapper, "zzz");
    expect(wrapper.text()).toContain("No tracked stocks match.");
  });

  it("forwards fetch warnings to the WarningsBanner", async () => {
    fetchStocks.mockResolvedValue({ stocks: [makeCard("AAPL")], warnings: ["Skipped AMD: fetch failed"] });
    const wrapper = await mountView();
    expect(wrapper.findComponent(WarningsBanner).props("warnings")).toEqual(["Skipped AMD: fetch failed"]);
  });

  it("shows a retry when loading the ticker list fails", async () => {
    fetchTickers.mockRejectedValueOnce(new Error("boom"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["AAPL", "AMD", "MSFT"]);
  });

  it("shows a retry when loading a page of charts fails", async () => {
    fetchStocks.mockRejectedValueOnce(new Error("provider down"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("provider down");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["AAPL", "AMD", "MSFT"]);
  });

  it("lists sectors alphabetically with counts, Uncategorized last", async () => {
    fetchTickers.mockResolvedValue(MIXED_SECTORS);
    const wrapper = await mountView();
    const options = wrapper.findAll(".sector-select option").map((o) => o.text());
    expect(options).toEqual(["All sectors", "Financial Services (1)", "Technology (3)", "Uncategorized (1)"]);
  });

  it("filters to the chosen sector, combined with the search", async () => {
    fetchTickers.mockResolvedValue(MIXED_SECTORS);
    const wrapper = await mountView();

    await wrapper.find(".sector-select").setValue("Technology");
    await vi.runAllTimersAsync();
    expect(cardSymbols(wrapper)).toEqual(["AAPL", "AMD", "MSFT"]);
    expect(wrapper.find(".match-count").text()).toBe("3 matches");

    await typeQuery(wrapper, "micro");
    expect(cardSymbols(wrapper)).toEqual(["MSFT", "AMD"]);

    await wrapper.find(".sector-select").setValue("Uncategorized");
    await vi.runAllTimersAsync();
    expect(wrapper.text()).toContain("No tracked stocks match.");

    await typeQuery(wrapper, "");
    expect(cardSymbols(wrapper)).toEqual(["SPY"]);
  });

  it("goes back to page 1 when the sector changes", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ symbol: `S${i}`, name: `Stock ${i}`, sector: "Energy", industry: "Oil" }));
    fetchTickers.mockResolvedValue(many);
    const wrapper = await mountView();

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await vi.runAllTimersAsync();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(2);

    await wrapper.find(".sector-select").setValue("Energy");
    await vi.runAllTimersAsync();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(1);
  });

  it("restores its filters and page from the URL", async () => {
    fetchTickers.mockResolvedValue([
      ...MIXED_SECTORS,
      ...Array.from({ length: 7 }, (_, i) => ({ symbol: `T${i}`, name: `Tech ${i}`, sector: "Technology", industry: "Software" })),
    ]);
    router = await routerAt({ sector: "Technology", q: "tech", page: "2" });
    const wrapper = await mountView();

    expect((wrapper.find("input.search").element as HTMLInputElement).value).toBe("tech");
    expect((wrapper.find(".sector-select").element as HTMLSelectElement).value).toBe("Technology");
    expect(wrapper.findComponent(Pagination).props("page")).toBe(2);
    expect(cardSymbols(wrapper)).toEqual(["T6"]);
  });

  it("writes its filters to the URL", async () => {
    fetchTickers.mockResolvedValue(MIXED_SECTORS);
    const wrapper = await mountView();
    await wrapper.find(".sector-select").setValue("Technology");
    await typeQuery(wrapper, "micro");
    expect(router.currentRoute.value.query).toEqual({ sector: "Technology", q: "micro" });
  });
});
