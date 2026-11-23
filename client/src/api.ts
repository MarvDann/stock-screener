import type {
  BreakoutResponse,
  EarningsResponse,
  Etf,
  EtfsResponse,
  IndustryGroupsResponse,
  OverviewResponse,
  SectorRotationResponse,
  SectorStatsResponse,
  StockChart,
  StockDetail,
  StocksResponse,
  Ticker,
  UserSummary,
  VolatilityResponse,
  Watchlist,
} from "./types";
import router from "./router";
import { clearSessionCache } from "./auth";

async function fetchJson<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers,
      credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Network error — check your connection and try again");
  }

  if (res.status === 401) {
    clearSessionCache();
    router.push("/login");
    throw new Error("Session expired — please log in again");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.message || body.error;
    if (res.status >= 500) {
      throw new Error(message || "Server error — try again in a moment");
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function fetchBreakout(): Promise<BreakoutResponse> {
  return fetchJson<BreakoutResponse>("/api/breakout");
}

/** `?fresh=1` asks the server to skip its 5-minute price cache and pull live prices. */
function freshQuery(fresh: boolean, separator: "?" | "&" = "?"): string {
  return fresh ? `${separator}fresh=1` : "";
}

export function fetchOverview({ fresh = false } = {}): Promise<OverviewResponse> {
  return fetchJson<OverviewResponse>(`/api/overview${freshQuery(fresh)}`);
}

export function fetchSectorStats(): Promise<SectorStatsResponse> {
  return fetchJson<SectorStatsResponse>("/api/sector-stats");
}

export function fetchIndustryGroups(): Promise<IndustryGroupsResponse> {
  return fetchJson<IndustryGroupsResponse>("/api/industry-groups");
}

export function fetchSectorRotation({ fresh = false } = {}): Promise<SectorRotationResponse> {
  return fetchJson<SectorRotationResponse>(`/api/sector-rotation${freshQuery(fresh)}`);
}

export function fetchStockDetail(symbol: string): Promise<StockDetail> {
  return fetchJson<StockDetail>(`/api/stock/${encodeURIComponent(symbol)}`);
}

export function fetchStockChart(symbol: string, timeframe: StockChart["timeframe"]): Promise<StockChart> {
  return fetchJson<StockChart>(`/api/stock/${encodeURIComponent(symbol)}/chart?timeframe=${timeframe}`);
}

export function fetchStocks(symbols: string[], { fresh = false } = {}): Promise<StocksResponse> {
  return fetchJson<StocksResponse>(
    `/api/stocks?symbols=${symbols.map(encodeURIComponent).join(",")}${freshQuery(fresh, "&")}`
  );
}

export function fetchEarnings(): Promise<EarningsResponse> {
  return fetchJson<EarningsResponse>("/api/earnings");
}

export function fetchVolatility(): Promise<VolatilityResponse> {
  return fetchJson<VolatilityResponse>("/api/volatility");
}

export function fetchEtfs(): Promise<EtfsResponse> {
  return fetchJson<EtfsResponse>("/api/etfs");
}

export function addEtf(symbol: string, category: string, name?: string): Promise<Etf> {
  return fetchJson<Etf>("/api/etfs", { method: "POST", body: { symbol, category, name } });
}

export function updateEtf(symbol: string, changes: { name?: string; category?: string }): Promise<Etf> {
  return fetchJson<Etf>(`/api/etfs/${encodeURIComponent(symbol)}`, { method: "PATCH", body: changes });
}

export function deleteEtf(symbol: string): Promise<void> {
  return fetchJson<void>(`/api/etfs/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}

export async function fetchTickers(): Promise<Ticker[]> {
  const { tickers } = await fetchJson<{ tickers: Ticker[] }>("/api/tickers");
  return tickers;
}

export function addTicker(symbol: string, name?: string): Promise<Ticker> {
  return fetchJson<Ticker>("/api/tickers", { method: "POST", body: { symbol, name } });
}

/** Fields left out are unchanged; an empty or null `customGroup` clears it. */
export function updateTicker(symbol: string, changes: { name?: string; customGroup?: string | null }): Promise<Ticker> {
  return fetchJson<Ticker>(`/api/tickers/${encodeURIComponent(symbol)}`, { method: "PATCH", body: changes });
}

export function deleteTicker(symbol: string): Promise<void> {
  return fetchJson<void>(`/api/tickers/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}

/** Admins only. */
export async function fetchUsers(): Promise<UserSummary[]> {
  const { users } = await fetchJson<{ users: UserSummary[] }>("/api/admin/users");
  return users;
}

export async function fetchWatchlists(): Promise<Watchlist[]> {
  const { watchlists } = await fetchJson<{ watchlists: Watchlist[] }>("/api/watchlists");
  return watchlists;
}

export function createWatchlist(name: string): Promise<Watchlist> {
  return fetchJson<Watchlist>("/api/watchlists", { method: "POST", body: { name } });
}

export function renameWatchlist(id: number, name: string): Promise<Watchlist> {
  return fetchJson<Watchlist>(`/api/watchlists/${id}`, { method: "PATCH", body: { name } });
}

export function deleteWatchlist(id: number): Promise<void> {
  return fetchJson<void>(`/api/watchlists/${id}`, { method: "DELETE" });
}

/** Adds on the end, or at `index` in the list (used to undo a removal). */
export function addToWatchlist(id: number, symbol: string, index?: number): Promise<Watchlist> {
  return fetchJson<Watchlist>(`/api/watchlists/${id}/symbols`, { method: "POST", body: { symbol, index } });
}

export function removeFromWatchlist(id: number, symbol: string): Promise<Watchlist> {
  return fetchJson<Watchlist>(`/api/watchlists/${id}/symbols/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}

