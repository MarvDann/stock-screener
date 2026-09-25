import type { Component } from "vue";
import {
  Building2,
  CircleHelp,
  Cpu,
  Factory,
  Flame,
  HeartPulse,
  Landmark,
  Pickaxe,
  RadioTower,
  ShoppingBag,
  ShoppingCart,
  Zap,
} from "lucide-vue-next";
import type { Ticker } from "../types";

/** Label for tickers with no sector or sub-sector (not looked up yet, or none from Yahoo, e.g. ETFs). */
export const UNCATEGORIZED = "Uncategorized";

export const sectorOf = (t: Ticker): string => t.sector || UNCATEGORIZED;
export const industryOf = (t: Ticker): string => t.industry || UNCATEGORIZED;

export interface SectorMeta {
  icon: Component;
  /** Accent colour for the sector's icon badge and highlights. */
  color: string;
  /** The SPDR sector ETF tracking it — the same funds the Sector Rotation page ranks. */
  etf: string | null;
}

/** Keyed by Yahoo's sector names, which is what tickers are categorised by. */
const SECTOR_META: Record<string, SectorMeta> = {
  Technology: { icon: Cpu, color: "#4c8dff", etf: "XLK" },
  "Communication Services": { icon: RadioTower, color: "#22d3ee", etf: "XLC" },
  "Financial Services": { icon: Landmark, color: "#22c55e", etf: "XLF" },
  Healthcare: { icon: HeartPulse, color: "#f43f5e", etf: "XLV" },
  Industrials: { icon: Factory, color: "#94a3b8", etf: "XLI" },
  "Consumer Cyclical": { icon: ShoppingBag, color: "#ec4899", etf: "XLY" },
  "Consumer Defensive": { icon: ShoppingCart, color: "#a3e635", etf: "XLP" },
  "Real Estate": { icon: Building2, color: "#8b5cf6", etf: "XLRE" },
  Utilities: { icon: Zap, color: "#facc15", etf: "XLU" },
  "Basic Materials": { icon: Pickaxe, color: "#14b8a6", etf: "XLB" },
  Energy: { icon: Flame, color: "#f97316", etf: "XLE" },
};

const FALLBACK: SectorMeta = { icon: CircleHelp, color: "#6b7280", etf: null };

export function sectorMeta(sector: string): SectorMeta {
  return SECTOR_META[sector] ?? FALLBACK;
}

/** The Yahoo sector a sector ETF tracks, e.g. "XLF" → "Financial Services" (the names differ from GICS). */
export function sectorForEtf(etf: string): string | null {
  return Object.entries(SECTOR_META).find(([, meta]) => meta.etf === etf)?.[0] ?? null;
}
