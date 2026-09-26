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

export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

/** The logged-in user's email, read from the login token (display only; the server verifies tokens). */
export function currentUserEmail(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
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

/** Emails a reset link if the account exists; the reply is the same either way. */
export async function requestPasswordReset(email: string): Promise<string> {
  const { message } = await fetchJson<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: { email } });
  return message;
}

/** Sets a new password from an emailed reset link and returns a fresh login token. */
export async function resetPassword(token: string, password: string): Promise<string> {
  const res = await fetchJson<{ token: string }>("/api/auth/reset-password", { method: "POST", body: { token, password } });
  return res.token;
}

/** Changes the logged-in user's password; returns a new login token (other sessions are signed out). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  const res = await fetchJson<{ token: string }>("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
  return res.token;
}
