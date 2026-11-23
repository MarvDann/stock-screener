import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, RouterLinkStub, shallowMount } from "@vue/test-utils";
import EtfsView from "../EtfsView.vue";
import type { Router } from "vue-router";
import { routerAt } from "../../__tests__/testRouter";
import CandidateCard from "../../components/CandidateCard.vue";
import Pagination from "../../components/Pagination.vue";
import { resetStockCardCache } from "../../composables/useStockCards";
import type { Etf, StockCard } from "../../types";

const fetchEtfs = vi.fn();
const fetchStocks = vi.fn();
const addEtf = vi.fn();
const updateEtf = vi.fn();
const deleteEtf = vi.fn();
const getSessionUser = vi.fn();
vi.mock("../../auth", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("../../api", () => ({
  fetchEtfs: (...args: unknown[]) => fetchEtfs(...args),
  fetchStocks: (...args: unknown[]) => fetchStocks(...args),
  addEtf: (...args: unknown[]) => addEtf(...args),
  updateEtf: (...args: unknown[]) => updateEtf(...args),
  deleteEtf: (...args: unknown[]) => deleteEtf(...args),
}));

function makeCard(symbol: string): StockCard {
  return { symbol, name: symbol, state: null, details: null, currency: "USD", bars: [], sma50Series: [], sma150Series: [] };
}

const ETFS: Etf[] = [
  { symbol: "VWRP.L", name: "Vanguard FTSE All-World (Acc)", category: "Global" },
  { symbol: "SPY", name: "SPDR S&P 500", category: "US Market" },
  { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)", category: "Growth & Tech" },
  { symbol: "SMH", name: "VanEck Semiconductor", category: "Growth & Tech" },
  { symbol: "XLK", name: "Technology Select Sector SPDR", category: "US Sectors" },
];
const CATEGORIES = ["Global", "US Market", "Growth & Tech", "US Sectors", "Bonds"];
const EDITABLE = CATEGORIES.filter((c) => c !== "US Sectors");

async function mountView() {
  const wrapper = shallowMount(EtfsView, { global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } } });
  await flushPromises();
  return wrapper;
}

const cardSymbols = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
  wrapper.findAllComponents(CandidateCard).map((c) => c.props("candidate").symbol);

const chip = (wrapper: Awaited<ReturnType<typeof mountView>>, label: string) =>
  wrapper.findAll(".chip").find((c) => c.text().startsWith(label))!;

let router: Router;

beforeEach(() => {
  getSessionUser.mockReset().mockResolvedValue({ id: "u1", email: "admin@example.com", name: "Admin", isAdmin: true });
});

