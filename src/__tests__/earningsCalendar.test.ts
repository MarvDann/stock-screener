import { describe, it, expect } from "vitest";
import { NextEarnings, marketSession, nextEarningsFromQuote, upcomingEarnings } from "../data/earningsCalendar";

describe("nextEarningsFromQuote", () => {
  it("reads a confirmed date", () => {
    const date = new Date("2026-10-13T12:30:00Z");
    expect(
      nextEarningsFromQuote({
        symbol: "JPM",
        earningsTimestamp: date,
        earningsTimestampStart: date,
        earningsTimestampEnd: date,
        isEarningsDateEstimate: false,
        exchangeTimezoneName: "America/New_York",
      })
    ).toEqual({ symbol: "JPM", date, estimated: false, timezone: "America/New_York" });
  });

  it("takes the projected date over the last report's while unconfirmed", () => {
    const next = nextEarningsFromQuote({
      symbol: "A",
      earningsTimestamp: new Date("2026-08-26T20:00:00Z"),
      earningsTimestampStart: new Date("2026-11-25T20:00:00Z"),
      earningsTimestampEnd: new Date("2026-11-25T20:00:00Z"),
      isEarningsDateEstimate: true,
    });
    expect(next?.date.toISOString()).toBe("2026-11-25T20:00:00.000Z");
    expect(next?.estimated).toBe(true);
  });

  it("treats a date window as estimated", () => {
    const next = nextEarningsFromQuote({
      symbol: "X",
      earningsTimestampStart: new Date("2026-10-20T12:30:00Z"),
      earningsTimestampEnd: new Date("2026-10-24T12:30:00Z"),
    });
    expect(next?.date.toISOString()).toBe("2026-10-20T12:30:00.000Z");
    expect(next?.estimated).toBe(true);
  });

  it("is null when Yahoo has no date", () => {
    expect(nextEarningsFromQuote({ symbol: "SPY" })).toBeNull();
  });
});

describe("marketSession", () => {
  it("places US reports around New York's 9:30–16:00 session", () => {
    expect(marketSession(new Date("2026-10-13T12:30:00Z"), "America/New_York")).toBe("before-open");
    expect(marketSession(new Date("2026-10-13T15:00:00Z"), "America/New_York")).toBe("during-market");
    expect(marketSession(new Date("2026-10-13T20:00:00Z"), "America/New_York")).toBe("after-close");
  });

  it("uses London's 8:00–16:30 session for London listings", () => {
    expect(marketSession(new Date("2026-10-13T06:00:00Z"), "Europe/London")).toBe("before-open");
    expect(marketSession(new Date("2026-10-13T15:00:00Z"), "Europe/London")).toBe("during-market");
    expect(marketSession(new Date("2026-10-13T15:30:00Z"), "Europe/London")).toBe("after-close");
  });
});

describe("upcomingEarnings", () => {
  const at = (symbol: string, iso: string): NextEarnings => ({
    symbol,
    date: new Date(iso),
    estimated: false,
    timezone: "America/New_York",
  });

  it("keeps reports in the window, soonest first, then by symbol", () => {
    const all = [
      at("LATE", "2026-10-20T12:30:00Z"),
      at("WFC", "2026-10-13T12:30:00Z"),
      at("PAST", "2026-10-10T12:30:00Z"),
      at("NFLX", "2026-10-13T20:00:00Z"),
      at("JPM", "2026-10-13T12:30:00Z"),
    ];
    const result = upcomingEarnings(all, new Date("2026-10-11T00:00:00Z"), new Date("2026-10-19T00:00:00Z"));
    expect(result.map((e) => e.symbol)).toEqual(["JPM", "WFC", "NFLX"]);
  });
});
