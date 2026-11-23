<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ColorType, createChart, LineStyle, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { DailyBar } from "../types";
import { useTheme } from "../composables/useTheme";
import { CHART_THEMES, SMA_LINE_OPACITY, withAlpha } from "../utils/chartTheme";
import { formatAbbreviatedNumber } from "../utils/format";

/** One moving-average line; hidden lines keep their data so toggling is instant. */
export interface MovingAverageLine {
  values: number[];
  color: string;
  visible?: boolean;
}

const props = withDefaults(defineProps<{ bars: DailyBar[]; movingAverages: MovingAverageLine[]; height?: number }>(), {
  height: 200,
});
const container = ref<HTMLDivElement | null>(null);
const { theme } = useTheme();
let chart: IChartApi | null = null;
let candleSeries: ISeriesApi<"Candlestick"> | null = null;
let maSeries: ISeriesApi<"Line">[] = [];
let volumeSeries: ISeriesApi<"Histogram"> | null = null;
let resizeObserver: ResizeObserver | null = null;
const hoveredBar = ref<DailyBar | null>(null);
// The readout sits above the chart rather than over the candles, and shows the
// latest bar when nothing is hovered so the line never appears or disappears.
const legendBar = computed(() => hoveredBar.value ?? props.bars[props.bars.length - 1] ?? null);
const legendUp = computed(() => (legendBar.value ? legendBar.value.close >= legendBar.value.open : true));

const formatOhlc = (value: number) => value.toFixed(2);

function render() {
  if (!container.value) return;
  if (chart) {
    chart.remove();
    chart = null;
  }

  const colors = CHART_THEMES[theme.value];
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

  // Series draw in the order they're added, so the moving averages go first to sit behind the candles.
  maSeries = props.movingAverages.map((ma) => {
    const line = chart!.addLineSeries({
      color: withAlpha(ma.color, SMA_LINE_OPACITY),
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: ma.visible !== false,
      visible: ma.visible !== false,
    });
    line.setData(
      props.bars
        .map((b, i) => ({ time: b.date.slice(0, 10), value: ma.values[i] }))
        .filter((p) => p.value != null && !Number.isNaN(p.value))
    );
    return line;
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

  const barsByTime = new Map(props.bars.map((b) => [b.date.slice(0, 10), b]));
  hoveredBar.value = null;
  chart.subscribeCrosshairMove((param) => {
    hoveredBar.value = param.time ? barsByTime.get(String(param.time)) ?? null : null;
  });

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
const sameLines = (a: MovingAverageLine[], b: MovingAverageLine[]) =>
  a.length === b.length && a.every((ma, i) => ma.values === b[i].values && ma.color === b[i].color);

// New bars, lines or theme redraw the chart; a visibility toggle alone just shows or hides a line.
watch([() => props.bars, () => props.movingAverages, theme], ([bars, lines, t], [prevBars, prevLines, prevTheme]) => {
  if (bars !== prevBars || t !== prevTheme || !sameLines(lines, prevLines)) {
    render();
    return;
  }
  lines.forEach((ma, i) => {
    const visible = ma.visible !== false;
    maSeries[i]?.applyOptions({ visible, lastValueVisible: visible });
  });
});
</script>

<template>
  <div class="chart-wrap">
    <div v-if="legendBar" class="legend" :class="legendUp ? 'up' : 'down'" data-testid="ohlcv-legend">
      <span><span class="label">H:</span> <span class="value">{{ formatOhlc(legendBar.high) }}</span></span>
      <span><span class="label">L:</span> <span class="value">{{ formatOhlc(legendBar.low) }}</span></span>
      <span><span class="label">O:</span> <span class="value">{{ formatOhlc(legendBar.open) }}</span></span>
      <span><span class="label">C:</span> <span class="value">{{ formatOhlc(legendBar.close) }}</span></span>
      <span><span class="label">V:</span> <span class="value">{{ formatAbbreviatedNumber(legendBar.volume) }}</span></span>
    </div>
    <div ref="container" class="chart"></div>
  </div>
</template>

<style scoped>
.chart-wrap {
  width: 100%;
}
.chart {
  width: 100%;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  padding: 0 2px 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
}
.legend .label {
  color: var(--text-muted);
}
.legend.up .value {
  color: var(--positive);
}
.legend.down .value {
  color: var(--negative);
}
</style>
