import { SymbolHistory } from "../types";
import { sma } from "../indicators/movingAverage";

export interface Mover {
  symbol: string;
  name: string;
  close: number;
  /** Day-over-day change as a percent, e.g. 3.2 for +3.2%. */
  changePct: number;
}

export interface Breadth {
  /** Stocks with a bar on the latest trading day (the ones counted below). */
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  /** Stocks closing above their 50-day SMA; only those with 50+ bars are eligible. */
  aboveSma50: number;
}

export interface MarketOverview {
  /** Latest trading day in the data, YYYY-MM-DD. Null when there's no data at all. */
  asOf: string | null;
  breadth: Breadth;
  gainers: Mover[];
  losers: Mover[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

interface DayChange {
  symbol: string;
  close: number;
  changePct: number;
  aboveSma50: boolean;
}

/**
 * Each history's move on the latest trading day in the data. Only histories
 * whose last bar is on that day count, so a stock that hasn't traded
 * (halted, holiday on its exchange) doesn't skew "today".
 */
function latestDayChanges(histories: SymbolHistory[]): { asOf: string | null; changes: DayChange[] } {
  const withBars = histories.filter((h) => h.bars.length >= 2);
  const asOf = withBars.reduce<string | null>((latest, h) => {
    const day = dayKey(h.bars[h.bars.length - 1].date);
    return latest === null || day > latest ? day : latest;
  }, null);

  const changes: DayChange[] = [];
  for (const h of withBars) {
    const last = h.bars[h.bars.length - 1];
    if (dayKey(last.date) !== asOf) continue;
    const prev = h.bars[h.bars.length - 2];
    const sma50 = sma(h.bars, 50, h.bars.length - 1);
    changes.push({
      symbol: h.symbol,
      close: last.close,
      changePct: ((last.close - prev.close) / prev.close) * 100,
      aboveSma50: !isNaN(sma50) && last.close > sma50,
    });
  }
  return { asOf, changes };
}

function breadthOf(changes: DayChange[]): Breadth {
  const breadth: Breadth = { total: 0, advancers: 0, decliners: 0, unchanged: 0, aboveSma50: 0 };
  for (const c of changes) {
    breadth.total++;
    if (c.changePct > 0) breadth.advancers++;
    else if (c.changePct < 0) breadth.decliners++;
    else breadth.unchanged++;
    if (c.aboveSma50) breadth.aboveSma50++;
  }
  return breadth;
}

/** Breadth and top movers across many histories, oldest-bar-first. */
export function computeMarketOverview(
  histories: SymbolHistory[],
  names: Record<string, string> = {},
  moverCount = 5
): MarketOverview {
  const { asOf, changes } = latestDayChanges(histories);
  const movers = changes
    .map(({ symbol, close, changePct }) => ({ symbol, name: names[symbol] ?? "", close, changePct }))
    .sort((a, b) => b.changePct - a.changePct);
  return {
    asOf,
    breadth: breadthOf(changes),
    gainers: movers.filter((m) => m.changePct > 0).slice(0, moverCount),
    losers: movers.filter((m) => m.changePct < 0).reverse().slice(0, moverCount),
  };
}

export interface GroupStats extends Breadth {
  /** Equal-weighted average day change of the group's stocks, as a percent; null if none traded. */
  avgChangePct: number | null;
}

/**
 * Latest-day breadth and average move per group (e.g. per sector). Symbols
 * `groupOf` maps to null are left out.
 */
export function computeGroupStats(
  histories: SymbolHistory[],
  groupOf: (symbol: string) => string | null
): { asOf: string | null; groups: Map<string, GroupStats> } {
  const { asOf, changes } = latestDayChanges(histories);
  const byGroup = new Map<string, DayChange[]>();
  for (const c of changes) {
    const group = groupOf(c.symbol);
    if (group === null) continue;
    byGroup.set(group, [...(byGroup.get(group) ?? []), c]);
  }
  const groups = new Map<string, GroupStats>();
  for (const [group, members] of byGroup) {
    groups.set(group, {
      ...breadthOf(members),
      avgChangePct: members.reduce((sum, m) => sum + m.changePct, 0) / members.length,
    });
  }
  return { asOf, groups };
}
