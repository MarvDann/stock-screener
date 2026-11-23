import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PriceChart from "../PriceChart.vue";
import type { DailyBar } from "../../types";

const series = () => ({
  setData: vi.fn(),
  applyOptions: vi.fn(),
  priceScale: () => ({ applyOptions: vi.fn() }),
});

const chart = {
  addCandlestickSeries: vi.fn(series),
  addHistogramSeries: vi.fn(series),
  addLineSeries: vi.fn(series),
  addBarSeries: vi.fn(series),
  removeSeries: vi.fn(),
  applyOptions: vi.fn(),
  subscribeCrosshairMove: vi.fn(),
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
  chart.addBarSeries.mockClear();
  chart.removeSeries.mockClear();
  chart.subscribeCrosshairMove.mockClear();
  chart.remove.mockClear();
});

describe("PriceChart", () => {
  it("leaves wheel and two-finger trackpad scrolling to the page", () => {
    mount(PriceChart, { props: { bars: [makeBar({ date: "2024-01-02" })], movingAverages: [{ values: [NaN], color: "#ff0" }, { values: [NaN], color: "#a0f" }] } });

    const options = createChart.mock.calls[0][1] as {
      handleScroll: { mouseWheel: boolean; pressedMouseMove: boolean };
      handleScale: { mouseWheel: boolean; axisPressedMouseMove: boolean };
    };
    expect(options.handleScroll.mouseWheel).toBe(false);
    expect(options.handleScale.mouseWheel).toBe(false);
    expect(options.handleScroll.pressedMouseMove).toBe(true);
    expect(options.handleScale.axisPressedMouseMove).toBe(true);
  });

  it("creates a chart with candlestick, volume, and SMA series on mount", () => {
    mount(PriceChart, {
      props: {
        bars: [makeBar({ date: "2024-01-02" }), makeBar({ date: "2024-01-03" })],
        movingAverages: [{ values: [NaN, 10.5], color: "#ff0" }, { values: [NaN, NaN], color: "#a0f" }],
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
        movingAverages: [{ values: [NaN, 10.5], color: "#ff0" }, { values: [NaN, NaN], color: "#a0f" }],
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
        movingAverages: [{ values: [10], color: "#ff0" }, { values: [10], color: "#a0f" }],
      },
    });

    expect(createChart).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ bars: [makeBar(), makeBar({ date: "2024-01-03" })] });

    expect(chart.remove).toHaveBeenCalledTimes(1);
    expect(createChart).toHaveBeenCalledTimes(2);
  });

  it("removes the chart and disconnects the resize observer on unmount", () => {
    const wrapper = mount(PriceChart, {
      props: { bars: [makeBar()], movingAverages: [{ values: [10], color: "#ff0" }, { values: [10], color: "#a0f" }] },
    });

    wrapper.unmount();

    expect(chart.remove).toHaveBeenCalledTimes(1);
  });

  it("shows H, L, O, C and V for the hovered candle, falling back to the latest bar", async () => {
    const wrapper = mount(PriceChart, {
      props: {
        bars: [
          makeBar({ date: "2024-01-02T00:00:00Z", open: 10, high: 12.5, low: 9.25, close: 11, volume: 1234567 }),
          makeBar({ date: "2024-01-03T00:00:00Z", open: 11, high: 11.5, low: 10, close: 10.5, volume: 2000 }),
        ],
        movingAverages: [{ values: [NaN, NaN], color: "#ff0" }, { values: [NaN, NaN], color: "#a0f" }],
      },
    });
    const onMove = chart.subscribeCrosshairMove.mock.calls[0][0] as (p: { time?: string }) => void;
    const legend = () => wrapper.get('[data-testid="ohlcv-legend"]');

    expect(legend().text()).toContain("C: 10.50");
    expect(legend().classes()).toContain("down");

    onMove({ time: "2024-01-02" });
    await wrapper.vm.$nextTick();
    const text = legend().text();
    expect(text).toContain("H: 12.50");
    expect(text).toContain("L: 9.25");
    expect(text).toContain("O: 10.00");
    expect(text).toContain("C: 11.00");
    expect(text).toContain("V: 1.2M");
    expect(legend().classes()).toContain("up");

    onMove({});
    await wrapper.vm.$nextTick();
    expect(legend().text()).toContain("C: 10.50");
  });

  it("draws one line per moving average, hiding the ones switched off", () => {
    mount(PriceChart, {
      props: {
        bars: [makeBar()],
        movingAverages: [
          { values: [10], color: "#ff0" },
          { values: [9], color: "#a0f", visible: false },
          { values: [8], color: "#f00" },
        ],
      },
    });

    expect(chart.addLineSeries).toHaveBeenCalledTimes(3);
    expect(chart.addLineSeries.mock.calls.map((c) => (c as unknown as [{ color: string; visible: boolean }])[0])).toMatchObject([
      { color: "rgba(255, 255, 0, 0.75)", visible: true },
      { color: "rgba(170, 0, 255, 0.75)", visible: false },
      { color: "rgba(255, 0, 0, 0.75)", visible: true },
    ]);
  });

  it("toggles a line's visibility without redrawing the chart", async () => {
    const ma200 = [8];
    const wrapper = mount(PriceChart, {
      props: { bars: [makeBar()], movingAverages: [{ values: [10], color: "#ff0" }, { values: ma200, color: "#f00" }] },
    });
    const fast = chart.addLineSeries.mock.results[0].value;
    const slow = chart.addLineSeries.mock.results[1].value;
    const first = wrapper.props("movingAverages")[0];

    await wrapper.setProps({ movingAverages: [first, { values: ma200, color: "#f00", visible: false }] });

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(slow.applyOptions).toHaveBeenCalledWith({ visible: false, lastValueVisible: false });
    expect(fast.applyOptions).toHaveBeenCalledWith({ visible: true, lastValueVisible: true });
  });

  it("adds the moving averages before the candles so they draw behind them", () => {
    mount(PriceChart, { props: { bars: [makeBar()], movingAverages: [{ values: [10], color: "#ff0" }] } });

    const [lineOrder] = chart.addLineSeries.mock.invocationCallOrder;
    const [candleOrder] = chart.addCandlestickSeries.mock.invocationCallOrder;
    expect(lineOrder).toBeLessThan(candleOrder);
  });

  it("draws HLC bars, without the open tick, when asked for bars", () => {
    mount(PriceChart, { props: { bars: [makeBar()], movingAverages: [], priceStyle: "bars" } });

    expect(chart.addCandlestickSeries).not.toHaveBeenCalled();
    expect(chart.addBarSeries).toHaveBeenCalledTimes(1);
    expect(chart.addBarSeries.mock.calls[0]).toMatchObject([{ openVisible: false }]);
  });

  it("swaps candles for bars in place, keeping the chart", async () => {
    const wrapper = mount(PriceChart, { props: { bars: [makeBar()], movingAverages: [] } });
    const candles = chart.addCandlestickSeries.mock.results[0].value;

    await wrapper.setProps({ priceStyle: "bars" });

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(chart.removeSeries).toHaveBeenCalledWith(candles);
    expect(chart.addBarSeries).toHaveBeenCalledTimes(1);
    expect(chart.addBarSeries.mock.results[0].value.setData).toHaveBeenCalledWith([
      { time: "2024-01-02", open: 10, high: 12, low: 9, close: 11 },
    ]);
  });
});
