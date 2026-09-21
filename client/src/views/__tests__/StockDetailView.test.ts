import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import StockDetailView from "../StockDetailView.vue";
import EpsChart from "../../components/EpsChart.vue";
import type { StockDetail } from "../../types";

const fetchStockDetail = vi.fn();
vi.mock("../../api", () => ({
  fetchStockDetail: (...args: unknown[]) => fetchStockDetail(...args),
}));

function makeStockDetail(overrides: Partial<StockDetail> = {}): StockDetail {
  return {
    symbol: "AAPL",
    name: "Apple Inc.",
    bars: [],
    sma50Series: [190],
    sma150Series: [180],
    details: {
      close: 190.5,
      sma50: 180,
      pctBelowSma50: -5.8,
      rangeContractionPct: 4.2,
      volumeRatio: 2.3,
      daysSinceCross: 3,
    },
    financials: {
      grossMargin: 0.4235,
      operatingMargin: 0.301,
      freeCashflow: 1_200_000_000,
      debtToEquity: 0.48,
      trailingPE: 28.41,
    },
    epsHistory: [1.1, 1.3, -0.2, 1.5],
    ...overrides,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/breakout", component: { template: "<div />" } },
    { path: "/stock/:symbol", component: { template: "<div />" } },
  ],
});

async function mountView() {
  await router.push("/stock/AAPL");
  await router.isReady();
  const wrapper = shallowMount(StockDetailView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

function statValue(wrapper: VueWrapper, label: string): string | undefined {
  const card = wrapper
    .findAll(".stat-card")
    .find((c) => c.find(".stat-label").text() === label);
  return card?.find(".stat-value").text();
}

beforeEach(() => {
  fetchStockDetail.mockReset();
});

describe("StockDetailView financial cards", () => {
  it("shows Gross Margin and Operating Margin as percentages rounded to 2 decimal places", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Gross Margin")).toBe("42.35%");
    expect(statValue(wrapper, "Operating Margin")).toBe("30.10%");
  });

  it("abbreviates Free Cash Flow", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Free Cash Flow")).toBe("$1.2B");
  });

  it("shows Debt / Equity as a fraction", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Debt / Equity")).toBe("0.48");
  });

  it("shows the trailing P/E ratio", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Trailing P/E Ratio")).toBe("28.41");
  });

  it("does not render financial stat cards when financials are unavailable", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ financials: null }));
    const wrapper = await mountView();

    expect(statValue(wrapper, "Gross Margin")).toBeUndefined();
    expect(statValue(wrapper, "Operating Margin")).toBeUndefined();
    expect(statValue(wrapper, "Free Cash Flow")).toBeUndefined();
    expect(statValue(wrapper, "Debt / Equity")).toBeUndefined();
    expect(statValue(wrapper, "Trailing P/E Ratio")).toBeUndefined();
  });

  it("removes the Days Since Cross stat card", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Days Since Cross")).toBeUndefined();
    expect(wrapper.text()).not.toContain("Days Since Cross");
  });
});

describe("StockDetailView EPS chart", () => {
  it("passes the trailing 4 quarters of EPS history to the chart in chronological order", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ epsHistory: [1.1, 1.3, -0.2, 1.5] }));
    const wrapper = await mountView();

    expect(wrapper.findComponent(EpsChart).props("values")).toEqual([1.1, 1.3, -0.2, 1.5]);
  });

  it("still renders the EPS chart when other financial data is unavailable", async () => {
    fetchStockDetail.mockResolvedValue(
      makeStockDetail({ financials: null, epsHistory: [0.1, 0.2, 0.3, 0.4] })
    );
    const wrapper = await mountView();

    expect(wrapper.findComponent(EpsChart).exists()).toBe(true);
    expect(wrapper.findComponent(EpsChart).props("values")).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("does not render an EPS chart card when there is no EPS history", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ epsHistory: [] }));
    const wrapper = await mountView();

    expect(wrapper.findComponent(EpsChart).exists()).toBe(false);
  });
});
