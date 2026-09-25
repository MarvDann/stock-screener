/** 0 = exact symbol, 1 = symbol prefix, 2 = name prefix, 3 = substring, -1 = no match. `q` must be lowercase. */
export function rankMatch(c: { symbol: string; name: string }, q: string): number {
  const sym = c.symbol.toLowerCase();
  const name = c.name.toLowerCase();
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (sym.includes(q) || name.includes(q)) return 3;
  return -1;
}

/** Keeps items matching `q` (lowercase), best matches first; returns `items` unchanged when `q` is empty. */
export function filterAndRank<T extends { symbol: string; name: string }>(items: T[], q: string): T[] {
  if (!q) return items;
  return items
    .map((c) => ({ c, rank: rankMatch(c, q) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .map((r) => r.c);
}
