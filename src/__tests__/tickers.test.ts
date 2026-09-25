import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../auth";
import { backfillProfiles, createTickersRouter, listSymbols, listTickers, getTickerName } from "../tickers";
import db from "../db";
import SEED_TICKERS from "../seed/tickers.json";

const seeded = (symbol: string) => SEED_TICKERS.find((t) => t.symbol === symbol)!;

const lookupTicker = vi.fn(async (symbol: string) =>
  symbol === "NOPE" ? null : { name: `${symbol} Inc`, profile: { sector: "Technology", industry: "Software", currency: "USD" } }
);
const onChange = vi.fn();

const app = express();
app.use(express.json());
app.use(createTickersRouter({ lookupTicker, onChange }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const token = jwt.sign({ id: 1, email: "t@example.com" }, JWT_SECRET);

function request(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== "string") baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe("tickers", () => {
  it("seeds the table from the seed file on first run, profiles included", () => {
    expect(listSymbols()).toEqual(SEED_TICKERS.map((t) => t.symbol).sort());
    expect(listTickers()).toEqual(SEED_TICKERS);
    expect(getTickerName("AAPL")).toBe(seeded("AAPL").name);
  });

  it("requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/tickers`);
    expect(res.status).toBe(401);
  });

  it("lists tickers sorted by symbol", async () => {
    const res = await request("GET", "/api/tickers");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tickers[0]).toEqual(SEED_TICKERS[0]);
  });

  it("adds a ticker, uppercasing it and filling the name from the lookup", async () => {
    const res = await request("POST", "/api/tickers", { symbol: " abcd-b " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ symbol: "ABCD-B", name: "ABCD-B Inc", sector: "Technology", industry: "Software", currency: "USD" });
    expect(listSymbols()).toContain("ABCD-B");
    expect(onChange).toHaveBeenCalled();
  });

  it("prefers a user-supplied name over the looked-up one", async () => {
    const res = await request("POST", "/api/tickers", { symbol: "SHOP.TO", name: "Shopify (TSX)" });
    expect(await res.json()).toMatchObject({ symbol: "SHOP.TO", name: "Shopify (TSX)" });
  });

  it("leaves the profile null when that part of the lookup failed", async () => {
    lookupTicker.mockResolvedValueOnce({ name: "Mystery Co", profile: null });
    const res = await request("POST", "/api/tickers", { symbol: "MYST" });
    expect(await res.json()).toEqual({ symbol: "MYST", name: "Mystery Co", sector: null, industry: null, currency: null });
  });

  it("rejects malformed symbols", async () => {
    for (const symbol of ["", "AB CD", "A/B", "TOOLONGSYMBOL1234", 42]) {
      const res = await request("POST", "/api/tickers", { symbol });
      expect(res.status).toBe(400);
    }
  });

  it("rejects duplicates with 409", async () => {
    const res = await request("POST", "/api/tickers", { symbol: "AAPL" });
    expect(res.status).toBe(409);
  });

  it("rejects symbols the data provider doesn't know with 422", async () => {
    const res = await request("POST", "/api/tickers", { symbol: "NOPE" });
    expect(res.status).toBe(422);
    expect(listSymbols()).not.toContain("NOPE");
  });

  it("returns 502 when the lookup itself fails", async () => {
    lookupTicker.mockRejectedValueOnce(new Error("rate limited"));
    const res = await request("POST", "/api/tickers", { symbol: "ZZZ" });
    expect(res.status).toBe(502);
  });

  it("renames a ticker", async () => {
    const res = await request("PATCH", "/api/tickers/aapl", { name: "Apple Inc." });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...seeded("AAPL"), name: "Apple Inc." });
    expect(getTickerName("AAPL")).toBe("Apple Inc.");
  });

  it("returns 404 when renaming an unknown ticker", async () => {
    const res = await request("PATCH", "/api/tickers/NOPE", { name: "x" });
    expect(res.status).toBe(404);
  });

  it("deletes a ticker", async () => {
    const res = await request("DELETE", "/api/tickers/ABCD-B");
    expect(res.status).toBe(204);
    expect(listSymbols()).not.toContain("ABCD-B");

    const again = await request("DELETE", "/api/tickers/ABCD-B");
    expect(again.status).toBe(404);
  });

  it("backfills profiles for tickers missing one, retrying failures next run", async () => {
    const lookup = vi.fn(async (symbol: string) => {
      if (symbol === "AAPL") throw new Error("rate limited");
      return { sector: symbol === "SPY" ? "" : "Sector", industry: symbol === "SPY" ? "" : "Industry", currency: "USD" };
    });

    // Seeded tickers come with profiles, so blank a couple to give the backfill work.
    db.prepare("UPDATE tickers SET sector = NULL, industry = NULL WHERE symbol IN ('AAPL', 'MSFT')").run();
    const pending = listTickers().filter((t) => t.sector === null || t.currency === null).map((t) => t.symbol);
    expect(pending).toEqual(["AAPL", "MSFT", "MYST"]);
    const first = await backfillProfiles(lookup, { batchSize: 50, delayMs: 0 });
    expect(lookup.mock.calls.map(([s]) => s)).toEqual(pending);
    expect(pending).toContain("MYST"); // added while its sector lookup failed
    expect(pending).not.toContain("SHOP.TO"); // added with sector info already
    expect(first).toEqual({ updated: pending.length - 1, failed: 1 });

    const bySymbol = new Map(listTickers().map((t) => [t.symbol, t]));
    expect(bySymbol.get("MSFT")).toMatchObject({ sector: "Sector", industry: "Industry", currency: "USD" });
    expect(bySymbol.get("AAPL")).toMatchObject({ sector: null, industry: null });

    lookup.mockClear();
    const second = await backfillProfiles(lookup, { delayMs: 0 });
    expect(lookup.mock.calls.map(([s]) => s)).toEqual(["AAPL"]);
    expect(second).toEqual({ updated: 0, failed: 1 });
  });
});
