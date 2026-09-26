import YahooFinance from "yahoo-finance2";
import { NewsItem } from "../types";

const yahooFinance = new YahooFinance();

const NEWS_LIMIT = 5;
const CORPORATE_SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|plc|ltd|limited|holdings?|group|sa|nv|ag|the)\b\.?/gi;
/** First words too common to identify a company alone, e.g. "American" Express. */
const GENERIC_FIRST_WORDS = new Set(["american", "first", "general", "united", "international", "national", "bank", "global"]);

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** "Exxon Mobil Corporation" → "exxon", "American Express Company" → "americanexpress". */
function nameKey(name: string): string {
  const words = name.replace(/&/g, " ").replace(CORPORATE_SUFFIX, " ").split(/[\s,]+/).filter(Boolean);
  const count = GENERIC_FIRST_WORDS.has(words[0]?.toLowerCase()) ? 2 : 1;
  return squash(words.slice(0, count).join(""));
}

/**
 * Whether a headline is about the company: it names the ticker, e.g.
 * "Visa (V)", or the company, ignoring spacing and punctuation so
 * "ExxonMobil" and "J.P. Morgan" still match. Yahoo's own ticker tags are
 * too loose to rely on — market round-ups get tagged with every stock named.
 */
export function headlineMentions(title: string, symbol: string, name: string): boolean {
  const ticker = escapeRegExp(symbol);
  if (new RegExp(`\\(${ticker}\\)`).test(title)) return true;
  // Bare one- or two-letter tickers ("V", "GE") would match ordinary words.
  if (symbol.length >= 3 && new RegExp(`\\b${ticker}\\b`).test(title)) return true;
  const key = nameKey(name);
  return key.length >= 3 && squash(title).includes(key);
}

/**
 * Recent headlines about the company from Yahoo's search endpoint, newest
 * first. Empty for ETFs and for most non-US listings, which Yahoo has no
 * news for.
 */
export async function getCompanyNews(symbol: string, name: string): Promise<NewsItem[]> {
  const result = await yahooFinance.search(symbol, { newsCount: 20, quotesCount: 0 });
  return result.news
    .filter((n) => n.link.startsWith("https://") && headlineMentions(n.title, symbol, name || symbol))
    .sort((a, b) => b.providerPublishTime.getTime() - a.providerPublishTime.getTime())
    .slice(0, NEWS_LIMIT)
    .map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: n.providerPublishTime.toISOString(),
    }));
}
