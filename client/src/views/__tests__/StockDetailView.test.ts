import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, shallowMount, type VueWrapper } from "@vue/test-utils";
import { createRouter, createMemoryHistory, createWebHistory } from "vue-router";
import StockDetailView from "../StockDetailView.vue";
import EpsChart from "../../components/EpsChart.vue";
import PriceChart from "../../components/PriceChart.vue";
import type { StockDetail } from "../../types";

const fetchStockDetail = vi.fn();
const fetchStockChart = vi.fn();
vi.mock("../../api", () => ({
  fetchStockDetail: (...args: unknown[]) => fetchStockDetail(...args),
  fetchStockChart: (...args: unknown[]) => fetchStockChart(...args),
}));

function makeStockDetail(overrides: Partial<StockDetail> = {}): StockDetail {
  return {
    symbol: "AAPL",
    name: "Apple Inc.",
    currency: "USD",
    bars: [],
    sma50Series: [190],
    sma150Series: [180],
    details: {
      close: 190.5,
      sma50: 180,
      pattern: "cup-handle",
      pivot: 187.68,
      pctFromPivot: 1.5,
      baseDepthPct: 22,
      baseLengthWeeks: 12,
      contractions: [22, 9, 3],
      volumeRatio: 2.3,
      volumeConfirmed: true,
      extended: false,
      daysSinceBreakout: 3,
      rsRating: 91,
      rsLineNewHigh: true,
    },
    financials: {
      grossMargin: 0.4235,
      operatingMargin: 0.301,
      freeCashflow: 1_200_000_000,
      debtToEquity: 0.48,
      trailingPE: 28.41,
      financialCurrency: "USD",
    },
    epsHistory: [1.1, 1.3, -0.2, 1.5],
    profile: {
      summary: "Apple Inc. designs, manufactures, and markets smartphones.",
      sector: "Technology",
      industry: "Consumer Electronics",
      headquarters: "Cupertino, CA, United States",
      employees: 150000,
      website: "https://www.apple.com",
    },
    news: [
      {
        title: "Apple (AAPL) Plans a Health App Overhaul",
        publisher: "Insider Monkey",
        link: "https://finance.yahoo.com/news/apple-health",
        publishedAt: "2026-09-26T10:00:00.000Z",
      },
    ],
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
  fetchStockChart.mockReset();
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

  it("shows Free Cash Flow in the company's reporting currency, not its trading currency", async () => {
    fetchStockDetail.mockResolvedValue(
      makeStockDetail({ currency: "GBP", financials: { ...makeStockDetail().financials!, financialCurrency: "EUR" } })
    );
    const wrapper = await mountView();
    expect(statValue(wrapper, "Free Cash Flow")).toBe("€1.2B");
  });

  it("shows prices with the trading currency's symbol", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ currency: "GBP" }));
    const wrapper = await mountView();
    expect(wrapper.find(".price").text()).toBe("£190.50");
    expect(statValue(wrapper, "Close")).toBe("£190.50");
    expect(statValue(wrapper, "50-day SMA")).toBe("£180.00");
    expect(statValue(wrapper, "Pivot")).toBe("£187.68");
  });

  it("shows the base, its contractions and relative strength", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(statValue(wrapper, "Pattern")).toBe("Cup with handle");
    expect(statValue(wrapper, "% vs Pivot")).toBe("1.50%");
    expect(statValue(wrapper, "Base")).toBe("22% deep · 12 wks");
    expect(statValue(wrapper, "Contractions")).toBe("3T 22/9/3%");
    expect(statValue(wrapper, "RS Rating")).toBe("91");
    expect(statValue(wrapper, "RS Line")).toBe("New high");
  });

  it("falls back to the last bar's close in the header when the stock isn't a breakout candidate", async () => {
    fetchStockDetail.mockResolvedValue(
      makeStockDetail({
        details: null,
        bars: [{ date: "2024-01-02", open: 1, high: 1, low: 1, close: 42.5, volume: 1 }],
      })
    );
    const wrapper = await mountView();
    expect(wrapper.find(".price").text()).toBe("$42.50");
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

  it("shows the financial cards when the stock isn't a breakout candidate", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ details: null }));
    const wrapper = await mountView();

    expect(statValue(wrapper, "Gross Margin")).toBe("42.35%");
    expect(statValue(wrapper, "Trailing P/E Ratio")).toBe("28.41");
    expect(wrapper.findComponent(EpsChart).exists()).toBe(true);
    expect(statValue(wrapper, "Close")).toBeUndefined();
    expect(statValue(wrapper, "Volume Ratio")).toBeUndefined();
  });

  it("has no stats grid when there's neither screen data nor financials", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ details: null, financials: null, epsHistory: [] }));
    const wrapper = await mountView();
    expect(wrapper.find(".stats-grid").exists()).toBe(false);
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

