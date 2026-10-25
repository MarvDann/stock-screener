import { SymbolHistory } from "../types";

/** Yahoo's index symbols and their display names, in the order the page shows them. */
export const VOLATILITY_INDICES: Record<string, string> = {
  "^VIX": "VIX",
  "^VIX9D": "VIX 9-day",
  "^VIX3M": "VIX 3-month",
  "^VVIX": "VVIX",
};

/** VIX levels where the market's mood changes; 20 and 30 are the usual lines in the sand. */
const REGIMES: { below: number; regime: VolatilityRegime }[] = [
  { below: 15, regime: "calm" },
  { below: 20, regime: "normal" },
  { below: 30, regime: "elevated" },
  { below: Infinity, regime: "high" },
];

const YEAR_SESSIONS = 252;

export type VolatilityRegime = "calm" | "normal" | "elevated" | "high";

export interface DatedValue {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface LatestMove {
  close: number;
  /** Point change from the previous close; null with only one bar. */
  change: number | null;
  changePct: number | null;
}

export interface VolatilitySummary {
  /** Latest VIX session, YYYY-MM-DD. */
  asOf: string | null;
  vix: (LatestMove & { high52w: number; low52w: number; percentile1y: number; regime: VolatilityRegime }) | null;
  vvix: LatestMove | null;
  /** VIX ÷ VIX 3-month on the latest day both have. Above 1 the curve is inverted (backwardation). */
  termRatio: number | null;
  /** Daily closes per index, oldest first, keyed by Yahoo symbol. */
  series: { symbol: string; name: string; points: DatedValue[] }[];
  /** VIX ÷ VIX 3-month for each day both have, oldest first. */
  termRatioSeries: DatedValue[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function vixRegime(level: number): VolatilityRegime {
  return REGIMES.find((r) => level < r.below)!.regime;
}

function latestMove(points: DatedValue[]): LatestMove | null {
  const last = points.at(-1);
  if (!last) return null;
  const prev = points.at(-2);
  return {
    close: last.value,
    change: prev ? last.value - prev.value : null,
    changePct: prev ? ((last.value - prev.value) / prev.value) * 100 : null,
  };
}

/** Share of the past year's closes at or below the latest, 0–100. */
function percentileRank(values: number[]): number {
  const latest = values.at(-1)!;
  return (values.filter((v) => v <= latest).length / values.length) * 100;
}

/** a ÷ b for each date in both. */
export function ratioSeries(a: DatedValue[], b: DatedValue[]): DatedValue[] {
  const byDate = new Map(b.map((p) => [p.date, p.value]));
  return a
    .filter((p) => byDate.get(p.date))
    .map((p) => ({ date: p.date, value: p.value / byDate.get(p.date)! }));
}

export function summarizeVolatility(histories: SymbolHistory[]): VolatilitySummary {
  const points = new Map(
    histories.map((h) => [h.symbol, h.bars.map((b) => ({ date: dayKey(b.date), value: b.close }))])
  );
  const vixPoints = points.get("^VIX") ?? [];
  const vixMove = latestMove(vixPoints);
  const yearCloses = vixPoints.slice(-YEAR_SESSIONS).map((p) => p.value);
  const termRatioSeries = ratioSeries(vixPoints, points.get("^VIX3M") ?? []);

  return {
    asOf: vixPoints.at(-1)?.date ?? null,
    vix: vixMove && {
      ...vixMove,
      high52w: Math.max(...yearCloses),
      low52w: Math.min(...yearCloses),
      percentile1y: percentileRank(yearCloses),
      regime: vixRegime(vixMove.close),
    },
    vvix: latestMove(points.get("^VVIX") ?? []),
    termRatio: termRatioSeries.at(-1)?.value ?? null,
    series: Object.entries(VOLATILITY_INDICES)
      .filter(([symbol]) => (points.get(symbol)?.length ?? 0) > 0)
      .map(([symbol, name]) => ({ symbol, name, points: points.get(symbol)! })),
    termRatioSeries,
  };
}
