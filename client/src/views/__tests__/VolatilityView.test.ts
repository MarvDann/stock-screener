import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { Router } from "vue-router";
import VolatilityView from "../VolatilityView.vue";
import { routerAt } from "../../__tests__/testRouter";
import { resetCachedResources } from "../../composables/useCachedResource";
import type { DatedValue, VolatilityResponse } from "../../types";
import type { LineSeries } from "../../components/LineChart.vue";

const fetchVolatility = vi.fn();
vi.mock("../../api", () => ({
  fetchVolatility: (...args: unknown[]) => fetchVolatility(...args),
}));

/** `count` consecutive days ending 2026-10-09, with values from `value(i)`. */
function points(count: number, value: (i: number) => number): DatedValue[] {
  const end = Date.UTC(2026, 9, 9);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * 864e5).toISOString().slice(0, 10),
    value: value(i),
  }));
}

function makeResponse(overrides: Partial<VolatilityResponse> = {}): VolatilityResponse {
  return {
    asOf: "2026-10-09",
    vix: { close: 14.84, change: -0.57, changePct: -3.7, high52w: 38.2, low52w: 12.1, percentile1y: 22.4, regime: "calm" },
    vvix: { close: 84.88, change: -1.2, changePct: -1.4 },
    termRatio: 0.835,
    series: [
      { symbol: "^VIX", name: "VIX", points: points(300, (i) => 15 + (i % 5)) },
      { symbol: "^VIX9D", name: "VIX 9-day", points: points(300, () => 12) },
      { symbol: "^VIX3M", name: "VIX 3-month", points: points(300, () => 18) },
      { symbol: "^VVIX", name: "VVIX", points: points(300, () => 85) },
    ],
    termRatioSeries: points(300, () => 0.9),
    warnings: [],
    ...overrides,
  };
}

const LineChartStub = {
  name: "LineChart",
  props: ["series", "referenceLines", "height"],
  template: "<div class='line-chart-stub' />",
};

let router: Router;

async function mountView(query = {}) {
  router = await routerAt(query);
  const wrapper = mount(VolatilityView, { global: { plugins: [router], stubs: { LineChart: LineChartStub } } });
  await flushPromises();
  return wrapper;
}

function chartSeries(wrapper: Awaited<ReturnType<typeof mountView>>, index: number): LineSeries[] {
  return wrapper.findAllComponents(LineChartStub)[index].props("series");
}

beforeEach(() => {
  fetchVolatility.mockReset();
  resetCachedResources();
});

describe("VolatilityView", () => {
  it("shows the VIX level, its move, regime, percentile, term structure and VVIX", async () => {
    fetchVolatility.mockResolvedValue(makeResponse());
    const wrapper = await mountView();

    const hero = wrapper.find(".hero");
    expect(hero.find(".hero-value").text()).toBe("14.84");
    expect(hero.find(".move").text()).toBe("-0.57 (-3.7%)");
    // Falling fear is good news.
    expect(hero.find(".move").classes()).toContain("better");
    expect(hero.find(".regime").text()).toBe("Calm");
    expect(wrapper.findAll(".stat-value")[0].text()).toMatch(/^22nd/);
    expect(wrapper.text()).toContain("Contango");
    expect(wrapper.text()).toContain("84.88");
  });

  it("flags backwardation when the term ratio is 1 or more", async () => {
    fetchVolatility.mockResolvedValue(makeResponse({ termRatio: 1.12 }));
    const wrapper = await mountView();

    expect(wrapper.text()).toContain("Backwardation");
  });

  it("charts only the VIX at first, with 20 and 30 marked, and toggles the other tenors", async () => {
    fetchVolatility.mockResolvedValue(makeResponse());
    const wrapper = await mountView();

    expect(chartSeries(wrapper, 0).map((s) => s.key)).toEqual(["^VIX"]);
    const refs = wrapper.findAllComponents(LineChartStub)[0].props("referenceLines") as { value: number }[];
    expect(refs.map((r) => r.value)).toEqual([20, 30]);

    await wrapper.find("[data-series='^VIX3M']").trigger("click");
    expect(chartSeries(wrapper, 0).map((s) => s.key)).toEqual(["^VIX", "^VIX3M"]);
    // Colour slots stay with the index, whatever else is shown.
    expect(chartSeries(wrapper, 0).map((s) => s.slot)).toEqual([0, 2]);

    await wrapper.find("[data-series='^VIX3M']").trigger("click");
    expect(chartSeries(wrapper, 0).map((s) => s.key)).toEqual(["^VIX"]);
  });

  it("limits the charts and table to the chosen range, defaulting to 6 months", async () => {
    fetchVolatility.mockResolvedValue(makeResponse());
    const wrapper = await mountView();

    expect(chartSeries(wrapper, 0)[0].points).toHaveLength(126);
    expect(chartSeries(wrapper, 1)[0].points).toHaveLength(126);

    await wrapper.find("[data-range='1M']").trigger("click");
    await flushPromises();
    expect(chartSeries(wrapper, 0)[0].points).toHaveLength(21);
    expect(wrapper.findAll(".table-view tbody tr")).toHaveLength(21);
    expect(router.currentRoute.value.query.range).toBe("1M");
  });

  it("opens on the range from the URL", async () => {
    fetchVolatility.mockResolvedValue(makeResponse());
    const wrapper = await mountView({ range: "1Y" });

    expect(chartSeries(wrapper, 0)[0].points).toHaveLength(252);
  });

  it("lists daily values newest first in the table view", async () => {
    fetchVolatility.mockResolvedValue(makeResponse());
    const wrapper = await mountView();

    const first = wrapper.findAll(".table-view tbody tr")[0].findAll("td").map((td) => td.text());
    expect(first).toEqual(["2026-10-09", "19.00", "12.00", "18.00", "0.900", "85.00"]);
  });

  it("shows a retry button on failure, and reloads on retry", async () => {
    fetchVolatility.mockRejectedValueOnce(new Error("VIX fetch failed"));
    fetchVolatility.mockResolvedValueOnce(makeResponse());
    const wrapper = await mountView();

    expect(wrapper.find(".error-state").text()).toContain("VIX fetch failed");
    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();

    expect(fetchVolatility).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".hero").exists()).toBe(true);
  });
});
