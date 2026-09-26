import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import WatchlistMenu from "../WatchlistMenu.vue";
import { makeTestRouter } from "../../__tests__/testRouter";
import type { Watchlist } from "../../types";

const api = vi.hoisted(() => ({
  fetchWatchlists: vi.fn(),
  createWatchlist: vi.fn(),
  addToWatchlist: vi.fn(),
  removeFromWatchlist: vi.fn(),
}));
vi.mock("../../api", () =>
  Object.fromEntries(Object.keys(api).map((k) => [k, (...args: unknown[]) => api[k as keyof typeof api](...args)]))
);

const TECH: Watchlist = { id: 1, name: "Tech", symbols: ["AAPL"] };
const DIVIDENDS: Watchlist = { id: 2, name: "Dividends", symbols: ["KO"] };

async function mountOpen(symbol = "AAPL") {
  const wrapper = mount(WatchlistMenu, {
    props: { symbol },
    global: { plugins: [makeTestRouter()], stubs: { RouterLink: { template: "<a><slot /></a>" } } },
    attachTo: document.body,
  });
  await wrapper.find(".menu-btn").trigger("click");
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof mountOpen>>;

const checked = (wrapper: Wrapper) =>
  wrapper
    .findAll(".lists label")
    .filter((l) => (l.find("input").element as HTMLInputElement).checked)
    .map((l) => l.find(".list-name").text());

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchWatchlists.mockResolvedValue([DIVIDENDS, TECH]);
});

describe("WatchlistMenu", () => {
  it("ticks the lists the stock is already on", async () => {
    const wrapper = await mountOpen();
    expect(checked(wrapper)).toEqual(["Tech"]);
    wrapper.unmount();
  });

  it("adds the stock to a list when ticked, and removes it when unticked", async () => {
    api.addToWatchlist.mockResolvedValue({ ...DIVIDENDS, symbols: ["KO", "AAPL"] });
    api.removeFromWatchlist.mockResolvedValue({ ...TECH, symbols: [] });
    const wrapper = await mountOpen();
    const [dividends, tech] = wrapper.findAll(".lists input");

    await dividends.trigger("change");
    await tech.trigger("change");
    await flushPromises();

    expect(api.addToWatchlist).toHaveBeenCalledWith(2, "AAPL");
    expect(api.removeFromWatchlist).toHaveBeenCalledWith(1, "AAPL");
    expect(checked(wrapper)).toEqual(["Dividends"]);
    wrapper.unmount();
  });

  it("creates a new list with the stock already on it", async () => {
    api.createWatchlist.mockResolvedValue({ id: 3, name: "Semis", symbols: [] });
    api.addToWatchlist.mockResolvedValue({ id: 3, name: "Semis", symbols: ["NVDA"] });
    const wrapper = await mountOpen("NVDA");

    await wrapper.find(".create input").setValue("Semis");
    await wrapper.find(".create").trigger("submit");
    await flushPromises();

    expect(api.createWatchlist).toHaveBeenCalledWith("Semis");
    expect(api.addToWatchlist).toHaveBeenCalledWith(3, "NVDA");
    expect(checked(wrapper)).toEqual(["Semis"]);
    expect(wrapper.find(".menu-btn").classes()).toContain("on");
    wrapper.unmount();
  });

  it("shows why a change failed", async () => {
    api.addToWatchlist.mockRejectedValue(new Error("A watchlist can hold at most 200 symbols"));
    const wrapper = await mountOpen();

    await wrapper.findAll(".lists input")[0].trigger("change");
    await flushPromises();

    expect(wrapper.find(".error").text()).toBe("A watchlist can hold at most 200 symbols");
    wrapper.unmount();
  });

  it("closes when clicking outside", async () => {
    const wrapper = await mountOpen();
    expect(wrapper.find(".popover").exists()).toBe(true);

    document.body.click();
    await flushPromises();
    expect(wrapper.find(".popover").exists()).toBe(false);
    wrapper.unmount();
  });
});
