import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import LineChart, { type LineSeries } from "../LineChart.vue";
import { CHART_THEMES } from "../../utils/chartTheme";

type CrosshairHandler = (param: unknown) => void;

const makeSeries = () => ({ setData: vi.fn(), createPriceLine: vi.fn() });
let crosshairHandler: CrosshairHandler | null = null;
const chart = {
  addLineSeries: vi.fn(makeSeries),
  applyOptions: vi.fn(),
  remove: vi.fn(),
  timeScale: () => ({ fitContent: vi.fn() }),
  subscribeCrosshairMove: vi.fn((handler: CrosshairHandler) => {
    crosshairHandler = handler;
  }),
};
const createChart = vi.fn((..._args: unknown[]) => chart);

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  CrosshairMode: { Magnet: 1 },
  LineStyle: { Solid: 0 },
  createChart: (...args: unknown[]) => createChart(...args),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
  }
);

const vix: LineSeries = { key: "^VIX", label: "VIX", slot: 0, points: [{ date: "2026-10-09", value: 14.84 }] };
const vix3m: LineSeries = { key: "^VIX3M", label: "VIX 3-month", slot: 2, points: [{ date: "2026-10-09", value: 17.77 }] };

beforeEach(() => {
  createChart.mockClear();
  chart.addLineSeries.mockClear();
  crosshairHandler = null;
});

describe("LineChart", () => {
  it("draws a 2px line per series in its slot's colour", () => {
    mount(LineChart, { props: { series: [vix, vix3m] } });

    const options = chart.addLineSeries.mock.calls.map((c) => (c as unknown[])[0] as { color: string; lineWidth: number });
    const palette = CHART_THEMES.dark.series;
    expect(options.map((o) => o.color)).toEqual([palette[0], palette[2]]);
    expect(options.every((o) => o.lineWidth === 2)).toBe(true);

    const line = chart.addLineSeries.mock.results[0].value;
    expect(line.setData).toHaveBeenCalledWith([{ time: "2026-10-09", value: 14.84 }]);
  });

  it("adds labelled reference lines", () => {
    mount(LineChart, { props: { series: [vix], referenceLines: [{ value: 20, label: "20 · elevated" }] } });

    const line = chart.addLineSeries.mock.results[0].value;
    expect(line.createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 20, title: "20 · elevated" }));
  });

  it("shows every series' value at the hovered date in one tooltip", async () => {
    const wrapper = mount(LineChart, { props: { series: [vix, vix3m] } });
    const [vixApi, vix3mApi] = chart.addLineSeries.mock.results.map((r) => r.value);

    crosshairHandler!({
      time: "2026-10-09",
      point: { x: 50, y: 40 },
      seriesData: new Map<unknown, unknown>([
        [vixApi, { value: 14.84 }],
        [vix3mApi, { value: 17.77 }],
      ]),
    });
    await wrapper.vm.$nextTick();

    const rows = wrapper.findAll(".tooltip-row");
    expect(rows.map((r) => r.text())).toEqual(["14.84VIX", "17.77VIX 3-month"]);

    crosshairHandler!({ time: undefined, point: undefined, seriesData: new Map() });
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".tooltip").exists()).toBe(false);
  });
});
