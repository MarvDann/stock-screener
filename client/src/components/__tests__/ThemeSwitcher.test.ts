import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";

async function freshSwitcher() {
  vi.resetModules();
  return (await import("../ThemeSwitcher.vue")).default;
}

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("offers dark, light and matrix, with dark selected by default", async () => {
    const wrapper = mount(await freshSwitcher());

    const options = wrapper.findAll("[role=radio]");
    expect(options.map((o) => o.attributes("data-theme-option"))).toEqual(["dark", "light", "matrix"]);
    expect(options.map((o) => o.attributes("aria-checked"))).toEqual(["true", "false", "false"]);
  });

  it("switches to the clicked theme and marks it selected", async () => {
    const wrapper = mount(await freshSwitcher());

    await wrapper.find("[data-theme-option=matrix]").trigger("click");

    expect(document.documentElement.dataset.theme).toBe("matrix");
    expect(localStorage.getItem("theme")).toBe("matrix");
    expect(wrapper.find("[data-theme-option=matrix]").attributes("aria-checked")).toBe("true");
    expect(wrapper.find("[data-theme-option=dark]").attributes("aria-checked")).toBe("false");
  });
});
