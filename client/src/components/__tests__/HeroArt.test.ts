import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HeroArt from "../HeroArt.vue";

describe("HeroArt", () => {
  it("is decorative, hidden from assistive tech", () => {
    expect(mount(HeroArt).find("svg").attributes("aria-hidden")).toBe("true");
  });

  it("draws the same candles every time", () => {
    const first = mount(HeroArt);
    const second = mount(HeroArt);
    expect(first.findAll(".candle")).toHaveLength(44);
    expect(first.findAll(".candle rect").map((r) => r.attributes("y"))).toEqual(
      second.findAll(".candle rect").map((r) => r.attributes("y"))
    );
  });

  it("has no trend line", () => {
    expect(mount(HeroArt).find("polyline").exists()).toBe(false);
  });
});
