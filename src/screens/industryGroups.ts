import { BreakoutScreenResult, DailyBar, SymbolHistory } from "../types";
import { highestHigh, sma } from "../indicators/movingAverage";
import { percentileRatings, rsRatings } from "../indicators/relativeStrength";
import { passesTrendTemplate } from "./trendTemplate";
import { DEFAULT_BREAKOUT_CONFIG, runBreakoutScreen } from "./breakoutScreen";

/** Bars in a trading year, for the 52-week high. */
const YEAR_BARS = 252;

/** Trading-day lookbacks for 1- and 3-month performance. */
const MONTH_BARS = 21;
const QUARTER_BARS = 63;

export interface IndustryGroupsConfig {
  /** Groups returned, strongest first. Default 10. */
  topGroups: number;
  /** Fewest RS-rated stocks a group needs to be ranked, so a few hot stocks aren't a "group". Default 5. */
  minMembers: number;
  /** Stocks listed per group: the leader plus its top competitors. Default 6. */
  membersPerGroup: number;
}

export const DEFAULT_INDUSTRY_GROUPS_CONFIG: IndustryGroupsConfig = {
  topGroups: 10,
  minMembers: 5,
  membersPerGroup: 6,
};

export interface IndustryGroupMember {
  symbol: string;
  name: string;
  close: number;
  /** 1-month performance as a percentile (1–99) of the tracked universe's; null without the history. */
  rs1m: number | null;
  /** 3-month performance as a percentile (1–99) of the tracked universe's; null without the history. */
  rs3m: number | null;
  /** % price change over 1 and 3 months; null without enough history. */
  perf1m: number | null;
  perf3m: number | null;
  /** % below the 52-week high (0 at the high, negative below). */
  pctFromHigh: number;
  aboveSma50: boolean;
  /** Passes Minervini's Trend Template — a Stage 2 uptrend. */
  stage2: boolean;
  /** The breakout screen's verdict, or null when it isn't setting up. */
  setup: BreakoutScreenResult["state"] | null;
}

export interface IndustryGroup {
  /** 1 = strongest of every ranked group. */
  rank: number;
  industry: string;
  /** The sector most of the group's stocks are in. */
  sector: string;
  /** A group the user made (e.g. "Cybersecurity") rather than the data provider's industry. */
  custom: boolean;
  /** Every tracked stock in the group with price data. */
  memberCount: number;
  /** Mean of the members' 1-month and 3-month RS — what groups are ranked by. */
  rsScore: number;
  avgRs1m: number;
  avgRs3m: number;
  /** Equal-weighted average % change of the members over 1 and 3 months; null if none have the history. */
  perf1m: number | null;
  perf3m: number | null;
  aboveSma50: number;
  stage2: number;
  /** Strongest first by short-term RS — the first is the group leader. At most `membersPerGroup`. */
  members: IndustryGroupMember[];
}

export interface IndustryGroupsResult {
  /** Groups with enough rated stocks to be ranked. */
  rankedGroups: number;
  groups: IndustryGroup[];
}

function pctChange(bars: DailyBar[], lookback: number): number | null {
  const end = bars.length - 1;
  const past = bars[end - lookback]?.close;
  return past ? ((bars[end].close - past) / past) * 100 : null;
}

function mean(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? present.reduce((sum, v) => sum + v, 0) / present.length : null;
}

/** The average of a stock's 1-month and 3-month RS, or null until it has 3 months of history. */
function shortTermRs(m: { rs1m: number | null; rs3m: number | null }): number | null {
  return m.rs1m === null || m.rs3m === null ? null : (m.rs1m + m.rs3m) / 2;
}

/** Strongest short-term RS first; unrated stocks last, then by 3-month performance. */
function byStrength(a: IndustryGroupMember, b: IndustryGroupMember): number {
  return (shortTermRs(b) ?? -1) - (shortTermRs(a) ?? -1) || (b.perf3m ?? -Infinity) - (a.perf3m ?? -Infinity);
}

export interface GroupProfile {
  name: string;
  sector: string | null;
  industry: string | null;
  /** Ranked in place of `industry` when set. */
  customGroup?: string | null;
}

/** The most common of `values`, ties going to the first seen. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best), ["", 0])[0];
}

/**
 * Ranks industry groups (sub-sectors) by their stocks' short-term relative
 * strength — the average of each stock's 1-month and 3-month performance
 * percentile across the universe — and lists each of the strongest groups'
 * leader and top competitors. A stock with a custom group is ranked in that
 * group instead of its industry. Percentiles rank every history passed, so pass
 * the whole universe, not just one group.
 */
