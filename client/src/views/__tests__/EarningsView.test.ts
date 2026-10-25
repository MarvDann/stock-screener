import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { Router } from "vue-router";
import EarningsView from "../EarningsView.vue";
import { routerAt } from "../../__tests__/testRouter";
import { resetCachedResources } from "../../composables/useCachedResource";
import type { EarningsEvent, EarningsResponse } from "../../types";

const fetchEarnings = vi.fn();
vi.mock("../../api", () => ({
  fetchEarnings: (...args: unknown[]) => fetchEarnings(...args),
}));

/** An ISO timestamp `daysAhead` days from today at a local hour and minute. */
function localAt(daysAhead: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function makeEvent(overrides: Partial<EarningsEvent> = {}): EarningsEvent {
  return {
    symbol: "JPM",
    name: "JPMorgan Chase & Co.",
    sector: "Financial Services",
    date: localAt(0, 8, 30),
    session: "before-open",
    estimated: false,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<EarningsResponse> = {}): EarningsResponse {
  return { earnings: [], warnings: [], ...overrides };
}

let router: Router;

beforeEach(async () => {
  fetchEarnings.mockReset();
  resetCachedResources();
  router = await routerAt();
});

describe("EarningsView", () => {
  it("groups reports by day, with today and tomorrow labelled", async () => {
    fetchEarnings.mockResolvedValue(
      makeResponse({
        earnings: [
          makeEvent({ symbol: "JPM", date: localAt(0, 8, 30) }),
          makeEvent({ symbol: "WFC", date: localAt(0, 8, 30) }),
          makeEvent({ symbol: "NFLX", name: "Netflix", date: localAt(1, 16), session: "after-close" }),
          makeEvent({ symbol: "TSLA", name: "Tesla", date: localAt(3, 16), session: "after-close" }),
        ],
      })
    );
    const wrapper = mount(EarningsView, { global: { plugins: [router] } });
    await flushPromises();

    const days = wrapper.findAll(".day");
    expect(days).toHaveLength(3);
    expect(days[0].find(".day-heading").text()).toMatch(/^Today · .*2 reports$/);
    expect(days[0].findAll(".symbol").map((s) => s.text())).toEqual(["JPM", "WFC"]);
    expect(days[1].find(".day-heading").text()).toMatch(/^Tomorrow · .*1 report$/);
    expect(days[2].find(".day-heading").text()).not.toMatch(/Today|Tomorrow/);
  });

  it("shows each report's time, session, sector and estimate flag, linking to the stock", async () => {
    fetchEarnings.mockResolvedValue(
      makeResponse({
        earnings: [
          makeEvent({ symbol: "JPM", date: localAt(0, 8, 30) }),
          makeEvent({ symbol: "NFLX", sector: null, date: localAt(0, 16), session: "after-close", estimated: true }),
        ],
      })
    );
    const wrapper = mount(EarningsView, { global: { plugins: [router] } });
    await flushPromises();

    const [jpm, nflx] = wrapper.findAll("tbody tr");
    expect(jpm.find(".time").text()).toMatch(/8:30/);
    expect(jpm.find(".session").text()).toBe("Before open");
    expect(jpm.find(".sector").text()).toBe("Financial Services");
    expect(jpm.find(".estimated").exists()).toBe(false);
    expect(jpm.find(".company-link").attributes("href")).toBe("/stock/JPM");

    expect(nflx.find(".session").classes()).toContain("after-close");
    expect(nflx.find(".sector").text()).toBe("Uncategorized");
    expect(nflx.find(".estimated").exists()).toBe(true);
  });

  it("says so when nothing reports this week", async () => {
    fetchEarnings.mockResolvedValue(makeResponse());
    const wrapper = mount(EarningsView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".empty").text()).toContain("No tracked companies report");
  });

  it("shows a retry button on failure, and reloads on retry", async () => {
    fetchEarnings.mockRejectedValueOnce(new Error("Yahoo down"));
    fetchEarnings.mockResolvedValueOnce(makeResponse({ earnings: [makeEvent()] }));
    const wrapper = mount(EarningsView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".error-state").text()).toContain("Yahoo down");
    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();

    expect(fetchEarnings).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  });

  it("re-fetches when Refresh is clicked, even while the cache is fresh", async () => {
    fetchEarnings.mockResolvedValue(makeResponse());
    const wrapper = mount(EarningsView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.find(".btn-primary").trigger("click");
    await flushPromises();

    expect(fetchEarnings).toHaveBeenCalledTimes(2);
  });
});
