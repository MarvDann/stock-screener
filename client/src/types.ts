export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BreakoutCandidate {
  symbol: string;
  name: string;
  state: "triggered" | "approaching";
  details: {
    close: number;
    sma150: number;
    pctBelowSma150: number;
    rangeContractionPct: number;
    volumeRatio: number;
    daysSinceCross: number | null;
  };
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
}

export interface BreakoutResponse {
  triggered: BreakoutCandidate[];
  approaching: BreakoutCandidate[];
  warnings: string[];
}

export interface StockDetail {
  symbol: string;
  name: string;
  bars: DailyBar[];
  sma50Series: number[];
  sma150Series: number[];
  details: {
    close: number;
    sma150: number;
    pctBelowSma150: number;
    rangeContractionPct: number;
    volumeRatio: number;
    daysSinceCross: number | null;
  } | null;
}

export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  mansfieldRs: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  capitalFlow: "accumulating" | "distributing" | "neutral";
  rank: number;
}

export interface SectorRotationResponse {
  results: SectorRotationResult[];
  warnings: string[];
}
