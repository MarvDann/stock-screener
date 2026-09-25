/**
 * Writes the current ticker list (symbol, name, sector, sub-sector, currency)
 * to src/seed/tickers.json, which seeds the tickers table on a fresh
 * database. Run after changing the list you want new setups to start with.
 * User accounts are never exported.
 */
import fs from "fs";
import path from "path";
import { listTickers } from "../tickers";

const SEED_PATH = path.join(__dirname, "..", "seed", "tickers.json");

const tickers = listTickers();
// One ticker per line keeps diffs of the seed file readable.
const body = tickers.map((t) => `  ${JSON.stringify(t)}`).join(",\n");
fs.writeFileSync(SEED_PATH, `[\n${body}\n]\n`);
console.log(`Wrote ${tickers.length} tickers to ${path.relative(process.cwd(), SEED_PATH)}`);
