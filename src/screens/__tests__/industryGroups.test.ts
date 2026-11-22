import { describe, it, expect } from "vitest";
import { DEFAULT_INDUSTRY_GROUPS_CONFIG, rankIndustryGroups } from "../industryGroups";
import { makeBar } from "../../__tests__/helpers";
import { SymbolHistory } from "../../types";

/**
 * `count` bars rising by `earlyPct` a day, then by `latePct` a day over the
 * last `lateBars` — so long- and short-term strength can differ.
 */
function trending(symbol: string, earlyPct: number, latePct = earlyPct, count = 300, lateBars = 63): SymbolHistory {
  let close = 100;
  return {
    symbol,
    bars: Array.from({ length: count }, (_, i) => {
      close *= 1 + (i >= count - lateBars ? latePct : earlyPct) / 100;
      return makeBar({ date: new Date(2025, 0, 2 + i), close, open: close, high: close * 1.01, low: close * 0.99 });
    }),
  };
}

/** Small groups, so tests can rank a handful of stocks. */
const SMALL_GROUPS = { ...DEFAULT_INDUSTRY_GROUPS_CONFIG, minMembers: 3 };

const profile = (industry: string | null, sector = "Technology", name = "") => ({ name, sector, industry });

describe("rankIndustryGroups", () => {
  it("ranks groups by short-term RS, not 12-month strength", () => {
    const histories = [
      // Strong for most of the year, weak over the last 3 months.
      trending("OLD1", 0.5, -0.2),
      trending("OLD2", 0.5, -0.25),
      trending("OLD3", 0.5, -0.3),
      // Flat for most of the year, strong over the last 3 months.
      trending("NEW1", 0, 0.3),
      trending("NEW2", 0, 0.25),
      trending("NEW3", 0, 0.2),
    ];
    const profiles = {
      OLD1: profile("Refiners", "Energy"),
      OLD2: profile("Refiners", "Energy"),
      OLD3: profile("Refiners", "Energy"),
      NEW1: profile("Semiconductors"),
      NEW2: profile("Semiconductors"),
      NEW3: profile("Semiconductors"),
    };

    const { rankedGroups, groups } = rankIndustryGroups(histories, profiles, SMALL_GROUPS);

    expect(rankedGroups).toBe(2);
    expect(groups.map((g) => [g.rank, g.industry, g.sector])).toEqual([
      [1, "Semiconductors", "Technology"],
      [2, "Refiners", "Energy"],
    ]);
    expect(groups[0].rsScore).toBeGreaterThan(groups[1].rsScore);
    expect(groups[0].rsScore).toBe((groups[0].avgRs1m + groups[0].avgRs3m) / 2);
  });

  it("lists the leader first, then competitors by short-term RS", () => {
    const histories = [trending("MID", 0.2), trending("TOP", 0.3), trending("LOW", 0.1)];
    const profiles = { MID: profile("Semis"), TOP: profile("Semis", "Technology", "Top Co"), LOW: profile("Semis") };

    const [group] = rankIndustryGroups(histories, profiles, SMALL_GROUPS).groups;

    expect(group.members.map((m) => m.symbol)).toEqual(["TOP", "MID", "LOW"]);
    expect(group.members[0]).toMatchObject({ name: "Top Co", rs1m: 99, rs3m: 99, aboveSma50: true });
    expect(group.members[0].perf3m).toBeGreaterThan(group.members[1].perf3m!);
    expect(group.memberCount).toBe(3);
  });

  it("leaves out groups with fewer than 5 rated stocks, and stocks with no industry", () => {
    const histories = [
      ...[1, 2, 3, 4].map((i) => trending(`A${i}`, 0.3)),
      trending("SHORT", 0.3, 0.3, 40, 0),
      trending("NONE", 0.5),
      ...[1, 2, 3, 4, 5].map((i) => trending(`C${i}`, 0.1)),
    ];
    const profiles: Record<string, ReturnType<typeof profile>> = {
      // Under 3 months of history, so it has no 3-month RS and doesn't make Tiny's fifth.
      SHORT: profile("Tiny"),
      NONE: profile(null),
    };
    for (const i of [1, 2, 3, 4]) profiles[`A${i}`] = profile("Tiny");
    for (const i of [1, 2, 3, 4, 5]) profiles[`C${i}`] = profile("Big");

    const { rankedGroups, groups } = rankIndustryGroups(histories, profiles);

    expect(rankedGroups).toBe(1);
    expect(groups.map((g) => g.industry)).toEqual(["Big"]);
  });

  it("ranks stocks in their custom group instead of their industry", () => {
    const histories = [
      trending("CRWD", 0, 0.4),
      trending("PANW", 0, 0.35),
      trending("ZS", 0, 0.3),
      trending("MSFT", 0, 0.05),
      trending("ORCL", 0, -0.1),
      trending("MDB", 0, -0.2),
    ];
    const software = (customGroup: string | null, sector = "Technology") => ({
      name: "",
      sector,
      industry: "Software - Infrastructure",
      customGroup,
    });
    const profiles = {
      CRWD: software("Cybersecurity"),
      PANW: software("Cybersecurity"),
      // Its sector is outvoted by the group's other members.
      ZS: software("Cybersecurity", "Communication Services"),
      MSFT: software(null),
      ORCL: software(null),
      MDB: software(""),
    };

    const { groups } = rankIndustryGroups(histories, profiles, SMALL_GROUPS);

    expect(groups.map((g) => [g.industry, g.sector, g.custom, g.memberCount])).toEqual([
      ["Cybersecurity", "Technology", true, 3],
      ["Software - Infrastructure", "Technology", false, 3],
    ]);
  });

  it("returns only the top groups and caps the members listed", () => {
    const histories: SymbolHistory[] = [];
    const profiles: Record<string, ReturnType<typeof profile>> = {};
    for (let g = 0; g < 4; g++) {
      for (let m = 0; m < 4; m++) {
        const symbol = `G${g}M${m}`;
        histories.push(trending(symbol, 0.05 * g + 0.01 * m));
        profiles[symbol] = profile(`Group ${g}`);
      }
    }

    const { rankedGroups, groups } = rankIndustryGroups(histories, profiles, {
      topGroups: 2,
      minMembers: 3,
      membersPerGroup: 2,
    });

    expect(rankedGroups).toBe(4);
    expect(groups.map((g) => g.industry)).toEqual(["Group 3", "Group 2"]);
    expect(groups[0].members.map((m) => m.symbol)).toEqual(["G3M3", "G3M2"]);
    expect(groups[0].memberCount).toBe(4);
  });
});
