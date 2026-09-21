import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WarningsBanner from "../WarningsBanner.vue";

describe("WarningsBanner", () => {
  it("renders nothing when there are no warnings", () => {
    const wrapper = mount(WarningsBanner, { props: { warnings: [] } });
    expect(wrapper.find(".banner").exists()).toBe(false);
  });

  it("shows the warning count and joined messages", () => {
    const wrapper = mount(WarningsBanner, {
      props: { warnings: ["AAPL: no data", "MSFT: stale"] },
    });
    const text = wrapper.find(".text").text();
    expect(text).toContain("2 symbol(s) skipped:");
    expect(text).toContain("AAPL: no data; MSFT: stale");
  });

  it("hides the banner after Dismiss is clicked", async () => {
    const wrapper = mount(WarningsBanner, { props: { warnings: ["AAPL: no data"] } });
    await wrapper.find(".dismiss").trigger("click");
    expect(wrapper.find(".banner").exists()).toBe(false);
  });

  it("reappears when the warnings prop changes after being dismissed", async () => {
    const wrapper = mount(WarningsBanner, { props: { warnings: ["AAPL: no data"] } });
    await wrapper.find(".dismiss").trigger("click");
    expect(wrapper.find(".banner").exists()).toBe(false);

    await wrapper.setProps({ warnings: ["MSFT: stale"] });
    expect(wrapper.find(".banner").exists()).toBe(true);
  });
});
