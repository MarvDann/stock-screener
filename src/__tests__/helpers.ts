import { DailyBar } from "../types";

export function makeBar(overrides: Partial<DailyBar> = {}): DailyBar {
  return {
    date: new Date("2024-01-02"),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1_000_000,
    ...overrides,
  };
}

export function makeBars(count: number, base: Partial<DailyBar> = {}): DailyBar[] {
  return Array.from({ length: count }, (_, i) =>
    makeBar({
      date: new Date(2024, 0, 2 + i),
      close: 100 + i * 0.1,
      open: 100 + i * 0.1 - 0.5,
      high: 100 + i * 0.1 + 3,
      low: 100 + i * 0.1 - 3,
      ...base,
    })
  );
}
