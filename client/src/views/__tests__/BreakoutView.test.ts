import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import BreakoutView from "../BreakoutView.vue";
import type { Router } from "vue-router";
import { routerAt } from "../../__tests__/testRouter";
import CandidateCard from "../../components/CandidateCard.vue";
import Pagination from "../../components/Pagination.vue";
import WarningsBanner from "../../components/WarningsBanner.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import { resetCachedResources } from "../../composables/useCachedResource";
import type { BreakoutCandidate, BreakoutResponse, StockCard } from "../../types";

const fetchBreakout = vi.fn();
const fetchStocks = vi.fn();
vi.mock("../../api", () => ({
  fetchBreakout: (...args: unknown[]) => fetchBreakout(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
}));

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: "triggered", details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

function makeCandidate(symbol: string, name: string): BreakoutCandidate {
  return {
    symbol,
    name,
    state: "triggered",
    details: {
      close: 100,
      sma50: 90,
      pctBelowSma50: -5,
      rangeContractionPct: 3,
      volumeRatio: 1.5,
      daysSinceCross: 1,
    },
    currency: "USD",
  };
}

function makeResponse(overrides: Partial<BreakoutResponse> = {}): BreakoutResponse {
  return { triggered: [], approaching: [], warnings: [], ...overrides };
}

let router: Router;

beforeEach(async () => {
  router = await routerAt();
  fetchBreakout.mockReset();
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] })
  );
  resetStockCardCache();
  resetCachedResources();
});

describe("BreakoutView", () => {
  it("loads candidates on mount and renders them grouped by state", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: [makeCandidate("AAPL", "Apple Inc.")],
        approaching: [makeCandidate("MSFT", "Microsoft")],
      })
    );

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(fetchBreakout).toHaveBeenCalledTimes(1);
    const tabs = wrapper.findAll(".tab");
    expect(tabs[0].text()).toContain("Triggered");
    expect(tabs[0].text()).toContain("1");
    expect(tabs[1].text()).toContain("Approaching");
    expect(tabs[1].text()).toContain("1");

    // defaults to the "triggered" tab since there are triggered candidates
    expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(1);
    expect(wrapper.findComponent(CandidateCard).props("candidate").symbol).toBe("AAPL");

    await tabs[1].trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(CandidateCard).props("candidate").symbol).toBe("MSFT");
  });

  it("shows an empty message when there are no candidates", async () => {
    fetchBreakout.mockResolvedValue(makeResponse());

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    // defaults to the "approaching" tab when nothing is triggered
    expect(wrapper.text()).toContain("No candidates approaching a breakout right now.");

    await wrapper.findAll(".tab")[0].trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No triggered breakouts right now.");
  });

  it("forwards warnings to the WarningsBanner", async () => {
    fetchBreakout.mockResolvedValue(makeResponse({ warnings: ["AAPL: skipped"] }));

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.findComponent(WarningsBanner).props("warnings")).toEqual(["AAPL: skipped"]);
  });

  it("shows a retry button on failure, and reloads on retry", async () => {
    fetchBreakout.mockRejectedValueOnce(new Error("boom"));
    fetchBreakout.mockResolvedValueOnce(makeResponse());

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".error-state").text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();

    expect(fetchBreakout).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".error-state").exists()).toBe(false);
  });

  it("filters candidates by symbol or name as the user types", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: [makeCandidate("AAPL", "Apple Inc."), makeCandidate("MSFT", "Microsoft")],
      })
    );

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".search").setValue("apple");
    await flushPromises();

    const tabs = wrapper.findAll(".tab");
    expect(tabs[0].text()).toContain("Triggered");
    expect(tabs[0].text()).toContain("1");
    expect(wrapper.findComponent(CandidateCard).props("candidate").symbol).toBe("AAPL");
  });

  it("shows a no-matches message when the search filters everything out", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({ triggered: [makeCandidate("AAPL", "Apple Inc.")] })
    );

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".search").setValue("zzz");
    await flushPromises();

    expect(wrapper.text()).toContain("No matches.");
  });

  it("shows 6 candidates per page", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: Array.from({ length: 14 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)),
      })
    );
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(6);
    expect(wrapper.findComponent(Pagination).props("totalPages")).toBe(3);
  });

  it("resets pagination to page 1 when the search text changes", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: Array.from({ length: 25 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)),
      })
    );

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(2);

    await wrapper.find(".search").setValue("sym1");
    await flushPromises();

    expect(wrapper.findComponent(Pagination).props("page")).toBe(1);
  });

  it("fetches charts only for the visible page, and again when paging", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({ triggered: Array.from({ length: 8 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)) })
    );
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(fetchStocks).toHaveBeenCalledTimes(1);
    expect(fetchStocks).toHaveBeenLastCalledWith(["SYM0", "SYM1", "SYM2", "SYM3", "SYM4", "SYM5"]);

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(fetchStocks).toHaveBeenLastCalledWith(["SYM6", "SYM7"]);

    // Paging back reuses the cached cards.
    await wrapper.findComponent(Pagination).vm.$emit("update:page", 1);
    await flushPromises();
    expect(fetchStocks).toHaveBeenCalledTimes(2);
    expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(6);
  });

  it("keeps showing results and says so when a rescan fails", async () => {
    fetchBreakout.mockResolvedValueOnce(makeResponse({ triggered: [makeCandidate("AAPL", "Apple Inc.")] }));
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    fetchBreakout.mockRejectedValueOnce(new Error("rate limited"));
    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();

    expect(wrapper.find(".error-state").text()).toContain("rate limited");
    expect(wrapper.findComponent(CandidateCard).props("candidate").symbol).toBe("AAPL");
  });

  it("refetches the visible charts when Refresh is clicked", async () => {
    fetchBreakout.mockResolvedValue(makeResponse({ triggered: [makeCandidate("AAPL", "Apple Inc.")] }));
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();
    expect(fetchStocks).toHaveBeenCalledTimes(1);

    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();
    expect(fetchBreakout).toHaveBeenCalledTimes(2);
    expect(fetchStocks).toHaveBeenCalledTimes(2);
  });

  it("shows the last scan instantly when returning to the page, without rescanning", async () => {
    fetchBreakout.mockResolvedValue(makeResponse({ approaching: [makeCandidate("MSFT", "Microsoft")] }));
    shallowMount(BreakoutView, { global: { plugins: [router] } }).unmount();
    await flushPromises();

    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    expect(wrapper.find(".tab.active").text()).toContain("Approaching");
    await flushPromises();
    expect(fetchBreakout).toHaveBeenCalledTimes(1);
  });

  it("restores its tab, filter and page from the URL", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: [makeCandidate("AAPL", "Apple Inc.")],
        approaching: Array.from({ length: 8 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)),
      })
    );
    router = await routerAt({ tab: "approaching", q: "sym", page: "2" });
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".tab.active").text()).toContain("Approaching");
    expect((wrapper.find(".search").element as HTMLInputElement).value).toBe("sym");
    expect(wrapper.findAllComponents(CandidateCard).map((c) => c.props("candidate").symbol)).toEqual(["SYM6", "SYM7"]);
  });

  it("writes the tab to the URL and starts the new tab on page 1", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: Array.from({ length: 8 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)),
        approaching: [makeCandidate("MSFT", "Microsoft")],
      })
    );
    const wrapper = shallowMount(BreakoutView, { global: { plugins: [router] } });
    await flushPromises();
    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ page: "2" });

    await wrapper.findAll(".tab")[1].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ tab: "approaching" });
  });
});
