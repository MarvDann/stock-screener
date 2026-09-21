import { describe, it, expect, beforeEach } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import CandidateCard from "../CandidateCard.vue";
import type { BreakoutCandidate } from "../../types";

function makeCandidate(overrides: Partial<BreakoutCandidate> = {}): BreakoutCandidate {
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

function mountCard(candidate: BreakoutCandidate) {
  return shallowMount(CandidateCard, {
    props: { candidate },
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
      makeCandidate({ details: { ...makeCandidate().details, daysSinceCross: 3 } })
    );
    expect(wrapper.find(".summary").text()).toContain("crossed MA50 3 day(s) ago");
  });

  it("summarizes an approaching candidate with distance from the SMA", () => {
    const wrapper = mountCard(makeCandidate({ state: "approaching" }));
    expect(wrapper.find(".summary").text()).toBe("-5.8% below 50-day SMA · 4.2% range");
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