describe("StockDetailView company overview", () => {
  function fact(wrapper: VueWrapper, label: string): string | undefined {
    return wrapper
      .findAll(".fact")
      .find((f) => f.find("dt").text() === label)
      ?.find("dd")
      .text();
  }

  it("shows the business summary and company facts", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    expect(wrapper.find(".summary").text()).toBe("Apple Inc. designs, manufactures, and markets smartphones.");
    expect(fact(wrapper, "Sector")).toBe("Technology");
    expect(fact(wrapper, "Industry")).toBe("Consumer Electronics");
    expect(fact(wrapper, "Headquarters")).toBe("Cupertino, CA, United States");
    expect(fact(wrapper, "Employees")).toBe("150,000");
    expect(fact(wrapper, "Website")).toBe("apple.com");
    expect(wrapper.find(".fact a").attributes("href")).toBe("https://www.apple.com/");
  });

  it("shows the overview even when the stock isn't a breakout candidate", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ details: null }));
    const wrapper = await mountView();
    expect(wrapper.find(".about").exists()).toBe(true);
    expect(wrapper.find(".news").exists()).toBe(true);
  });

  it("skips facts Yahoo doesn't have and non-web links", async () => {
    const profile = { ...makeStockDetail().profile!, employees: null, website: "javascript:alert(1)" };
    fetchStockDetail.mockResolvedValue(makeStockDetail({ profile }));
    const wrapper = await mountView();
    expect(fact(wrapper, "Employees")).toBeUndefined();
    expect(fact(wrapper, "Website")).toBeUndefined();
  });

  it("collapses a long summary behind Show more", async () => {
    const profile = { ...makeStockDetail().profile!, summary: "Long. ".repeat(100) };
    fetchStockDetail.mockResolvedValue(makeStockDetail({ profile }));
    const wrapper = await mountView();

    expect(wrapper.find(".summary").classes()).toContain("clamped");
    await wrapper.find(".more-btn").trigger("click");
    expect(wrapper.find(".summary").classes()).not.toContain("clamped");
    expect(wrapper.find(".more-btn").text()).toBe("Show less");
  });

  it("has no Show more button for a short summary", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();
    expect(wrapper.find(".more-btn").exists()).toBe(false);
  });

  it("lists news headlines linking out in a new tab", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
    const wrapper = await mountView();

    const link = wrapper.find(".news-title");
    expect(link.text()).toBe("Apple (AAPL) Plans a Health App Overhaul");
    expect(link.attributes("href")).toBe("https://finance.yahoo.com/news/apple-health");
    expect(link.attributes("target")).toBe("_blank");
    expect(wrapper.find(".news-meta").text()).toContain("Insider Monkey");
  });

  it("hides the whole overview when there's no profile or news, e.g. for an ETF", async () => {
    fetchStockDetail.mockResolvedValue(makeStockDetail({ profile: null, news: [] }));
    const wrapper = await mountView();
    expect(wrapper.find(".overview").exists()).toBe(false);
  });
});

describe("StockDetailView back button", () => {
  const blank = { template: "<div />" };

  /** A real browser-history router, starting from a clean history entry at `startAt`. */
  async function makeWebRouter(startAt: string) {
    window.history.replaceState(null, "", startAt);
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: "/", component: blank, meta: { title: "Home" } },
        { path: "/login", component: blank },
        { path: "/breakout", component: blank, meta: { title: "Breakout" } },
        { path: "/sector-drilldown", component: blank, meta: { title: "Sector Drilldown" } },
        { path: "/etfs", component: blank, meta: { title: "ETFs" } },
        { path: "/stock/:symbol", component: blank },
      ],
    });
    await router.push(startAt);
    await router.isReady();
    return router;
  }

  async function mountWith(webRouter: ReturnType<typeof createRouter>) {
    const wrapper = shallowMount(StockDetailView, { global: { plugins: [webRouter] } });
    await flushPromises();
    return wrapper;
  }

  beforeEach(() => {
    fetchStockDetail.mockResolvedValue(makeStockDetail());
  });

  it("names the page you came from and returns to it with its filters", async () => {
    const webRouter = await makeWebRouter("/sector-drilldown?sector=Technology&industry=Semiconductors");
    await webRouter.push("/stock/AAPL");
    const wrapper = await mountWith(webRouter);

    expect(wrapper.find(".back-btn").text()).toBe("← Sector Drilldown");

    await wrapper.find(".back-btn").trigger("click");
    await vi.waitFor(() =>
      expect(webRouter.currentRoute.value.fullPath).toBe("/sector-drilldown?sector=Technology&industry=Semiconductors")
    );
  });

  it("works for any titled page, e.g. ETFs", async () => {
    const webRouter = await makeWebRouter("/etfs");
    await webRouter.push("/stock/SPY");
    const wrapper = await mountWith(webRouter);
    expect(wrapper.find(".back-btn").text()).toBe("← ETFs");
  });

  it("falls back to Home when opened directly", async () => {
    const webRouter = await makeWebRouter("/stock/AAPL");
    const wrapper = await mountWith(webRouter);

    expect(wrapper.find(".back-btn").text()).toBe("← Home");
    await wrapper.find(".back-btn").trigger("click");
    await flushPromises();
    expect(webRouter.currentRoute.value.fullPath).toBe("/");
  });

  it("falls back to Home when the previous page isn't a titled page", async () => {
    const webRouter = await makeWebRouter("/login");
    await webRouter.push("/stock/AAPL");
    const wrapper = await mountWith(webRouter);
    expect(wrapper.find(".back-btn").text()).toBe("← Home");
  });
});

