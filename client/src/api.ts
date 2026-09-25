import type {
  BreakoutResponse,
  EtfsResponse,
  OverviewResponse,
  SectorRotationResponse,
  SectorStatsResponse,
  StockDetail,
  StocksResponse,
  Ticker,
} from "./types";
import router from "./router";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function clearToken(): void {
  localStorage.removeItem("token");
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

async function fetchJson<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Network error — check your connection and try again");
  }

  if (res.status === 401) {
    clearToken();
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

export function fetchOverview(): Promise<OverviewResponse> {
  return fetchJson<OverviewResponse>("/api/overview");
}

export function fetchSectorStats(): Promise<SectorStatsResponse> {
  return fetchJson<SectorStatsResponse>("/api/sector-stats");
}

export function fetchSectorRotation(): Promise<SectorRotationResponse> {
  return fetchJson<SectorRotationResponse>("/api/sector-rotation");
}

export function fetchStockDetail(symbol: string): Promise<StockDetail> {
  return fetchJson<StockDetail>(`/api/stock/${encodeURIComponent(symbol)}`);
}

export function fetchStocks(symbols: string[]): Promise<StocksResponse> {
  return fetchJson<StocksResponse>(`/api/stocks?symbols=${symbols.map(encodeURIComponent).join(",")}`);
}

export function fetchEtfs(): Promise<EtfsResponse> {
  return fetchJson<EtfsResponse>("/api/etfs");
}

export async function fetchTickers(): Promise<Ticker[]> {
  const { tickers } = await fetchJson<{ tickers: Ticker[] }>("/api/tickers");
  return tickers;
}

export function addTicker(symbol: string, name?: string): Promise<Ticker> {
  return fetchJson<Ticker>("/api/tickers", { method: "POST", body: { symbol, name } });
}

export function updateTicker(symbol: string, name: string): Promise<Ticker> {
  return fetchJson<Ticker>(`/api/tickers/${encodeURIComponent(symbol)}`, { method: "PATCH", body: { name } });
}

export function deleteTicker(symbol: string): Promise<void> {
  return fetchJson<void>(`/api/tickers/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}
