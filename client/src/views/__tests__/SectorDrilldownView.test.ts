import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import SectorDrilldownView from "../SectorDrilldownView.vue";
import CandidateCard from "../../components/CandidateCard.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import type { SectorStatsResponse, StockCard, Ticker } from "../../types";
import { resetCachedResources } from "../../composables/useCachedResource";

const fetchTickers = vi.fn();
const fetchStocks = vi.fn();
const fetchSectorStats = vi.fn();
vi.mock("../../api", () => ({
  fetchTickers: (...args: unknown[]) => fetchTickers(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
  fetchSectorStats: (...args: unknown[]) => fetchSectorStats(...args),
}));

function groupStats(advancers: number, decliners: number, avgChangePct: number, aboveSma50 = 0) {
  return { total: advancers + decliners, advancers, decliners, unchanged: 0, aboveSma50, avgChangePct };
}

const STATS: SectorStatsResponse = {
  asOf: "2026-09-25",
  sectors: [
    { sector: "Technology", ...groupStats(2, 1, 0.85, 3) },
    { sector: "Financial Services", ...groupStats(0, 1, -1.2) },
  ],
  industries: [{ sector: "Technology", industry: "Semiconductors", ...groupStats(2, 0, 2.5, 2) }],
};

function ticker(symbol: string, sector: string | null, industry: string | null): Ticker {
  return { symbol, name: symbol, sector, industry };
}

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

const TICKERS: Ticker[] = [
  ticker("AAPL", "Technology", "Consumer Electronics"),
  ticker("AMD", "Technology", "Semiconductors"),
  ticker("NVDA", "Technology", "Semiconductors"),
  ticker("JPM", "Financial Services", "Banks - Diversified"),
  ticker("SPY", "", ""),
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/sector-drilldown", component: SectorDrilldownView },
      { path: "/stock/:symbol", name: "stock-detail", component: { template: "<div />" } },
    ],
  });
}

async function mountAt(query: Record<string, string> = {}) {
  const router = makeRouter();
  await router.push({ path: "/sector-drilldown", query });
  const wrapper = mount(SectorDrilldownView, {
    global: { plugins: [router], stubs: { CandidateCard: true, Pagination: true, WarningsBanner: true } },
  });
  await flushPromises();
  return { wrapper, router };
}

const tileNames = (wrapper: Awaited<ReturnType<typeof mountAt>>["wrapper"]) =>
  wrapper.findAll(".tile-name").map((t) => t.text());

beforeEach(() => {
  resetStockCardCache();
  resetCachedResources();
  fetchSectorStats.mockReset().mockResolvedValue(STATS);
  fetchTickers.mockReset().mockResolvedValue(TICKERS);
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] })
  );
});

describe("SectorDrilldownView", () => {
  it("lists sectors largest first, with Uncategorized last", async () => {
    const { wrapper } = await mountAt();

    expect(tileNames(wrapper)).toEqual(["Technology", "Financial Services", "Uncategorized"]);
    expect(wrapper.find(".tile-meta").text()).toBe("3 stocks · 2 sub-sectors");
    // Only the sector ETFs are fetched, for the trend lines.
    expect(fetchStocks).toHaveBeenCalledWith(["XLK", "XLF"]);
  });

  it("drills into a sector's sub-sectors when a sector is clicked", async () => {
    const { wrapper, router } = await mountAt();

    await wrapper.findAll(".tile")[0].trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ sector: "Technology" });
    expect(tileNames(wrapper)).toEqual(["Semiconductors", "Consumer Electronics"]);
    expect(wrapper.find(".tile-meta").text()).toBe("2 stocks");
    expect(wrapper.find(".industry-tile").findAll(".chip").map((c) => c.text())).toEqual(["AMD", "NVDA"]);
    expect(wrapper.find(".breadcrumb").text()).toBe("All sectors/Technology");
  });

  it("shows chart cards for the stocks in a sub-sector", async () => {
    const { wrapper } = await mountAt({ sector: "Technology", industry: "Semiconductors" });

    expect(fetchStocks).toHaveBeenCalledWith(["AMD", "NVDA"]);
    const symbols = wrapper.findAllComponents(CandidateCard).map((c) => c.props("candidate").symbol);
    expect(symbols).toEqual(["AMD", "NVDA"]);
    expect(wrapper.find(".breadcrumb").text()).toBe("All sectors/Technology/Semiconductors");
  });

  it("links the breadcrumb back up a level", async () => {
    const { wrapper, router } = await mountAt({ sector: "Technology", industry: "Semiconductors" });

    await wrapper.findAll(".breadcrumb a")[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ sector: "Technology" });

    await wrapper.find(".breadcrumb a").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
    expect(tileNames(wrapper)).toContain("Financial Services");
  });

  it("groups tickers without a sector under Uncategorized", async () => {
    const { wrapper } = await mountAt({ sector: "Uncategorized", industry: "Uncategorized" });
    expect(fetchStocks).toHaveBeenCalledWith(["SPY"]);
    expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(1);
  });

  it("notes tickers that haven't been categorized yet", async () => {
    fetchTickers.mockResolvedValue([...TICKERS, ticker("NEW", null, null)]);
    const { wrapper } = await mountAt();
    expect(wrapper.find(".pending").text()).toContain("1 ticker still being categorized");
  });

  it("says so when a sector from the URL has no stocks", async () => {
    const { wrapper } = await mountAt({ sector: "Nonexistent" });
    expect(wrapper.text()).toContain("No tracked stocks in Nonexistent.");
  });

  it("shows a retry when loading tickers fails", async () => {
    fetchTickers.mockRejectedValueOnce(new Error("boom"));
    const { wrapper } = await mountAt();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(tileNames(wrapper)).toHaveLength(3);
  });

  it("shows each sector's icon, average move and breadth once stats arrive", async () => {
    const { wrapper } = await mountAt();
    const tech = wrapper.findAll(".sector-tile")[0];
    expect(tech.find(".badge svg").exists()).toBe(true);
    expect(tech.find(".move").text()).toBe("+0.85%");
    expect(tech.find(".move").classes()).toContain("up");
    expect(tech.find(".stat-line").text()).toContain("2 up · 1 down");
    expect(tech.find(".stat-line").text()).toContain("100% above 50-day");
    expect(wrapper.findAll(".sector-tile")[1].find(".move").text()).toBe("-1.20%");
  });

  it("shows a placeholder for stats until they load", async () => {
    fetchSectorStats.mockReturnValue(new Promise(() => {}));
    const { wrapper } = await mountAt();
    expect(wrapper.find(".sector-tile .skeleton").exists()).toBe(true);
    expect(wrapper.find(".sector-tile .move").exists()).toBe(false);
  });

  it("shows a sector banner with its stats and a link to the sector ETF chart", async () => {
    const { wrapper } = await mountAt({ sector: "Technology" });
    const banner = wrapper.find(".sector-banner");
    expect(banner.find("h3").text()).toBe("Technology");
    expect(banner.find(".banner-stats").text()).toContain("+0.85% avg today");
    expect(banner.find(".banner-link").attributes("href")).toBe("/stock/XLK");
    expect(wrapper.find(".industry-tile .move").text()).toBe("+2.50%");
  });
});
