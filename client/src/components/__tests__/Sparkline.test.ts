import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Sparkline from "../Sparkline.vue";

describe("Sparkline", () => {
  it("draws nothing with fewer than two points", () => {
    expect(mount(Sparkline, { props: { values: [5] } }).find("svg").exists()).toBe(false);
  });

  it("scales points into the box, highest value at the top", () => {
    const wrapper = mount(Sparkline, { props: { values: [0, 10], width: 100, height: 20 } });
    expect(wrapper.find("polyline").attributes("points")).toBe("0.0,18.5 100.0,1.5");
  });

  it("colours a rising line positive and a falling one negative", () => {
    const up = mount(Sparkline, { props: { values: [1, 2] } });
    const down = mount(Sparkline, { props: { values: [2, 1] } });
    expect(up.find("polyline").attributes("style")).toContain("var(--positive)");
    expect(down.find("polyline").attributes("style")).toContain("var(--negative)");
  });

  it("copes with a flat series", () => {
    const wrapper = mount(Sparkline, { props: { values: [3, 3, 3], width: 10, height: 10 } });
    expect(wrapper.find("polyline").attributes("points")).not.toContain("NaN");
  });
});
