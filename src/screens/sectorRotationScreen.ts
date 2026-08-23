import { SectorRotationResult, SymbolHistory } from "../types";
import { relativeStrength, moneyFlowScore, classifyMoneyFlow } from "../indicators/relativeStrength";

/** The 11 SPDR sector ETFs, covering the full S&P 500 sector breakdown. */
export const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLE: "Energy",
  XLV: "Health Care",
  XLI: "Industrials",
  XLY: "Consumer Discretionary",
  XLP: "Consumer Staples",
  XLU: "Utilities",
  XLB: "Materials",
  XLRE: "Real Estate",
  XLC: "Communication Services",
};

const TRADING_DAYS_1M = 21;
const TRADING_DAYS_3M = 63;
const TRADING_DAYS_6M = 126;
const MONEY_FLOW_PERIOD = 21;

/**
 * Ranks sector ETFs by relative strength vs the benchmark (typically SPY)
 * across three lookback windows, plus a money-flow (accumulation/distribution)
 * read on each. Sectors are ranked by 3-month relative strength as the
 * primary rotation signal — short enough to catch a real rotation, long
 * enough to filter out noise.
 */
export function runSectorRotationScreen(
  sectorHistories: SymbolHistory[],
  benchmarkHistory: SymbolHistory
): SectorRotationResult[] {
  const results: Omit<SectorRotationResult, "rank">[] = sectorHistories.map((history) => {
    const rs1m = relativeStrength(history.bars, benchmarkHistory.bars, TRADING_DAYS_1M);
    const rs3m = relativeStrength(history.bars, benchmarkHistory.bars, TRADING_DAYS_3M);
    const rs6m = relativeStrength(history.bars, benchmarkHistory.bars, TRADING_DAYS_6M);
    const flowScore = moneyFlowScore(history.bars, MONEY_FLOW_PERIOD);

    return {
      sectorSymbol: history.symbol,
      sectorName: SECTOR_ETFS[history.symbol] ?? history.symbol,
      relativeStrength1m: rs1m,
      relativeStrength3m: rs3m,
      relativeStrength6m: rs6m,
      moneyFlowTrend: classifyMoneyFlow(flowScore),
    };
  });

  const sorted = [...results].sort((a, b) => {
    const aVal = isNaN(a.relativeStrength3m) ? -Infinity : a.relativeStrength3m;
    const bVal = isNaN(b.relativeStrength3m) ? -Infinity : b.relativeStrength3m;
    return bVal - aVal;
  });

  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}
