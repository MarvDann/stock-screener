<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
} from "lightweight-charts";
import { useTheme } from "../composables/useTheme";
import { CHART_THEMES } from "../utils/chartTheme";

export interface LineSeries {
  key: string;
  label: string;
  /** Palette slot, 0–3. Fixed per series so its colour doesn't change when others are hidden. */
  slot: 0 | 1 | 2 | 3;
  /** Oldest first; `date` is YYYY-MM-DD. */
  points: { date: string; value: number }[];
}

export interface ReferenceLine {
  value: number;
  label: string;
}

const props = withDefaults(
  defineProps<{ series: LineSeries[]; referenceLines?: ReferenceLine[]; height?: number; precision?: number }>(),
  { referenceLines: () => [], height: 320, precision: 2 }
);

const container = ref<HTMLDivElement | null>(null);
const { theme } = useTheme();
let chart: IChartApi | null = null;
let lines: { series: LineSeries; api: ISeriesApi<"Line"> }[] = [];
let resizeObserver: ResizeObserver | null = null;

interface Tooltip {
  date: string;
  left: number;
  rows: { key: string; label: string; color: string; value: string }[];
}
const tooltip = ref<Tooltip | null>(null);

const TOOLTIP_WIDTH = 170;

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One readout for every series at the hovered date, so the pointer never has to land on a line. */
function onCrosshairMove(param: MouseEventParams) {
  if (!param.time || !param.point || !container.value) {
    tooltip.value = null;
    return;
  }
  const colors = CHART_THEMES[theme.value];
  const rows = lines.flatMap(({ series, api }) => {
    const point = param.seriesData.get(api) as { value?: number } | undefined;
    return point?.value == null
      ? []
      : [{ key: series.key, label: series.label, color: colors.series[series.slot], value: point.value.toFixed(props.precision) }];
  });
  if (rows.length === 0) {
    tooltip.value = null;
    return;
  }
  // Sit beside the crosshair, flipping to its left near the right edge.
  const width = container.value.clientWidth;
  const left = param.point.x + 16 + TOOLTIP_WIDTH > width ? param.point.x - 16 - TOOLTIP_WIDTH : param.point.x + 16;
  tooltip.value = { date: String(param.time), left: Math.max(0, left), rows };
}

function render() {
  if (!container.value) return;
  chart?.remove();
  tooltip.value = null;
  const colors = CHART_THEMES[theme.value];

  chart = createChart(container.value, {
    width: container.value.clientWidth,
    height: props.height,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: colors.text,
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: colors.grid },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: colors.reference, style: LineStyle.Solid, width: 1, labelVisible: false },
      horzLine: { visible: false, labelVisible: false },
    },
    timeScale: { borderVisible: false, rightOffset: 2 },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    handleScroll: false,
    handleScale: false,
  });

  lines = props.series.map((series) => {
    const api = chart!.addLineSeries({
      color: colors.series[series.slot],
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: props.precision, minMove: 1 / 10 ** props.precision },
    });
    api.setData(series.points.map((p) => ({ time: p.date, value: p.value })));
    return { series, api };
  });

  const anchor = lines[0]?.api;
  for (const line of props.referenceLines) {
    anchor?.createPriceLine({
      price: line.value,
      color: colors.reference,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      // The title only renders alongside the axis label.
      axisLabelVisible: true,
      title: line.label,
    });
  }

  chart.timeScale().fitContent();
  chart.subscribeCrosshairMove(onCrosshairMove);

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    if (chart && width) {
      chart.applyOptions({ width });
      chart.timeScale().fitContent();
    }
  });
  resizeObserver.observe(container.value);
}

onMounted(render);
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.remove();
});
watch([() => props.series, () => props.referenceLines, theme], render);
</script>

<template>
  <div class="line-chart" @pointerleave="tooltip = null">
    <div ref="container"></div>
    <div v-if="tooltip" class="tooltip" :style="{ left: `${tooltip.left}px`, width: `${TOOLTIP_WIDTH}px` }" role="status">
      <div class="tooltip-date">{{ formatDate(tooltip.date) }}</div>
      <div v-for="row in tooltip.rows" :key="row.key" class="tooltip-row">
        <span class="line-key" :style="{ background: row.color }"></span>
        <strong>{{ row.value }}</strong>
        <span class="tooltip-label">{{ row.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-chart {
  position: relative;
  width: 100%;
}
.tooltip {
  position: absolute;
  top: 8px;
  z-index: 2;
  pointer-events: none;
  padding: 8px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
  font-size: 12px;
}
.tooltip-date {
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.tooltip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}
.tooltip-row + .tooltip-row {
  margin-top: 4px;
}
.tooltip-row strong {
  font-family: var(--font-mono);
  font-weight: 600;
}
.tooltip-label {
  color: var(--text-secondary);
}
.line-key {
  width: 12px;
  height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
}
</style>
