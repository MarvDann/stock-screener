import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SectorRotationView from "../SectorRotationView.vue";
import { routerAt } from "../../__tests__/testRouter";
import type { Router } from "vue-router";
import type { SectorRotationResponse, SectorRotationResult } from "../../types";

const fetchSectorRotation = vi.fn();
vi.mock("../../api", () => ({
  fetchSectorRotation: (...args: unknown[]) => fetchSectorRotation(...args),
}));

function makeResult(overrides: Partial<SectorRotationResult> = {}): SectorRotationResult {
  return {
    sectorSymbol: "XLK",
    sectorName: "Technology",
    mansfieldRs: 1.5,
    moneyFlowTrend: "accumulation",
    capitalFlow: "accumulating",
    rank: 1,
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<SectorRotationResponse> = {}
): SectorRotationResponse {
  return { results: [], warnings: [], ...overrides };
}

let router: Router;

beforeEach(async () => {
  fetchSectorRotation.mockReset();
  router = await routerAt();
  router.addRoute({ path: "/sector-drilldown", name: "sector-drilldown", component: { template: "<div />" } });
});

describe("SectorRotationView", () => {
  it("loads and renders a row per sector result", async () => {
    fetchSectorRotation.mockResolvedValue(
      makeResponse({
        results: [
          makeResult({ sectorSymbol: "XLK", sectorName: "Technology", rank: 1 }),
          makeResult({ sectorSymbol: "XLF", sectorName: "Financials", rank: 2 }),
        ],
      })
    );

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].find(".sector-name").text()).toBe("Technology");
    expect(rows[0].find(".sector-etf").text()).toBe("XLK");
    expect(rows[1].find(".sector-name").text()).toBe("Financials");
  });

  it("colors positive Mansfield RS green and negative red", async () => {
    fetchSectorRotation.mockResolvedValue(
      makeResponse({
        results: [
          makeResult({ sectorSymbol: "XLK", mansfieldRs: 2.5 }),
          makeResult({ sectorSymbol: "XLE", mansfieldRs: -1.2 }),
        ],
      })
    );

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].findAll("td")[2].classes()).toContain("pos");
    expect(rows[0].findAll("td")[2].text()).toBe("2.50");
    expect(rows[1].findAll("td")[2].classes()).toContain("neg");
    expect(rows[1].findAll("td")[2].text()).toBe("-1.20");
  });

  it("shows an em-dash instead of NaN for an undetermined Mansfield RS", async () => {
    fetchSectorRotation.mockResolvedValue(
      makeResponse({ results: [makeResult({ mansfieldRs: NaN })] })
    );

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find("tbody tr td:nth-child(3)").text()).toBe("—");
  });

  it("applies the matching class for money flow and capital flow columns", async () => {
    fetchSectorRotation.mockResolvedValue(
      makeResponse({
        results: [
          makeResult({ moneyFlowTrend: "distribution", capitalFlow: "distributing" }),
        ],
      })
    );

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    const cells = wrapper.findAll("tbody td.flow");
    expect(cells[0].classes()).toContain("distribution");
    expect(cells[0].text()).toBe("distribution");
    expect(cells[1].classes()).toContain("distributing");
    expect(cells[1].text()).toBe("distributing");
  });

  it("shows a retry button on failure, and reloads on retry", async () => {
    fetchSectorRotation.mockRejectedValueOnce(new Error("scan failed"));
    fetchSectorRotation.mockResolvedValueOnce(makeResponse({ results: [makeResult()] }));

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".error-state").text()).toContain("scan failed");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();

    expect(fetchSectorRotation).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".error-state").exists()).toBe(false);
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("re-fetches when the Refresh button is clicked", async () => {
    fetchSectorRotation.mockResolvedValue(makeResponse());

    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();

    expect(fetchSectorRotation).toHaveBeenCalledTimes(2);
  });

  it("links each sector to its ETF chart and to its stocks, mapping to Yahoo's sector names", async () => {
    fetchSectorRotation.mockResolvedValue(
      makeResponse({
        results: [
          makeResult({ sectorSymbol: "XLF", sectorName: "Financials", rank: 1 }),
          makeResult({ sectorSymbol: "XLY", sectorName: "Consumer Discretionary", rank: 2 }),
        ],
      })
    );
    const wrapper = mount(SectorRotationView, { global: { plugins: [router] } });
    await flushPromises();

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].find(".sector-link").attributes("href")).toBe("/stock/XLF");
    expect(rows[0].find(".stocks-link").attributes("href")).toBe("/sector-drilldown?sector=Financial+Services");
    expect(rows[1].find(".stocks-link").attributes("href")).toBe("/sector-drilldown?sector=Consumer+Cyclical");
  });
});
