import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { Router } from "vue-router";
import IndustryGroupsView from "../IndustryGroupsView.vue";
import { routerAt } from "../../__tests__/testRouter";
import { resetCachedResources } from "../../composables/useCachedResource";
import type { IndustryGroup, IndustryGroupMember, IndustryGroupsResponse } from "../../types";

const fetchIndustryGroups = vi.fn();
vi.mock("../../api", () => ({
  fetchIndustryGroups: (...args: unknown[]) => fetchIndustryGroups(...args),
}));

function makeMember(overrides: Partial<IndustryGroupMember> = {}): IndustryGroupMember {
  return {
    symbol: "NVDA",
    name: "NVIDIA",
    close: 180.5,
    currency: "USD",
    rs1m: 92,
    rs3m: 97,
    perf1m: 4.2,
    perf3m: 18.6,
    pctFromHigh: -2.3,
    aboveSma50: true,
    stage2: true,
    setup: null,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<IndustryGroup> = {}): IndustryGroup {
  return {
    rank: 1,
    industry: "Semiconductors",
    sector: "Technology",
    custom: false,
    memberCount: 12,
    rsScore: 84.4,
    avgRs1m: 80.2,
    avgRs3m: 88.6,
    perf1m: 3.1,
    perf3m: -1.5,
    aboveSma50: 9,
    stage2: 6,
    members: [makeMember()],
    ...overrides,
  };
}

function makeResponse(overrides: Partial<IndustryGroupsResponse> = {}): IndustryGroupsResponse {
  return { asOf: "2026-11-20", rankedGroups: 40, groups: [makeGroup()], warnings: [], ...overrides };
}

let router: Router;

beforeEach(async () => {
  fetchIndustryGroups.mockReset();
  resetCachedResources();
  router = await routerAt();
  router.addRoute({ path: "/sector-drilldown", name: "sector-drilldown", component: { template: "<div />" } });
});

async function mountView(response: IndustryGroupsResponse) {
  fetchIndustryGroups.mockResolvedValue(response);
  const wrapper = mount(IndustryGroupsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe("IndustryGroupsView", () => {
  it("renders a section per group, in rank order, with its stats", async () => {
    const wrapper = await mountView(
      makeResponse({
        groups: [makeGroup(), makeGroup({ rank: 2, industry: "Aerospace & Defense", sector: "Industrials" })],
      })
    );

    const groups = wrapper.findAll("section.group");
    expect(groups).toHaveLength(2);
    expect(groups[0].find(".rank").text()).toBe("1");
    expect(groups[0].find("h3").text()).toBe("Semiconductors");
    expect(groups[0].find(".group-meta").text()).toBe("Technology · 12 stocks");
    expect(groups[1].find("h3").text()).toBe("Aerospace & Defense");

    const stats = groups[0].findAll(".group-stats dd").map((d) => d.text());
    expect(stats).toEqual(["84", "80", "89", "+3.1%", "-1.5%", "75%", "6/12"]);
    expect(wrapper.find(".intro").text()).toContain("top 2 of 40");
  });

  it("marks the first stock as the group leader and links each stock to its chart", async () => {
    const wrapper = await mountView(
      makeResponse({
        groups: [makeGroup({ members: [makeMember(), makeMember({ symbol: "AMD", name: "AMD", rs1m: 85, rs3m: 88 })] })],
      })
    );

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].classes()).toContain("leader");
    expect(rows[0].find(".leader-tag").exists()).toBe(true);
    expect(rows[1].find(".leader-tag").exists()).toBe(false);
    expect(rows[1].find("a").attributes("href")).toBe("/stock/AMD");
  });

  it("shows trend and setup tags, and dashes for missing data", async () => {
    const wrapper = await mountView(
      makeResponse({
        groups: [
          makeGroup({
            members: [
              makeMember({ setup: "triggered" }),
              makeMember({ symbol: "NEW", stage2: false, aboveSma50: false, rs1m: null, rs3m: null, perf3m: null }),
            ],
          }),
        ],
      })
    );

    const [first, second] = wrapper.findAll("tbody tr");
    expect(first.find(".tag.stage2").exists()).toBe(true);
    expect(first.find(".tag.triggered").text()).toBe("Triggered");
    expect(second.text()).toContain("Below 50-day");
    expect(second.findAll(".rs").map((td) => td.text())).toEqual(["—", "—"]);
    expect(second.findAll("td")[5].text()).toBe("—");
  });

  it("links each group to its stocks in Sector Drilldown", async () => {
    const wrapper = await mountView(makeResponse());

    expect(wrapper.find(".all-link").attributes("href")).toBe(
      "/sector-drilldown?sector=Technology&industry=Semiconductors"
    );
  });

  it("tags custom groups and doesn't link them to Sector Drilldown", async () => {
    const wrapper = await mountView(makeResponse({ groups: [makeGroup({ industry: "Cybersecurity", custom: true })] }));

    expect(wrapper.find(".custom-tag").text()).toBe("Custom");
    expect(wrapper.find(".all-link").exists()).toBe(false);
  });

  it("shows an error with a retry when the scan fails", async () => {
    fetchIndustryGroups.mockRejectedValue(new Error("Industry groups failed"));
    const wrapper = mount(IndustryGroupsView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find(".error-state").text()).toContain("Industry groups failed");

    fetchIndustryGroups.mockResolvedValue(makeResponse());
    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(wrapper.find(".error-state").exists()).toBe(false);
    expect(wrapper.findAll("section.group")).toHaveLength(1);
  });
});
