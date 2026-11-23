import type { Theme } from "../composables/useTheme";

export interface ChartTheme {
  /** Axis labels. */
  text: string;
  grid: string;
  up: string;
  down: string;
  volumeUp: string;
  volumeDown: string;
  /** Reference lines (e.g. a VIX threshold): recessive, a step stronger than the grid. */
  reference: string;
  /** Line-chart series slots, in fixed order. Blue, orange, aqua, then violet for a lone derived series. */
  series: [string, string, string, string];
}

const STANDARD_CANDLES = {
  up: "#17c964",
  down: "#f5384e",
  volumeUp: "rgba(23, 201, 100, 0.5)",
  volumeDown: "rgba(245, 56, 78, 0.5)",
};

// Series slots come from a colour-blind-validated categorical palette, stepped
// separately for light and dark surfaces; matrix's near-black takes the dark steps.
const DARK_SERIES: ChartTheme["series"] = ["#3987e5", "#d95926", "#199e70", "#9085e9"];
const LIGHT_SERIES: ChartTheme["series"] = ["#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"];

export const CHART_THEMES: Record<Theme, ChartTheme> = {
  dark: {
    text: "#8b8fa3",
    grid: "rgba(91, 95, 114, 0.12)",
    reference: "rgba(139, 143, 163, 0.45)",
    series: DARK_SERIES,
    ...STANDARD_CANDLES,
  },
  light: {
    text: "#5c6070",
    grid: "rgba(91, 95, 114, 0.18)",
    reference: "rgba(92, 96, 112, 0.45)",
    series: LIGHT_SERIES,
    ...STANDARD_CANDLES,
  },
  matrix: {
    text: "#3fbf63",
    grid: "rgba(0, 255, 65, 0.08)",
    reference: "rgba(63, 191, 99, 0.5)",
    series: DARK_SERIES,
    up: "#00ff41",
    down: "#ff4d5e",
    volumeUp: "rgba(0, 255, 65, 0.4)",
    volumeDown: "rgba(255, 77, 94, 0.45)",
  },
};

/** Moving-average line colours, the same in every theme: 50-day yellow, 150-day violet, 200-day red. */
export const SMA_COLORS = {
  sma50: "#facc15",
  sma150: "#a78bfa",
  sma200: "#ef4444",
} as const;

/** Moving averages sit slightly behind the candles so price stays the focus. */
export const SMA_LINE_OPACITY = 0.75;

/** A "#rgb" or "#rrggbb" colour as rgba() at the given opacity; anything else is returned unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const digits = m[1].length === 3 ? [...m[1]].map((d) => d + d).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
