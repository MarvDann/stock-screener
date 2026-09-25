import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import HomeView from "../HomeView.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import { resetCachedResources } from "../../composables/useCachedResource";
import type { OverviewResponse, SectorRotationResponse, StockCard } from "../../types";

const fetchOverview = vi.fn();
const fetchSectorRotation = vi.fn();
const fetchEtfs = vi.fn();
const fetchStocks = vi.fn();
vi.mock("../../api", () => ({
  fetchOverview: (...args: unknown[]) => fetchOverview(...args),
  fetchSectorRotation: (...args: unknown[]) => fetchSectorRotation(...args),
  fetchEtfs: (...args: unknown[]) => fetchEtfs(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
}));

function bar(close: number) {
  return { date: "2026-09-25", open: close, high: close, low: close, close, volume: 1 };
}

/** An index card whose last two closes are `prev` then `last`. */
function indexCard(symbol: string, prev: number, last: number, currency = "USD"): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency, bars: [bar(prev), bar(last)], sma50Series: [], sma150Series: [] };
}

function makeOverview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
  return {
    asOf: "2026-09-25",
    tracked: 644,
    breadth: { total: 640, advancers: 420, decliners: 200, unchanged: 20, aboveSma50: 400 },
    gainers: [{ symbol: "NVDA", name: "Nvidia", close: 190.5, changePct: 6.25, currency: "USD" }],
    losers: [{ symbol: "SHEL.L", name: "Shell", close: 36.11, changePct: -3.4, currency: "GBP" }],
    breakouts: {
      triggeredCount: 12,
      approachingCount: 34,
      top: [
        {
          symbol: "AAPL",
          name: "Apple",
          state: "triggered",
          currency: "USD",
          details: { close: 250, sma50: 240, pctBelowSma50: -4, rangeContractionPct: 3, volumeRatio: 2.8, daysSinceCross: 1 },
        },
      ],
    },
    warnings: [],
    ...overrides,
  };
}

const ROTATION: SectorRotationResponse = {
  warnings: [],
  results: ["Technology", "Industrials", "Financials", "Energy", "Utilities", "Real Estate"].map((sectorName, i) => ({
    sectorSymbol: `X${i}`,
    sectorName,
    mansfieldRs: 3 - i * 1.2,
    moneyFlowTrend: "neutral",
    capitalFlow: "neutral",
    rank: i + 1,
  })),
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: HomeView },
    { path: "/stock/:symbol", name: "stock-detail", component: { template: "<div />" } },
    { path: "/:other(.*)", component: { template: "<div />" } },
  ],
});

async function mountView() {
  const wrapper = mount(HomeView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  resetStockCardCache();
  resetCachedResources();
  fetchOverview.mockReset().mockResolvedValue(makeOverview());
  fetchSectorRotation.mockReset().mockResolvedValue(ROTATION);
  fetchEtfs.mockReset().mockResolvedValue({ categories: [], etfs: Array.from({ length: 58 }, (_, i) => ({ symbol: `E${i}`, name: "", category: "" })) });
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({
      stocks: symbols.map((s) => (s === "SPY" ? indexCard("SPY", 100, 100.42) : indexCard(s, 50, 49, s.endsWith(".L") ? "GBP" : "USD"))),
      warnings: [],
    })
  );
});

