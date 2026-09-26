import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import { createTestUser } from "./helpers";
import { createWatchlistsRouter, listWatchlists } from "../watchlists";

const KNOWN = new Set(["AAPL", "MSFT", "NVDA", "SPY", "VWRP.L"]);

const app = express();
app.use(express.json());
app.use(createWatchlistsRouter({ isKnownSymbol: (symbol) => KNOWN.has(symbol) }));

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const alice = createTestUser();
const bob = createTestUser();

function request(method: string, path: string, body?: unknown, token = alice.token) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function create(name: string, token = alice.token): Promise<{ id: number; name: string; symbols: string[] }> {
  const res = await request("POST", "/api/watchlists", { name }, token);
  expect(res.status).toBe(201);
  return res.json();
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

describe("watchlists", () => {
  it("requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/watchlists`);
    expect(res.status).toBe(401);
  });

  it("starts empty", async () => {
    const res = await request("GET", "/api/watchlists");
    expect(await res.json()).toEqual({ watchlists: [] });
  });

  it("creates watchlists, trimming the name, and lists them alphabetically", async () => {
    expect(await create("  Tech  ")).toMatchObject({ name: "Tech", symbols: [] });
    await create("dividends");

    const res = await request("GET", "/api/watchlists");
    const { watchlists } = await res.json();
    expect(watchlists.map((w: { name: string }) => w.name)).toEqual(["dividends", "Tech"]);
  });

  it("rejects blank, overlong and duplicate names", async () => {
    for (const name of ["", "   ", "x".repeat(61), 42]) {
      const res = await request("POST", "/api/watchlists", { name });
      expect(res.status).toBe(400);
    }
    const dup = await request("POST", "/api/watchlists", { name: "TECH" });
    expect(dup.status).toBe(409);
  });

  it("adds symbols in order, uppercasing them", async () => {
    const list = await create("Adds");
    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "nvda" });
    const res = await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: " aapl " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: list.id, name: "Adds", symbols: ["NVDA", "AAPL"] });
  });

  it("only adds symbols the app can chart, once each", async () => {
    const list = await create("Checks");
    expect((await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "A/B" })).status).toBe(400);
    expect((await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "ZZZZ" })).status).toBe(422);
    expect((await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "VWRP.L" })).status).toBe(201);
    expect((await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "vwrp.l" })).status).toBe(409);
  });

  it("removes symbols", async () => {
    const list = await create("Removes");
    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "AAPL" });
    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "MSFT" });

    const res = await request("DELETE", `/api/watchlists/${list.id}/symbols/aapl`);
    expect(res.status).toBe(200);
    expect((await res.json()).symbols).toEqual(["MSFT"]);

    const again = await request("DELETE", `/api/watchlists/${list.id}/symbols/AAPL`);
    expect(again.status).toBe(404);
  });

  it("puts a symbol back at a given index, e.g. to undo a removal", async () => {
    const list = await create("Ordered");
    for (const symbol of ["AAPL", "MSFT", "NVDA"]) await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol });
    await request("DELETE", `/api/watchlists/${list.id}/symbols/AAPL`);

    const res = await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "AAPL", index: 0 });
    expect((await res.json()).symbols).toEqual(["AAPL", "MSFT", "NVDA"]);

    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "SPY", index: 2 });
    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "VWRP.L", index: 99 });
    const { watchlists } = await (await request("GET", "/api/watchlists")).json();
    expect(watchlists.find((w: { id: number }) => w.id === list.id).symbols).toEqual(["AAPL", "MSFT", "SPY", "NVDA", "VWRP.L"]);

    for (const index of [-1, 1.5, "0"]) {
      const bad = await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "SPY", index });
      expect(bad.status).toBe(400);
    }
  });

  it("renames a watchlist, allowing a change of case but not another list's name", async () => {
    const list = await create("renames");
    const res = await request("PATCH", `/api/watchlists/${list.id}`, { name: "Renames" });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Renames");

    const clash = await request("PATCH", `/api/watchlists/${list.id}`, { name: "tech" });
    expect(clash.status).toBe(409);
  });

  it("deletes a watchlist along with its symbols", async () => {
    const list = await create("Doomed");
    await request("POST", `/api/watchlists/${list.id}/symbols`, { symbol: "SPY" });

    expect((await request("DELETE", `/api/watchlists/${list.id}`)).status).toBe(204);
    expect(listWatchlists(alice.id).map((w) => w.name)).not.toContain("Doomed");
    expect((await request("DELETE", `/api/watchlists/${list.id}`)).status).toBe(404);

    // A new list can reuse the name, and starts empty.
    expect(await create("Doomed")).toMatchObject({ symbols: [] });
  });

  it("keeps each user's watchlists private", async () => {
    const mine = await create("Private");
    // Bob can use the same name, since names are only unique per user.
    await create("Private", bob.token);

    const bobsView = await request("GET", "/api/watchlists", undefined, bob.token);
    expect((await bobsView.json()).watchlists.map((w: { name: string }) => w.name)).toEqual(["Private"]);

    for (const [method, path, body] of [
      ["PATCH", `/api/watchlists/${mine.id}`, { name: "Hijacked" }],
      ["DELETE", `/api/watchlists/${mine.id}`, undefined],
      ["POST", `/api/watchlists/${mine.id}/symbols`, { symbol: "AAPL" }],
      ["DELETE", `/api/watchlists/${mine.id}/symbols/AAPL`, undefined],
    ] as const) {
      const res = await request(method, path, body, bob.token);
      expect(res.status).toBe(404);
    }
    expect(listWatchlists(alice.id).find((w) => w.id === mine.id)).toEqual({ id: mine.id, name: "Private", symbols: [] });
  });

  it("returns 404 for non-numeric ids", async () => {
    expect((await request("PATCH", "/api/watchlists/abc", { name: "x" })).status).toBe(404);
  });
});
