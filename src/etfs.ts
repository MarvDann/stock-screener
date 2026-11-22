import { Router, Request, Response } from "express";
import db from "./db";
import { requireAuth } from "./middleware/requireAuth";
import { SECTOR_ETFS } from "./screens/sectorRotationScreen";
import { normalizeSymbol } from "./tickers";

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
 * A curated spread of widely held ETFs that seeds the etfs table on a fresh
 * database; after that the list is edited from the ETFs page.
 * Currencies were checked against Yahoo; anything not given is USD.
 */
const CURATED: Record<Exclude<EtfCategory, "US Sectors">, EtfEntry[]> = {
  Global: [
    ["VWRP.L", "Vanguard FTSE All-World (Acc)", "GBP"],
    ["SWDA.L", "iShares Core MSCI World", "GBp"],
    ["VALL.L", "Vanguard FTSE Global All Cap (Acc)", "GBP"],
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
    ["SMGB.L", "VanEck Semiconductor (UK)", "GBP"],
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

/** Every category except US Sectors, whose funds are fixed by the Sector Rotation page. */
export const EDITABLE_ETF_CATEGORIES = ETF_CATEGORIES.filter(
  (c): c is Exclude<EtfCategory, "US Sectors"> => c !== "US Sectors"
);

/** The same funds the Sector Rotation page ranks; built in rather than stored. */
const SECTOR_FUNDS: Etf[] = Object.entries(SECTOR_ETFS).map(([symbol, sector]) => ({
  symbol,
  name: `${sector} Select Sector SPDR`,
  category: "US Sectors",
  currency: "USD",
}));

const MAX_NAME_LENGTH = 100;

const tableExists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'etfs'").get();

db.exec(`
  CREATE TABLE IF NOT EXISTS etfs (
    symbol TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed the curated list only when the table is first created, so removing
// ETFs doesn't bring them back on the next restart.
if (!tableExists) {
  const insert = db.prepare("INSERT INTO etfs (symbol, name, category, currency) VALUES (?, ?, ?, ?)");
  db.transaction(() => {
    for (const category of EDITABLE_ETF_CATEGORIES) {
      for (const [symbol, name, currency = "USD"] of CURATED[category]) insert.run(symbol, name, category, currency);
    }
  })();
}

function isEditableCategory(value: unknown): value is Exclude<EtfCategory, "US Sectors"> {
  return (EDITABLE_ETF_CATEGORIES as readonly unknown[]).includes(value);
}

/** Every ETF, in category display order, then in the order they were added. */
export function listEtfs(): Etf[] {
  const stored = db.prepare("SELECT symbol, name, category, currency FROM etfs ORDER BY rowid").all() as Etf[];
  return ETF_CATEGORIES.flatMap((category) =>
    category === "US Sectors" ? SECTOR_FUNDS : stored.filter((e) => e.category === category)
  );
}

export function getEtf(symbol: string): Etf | undefined {
  return (
    SECTOR_FUNDS.find((e) => e.symbol === symbol) ??
    (db.prepare("SELECT symbol, name, category, currency FROM etfs WHERE symbol = ?").get(symbol) as Etf | undefined)
  );
}

function normalizeName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length <= MAX_NAME_LENGTH ? name : null;
}

export interface EtfsRouterDeps {
  /**
   * Confirms the symbol has price data; returns its display name and trading
   * currency, or null if the symbol is unknown. Throws if the provider can't be reached.
   */
  lookupEtf: (symbol: string) => Promise<{ name: string; currency: string } | null>;
}

const INVALID_CATEGORY = `Category must be one of: ${EDITABLE_ETF_CATEGORIES.join(", ")}`;
const INVALID_NAME = `Name must be text of at most ${MAX_NAME_LENGTH} characters`;
const INVALID_RENAME = `Name must be 1–${MAX_NAME_LENGTH} characters`;

/** The ETFs page list. US Sectors funds are listed but can't be edited. */
export function createEtfsRouter({ lookupEtf }: EtfsRouterDeps): Router {
  const router = Router();

  router.get("/api/etfs", requireAuth, (_req: Request, res: Response) => {
    res.json({
      categories: ETF_CATEGORIES,
      editableCategories: EDITABLE_ETF_CATEGORIES,
      etfs: listEtfs().map(({ symbol, name, category }) => ({ symbol, name, category })),
    });
  });

  router.post("/api/etfs", requireAuth, async (req: Request, res: Response) => {
    const symbol = normalizeSymbol(req.body?.symbol);
    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol — use letters, digits, '.', '-', '^' or '=' (max 15 chars)" });
      return;
    }
    const category = req.body?.category;
    if (!isEditableCategory(category)) {
      res.status(400).json({ error: INVALID_CATEGORY });
      return;
    }
    const name = normalizeName(req.body?.name);
    if (name === null) {
      res.status(400).json({ error: INVALID_NAME });
      return;
    }
    const existing = getEtf(symbol);
    if (existing) {
      res.status(409).json({ error: `${symbol} is already listed under ${existing.category}` });
      return;
    }

    let found: Awaited<ReturnType<EtfsRouterDeps["lookupEtf"]>>;
    try {
      found = await lookupEtf(symbol);
    } catch (err) {
      console.error(`ETF lookup failed for ${symbol}:`, err);
      res.status(502).json({ error: `Couldn't verify ${symbol} with the data provider — try again` });
      return;
    }
    if (!found) {
      res.status(422).json({ error: `No price data found for ${symbol}` });
      return;
    }

    const etf: Etf = { symbol, name: name || found.name || symbol, category, currency: found.currency };
    db.prepare("INSERT INTO etfs (symbol, name, category, currency) VALUES (?, ?, ?, ?)").run(
      etf.symbol,
      etf.name,
      etf.category,
      etf.currency
    );
    res.status(201).json({ symbol: etf.symbol, name: etf.name, category: etf.category });
  });

  router.patch("/api/etfs/:symbol", requireAuth, (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const current = getEtf(symbol);
    if (!current) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    if (current.category === "US Sectors") {
      res.status(403).json({ error: "US Sectors ETFs are fixed by the Sector Rotation page" });
      return;
    }
    const name = req.body?.name === undefined ? current.name : normalizeName(req.body.name);
    if (name === null || name === "") {
      res.status(400).json({ error: INVALID_RENAME });
      return;
    }
    const category = req.body?.category === undefined ? current.category : req.body.category;
    if (!isEditableCategory(category)) {
      res.status(400).json({ error: INVALID_CATEGORY });
      return;
    }
    db.prepare("UPDATE etfs SET name = ?, category = ? WHERE symbol = ?").run(name, category, symbol);
    res.json({ symbol, name, category });
  });

  router.delete("/api/etfs/:symbol", requireAuth, (req: Request, res: Response) => {
    const symbol = String(req.params.symbol).toUpperCase();
    if (SECTOR_FUNDS.some((e) => e.symbol === symbol)) {
      res.status(403).json({ error: "US Sectors ETFs are fixed by the Sector Rotation page" });
      return;
    }
    const result = db.prepare("DELETE FROM etfs WHERE symbol = ?").run(symbol);
    if (result.changes === 0) {
      res.status(404).json({ error: `${symbol} is not in the list` });
      return;
    }
    res.status(204).end();
  });

  return router;
}
