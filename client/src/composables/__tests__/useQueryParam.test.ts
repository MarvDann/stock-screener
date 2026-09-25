import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { routerAt } from "../../__tests__/testRouter";
import { useQueryPage, useQueryParam } from "../useQueryParam";

/** Mounts a component that exposes the composables' refs, under a router at `query`. */
async function setup(query: Record<string, string> = {}) {
  const router = await routerAt(query);
  let refs!: { q: ReturnType<typeof useQueryParam>; sector: ReturnType<typeof useQueryParam>; page: ReturnType<typeof useQueryPage> };
  mount(
    defineComponent({
      setup() {
        refs = { q: useQueryParam("q"), sector: useQueryParam("sector", "all"), page: useQueryPage() };
        return () => h("div");
      },
    }),
    { global: { plugins: [router] } }
  );
  return { router, ...refs };
}

describe("useQueryParam", () => {
  it("reads from the URL, with fallbacks for missing values", async () => {
    const { q, sector, page } = await setup({ q: "apple", page: "3" });
    expect(q.value).toBe("apple");
    expect(sector.value).toBe("all");
    expect(page.value).toBe(3);
  });

  it("writes to the URL with replace, leaving defaults out", async () => {
    const { router, q, sector, page } = await setup();
    const historyLength = window.history.length;
    q.value = "micro";
    sector.value = "Technology";
    page.value = 2;
    expect(q.value).toBe("micro"); // visible before the navigation lands
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: "micro", sector: "Technology", page: "2" });
    expect(window.history.length).toBe(historyLength);

    sector.value = "all";
    page.value = 1;
    q.value = "";
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
  });

  it("keeps both of two writes made while a navigation is in flight", async () => {
    const { router, q, sector } = await setup();
    sector.value = "Energy";
    await Promise.resolve(); // first replace has started but not landed
    q.value = "oil";
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ sector: "Energy", q: "oil" });
  });

  it("ignores a bad page number", async () => {
    const { page } = await setup({ page: "abc" });
    expect(page.value).toBe(1);
  });

  it("ignores writes once its page has been left", async () => {
    const { router, q } = await setup();
    await router.push("/stock/AAPL");
    q.value = "late"; // e.g. a stray write from the page being left
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/stock/AAPL");
  });
});
