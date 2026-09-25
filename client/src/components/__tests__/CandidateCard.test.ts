import { describe, it, expect, beforeEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import CandidateCard from "../CandidateCard.vue";
import type { StockCard } from "../../types";

function makeCandidate(overrides: Partial<StockCard> = {}): StockCard {
  return {
    symbol: "AAPL",
    name: "Apple Inc.",
    state: "triggered",
    details: {
      close: 190.5,
      sma50: 180,
      pctBelowSma50: -5.8,
      rangeContractionPct: 4.2,
      volumeRatio: 2.3,
      daysSinceCross: 0,
    },
    currency: "USD",
    bars: [],
    sma50Series: [],
    sma150Series: [],
    ...overrides,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: { template: "<div />" } },
    { path: "/stock/:symbol", component: { template: "<div />" } },
  ],
});

function makeBar(close: number) {
  return { date: "2024-01-02", open: close, high: close, low: close, close, volume: 1000 };
}

function makeStock(overrides: Partial<StockCard> = {}): StockCard {
  return {
    symbol: "KO",
    name: "Coca-Cola",
    state: null,
    details: null,
    currency: null,
    bars: [makeBar(60), makeBar(55)],
    sma50Series: [NaN, 50],
    sma150Series: [NaN, NaN],
    ...overrides,
  };
}

function mountCard(candidate: StockCard, showState = false) {
  return shallowMount(CandidateCard, {
    props: { candidate, showState },
    global: { plugins: [router] },
  });
}

describe("CandidateCard", () => {
  beforeEach(async () => {
    await router.push("/");
  });

  it("shows the name and symbol", () => {
    const wrapper = mountCard(makeCandidate());
    expect(wrapper.find("h3").text()).toBe("Apple Inc.");
    expect(wrapper.find(".ticker").text()).toBe("AAPL");
  });

  it("falls back to the symbol when name is missing", () => {
    const wrapper = mountCard(makeCandidate({ name: "" }));
    expect(wrapper.find("h3").text()).toBe("AAPL");
  });

  it("summarizes a triggered candidate with volume, cross day, and range", () => {
    const wrapper = mountCard(makeCandidate());
    expect(wrapper.find(".summary").text()).toBe(
      "2.3x volume · crossed MA50 today · 4.2% range"
    );
  });

  it("shows days-ago wording for a triggered candidate that crossed earlier", () => {
    const wrapper = mountCard(
      makeCandidate({ details: { ...makeCandidate().details!, daysSinceCross: 3 } })
    );
    expect(wrapper.find(".summary").text()).toContain("crossed MA50 3 day(s) ago");
  });

  it("summarizes an approaching candidate with distance from the SMA", () => {
    const wrapper = mountCard(makeCandidate({ state: "approaching" }));
    expect(wrapper.find(".summary").text()).toBe("-5.8% below 50-day SMA · 4.2% range");
  });

  it("shows the close with its currency symbol", () => {
    expect(mountCard(makeCandidate()).find(".close").text()).toBe("$190.50");
    expect(mountCard(makeCandidate({ currency: "GBP" })).find(".close").text()).toBe("£190.50");
  });

  it("uses the last bar's close and SMA distance for a stock that isn't a candidate", () => {
    const wrapper = mountCard(makeStock());
    expect(wrapper.find(".close").text()).toBe("55.00");
    expect(wrapper.find(".summary").text()).toBe("10.0% above 50-day SMA");
  });

  it("says below when a non-candidate trades under its SMA", () => {
    const wrapper = mountCard(makeStock({ bars: [makeBar(45)], sma50Series: [50] }));
    expect(wrapper.find(".summary").text()).toBe("10.0% below 50-day SMA");
  });

  it("explains when there isn't enough history for the SMA", () => {
    const wrapper = mountCard(makeStock({ sma50Series: [NaN, NaN] }));
    expect(wrapper.find(".summary").text()).toBe("Not enough history for a 50-day SMA");
  });

  it("shows a state badge only when asked and the stock has a state", () => {
    expect(mountCard(makeCandidate()).find(".state").exists()).toBe(false);
    expect(mountCard(makeCandidate(), true).find(".state").text()).toBe("Triggered");
    expect(mountCard(makeStock(), true).find(".state").exists()).toBe(false);
  });

  it("navigates to the stock detail page on click", async () => {
    const wrapper = mountCard(makeCandidate());
    await wrapper.find(".card").trigger("click", { clientX: 0, clientY: 0 });
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/stock/AAPL");
  });

  it("does not navigate when the click follows a drag", async () => {
    const wrapper = mountCard(makeCandidate());
    const card = wrapper.find(".card");
    await card.trigger("pointerdown", { clientX: 0, clientY: 0 });
    await card.trigger("click", { clientX: 50, clientY: 0 });
    await router.isReady();
    expect(router.currentRoute.value.fullPath).toBe("/");
  });
});