beforeEach(async () => {
  router = await routerAt();
  vi.useFakeTimers();
  resetStockCardCache();
  fetchEtfs.mockReset().mockResolvedValue({ categories: CATEGORIES, editableCategories: EDITABLE, etfs: ETFS });
  addEtf.mockReset();
  updateEtf.mockReset();
  deleteEtf.mockReset();
  fetchStocks.mockReset().mockImplementation((symbols: string[]) =>
    Promise.resolve({ stocks: symbols.map(makeCard), warnings: [] })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EtfsView", () => {
  it("shows every ETF in category order with charts for the first page", async () => {
    const wrapper = await mountView();
    expect(cardSymbols(wrapper)).toEqual(["VWRP.L", "SPY", "QQQ", "SMH", "XLK"]);
    expect(fetchStocks).toHaveBeenCalledWith(["VWRP.L", "SPY", "QQQ", "SMH", "XLK"], { fresh: false });
    expect(wrapper.find(".match-count").text()).toBe("5 matches");
  });

  it("shows a chip per category with counts, including empty ones", async () => {
    const wrapper = await mountView();
    expect(wrapper.findAll(".chip").map((c) => c.text())).toEqual([
      "All 5",
      "Global 1",
      "US Market 1",
      "Growth & Tech 2",
      "US Sectors 1",
      "Bonds 0",
    ]);
  });

  it("filters by category, and back to all", async () => {
    const wrapper = await mountView();

    await chip(wrapper, "Growth & Tech").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["QQQ", "SMH"]);
    expect(chip(wrapper, "Growth & Tech").classes()).toContain("active");

    await chip(wrapper, "Bonds").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("No ETFs match.");

    await chip(wrapper, "All").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toHaveLength(5);
  });

  it("searches within the chosen category after the debounce", async () => {
    const wrapper = await mountView();
    await chip(wrapper, "Growth & Tech").trigger("click");

    await wrapper.find("input.search").setValue("semi");
    vi.advanceTimersByTime(250);
    await flushPromises();
    expect(cardSymbols(wrapper)).toEqual(["SMH"]);
  });

  it("pages through results and resets to page 1 on a category change", async () => {
    const many: Etf[] = Array.from({ length: 8 }, (_, i) => ({ symbol: `E${i}`, name: `ETF ${i}`, category: "Bonds" }));
    fetchEtfs.mockResolvedValue({ categories: CATEGORIES, editableCategories: EDITABLE, etfs: many });
    const wrapper = await mountView();

    await wrapper.findComponent(Pagination).vm.$emit("update:page", 2);
    await flushPromises();
    expect(fetchStocks).toHaveBeenLastCalledWith(["E6", "E7"], { fresh: false });

    await chip(wrapper, "Bonds").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(Pagination).props("page")).toBe(1);
  });

  it("shows a retry when loading the ETF list fails", async () => {
    fetchEtfs.mockRejectedValueOnce(new Error("boom"));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".error-state button").trigger("click");
    await flushPromises();
    expect(cardSymbols(wrapper)).toHaveLength(5);
  });

  it("restores its category and search from the URL", async () => {
    router = await routerAt({ category: "Growth & Tech", q: "semi" });
    const wrapper = await mountView();
    expect(chip(wrapper, "Growth & Tech").classes()).toContain("active");
    expect((wrapper.find("input.search").element as HTMLInputElement).value).toBe("semi");
    expect(cardSymbols(wrapper)).toEqual(["SMH"]);
  });

  it("writes the chosen category to the URL", async () => {
    const wrapper = await mountView();
    await chip(wrapper, "Growth & Tech").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ category: "Growth & Tech" });
  });

  describe("editing", () => {
    async function mountEditing() {
      const wrapper = await mountView();
      await wrapper.find(".edit-toggle").trigger("click");
      return wrapper;
    }

    const rowSymbols = (wrapper: Awaited<ReturnType<typeof mountView>>) =>
      wrapper.findAll(".etf-table tbody tr").map((r) => r.find(".symbol").text());

    const row = (wrapper: Awaited<ReturnType<typeof mountView>>, symbol: string) =>
      wrapper.findAll(".etf-table tbody tr").find((r) => r.find(".symbol").text() === symbol)!;

    it("swaps the cards for a table, with US Sectors funds fixed", async () => {
      const wrapper = await mountEditing();
      expect(wrapper.findAllComponents(CandidateCard)).toHaveLength(0);
      expect(rowSymbols(wrapper)).toEqual(["VWRP.L", "SPY", "QQQ", "SMH", "XLK"]);
      expect(row(wrapper, "XLK").text()).toContain("Fixed");
      expect(row(wrapper, "XLK").find("select").exists()).toBe(false);
      expect(row(wrapper, "SPY").findAll("button").map((b) => b.text())).toEqual(["Rename", "Remove"]);

      await wrapper.find(".edit-toggle").trigger("click");
      expect(wrapper.find(".etf-table").exists()).toBe(false);
      expect(cardSymbols(wrapper)).toHaveLength(5);
    });

    it("lets members add but not rename, move or remove", async () => {
      getSessionUser.mockResolvedValue({ id: "u2", email: "member@example.com", name: "Member", isAdmin: false });
      const wrapper = await mountEditing();
      expect(row(wrapper, "SPY").findAll("button")).toHaveLength(0);
      expect(row(wrapper, "SPY").find("select").exists()).toBe(false);
      expect(row(wrapper, "SPY").text()).toContain("US Market");
      expect(row(wrapper, "XLK").text()).toContain("Fixed");
      expect(wrapper.find(".add-form").exists()).toBe(true);
    });

    it("offers only editable categories, defaulting to the one being viewed", async () => {
      const wrapper = await mountView();
      await chip(wrapper, "Growth & Tech").trigger("click");
      await wrapper.find(".edit-toggle").trigger("click");
      const select = wrapper.find(".add-form select");
      expect(select.findAll("option").map((o) => o.text())).toEqual(EDITABLE);
      expect((select.element as HTMLSelectElement).value).toBe("Growth & Tech");
      expect(rowSymbols(wrapper)).toEqual(["QQQ", "SMH"]);
    });

    it("adds an ETF to the end of its category", async () => {
      addEtf.mockResolvedValue({ symbol: "CSPX.L", name: "iShares Core S&P 500", category: "Global" });
      const wrapper = await mountEditing();
      await wrapper.find(".symbol-input").setValue(" cspx.l ");
      await wrapper.find(".add-form").trigger("submit");
      await flushPromises();
      expect(addEtf).toHaveBeenCalledWith("cspx.l", "Global", undefined);
      expect(rowSymbols(wrapper)).toEqual(["VWRP.L", "CSPX.L", "SPY", "QQQ", "SMH", "XLK"]);
      expect((wrapper.find(".symbol-input").element as HTMLInputElement).value).toBe("");
    });

    it("shows the server's error when adding fails", async () => {
      addEtf.mockRejectedValue(new Error("SPY is already listed under US Market"));
      const wrapper = await mountEditing();
      await wrapper.find(".symbol-input").setValue("SPY");
      await wrapper.find(".add-form").trigger("submit");
      await flushPromises();
      expect(wrapper.find(".inline-error").text()).toBe("SPY is already listed under US Market");
    });

    it("renames an ETF", async () => {
      updateEtf.mockResolvedValue({ symbol: "SPY", name: "SPDR S&P 500 ETF Trust", category: "US Market" });
      const wrapper = await mountEditing();
      await row(wrapper, "SPY").find("button").trigger("click");
      await wrapper.find(".rename-input").setValue("SPDR S&P 500 ETF Trust");
      await wrapper.find(".rename-form").trigger("submit");
      await flushPromises();
      expect(updateEtf).toHaveBeenCalledWith("SPY", { name: "SPDR S&P 500 ETF Trust" });
      expect(row(wrapper, "SPY").text()).toContain("SPDR S&P 500 ETF Trust");
      expect(wrapper.find(".rename-form").exists()).toBe(false);
    });

    it("moves an ETF to another category", async () => {
      updateEtf.mockResolvedValue({ symbol: "VWRP.L", name: "Vanguard FTSE All-World (Acc)", category: "Bonds" });
      const wrapper = await mountEditing();
      await row(wrapper, "VWRP.L").find("select").setValue("Bonds");
      await flushPromises();
      expect(updateEtf).toHaveBeenCalledWith("VWRP.L", { category: "Bonds" });
      expect(rowSymbols(wrapper)).toEqual(["SPY", "QQQ", "SMH", "XLK", "VWRP.L"]);
      expect(chip(wrapper, "Bonds").text()).toBe("Bonds 1");
    });

    it("removes an ETF after confirming", async () => {
      vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
      deleteEtf.mockResolvedValue(undefined);
      const wrapper = await mountEditing();

      await row(wrapper, "SMH").find(".remove-btn").trigger("click");
      expect(deleteEtf).not.toHaveBeenCalled();

      await row(wrapper, "SMH").find(".remove-btn").trigger("click");
      await flushPromises();
      expect(deleteEtf).toHaveBeenCalledWith("SMH");
      expect(rowSymbols(wrapper)).not.toContain("SMH");
    });
  });
});
