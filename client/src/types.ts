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
  sma150Series: number[];
}

export interface BreakoutResponse {
  triggered: BreakoutCandidate[];
  approaching: BreakoutCandidate[];
  warnings: string[];
}

export interface SectorRotationResult {
  sectorSymbol: string;
  sectorName: string;
  relativeStrength1m: number;
  relativeStrength3m: number;
  relativeStrength6m: number;
  moneyFlowTrend: "accumulation" | "distribution" | "neutral";
  rank: number;
}

export interface SectorRotationResponse {
  results: SectorRotationResult[];
  warnings: string[];
}
