import type { BreakoutResponse, SectorRotationResponse, StockDetail } from "./types";
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

async function fetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, { headers });
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
  return res.json() as Promise<T>;
}

export function fetchBreakout(): Promise<BreakoutResponse> {
  return fetchJson<BreakoutResponse>("/api/breakout");
}

export function fetchSectorRotation(): Promise<SectorRotationResponse> {
  return fetchJson<SectorRotationResponse>("/api/sector-rotation");
}

export function fetchStockDetail(symbol: string): Promise<StockDetail> {
  return fetchJson<StockDetail>(`/api/stock/${encodeURIComponent(symbol)}`);
}