export function rankIndustryGroups(
  histories: SymbolHistory[],
  profiles: Record<string, GroupProfile>,
  config: IndustryGroupsConfig = DEFAULT_INDUSTRY_GROUPS_CONFIG,
  benchmarkBars?: DailyBar[]
): IndustryGroupsResult {
  const withBars = histories.filter((h) => h.bars.length > 0);
  const scoresOver = (lookback: number) =>
    percentileRatings(withBars.map((h) => ({ symbol: h.symbol, score: pctChange(h.bars, lookback) ?? NaN })));
  const rs1m = scoresOver(MONTH_BARS);
  const rs3m = scoresOver(QUARTER_BARS);
  // Only for the breakout screen, so setups match the Breakout page.
  const yearRatings = rsRatings(withBars);

  const byGroup = new Map<string, { custom: boolean; sectors: string[]; histories: SymbolHistory[] }>();
  for (const history of withBars) {
    const profile = profiles[history.symbol];
    const name = profile?.customGroup || profile?.industry;
    if (!name) continue;
    // A custom group sharing a provider industry's name merges with it.
    const group = byGroup.get(name) ?? { custom: false, sectors: [], histories: [] };
    group.custom ||= Boolean(profile.customGroup);
    group.sectors.push(profile.sector ?? "");
    group.histories.push(history);
    byGroup.set(name, group);
  }

  const ranked = [...byGroup]
    .map(([industry, group]) => {
      const ratings = group.histories.map((h) => ({ rs1m: rs1m.get(h.symbol) ?? null, rs3m: rs3m.get(h.symbol) ?? null }));
      const rated = ratings.filter((r) => shortTermRs(r) !== null);
      return {
        industry,
        custom: group.custom,
        sector: mostCommon(group.sectors),
        histories: group.histories,
        rated: rated.length,
        avgRs1m: mean(rated.map((r) => r.rs1m)) ?? 0,
        avgRs3m: mean(rated.map((r) => r.rs3m)) ?? 0,
        rsScore: mean(rated.map(shortTermRs)) ?? 0,
      };
    })
    .filter((g) => g.rated >= config.minMembers)
    .sort((a, b) => b.rsScore - a.rsScore || a.industry.localeCompare(b.industry));

  // Only the top groups' stocks are screened in full.
  const groups = ranked.slice(0, config.topGroups).map((g, i): IndustryGroup => {
    const members = g.histories
      .map((history): IndustryGroupMember => {
        const { bars, symbol } = history;
        const end = bars.length - 1;
        const close = bars[end].close;
        const sma50 = sma(bars, 50, end);
        const yearHigh = highestHigh(bars, YEAR_BARS, end);
        const name = profiles[symbol]?.name ?? "";
        const rsRating = yearRatings.get(symbol) ?? null;
        const setup = runBreakoutScreen(history, DEFAULT_BREAKOUT_CONFIG, name, { rsRating, benchmarkBars });
        return {
          symbol,
          name,
          close,
          rs1m: rs1m.get(symbol) ?? null,
          rs3m: rs3m.get(symbol) ?? null,
          perf1m: pctChange(bars, MONTH_BARS),
          perf3m: pctChange(bars, QUARTER_BARS),
          pctFromHigh: ((close - yearHigh) / yearHigh) * 100,
          aboveSma50: !isNaN(sma50) && close > sma50,
          stage2: passesTrendTemplate(bars, end, rsRating, DEFAULT_BREAKOUT_CONFIG.trendTemplate),
          setup: setup?.state ?? null,
        };
      })
      .sort(byStrength);

    return {
      rank: i + 1,
      industry: g.industry,
      sector: g.sector,
      custom: g.custom,
      memberCount: members.length,
      rsScore: g.rsScore,
      avgRs1m: g.avgRs1m,
      avgRs3m: g.avgRs3m,
      perf1m: mean(members.map((m) => m.perf1m)),
      perf3m: mean(members.map((m) => m.perf3m)),
      aboveSma50: members.filter((m) => m.aboveSma50).length,
      stage2: members.filter((m) => m.stage2).length,
      members: members.slice(0, config.membersPerGroup),
    };
  });

  return { rankedGroups: ranked.length, groups };
}
