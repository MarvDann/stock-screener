<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, LineStyle, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";

const props = defineProps<{ bars: DailyBar[]; sma150Series: number[] }>();
const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let smaSeries: ISeriesApi<"Line"> | null = null;

function render() {
  if (!container.value) return;
  if (chart) {
    chart.remove();
    chart = null;
  }

  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: 160,
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
    upColor: "#16a34a",
    downColor: "#dc2626",
    borderVisible: false,
    wickUpColor: "#16a34a",
    wickDownColor: "#dc2626",
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
  height: 160px;
}
</style>
