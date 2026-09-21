import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EpsChart from "../EpsChart.vue";

describe("EpsChart", () => {
  it("renders one bar per EPS value, left to right in the given order", () => {
    const wrapper = mount(EpsChart, { props: { values: [1.1, 1.3, -0.2, 1.5] } });
    const bars = wrapper.findAll(".bar");

    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.attributes("title"))).toEqual(["1.10", "1.30", "-0.20", "1.50"]);
  });

  it("shows the exact EPS value in the title attribute for the tooltip", () => {
    const wrapper = mount(EpsChart, { props: { values: [2] } });
    expect(wrapper.find(".bar").attributes("title")).toBe("2.00");
  });

  it("marks non-negative bars as positive and negative bars as negative", () => {
    const wrapper = mount(EpsChart, { props: { values: [0.5, -0.5, 0] } });
    const bars = wrapper.findAll(".bar");

    expect(bars[0].classes()).toContain("positive");
    expect(bars[1].classes()).toContain("negative");
    expect(bars[2].classes()).toContain("positive");
  });

  it("separates bars with a 1 pixel gap", () => {
    const wrapper = mount(EpsChart, { props: { values: [1, 2, 3, 4] } });
    expect(wrapper.get<HTMLElement>(".eps-chart").element.style.gap).toBe("1px");
  });

  it("scales bar height by magnitude relative to the largest absolute value", () => {
    const wrapper = mount(EpsChart, { props: { values: [1, -2, 0.5] } });
    const bars = wrapper.findAll<HTMLElement>(".bar");

    expect(bars[1].element.style.height).toBe("100%");
    expect(bars[0].element.style.height).toBe("50%");
    expect(bars[2].element.style.height).toBe("25%");
  });

  it("shows an empty state when there is no EPS history", () => {
    const wrapper = mount(EpsChart, { props: { values: [] } });
    expect(wrapper.findAll(".bar")).toHaveLength(0);
    expect(wrapper.text()).toContain("No EPS data");
  });
});
