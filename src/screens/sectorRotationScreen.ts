import { SectorRotationResult, SymbolHistory } from "../types";
import { mansfieldRelativeStrength, moneyFlowScore, classifyMoneyFlow, classifyCapitalFlow } from "../indicators/relativeStrength";

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

const MANSFIELD_RS_PERIOD = 200;
const MONEY_FLOW_PERIOD = 21;

export function runSectorRotationScreen(
  sectorHistories: SymbolHistory[],
  benchmarkHistory: SymbolHistory
): SectorRotationResult[] {
  const results: Omit<SectorRotationResult, "rank">[] = sectorHistories.map((history) => {
    const mrs = mansfieldRelativeStrength(history.bars, benchmarkHistory.bars, MANSFIELD_RS_PERIOD);
    const flowScore = moneyFlowScore(history.bars, MONEY_FLOW_PERIOD);
    const moneyFlowTrend = classifyMoneyFlow(flowScore);

    return {
      sectorSymbol: history.symbol,
      sectorName: SECTOR_ETFS[history.symbol] ?? history.symbol,
      mansfieldRs: mrs,
      moneyFlowTrend,
      capitalFlow: classifyCapitalFlow(mrs, moneyFlowTrend),
    };
  });

  const sorted = [...results].sort((a, b) => {
    const aVal = isNaN(a.mansfieldRs) ? -Infinity : a.mansfieldRs;
    const bVal = isNaN(b.mansfieldRs) ? -Infinity : b.mansfieldRs;
    return bVal - aVal;
  });

  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}
