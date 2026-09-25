import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import EtfsView from "../EtfsView.vue";
import type { Router } from "vue-router";
import { routerAt } from "../../__tests__/testRouter";
import CandidateCard from "../../components/CandidateCard.vue";
import Pagination from "../../components/Pagination.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import type { Etf, StockCard } from "../../types";

const fetchEtfs = vi.fn();
const fetchStocks = vi.fn();
vi.mock("../../api", () => ({
  fetchEtfs: (...args: unknown[]) => fetchEtfs(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
}));

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

const ETFS: Etf[] = [
  { symbol: "VWRP.L", name: "Vanguard FTSE All-World (Acc)", category: "Global" },
  { symbol: "SPY", name: "SPDR S&P 500", category: "US Market" },
  { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)", category: "Growth & Tech" },
  { symbol: "SMH", name: "VanEck Semiconductor", category: "Growth & Tech" },
  { symbol: "XLK", name: "Technology Select Sector SPDR", category: "US Sectors" },
];
const CATEGORIES = ["Global", "US Market", "Growth & Tech", "US Sectors", "Bonds"];

async function mountView() {
  const wrapper = shallowMount(EtfsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

const cardSymbols = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
  wrapper.findAllComponents(CandidateCard).map((c) => c.props("candidate").symbol);

const chip = (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) =>
  wrapper.findAll(".chip").find((c) => c.text().startsWith(label))!;

let router: Router;

beforeEach(async () => {
  router = await routerAt();
  vi.useFakeTimers();
  resetStockCardCache();
  fetchEtfs.mockReset().mockResolvedValue({ categories: CATEGORIES, etfs: ETFS });
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EtfsView", () => {
  it("shows every ETF in category order with charts for the first page", async () => {
    const wrapper = await mountView();
    expect(cardSymbols(wrapper)).toEqual(["VWRP.L", "SPY", "QQQ", "SMH", "XLK"]);
    expect(fetchStocks).toHaveBeenCalledWith(["VWRP.L", "SPY", "QQQ", "SMH", "XLK"]);
    expect(wrapper.find(".match-count").text()).toBe("5 matches");
  });

  it("shows a chip per category with counts, including empty ones", async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll(".chip").map((c) => c.text())).toEqual([
      "All 5",
      "Global 1",
      "US Market 1",
      "Growth & Tech 2",
      "US Sectors 1",
      "Bonds 0",
    ]);
  });

  it("filters by category, and back to all", async () => {
    const wrapper = await mountView();

    await chip(wrapper, "Growth & Tech").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["QQQ", "SMH"]);
    expect(chip(wrapper, "Growth & Tech").classes()).toContain("active");

    await chip(wrapper, "Bonds").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No ETFs match.");

    await chip(wrapper, "All").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toHaveLength(5);
  });

  it("searches within the chosen category after the debounce", async () => {
    const wrapper = await mountView();
    await chip(wrapper, "Growth & Tech").trigger("click");

    await wrapper.find("input.search").setValue("semi");
    vi.advanceTimersByTime(250);
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["SMH"]);
  });

  it("pages through results and resets to page 1 on a category change", async () => {
    const many: Etf[] = Array.from({ length: 8 }, (_, i) => ({ symbol: `E${i}`, name: `ETF ${i}`, category: "Bonds" }));
    fetchEtfs.mockResolvedValue({ categories: CATEGORIES, etfs: many });
    const wrapper = await mountView();

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(fetchStocks).toHaveBeenLastCalledWith(["E6", "E7"]);

    await chip(wrapper, "Bonds").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(1);
  });

  it("shows a retry when loading the ETF list fails", async () => {
    fetchEtfs.mockRejectedValueOnce(new Error("boom"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toHaveLength(5);
  });

  it("restores its category and search from the URL", async () => {
    router = await routerAt({ category: "Growth & Tech", q: "semi" });
    const wrapper = await mountView();
    expect(chip(wrapper, "Growth & Tech").classes()).toContain("active");
    expect((wrapper.find("input.search").element as HTMLInputElement).value).toBe("semi");
    expect(cardSymbols(wrapper)).toEqual(["SMH"]);
  });

  it("writes the chosen category to the URL", async () => {
    const wrapper = await mountView();
    await chip(wrapper, "Growth & Tech").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ category: "Growth & Tech" });
  });
});
