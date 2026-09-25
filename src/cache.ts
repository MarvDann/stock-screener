import { SymbolHistory } from "./types";

interface CacheEntry {
  data: SymbolHistory[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function getCached(key: string, ttlMs = DEFAULT_TTL_MS): SymbolHistory[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: SymbolHistory[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(key: string): void {
  cache.delete(key);
}