describe("HomeView", () => {
  it("summarises the session in the hero", async () => {
    const wrapper = await mountView();
    expect(wrapper.find(".headline").text()).toBe("Broad gains across the market");
    const facts = wrapper.findAll(".fact").map((f) => f.text());
    expect(facts).toEqual([
      "S&P 500 +0.42%",
      "420 of 640 stocks higher",
      "12 breakouts triggered",
      "Technology leads sector rotation",
    ]);
  });

  it.each([
    [200, "Broad selling across the market"],
    [320, "A mixed session for stocks"],
  ])("picks the headline from breadth (%i of 640 up)", async (advancers, headline) => {
    fetchOverview.mockResolvedValue(makeOverview({ breadth: { total: 640, advancers, decliners: 640 - advancers, unchanged: 0, aboveSma50: 0 } }));
    const wrapper = await mountView();
    expect(wrapper.find(".headline").text()).toBe(headline);
  });

  it("shows a pulse tile per index with price, day change and currency", async () => {
    const wrapper = await mountView();
    expect(fetchStocks).toHaveBeenCalledWith(["SPY", "QQQ", "IWM", "DIA", "VWRP.L", "ISF.L"]);
    const tiles = wrapper.findAll(".tile");
    expect(tiles).toHaveLength(6);
    expect(tiles[0].find(".tile-label").text()).toBe("S&P 500");
    expect(tiles[0].find(".price").text()).toBe("$100.42");
    expect(tiles[0].find(".change").text()).toBe("+0.42%");
    expect(tiles[0].find(".change").classes()).toContain("up");
    expect(tiles[5].find(".price").text()).toBe("£49.00");
    expect(tiles[5].find(".change").classes()).toContain("down");
    expect(tiles[0].attributes("href")).toBe("/stock/SPY");
  });

  it("shows breadth and the share above the 50-day SMA", async () => {
    const wrapper = await mountView();
    expect(wrapper.find(".breadth-legend").text()).toContain("420 advancing");
    expect(wrapper.find(".breadth-legend").text()).toContain("200 declining");
    expect(wrapper.find(".meter-head b").text()).toBe("62.5%");
  });

  it("lists the top three and bottom three sectors", async () => {
    const wrapper = await mountView();
    const names = wrapper.findAll(".rs-name").map((n) => n.text());
    expect(names).toEqual(["Technology", "Industrials", "Financials", "Energy", "Utilities", "Real Estate"]);
  });

  it("lists movers and breakouts, each linking to the stock", async () => {
    const wrapper = await mountView();
    const rows = wrapper.findAll(".mover");
    expect(rows.map((r) => r.find(".mover-symbol").text())).toEqual(["NVDA", "SHEL.L", "AAPL"]);
    expect(rows[0].find(".pill").text()).toBe("+6.3%");
    expect(rows[1].find(".mover-price").text()).toBe("£36.11");
    expect(rows[2].find(".pill").text()).toBe("2.8× vol");
    expect(rows[2].attributes("href")).toBe("/stock/AAPL");
    expect(wrapper.findAll(".stat-num").map((s) => s.text())).toEqual(["12", "34"]);
  });

  it("uses live counts in the explore tiles", async () => {
    const wrapper = await mountView();
    const descs = wrapper.findAll(".explore-desc").map((d) => d.text());
    expect(descs[0]).toContain("644 stocks");
    expect(descs[1]).toContain("58 funds");
  });

  it("shows placeholders and a scanning note while the first scan runs", async () => {
    fetchOverview.mockReturnValue(new Promise(() => {}));
    const wrapper = await mountView();
    expect(wrapper.find(".headline").text()).toBe("Your market at a glance");
    expect(wrapper.text()).toContain("the first scan takes about a minute");
    expect(wrapper.findAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows an inline retry when the overview fails", async () => {
    fetchOverview.mockRejectedValueOnce(new Error("provider down"));
    const wrapper = await mountView();
    expect(wrapper.find(".panel-error").text()).toContain("provider down");

    await wrapper.find(".panel-error .link-btn").trigger("click");
    await flushPromises();
    expect(wrapper.find(".breadth-legend").exists()).toBe(true);
  });

  it("refreshes everything when Refresh is clicked", async () => {
    const wrapper = await mountView();
    await wrapper.find(".hero .btn-primary").trigger("click");
    await flushPromises();
    expect(fetchOverview).toHaveBeenCalledTimes(2);
    expect(fetchSectorRotation).toHaveBeenCalledTimes(2);
    expect(fetchStocks).toHaveBeenCalledTimes(2);
  });
});
