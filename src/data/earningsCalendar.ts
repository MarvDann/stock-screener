import YahooFinance from "yahoo-finance2";
import { EarningsSession } from "../types";

const yahooFinance = new YahooFinance();

const QUOTE_BATCH_SIZE = 100;
const DEFAULT_SESSION_MINUTES: [number, number] = [9 * 60 + 30, 16 * 60];
/** Regular trading hours, in minutes after local midnight, where they differ from New York's 9:30–16:00. */
const SESSION_MINUTES: Record<string, [number, number]> = {
  "Europe/London": [8 * 60, 16 * 60 + 30],
};

/** A company's next earnings report, as Yahoo's quote endpoint has it. */
export interface NextEarnings {
  symbol: string;
  date: Date;
  /** Yahoo's projection rather than a date the company has announced. */
  estimated: boolean;
  /** The listing exchange's time zone, e.g. "America/New_York". */
  timezone: string;
}

/** The quote fields used here; the rest of Yahoo's quote isn't requested. */
export interface EarningsQuote {
  symbol: string;
  earningsTimestamp?: Date;
  earningsTimestampStart?: Date;
  earningsTimestampEnd?: Date;
  isEarningsDateEstimate?: boolean;
  exchangeTimezoneName?: string;
}

/**
 * The upcoming report from a quote, or null when Yahoo has none. Until a
 * date is confirmed, `earningsTimestamp` still holds the last report and
 * the projected next one is in `earningsTimestampStart`/`End` — a window
 * when they differ.
 */
export function nextEarningsFromQuote(q: EarningsQuote): NextEarnings | null {
  const date = q.earningsTimestampStart ?? q.earningsTimestamp;
  if (!date) return null;
  const isRange = q.earningsTimestampEnd != null && q.earningsTimestampEnd.getTime() !== date.getTime();
  return {
    symbol: q.symbol,
    date,
    estimated: Boolean(q.isEarningsDateEstimate) || isRange,
    timezone: q.exchangeTimezoneName ?? "America/New_York",
  };
}

/** Minutes after midnight on the exchange's clock. */
function exchangeMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Whether a report lands before the exchange opens, during trading, or after it closes. */
export function marketSession(date: Date, timezone: string): EarningsSession {
  const [open, close] = SESSION_MINUTES[timezone] ?? DEFAULT_SESSION_MINUTES;
  const minutes = exchangeMinutes(date, timezone);
  if (minutes < open) return "before-open";
  if (minutes >= close) return "after-close";
  return "during-market";
}

/** Reports in [from, to), soonest first. */
export function upcomingEarnings(all: NextEarnings[], from: Date, to: Date): NextEarnings[] {
  return all
    .filter((e) => e.date >= from && e.date < to)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.symbol.localeCompare(b.symbol));
}

/**
 * Next earnings dates for every symbol, from Yahoo's quote endpoint, a
 * batch at a time. `failed` lists symbols whose batch errored; symbols
 * Yahoo simply has no date for (e.g. ETFs) are left out of both lists.
 */
export async function fetchNextEarnings(symbols: string[]): Promise<{ earnings: NextEarnings[]; failed: string[] }> {
  const earnings: NextEarnings[] = [];
  const failed: string[] = [];
  for (let i = 0; i < symbols.length; i += QUOTE_BATCH_SIZE) {
    const batch = symbols.slice(i, i + QUOTE_BATCH_SIZE);
    try {
      const quotes = await yahooFinance.quote(batch, {
        fields: [
          "symbol",
          "earningsTimestamp",
          "earningsTimestampStart",
          "earningsTimestampEnd",
          "isEarningsDateEstimate",
          "exchangeTimezoneName",
        ],
      });
      for (const q of quotes as EarningsQuote[]) {
        const next = nextEarningsFromQuote(q);
        if (next) earnings.push(next);
      }
    } catch (err) {
      console.error(`Earnings fetch failed for ${batch.length} symbols:`, (err as Error).message);
      failed.push(...batch);
    }
  }
  return { earnings, failed };
}
