import { describe, it, expect } from "vitest";
import { headlineMentions } from "../data/companyNews";

describe("headlineMentions", () => {
  it("matches the ticker in parentheses, even a one-letter one", () => {
    expect(headlineMentions("Visa (V) Pushes Into Cross Border Payments", "V", "Visa Inc.")).toBe(true);
    expect(headlineMentions("Is (V) a buy?", "V", "Visa Inc.")).toBe(true);
  });

  it("doesn't match a short bare ticker inside ordinary text", () => {
    expect(headlineMentions("Stocks rally as GE of V-shaped recovery", "V", "Vxyz Holdings")).toBe(false);
  });

  it("matches the company name, ignoring spacing, punctuation and corporate suffixes", () => {
    expect(headlineMentions("Chevron vs. ExxonMobil", "XOM", "Exxon Mobil Corporation")).toBe(true);
    expect(headlineMentions("J.P. Morgan Loses Fight", "JPM", "JPMorgan Chase & Co.")).toBe(true);
  });

  it("needs both words when the first is generic", () => {
    expect(headlineMentions("American Express Adds Lounges", "AXP", "American Express Company")).toBe(true);
    expect(headlineMentions("American Airlines Cuts Routes", "AXP", "American Express Company")).toBe(false);
  });

  it("ignores round-ups that don't name the company", () => {
    expect(headlineMentions("The 3 Magnificent Seven Stocks I'm Buying Now", "AAPL", "Apple Inc.")).toBe(false);
  });
});
