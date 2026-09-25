import { SECTOR_ETFS } from "./screens/sectorRotationScreen";

export interface Etf {
  symbol: string;
  name: string;
  category: EtfCategory;
  /** Trading currency as Yahoo quotes it — "GBp" means pence. */
  currency: string;
}

/** Display order on the ETFs page. */
export const ETF_CATEGORIES = [
  "Global",
  "US Market",
  "Growth & Tech",
  "US Sectors",
  "Dividend & Value",
  "International",
  "UK",
  "Bonds",
  "Commodities",
  "Thematic",
] as const;

export type EtfCategory = (typeof ETF_CATEGORIES)[number];

type EtfEntry = [symbol: string, name: string, currency?: string];

/**
 * A curated spread of widely held ETFs rather than every ETF out there.
 * Currencies were checked against Yahoo; anything not given is USD.
 */
const CURATED: Record<Exclude<EtfCategory, "US Sectors">, EtfEntry[]> = {
  Global: [
    ["VWRP.L", "Vanguard FTSE All-World (Acc)", "GBP"],
    ["SWDA.L", "iShares Core MSCI World", "GBp"],
    ["VT", "Vanguard Total World Stock"],
    ["ACWI", "iShares MSCI ACWI"],
  ],
  "US Market": [
    ["SPY", "SPDR S&P 500"],
    ["VOO", "Vanguard S&P 500"],
    ["VTI", "Vanguard Total Stock Market"],
    ["IWM", "iShares Russell 2000"],
    ["DIA", "SPDR Dow Jones Industrial Average"],
    ["RSP", "Invesco S&P 500 Equal Weight"],
  ],
  "Growth & Tech": [
    ["QQQ", "Invesco QQQ (Nasdaq-100)"],
    ["VUG", "Vanguard Growth"],
    ["SMH", "VanEck Semiconductor"],
    ["SOXX", "iShares Semiconductor"],
    ["IGV", "iShares Expanded Tech-Software"],
  ],
  "Dividend & Value": [
    ["SCHD", "Schwab U.S. Dividend Equity"],
    ["VYM", "Vanguard High Dividend Yield"],
    ["VTV", "Vanguard Value"],
    ["VNQ", "Vanguard Real Estate"],
  ],
  International: [
    ["VEA", "Vanguard FTSE Developed Markets"],
    ["VWO", "Vanguard FTSE Emerging Markets"],
    ["EWJ", "iShares MSCI Japan"],
    ["INDA", "iShares MSCI India"],
    ["MCHI", "iShares MSCI China"],
  ],
  UK: [
    ["ISF.L", "iShares Core FTSE 100", "GBp"],
    ["VMID.L", "Vanguard FTSE 250", "GBP"],
    ["VUSA.L", "Vanguard S&P 500 (UK)", "GBP"],
  ],
  Bonds: [
    ["BND", "Vanguard Total Bond Market"],
    ["TLT", "iShares 20+ Year Treasury"],
    ["IEF", "iShares 7-10 Year Treasury"],
    ["LQD", "iShares Investment Grade Corporate Bond"],
    ["HYG", "iShares High Yield Corporate Bond"],
    ["TIP", "iShares TIPS Bond"],
  ],
  Commodities: [
    ["GLD", "SPDR Gold Shares"],
    ["SLV", "iShares Silver Trust"],
    ["GDX", "VanEck Gold Miners"],
    ["USO", "United States Oil Fund"],
    ["DBC", "Invesco DB Commodity Index"],
  ],
  Thematic: [
    ["ARKK", "ARK Innovation"],
    ["ICLN", "iShares Global Clean Energy"],
    ["URA", "Global X Uranium"],
    ["ITA", "iShares U.S. Aerospace & Defense"],
    ["IBIT", "iShares Bitcoin Trust"],
    ["XBI", "SPDR S&P Biotech"],
    ["KRE", "SPDR S&P Regional Banking"],
    ["BOTZ", "Global X Robotics & AI"],
  ],
};

const ETFS: Etf[] = ETF_CATEGORIES.flatMap((category): Etf[] =>
  category === "US Sectors"
    ? // The same funds the Sector Rotation page ranks.
      Object.entries(SECTOR_ETFS).map(([symbol, sector]) => ({
        symbol,
        name: `${sector} Select Sector SPDR`,
        category,
        currency: "USD",
      }))
    : CURATED[category].map(([symbol, name, currency = "USD"]) => ({ symbol, name, category, currency }))
);

const BY_SYMBOL = new Map(ETFS.map((e) => [e.symbol, e]));

export function listEtfs(): Etf[] {
  return ETFS;
}

export function getEtf(symbol: string): Etf | undefined {
  return BY_SYMBOL.get(symbol);
}
