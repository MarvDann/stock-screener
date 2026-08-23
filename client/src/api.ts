import type { BreakoutResponse, SectorRotationResponse } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request to ${url} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchBreakout(): Promise<BreakoutResponse> {
  return fetchJson<BreakoutResponse>("/api/breakout");
}

export function fetchSectorRotation(): Promise<SectorRotationResponse> {
  return fetchJson<SectorRotationResponse>("/api/sector-rotation");
}
