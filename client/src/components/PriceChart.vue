<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";

const props = defineProps<{ bars: DailyBar[]; sma150Series: number[] }>();
const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let smaSeries: ISeriesApi<"Line"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let resizeObserver: ResizeObserver | null = null;

// Keep these in sync with the --positive/--negative tokens in style.css.
const UP_COLOR = "#17c964";
const DOWN_COLOR = "#f5384e";
const VOLUME_UP_COLOR = "rgba(23, 201, 100, 0.5)";
const VOLUME_DOWN_COLOR = "rgba(245, 56, 78, 0.5)";

function render() {
  if (!container.value) return;
  if (chart) {
    chart.remove();
    chart = null;
  }

  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: 200,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: "#8b8fa3",
      fontSize: 10,
    },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  });

  candleSeries = chart.addCandlestickSeries({
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderVisible: false,
    wickUpColor: UP_COLOR,
    wickDownColor: DOWN_COLOR,
    priceLineVisible: false,
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
      color: b.close >= b.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
    }))
  );

  smaSeries = chart.addLineSeries({
    color: "#a78bfa",
    lineWidth: 1,
    priceLineVisible: false,
  });
  const smaPoints = props.bars
    .map((b, i) => ({ time: b.date.slice(0, 10), value: props.sma150Series[i] }))
    .filter((p) => !Number.isNaN(p.value));
  smaSeries.setData(smaPoints);

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver((entries) => {
    if (!chart) return;
    const width = entries[0]?.contentRect.width;
    if (width) chart.applyOptions({ width });
  });
  resizeObserver.observe(container.value);
}

onMounted(render);
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.remove();
});
watch(() => props.bars, render);
</script>

<template>
  <div ref="container" class="chart"></div>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 200px;
}
</style>