describe("StockDetailView chart timeframes", () => {
  const dailyBar = { date: "2026-11-20T00:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 };
  const weeklyBar = { date: "2026-11-16T00:00:00.000Z", open: 1, high: 3, low: 0.5, close: 2, volume: 50 };
  const weeklyChart = {
    timeframe: "weekly",
    bars: [weeklyBar],
    smaPeriods: [10, 30],
    smaFastSeries: [1.8],
    smaSlowSeries: [1.6],
  };

  beforeEach(async () => {
    await router.replace("/breakout");
    fetchStockDetail.mockResolvedValue(makeStockDetail({ bars: [dailyBar] }));
  });

  function legendText(wrapper: VueWrapper) {
    return wrapper.findAll(".legend-item").map((item) => item.text());
  }

  it("starts on the daily chart with the 50 and 150-day SMAs, without fetching another chart", async () => {
    const wrapper = await mountView();
    expect(wrapper.find(".timeframe-btn.active").text()).toBe("Daily");
    expect(wrapper.findComponent(PriceChart).props()).toMatchObject({
      bars: [dailyBar],
      sma50Series: [190],
      sma150Series: [180],
    });
    expect(legendText(wrapper)).toEqual(["50-day SMA", "150-day SMA"]);
    expect(fetchStockChart).not.toHaveBeenCalled();
  });

  it("fetches and shows the weekly chart once, keeping the choice in the URL", async () => {
    fetchStockChart.mockResolvedValue(weeklyChart);
    const wrapper = await mountView();
    const [daily, weekly] = wrapper.findAll(".timeframe-btn");
    await weekly.trigger("click");
    await flushPromises();

    expect(fetchStockChart).toHaveBeenCalledWith("AAPL", "weekly");
    expect(router.currentRoute.value.query.chart).toBe("weekly");
    expect(wrapper.findComponent(PriceChart).props()).toMatchObject({
      bars: [weeklyBar],
      sma50Series: [1.8],
      sma150Series: [1.6],
    });
    expect(legendText(wrapper)).toEqual(["10-week SMA", "30-week SMA"]);

    await daily.trigger("click");
    await weekly.trigger("click");
    await flushPromises();
    expect(fetchStockChart).toHaveBeenCalledTimes(1);
  });

  it("opens on the timeframe in the URL", async () => {
    fetchStockChart.mockResolvedValue({ ...weeklyChart, timeframe: "monthly" });
    await router.push("/stock/AAPL?chart=monthly");
    const wrapper = shallowMount(StockDetailView, { global: { plugins: [router] } });
    await flushPromises();
    expect(fetchStockChart).toHaveBeenCalledWith("AAPL", "monthly");
    expect(wrapper.find(".timeframe-btn.active").text()).toBe("Monthly");
    expect(legendText(wrapper)).toEqual(["10-month SMA", "30-month SMA"]);
  });

  it("shows a retry when a chart fails to load", async () => {
    fetchStockChart.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(weeklyChart);
    const wrapper = await mountView();
    await wrapper.findAll(".timeframe-btn")[1].trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(PriceChart).exists()).toBe(false);
    expect(wrapper.find(".chart-status").text()).toContain("boom");

    await wrapper.find(".chart-status button").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(PriceChart).props("bars")).toEqual([weeklyBar]);
  });
});
