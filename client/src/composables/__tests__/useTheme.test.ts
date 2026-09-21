import { describe, it, expect, beforeEach, vi } from "vitest";

async function freshTheme() {
  vi.resetModules();
  return import("../useTheme");
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("defaults to dark theme with no stored preference", async () => {
    const { useTheme } = await freshTheme();
    const { theme } = useTheme();

    expect(theme.value).toBe("dark");
  });

  it("initTheme reads a stored light preference and applies it to the document", async () => {
    localStorage.setItem("theme", "light");
    const { useTheme } = await freshTheme();
    const { theme, initTheme } = useTheme();

    initTheme();

    expect(theme.value).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("initTheme leaves the dataset attribute unset for dark theme", async () => {
    const { useTheme } = await freshTheme();
    const { initTheme } = useTheme();

    initTheme();

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("toggleTheme flips between dark and light and persists the choice", async () => {
    const { useTheme } = await freshTheme();
    const { theme, toggleTheme } = useTheme();

    toggleTheme();
    expect(theme.value).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    toggleTheme();
    expect(theme.value).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("ignores localStorage errors when reading or writing", async () => {
    const { useTheme } = await freshTheme();
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { theme, initTheme, toggleTheme } = useTheme();

    expect(() => initTheme()).not.toThrow();
    expect(() => toggleTheme()).not.toThrow();
    expect(theme.value).toBe("light");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
