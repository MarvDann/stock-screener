import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { backfillProfiles, createTickersRouter, listSymbols, listTickers, loadTickers, getTickerName } from "../tickers";
import { execute } from "../db";
import SEED_TICKERS from "../seed/tickers.json";

// Older seed files have no customGroup; the table reports it as null.
const SEEDED = SEED_TICKERS.map((t) => ({ ...t, customGroup: (t as { customGroup?: string | null }).customGroup ?? null }));
const seeded = (symbol: string) => SEEDED.find((t) => t.symbol === symbol)!;

const lookupTicker = vi.fn(async (symbol: string) =>
  symbol === "NOPE" ? null : { name: `${symbol} Inc`, profile: { sector: "Technology", industry: "Software", currency: "USD" } }
);
const onChange = vi.fn();

const app = express();
app.use(express.json());
app.use(createTickersRouter({ lookupTicker, onChange }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const { cookie } = await createTestUser();
const admin = await createTestUser("admin@example.com");

function request(method: string, path: string, body?: unknown, as = cookie) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: as },
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
    expect(listTickers()).toEqual(SEEDED);
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
    expect(body.tickers[0]).toEqual(SEEDED[0]);
  });

  it("adds a ticker, uppercasing it and filling the name from the lookup", async () => {
    const res = await request("POST", "/api/tickers", { symbol: " abcd-b " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      symbol: "ABCD-B",
      name: "ABCD-B Inc",
      sector: "Technology",
      industry: "Software",
      currency: "USD",
      customGroup: null,
    });
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
    expect(await res.json()).toEqual({
      symbol: "MYST",
      name: "Mystery Co",
      sector: null,
      industry: null,
      currency: null,
      customGroup: null,
    });
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
    const res = await request("PATCH", "/api/tickers/aapl", { name: "Apple Inc." }, admin.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...seeded("AAPL"), name: "Apple Inc." });
    expect(getTickerName("AAPL")).toBe("Apple Inc.");
  });

  it("sets and clears a custom group, leaving the name alone", async () => {
    const set = await request("PATCH", "/api/tickers/MSFT", { customGroup: "  Cloud   Platforms " }, admin.cookie);
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ ...seeded("MSFT"), customGroup: "Cloud Platforms" });

    const cleared = await request("PATCH", "/api/tickers/MSFT", { customGroup: "" }, admin.cookie);
    expect(await cleared.json()).toEqual(seeded("MSFT"));
    await request("PATCH", "/api/tickers/MSFT", { customGroup: "Cloud Platforms" }, admin.cookie);
    const nulled = await request("PATCH", "/api/tickers/MSFT", { customGroup: null }, admin.cookie);
    expect((await nulled.json()).customGroup).toBeNull();
  });

  it("updates the name and custom group together", async () => {
    const res = await request("PATCH", "/api/tickers/MSFT", { name: "Microsoft Corp", customGroup: "Cloud" }, admin.cookie);
    expect(await res.json()).toMatchObject({ name: "Microsoft Corp", customGroup: "Cloud" });
    await request("PATCH", "/api/tickers/MSFT", { name: seeded("MSFT").name, customGroup: null }, admin.cookie);
  });

  it("only lets an admin edit a ticker", async () => {
    const res = await request("PATCH", "/api/tickers/MSFT", { name: "Microsoft Corp" });
    expect(res.status).toBe(403);
    expect(listTickers().find((t) => t.symbol === "MSFT")).toMatchObject({ name: seeded("MSFT").name, customGroup: seeded("MSFT").customGroup });
  });

  it("rejects an invalid custom group or an empty update", async () => {
    expect((await request("PATCH", "/api/tickers/MSFT", { customGroup: 42 }, admin.cookie)).status).toBe(400);
    expect((await request("PATCH", "/api/tickers/MSFT", { customGroup: "x".repeat(51) }, admin.cookie)).status).toBe(400);
    expect((await request("PATCH", "/api/tickers/MSFT", {}, admin.cookie)).status).toBe(400);
  });

  it("returns 404 when renaming an unknown ticker", async () => {
    const res = await request("PATCH", "/api/tickers/NOPE", { name: "x" }, admin.cookie);
    expect(res.status).toBe(404);
  });

  it("only lets an admin delete a ticker", async () => {
    const refused = await request("DELETE", "/api/tickers/ABCD-B");
    expect(refused.status).toBe(403);
    expect(listSymbols()).toContain("ABCD-B");

    const res = await request("DELETE", "/api/tickers/ABCD-B", undefined, admin.cookie);
    expect(res.status).toBe(204);
    expect(listSymbols()).not.toContain("ABCD-B");

    const again = await request("DELETE", "/api/tickers/ABCD-B", undefined, admin.cookie);
    expect(again.status).toBe(404);
  });

  it("backfills profiles for tickers missing one, retrying failures next run", async () => {
    const lookup = vi.fn(async (symbol: string) => {
      if (symbol === "AAPL") throw new Error("rate limited");
      return { sector: symbol === "SPY" ? "" : "Sector", industry: symbol === "SPY" ? "" : "Industry", currency: "USD" };
    });

    // Seeded tickers come with profiles, so blank a couple to give the backfill work.
    await execute("UPDATE tickers SET sector = NULL, industry = NULL WHERE symbol IN ('AAPL', 'MSFT')");
    await loadTickers();
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
