import { describe, it, expect } from "vitest";
import { filterAndRank, rankMatch } from "../search";

const t = (symbol: string, name: string) => ({ symbol, name });

describe("rankMatch", () => {
  it("ranks exact symbol, symbol prefix, name prefix, then substring", () => {
    expect(rankMatch(t("AMD", "Advanced Micro Devices"), "amd")).toBe(0);
    expect(rankMatch(t("AMDX", "Something"), "amd")).toBe(1);
    expect(rankMatch(t("XYZ", "Amdocs"), "amd")).toBe(2);
    expect(rankMatch(t("XYZ", "Hamdan Corp"), "amd")).toBe(3);
    expect(rankMatch(t("XYZ", "Other"), "amd")).toBe(-1);
  });
});

describe("filterAndRank", () => {
  it("returns items unchanged for an empty query", () => {
    const items = [t("B", "Beta"), t("A", "Alpha")];
    expect(filterAndRank(items, "")).toBe(items);
  });

  it("drops non-matches and orders best matches first", () => {
    const items = [t("XYZ", "Hamdan Corp"), t("NOPE", "Other"), t("AMD", "Advanced Micro Devices")];
    expect(filterAndRank(items, "amd").map((i) => i.symbol)).toEqual(["AMD", "XYZ"]);
  });
});
