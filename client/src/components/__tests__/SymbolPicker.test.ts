import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SymbolPicker from "../SymbolPicker.vue";

const OPTIONS = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "AMD", name: "Advanced Micro Devices" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "SPY", name: "SPDR S&P 500" },
];

function mountPicker(exclude: string[] = []) {
  return mount(SymbolPicker, { props: { options: OPTIONS, exclude } });
}

type Wrapper = ReturnType<typeof mountPicker>;

async function type(wrapper: Wrapper, text: string) {
  const input = wrapper.find("input");
  await input.trigger("focus");
  await input.setValue(text);
}

const suggestions = (wrapper: Wrapper) => wrapper.findAll("li .symbol").map((s) => s.text());
const picked = (wrapper: Wrapper) => wrapper.emitted("pick")?.map(([s]) => s);

describe("SymbolPicker", () => {
  it("suggests matches by symbol or name, best first, with names shown", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "micro");
    expect(suggestions(wrapper)).toEqual(["MSFT", "AMD"]);
    expect(wrapper.find("li .name").text()).toBe("Microsoft");
  });

  it("leaves out excluded symbols", async () => {
    const wrapper = mountPicker(["MSFT"]);
    await type(wrapper, "micro");
    expect(suggestions(wrapper)).toEqual(["AMD"]);
  });

  it("picks the top match on Enter and clears the box", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "micro");
    await wrapper.find("input").trigger("keydown", { key: "Enter" });
    expect(picked(wrapper)).toEqual(["MSFT"]);
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("");
    expect(wrapper.find("ul").exists()).toBe(false);
  });

  it("moves the highlight with the arrow keys, wrapping around", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "micro");
    const input = wrapper.find("input");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.find("li.active .symbol").text()).toBe("AMD");
    await input.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.find("li.active .symbol").text()).toBe("MSFT");
    await input.trigger("keydown", { key: "ArrowUp" });
    await input.trigger("keydown", { key: "Enter" });
    expect(picked(wrapper)).toEqual(["AMD"]);
  });

  it("picks a suggestion with the mouse", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "sp");
    await wrapper.find("li").trigger("mousedown");
    expect(picked(wrapper)).toEqual(["SPY"]);
  });

  it("passes on an unknown symbol as typed, uppercased, for the server to check", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "shop.to");
    expect(suggestions(wrapper)).toEqual([]);
    await wrapper.find("input").trigger("keydown", { key: "Enter" });
    expect(picked(wrapper)).toEqual(["SHOP.TO"]);
  });

  it("closes the suggestions on Escape", async () => {
    const wrapper = mountPicker();
    await type(wrapper, "a");
    expect(wrapper.find("ul").exists()).toBe(true);
    await wrapper.find("input").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("ul").exists()).toBe(false);
  });
});
