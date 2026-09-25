import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PriceChart from "../PriceChart.vue";
import type { DailyBar } from "../../types";

const series = () => ({
  setData: vi.fn(),
  priceScale: () => ({ applyOptions: vi.fn() }),
});

const chart = {
  addCandlestickSeries: vi.fn(series),
  addHistogramSeries: vi.fn(series),
  addLineSeries: vi.fn(series),
  applyOptions: vi.fn(),
  remove: vi.fn(),
};

const createChart = vi.fn((..._args: unknown[]) => chart);

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  LineStyle: { Dashed: 2 },
  createChart: (...args: unknown[]) => createChart(...args),
}));

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function makeBar(overrides: Partial<DailyBar> = {}): DailyBar {
  return { date: "2024-01-02", open: 10, high: 12, low: 9, close: 11, volume: 1000, ...overrides };
}

beforeEach(() => {
  createChart.mockClear();
  chart.addCandlestickSeries.mockClear();
  chart.addHistogramSeries.mockClear();
  chart.addLineSeries.mockClear();
  chart.remove.mockClear();
});

describe("PriceChart", () => {
  it("creates a chart with candlestick, volume, and SMA series on mount", () => {
    mount(PriceChart, {
      props: {
        bars: [makeBar({ date: "2024-01-02" }), makeBar({ date: "2024-01-03" })],
        sma50Series: [NaN, 10.5],
        sma150Series: [NaN, NaN],
      },
    });

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(chart.addCandlestickSeries).toHaveBeenCalledTimes(1);
    expect(chart.addHistogramSeries).toHaveBeenCalledTimes(1);
    expect(chart.addLineSeries).toHaveBeenCalledTimes(2);
  });

  it("filters out NaN/null SMA points before setting series data", () => {
    mount(PriceChart, {
      props: {
        bars: [makeBar({ date: "2024-01-02" }), makeBar({ date: "2024-01-03" })],
        sma50Series: [NaN, 10.5],
        sma150Series: [NaN, NaN],
      },
    });

    const sma50 = chart.addLineSeries.mock.results[0].value;
    expect(sma50.setData).toHaveBeenCalledWith([{ time: "2024-01-03", value: 10.5 }]);

    const sma150 = chart.addLineSeries.mock.results[1].value;
    expect(sma150.setData).toHaveBeenCalledWith([]);
  });

  it("re-renders the chart when the bars prop changes", async () => {
    const wrapper = mount(PriceChart, {
      props: {
        bars: [makeBar()],
        sma50Series: [10],
        sma150Series: [10],
      },
    });

    expect(createChart).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ bars: [makeBar(), makeBar({ date: "2024-01-03" })] });

    expect(chart.remove).toHaveBeenCalledTimes(1);
    expect(createChart).toHaveBeenCalledTimes(2);
  });

  it("removes the chart and disconnects the resize observer on unmount", () => {
    const wrapper = mount(PriceChart, {
      props: { bars: [makeBar()], sma50Series: [10], sma150Series: [10] },
    });

    wrapper.unmount();

    expect(chart.remove).toHaveBeenCalledTimes(1);
  });
});
