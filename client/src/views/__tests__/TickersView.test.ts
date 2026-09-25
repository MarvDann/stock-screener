import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TickersView from "../TickersView.vue";

const fetchTickers = vi.fn();
const addTicker = vi.fn();
const updateTicker = vi.fn();
const deleteTicker = vi.fn();
vi.mock("../../api", () => ({
  fetchTickers: (...args: unknown[]) => fetchTickers(...args),
  addTicker: (...args: unknown[]) => addTicker(...args),
  updateTicker: (...args: unknown[]) => updateTicker(...args),
  deleteTicker: (...args: unknown[]) => deleteTicker(...args),
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/stock/:symbol", name: "stock-detail", component: { template: "<div />" } },
    ],
  });
}

async function mountView() {
  const wrapper = mount(TickersView, { global: { plugins: [makeRouter()] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fetchTickers.mockReset().mockResolvedValue([
    { symbol: "AAPL", name: "Apple", sector: "Technology", industry: "Consumer Electronics" },
    { symbol: "MSFT", name: "Microsoft", sector: "Technology", industry: "Software - Infrastructure" },
  ]);
  addTicker.mockReset();
  updateTicker.mockReset();
  deleteTicker.mockReset();
});

describe("TickersView", () => {
  it("lists tickers with a count", async () => {
    const wrapper = await mountView();
    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("AAPL");
    expect(rows[0].text()).toContain("Apple");
    expect(wrapper.find(".count").text()).toBe("2 symbols");
  });

  it("shows sector and sub-sector, with placeholders when missing or pending", async () => {
    fetchTickers.mockResolvedValue([
      { symbol: "AAPL", name: "Apple", sector: "Technology", industry: "Consumer Electronics" },
      { symbol: "MSFT", name: "Microsoft", sector: "Technology", industry: "Software - Infrastructure" },
      { symbol: "SPY", name: "SPDR S&P 500", sector: "", industry: "" },
      { symbol: "NEW", name: "Newco", sector: null, industry: null },
    ]);
    const wrapper = await mountView();
    const categories = (i: number) => wrapper.findAll("tbody tr")[i].findAll("td.category").map((td) => td.text());
    expect(categories(0)).toEqual(["Technology", "Consumer Electronics"]);
    expect(categories(1)).toEqual(["Technology", "Software - Infrastructure"]);
    expect(categories(2)).toEqual(["—", "—"]);
    expect(categories(3)).toEqual(["Pending…", "Pending…"]);
  });

  it("filters by sector or sub-sector", async () => {
    const wrapper = await mountView();
    await wrapper.find(".filter-input").setValue("electronics");
    expect(wrapper.findAll("tbody td.symbol").map((td) => td.text())).toEqual(["AAPL"]);

    await wrapper.find(".filter-input").setValue("software");
    expect(wrapper.findAll("tbody td.symbol").map((td) => td.text())).toEqual(["MSFT"]);
  });

  it("filters by symbol or name", async () => {
    const wrapper = await mountView();
    await wrapper.find(".filter-input").setValue("micro");
    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("MSFT");
  });

  it("adds a ticker and keeps the list sorted", async () => {
    addTicker.mockResolvedValue({ symbol: "BRK-B", name: "Berkshire Hathaway" });
    const wrapper = await mountView();

    await wrapper.find(".symbol-input").setValue("brk-b");
    await wrapper.find(".add-form").trigger("submit");
    await flushPromises();

    expect(addTicker).toHaveBeenCalledWith("brk-b", undefined);
    const symbols = wrapper.findAll("tbody td.symbol").map((td) => td.text());
    expect(symbols).toEqual(["AAPL", "BRK-B", "MSFT"]);
    expect((wrapper.find(".symbol-input").element as HTMLInputElement).value).toBe("");
  });

  it("shows the server's error when adding fails", async () => {
    addTicker.mockRejectedValue(new Error("No price data found for NOPE"));
    const wrapper = await mountView();

    await wrapper.find(".symbol-input").setValue("NOPE");
    await wrapper.find(".add-form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".add-error").text()).toBe("No price data found for NOPE");
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });

  it("renames a ticker inline", async () => {
    updateTicker.mockResolvedValue({ symbol: "AAPL", name: "Apple Inc." });
    const wrapper = await mountView();

    await wrapper.find(".edit-btn").trigger("click");
    await wrapper.find(".edit-input").setValue("Apple Inc.");
    await wrapper.find(".edit-form").trigger("submit");
    await flushPromises();

    expect(updateTicker).toHaveBeenCalledWith("AAPL", "Apple Inc.");
    expect(wrapper.find(".edit-form").exists()).toBe(false);
    expect(wrapper.findAll("tbody tr")[0].text()).toContain("Apple Inc.");
  });

  it("removes a ticker after confirmation", async () => {
    vi.stubGlobal("confirm", () => true);
    deleteTicker.mockResolvedValue(undefined);
    const wrapper = await mountView();

    await wrapper.find(".remove-btn").trigger("click");
    await flushPromises();

    expect(deleteTicker).toHaveBeenCalledWith("AAPL");
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("does not remove when confirmation is declined", async () => {
    vi.stubGlobal("confirm", () => false);
    const wrapper = await mountView();

    await wrapper.find(".remove-btn").trigger("click");
    expect(deleteTicker).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
