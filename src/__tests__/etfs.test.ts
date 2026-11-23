import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { createEtfsRouter, ETF_CATEGORIES, getEtf, listEtfs } from "../etfs";
import { SECTOR_ETFS } from "../screens/sectorRotationScreen";
import { SYMBOL_PATTERN } from "../tickers";

describe("etfs", () => {
  it("lists each ETF once with a valid symbol and a known category", () => {
    const symbols = listEtfs().map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const etf of listEtfs()) {
      expect(etf.symbol).toMatch(SYMBOL_PATTERN);
      expect(ETF_CATEGORIES).toContain(etf.category);
      expect(etf.name).not.toBe("");
    }
  });

  it("includes every Sector Rotation ETF under US Sectors", () => {
    for (const symbol of Object.keys(SECTOR_ETFS)) {
      expect(getEtf(symbol)).toMatchObject({ category: "US Sectors", currency: "USD" });
    }
    expect(getEtf("XLK")?.name).toBe("Technology Select Sector SPDR");
  });

  it("orders ETFs by category and keeps London currencies as quoted", () => {
    const order = listEtfs().map((e) => ETF_CATEGORIES.indexOf(e.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(getEtf("SWDA.L")?.currency).toBe("GBp");
    expect(getEtf("VWRP.L")?.currency).toBe("GBP");
    expect(getEtf("SPY")?.currency).toBe("USD");
  });

  it("gives every category at least one ETF", () => {
    for (const category of ETF_CATEGORIES) {
      expect(listEtfs().some((e) => e.category === category)).toBe(true);
    }
  });
});

describe("etfs router", () => {
  const lookupEtf = vi.fn(async (symbol: string) =>
    symbol === "NOPE" ? null : { name: `${symbol} Fund`, currency: symbol.endsWith(".L") ? "GBp" : "USD" }
  );
  const app = express();
  app.use(express.json());
  app.use(createEtfsRouter({ lookupEtf }));

  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  let cookie: string;
  let adminCookie: string;

  function request(method: string, path: string, body?: unknown, as = cookie) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    ({ cookie } = await createTestUser());
    ({ cookie: adminCookie } = await createTestUser("admin@example.com"));
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

  it("requires auth", async () => {
    expect((await fetch(`${baseUrl}/api/etfs`)).status).toBe(401);
  });

  it("lists categories, the editable ones, and every ETF", async () => {
    const res = await request("GET", "/api/etfs");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.categories).toEqual([...ETF_CATEGORIES]);
    expect(body.editableCategories).not.toContain("US Sectors");
    expect(body.editableCategories).toHaveLength(ETF_CATEGORIES.length - 1);
    expect(body.etfs).toHaveLength(listEtfs().length);
    expect(body.etfs[0]).toEqual({ symbol: "VWRP.L", name: "Vanguard FTSE All-World (Acc)", category: "Global" });
  });

  it("adds an ETF with the looked-up name and currency, at the end of its category", async () => {
    const res = await request("POST", "/api/etfs", { symbol: " cspx.l ", category: "Global" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ symbol: "CSPX.L", name: "CSPX.L Fund", category: "Global" });
    expect(getEtf("CSPX.L")).toMatchObject({ currency: "GBp" });
    const global = listEtfs().filter((e) => e.category === "Global");
    expect(global[global.length - 1].symbol).toBe("CSPX.L");
  });

  it("keeps a given name instead of the looked-up one", async () => {
    const res = await request("POST", "/api/etfs", { symbol: "VGT", name: "Vanguard IT", category: "Growth & Tech" });
    expect((await res.json()).name).toBe("Vanguard IT");
  });

  it("rejects bad symbols, categories, duplicates and unknown symbols", async () => {
    expect((await request("POST", "/api/etfs", { symbol: "bad symbol!", category: "Global" })).status).toBe(400);
    expect((await request("POST", "/api/etfs", { symbol: "VXUS", category: "US Sectors" })).status).toBe(400);
    expect((await request("POST", "/api/etfs", { symbol: "VXUS", category: "Nope" })).status).toBe(400);
    const dup = await request("POST", "/api/etfs", { symbol: "SPY", category: "Global" });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toContain("US Market");
    expect((await request("POST", "/api/etfs", { symbol: "XLK", category: "Thematic" })).status).toBe(409);
    expect((await request("POST", "/api/etfs", { symbol: "NOPE", category: "Global" })).status).toBe(422);
  });

  it("returns 502 when the lookup throws", async () => {
    lookupEtf.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect((await request("POST", "/api/etfs", { symbol: "VXUS", category: "International" })).status).toBe(502);
    expect(getEtf("VXUS")).toBeUndefined();
  });

  it("renames and moves an ETF", async () => {
    let res = await request("PATCH", "/api/etfs/arkk", { name: "ARK Innovation ETF" }, adminCookie);
    expect(await res.json()).toEqual({ symbol: "ARKK", name: "ARK Innovation ETF", category: "Thematic" });

    res = await request("PATCH", "/api/etfs/ARKK", { category: "Growth & Tech" }, adminCookie);
    expect(res.status).toBe(200);
    expect(getEtf("ARKK")).toMatchObject({ name: "ARK Innovation ETF", category: "Growth & Tech" });
  });

  it("rejects bad edits, unknown ETFs and edits to US Sectors funds", async () => {
    expect((await request("PATCH", "/api/etfs/ARKK", { name: "  " }, adminCookie)).status).toBe(400);
    expect((await request("PATCH", "/api/etfs/ARKK", { category: "US Sectors" }, adminCookie)).status).toBe(400);
    expect((await request("PATCH", "/api/etfs/ZZZZ", { name: "x" }, adminCookie)).status).toBe(404);
    expect((await request("PATCH", "/api/etfs/XLK", { name: "x" }, adminCookie)).status).toBe(403);
    const xlk = await request("DELETE", "/api/etfs/XLK", undefined, adminCookie);
    expect(xlk.status).toBe(403);
    expect((await xlk.json()).error).toContain("fixed");
  });

  it("only lets an admin rename or move an ETF", async () => {
    expect((await request("PATCH", "/api/etfs/ARKK", { name: "Renamed" })).status).toBe(403);
    expect((await request("PATCH", "/api/etfs/ARKK", { category: "Global" })).status).toBe(403);
    expect(getEtf("ARKK")?.name).not.toBe("Renamed");
  });

  it("only lets an admin remove an ETF", async () => {
    expect((await request("DELETE", "/api/etfs/USO")).status).toBe(403);
    expect(getEtf("USO")).toBeDefined();
    expect((await request("DELETE", "/api/etfs/usO", undefined, adminCookie)).status).toBe(204);
    expect(getEtf("USO")).toBeUndefined();
    expect((await request("DELETE", "/api/etfs/USO", undefined, adminCookie)).status).toBe(404);
  });
});
