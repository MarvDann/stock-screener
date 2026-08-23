<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, LineStyle, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";

const props = defineProps<{ bars: DailyBar[]; sma150Series: number[] }>();
const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let smaSeries: ISeriesApi<"Line"> | null = null;
let volumeSeries: ISeriesApi<"Histogram"> | null = null;

const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

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
      textColor: "#64748b",
      fontSize: 10,
    },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
    handleScroll: false,
    handleScale: false,
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
      color: b.close >= b.open ? UP_COLOR : DOWN_COLOR,
    }))
  );

  smaSeries = chart.addLineSeries({
    color: "#9333ea",
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    priceLineVisible: false,
  });
  const smaPoints = props.bars
    .map((b, i) => ({ time: b.date.slice(0, 10), value: props.sma150Series[i] }))
    .filter((p) => !Number.isNaN(p.value));
  smaSeries.setData(smaPoints);
}

onMounted(render);
onBeforeUnmount(() => chart?.remove());
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
