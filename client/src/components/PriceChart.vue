<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, createChart, LineStyle, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";
import { useTheme, type Theme } from "../composables/useTheme";

const props = withDefaults(
  defineProps<{ bars: DailyBar[]; sma50Series: number[]; sma150Series: number[]; height?: number }>(),
  { height: 200 }
);
const container = ref<HTMLDivElement | null>(null);
const { theme } = useTheme();
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let sma50Series: ISeriesApi<"Line"> | null = null;
let sma150Series: ISeriesApi<"Line"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let resizeObserver: ResizeObserver | null = null;

const STANDARD_CANDLES = {
  up: "#17c964",
  down: "#f5384e",
  volumeUp: "rgba(23, 201, 100, 0.5)",
  volumeDown: "rgba(245, 56, 78, 0.5)",
};

const chartColors: Record<Theme, { text: string; grid: string; up: string; down: string; volumeUp: string; volumeDown: string }> = {
  dark: { text: "#8b8fa3", grid: "rgba(91, 95, 114, 0.12)", ...STANDARD_CANDLES },
  light: { text: "#5c6070", grid: "rgba(91, 95, 114, 0.18)", ...STANDARD_CANDLES },
  matrix: {
    text: "#3fbf63",
    grid: "rgba(0, 255, 65, 0.08)",
    up: "#00ff41",
    down: "#ff4d5e",
    volumeUp: "rgba(0, 255, 65, 0.4)",
    volumeDown: "rgba(255, 77, 94, 0.45)",
  },
};

function render() {
  if (!container.value) return;
  if (chart) {
    chart.remove();
    chart = null;
  }

  const colors = chartColors[theme.value];
  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: props.height,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: colors.text,
      fontSize: 10,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    timeScale: { borderVisible: false, rightOffset: 1 },
    rightPriceScale: { borderVisible: false },
    // Wheel and two-finger trackpad swipes scroll the page, not the chart;
    // pan by dragging the chart, zoom by dragging an axis.
    handleScroll: { mouseWheel: false, pressedMouseMove: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: colors.up,
    downColor: colors.down,
    borderVisible: false,
    wickUpColor: colors.up,
    wickDownColor: colors.down,
    priceLineWidth: 1,
    priceLineStyle: LineStyle.Dashed,
  });
  candleSeries.setData(
    props.bars.map((b) => ({
      time: b.date.slice(0, 10),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
  );
  candleSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.05, bottom: 0.3 },
  });

  volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
    priceLineVisible: false,
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.75, bottom: 0 },
  });
  volumeSeries.setData(
    props.bars.map((b) => ({
      time: b.date.slice(0, 10),
      value: b.volume,
      color: b.close >= b.open ? colors.volumeUp : colors.volumeDown,
    }))
  );

  sma50Series = chart.addLineSeries({
    color: "#facc15",
    lineWidth: 1,
    priceLineVisible: false,
  });
  sma50Series.setData(
    props.bars
      .map((b, i) => ({ time: b.date.slice(0, 10), value: props.sma50Series[i] }))
      .filter((p) => p.value != null && !Number.isNaN(p.value))
  );

  sma150Series = chart.addLineSeries({
    color: "#a78bfa",
    lineWidth: 1,
    priceLineVisible: false,
  });
  sma150Series.setData(
    props.bars
      .map((b, i) => ({ time: b.date.slice(0, 10), value: props.sma150Series[i] }))
      .filter((p) => p.value != null && !Number.isNaN(p.value))
  );

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver((entries) => {
    if (!chart) return;
    const { width, height } = entries[0]?.contentRect ?? {};
    if (width) chart.applyOptions({ width, height: height || props.height });
  });
  resizeObserver.observe(container.value);
}

onMounted(render);
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.remove();
});
watch([() => props.bars, theme], render);
</script>

<template>
  <div ref="container" class="chart"></div>
</template>

<style scoped>
.chart {
  width: 100%;
}
</style>
