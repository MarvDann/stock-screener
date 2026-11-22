import { describe, it, expect } from "vitest";
import { passesTrendTemplate } from "../trendTemplate";
import { makeBar } from "../../__tests__/helpers";

const series = (closes: number[]) =>
  closes.map((c, i) => makeBar({ date: new Date(2024, 0, 1 + i), close: c, high: c, low: c }));

/** 260 bars rising steadily from 40 to 100. */
const uptrend = series(Array.from({ length: 260 }, (_, i) => 40 + (60 * i) / 259));

describe("passesTrendTemplate", () => {
  it("passes a steady Stage 2 uptrend", () => {
    expect(passesTrendTemplate(uptrend, uptrend.length - 1, null)).toBe(true);
  });

  it("fails without enough history for a rising 200-day SMA", () => {
    const short = uptrend.slice(-210);
    expect(passesTrendTemplate(short, short.length - 1, null)).toBe(false);
  });

  it("fails a downtrend", () => {
    const down = [...uptrend].reverse();
    expect(passesTrendTemplate(down, down.length - 1, null)).toBe(false);
  });

  it("fails when price is more than 25% off its 52-week high", () => {
    const pulledBack = series([...uptrend.map((b) => b.close), ...Array(5).fill(70)]);
    expect(passesTrendTemplate(pulledBack, pulledBack.length - 1, null)).toBe(false);
  });

  it("fails an RS Rating below 70", () => {
    expect(passesTrendTemplate(uptrend, uptrend.length - 1, 69)).toBe(false);
    expect(passesTrendTemplate(uptrend, uptrend.length - 1, 70)).toBe(true);
  });
});
