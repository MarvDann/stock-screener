import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import BreakoutView from "../BreakoutView.vue";
import CandidateCard from "../../components/CandidateCard.vue";
import Pagination from "../../components/Pagination.vue";
import WarningsBanner from "../../components/WarningsBanner.vue";
import type { BreakoutCandidate, BreakoutResponse } from "../../types";

const fetchBreakout = vi.fn();
vi.mock("../../api", () => ({
  fetchBreakout: (...args: unknown[]) => fetchBreakout(...args),
}));

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
    bars: [],
    sma50Series: [],
    sma150Series: [],
  };
}

function makeResponse(overrides: Partial<BreakoutResponse> = {}): BreakoutResponse {
  return { triggered: [], approaching: [], warnings: [], ...overrides };
}

beforeEach(() => {
  fetchBreakout.mockReset();
});

describe("BreakoutView", () => {
  it("loads candidates on mount and renders them grouped by state", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: [makeCandidate("AAPL", "Apple Inc.")],
        approaching: [makeCandidate("MSFT", "Microsoft")],
      })
    );

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    expect(fetchBreakout).toHaveBeenCalledTimes(1);
    expect(wrapper.findAll("h3")[0].text()).toBe("Triggered (1)");
    expect(wrapper.findAll("h3")[1].text()).toBe("Approaching (1)");
    expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(2);
  });

  it("shows an empty message when there are no candidates", async () => {
    fetchBreakout.mockResolvedValue(makeResponse());

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    expect(wrapper.text()).toContain("No triggered breakouts right now.");
    expect(wrapper.text()).toContain("No candidates approaching a breakout right now.");
  });

  it("forwards warnings to the WarningsBanner", async () => {
    fetchBreakout.mockResolvedValue(makeResponse({ warnings: ["AAPL: skipped"] }));

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    expect(wrapper.findComponent(WarningsBanner).props("warnings")).toEqual(["AAPL: skipped"]);
  });

  it("shows a retry button on failure, and reloads on retry", async () => {
    fetchBreakout.mockRejectedValueOnce(new Error("boom"));
    fetchBreakout.mockResolvedValueOnce(makeResponse());

    const wrapper = shallowMount(BreakoutView);
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

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    await wrapper.find(".search").setValue("apple");
    await flushPromises();

    expect(wrapper.findAll("h3")[0].text()).toBe("Triggered (1)");
    expect(wrapper.findComponent(CandidateCard).props("candidate").symbol).toBe("AAPL");
  });

  it("shows a no-matches message when the search filters everything out", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({ triggered: [makeCandidate("AAPL", "Apple Inc.")] })
    );

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    await wrapper.find(".search").setValue("zzz");
    await flushPromises();

    expect(wrapper.text()).toContain("No matches.");
  });

  it("resets pagination to page 1 when the search text changes", async () => {
    fetchBreakout.mockResolvedValue(
      makeResponse({
        triggered: Array.from({ length: 25 }, (_, i) => makeCandidate(`SYM${i}`, `Name ${i}`)),
      })
    );

    const wrapper = shallowMount(BreakoutView);
    await flushPromises();

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(2);

    await wrapper.find(".search").setValue("sym1");
    await flushPromises();

    expect(wrapper.findComponent(Pagination).props("page")).toBe(1);
  });
});
