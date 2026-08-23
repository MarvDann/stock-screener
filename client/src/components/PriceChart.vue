<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, LineStyle, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";

const props = defineProps<{ bars: DailyBar[]; sma150Series: number[] }>();
const container = ref<HTMLDivElement | null>(null);
let chart: IChartApi | null = null;
let closeSeries: ISeriesApi<"Line"> | null = null;
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

  closeSeries = chart.addLineSeries({ color: "#2563eb", lineWidth: 2 });
  closeSeries.setData(props.bars.map((b) => ({ time: b.date.slice(0, 10), value: b.close })));

  smaSeries = chart.addLineSeries({ color: "#9333ea", lineWidth: 1, lineStyle: LineStyle.Dashed });
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
