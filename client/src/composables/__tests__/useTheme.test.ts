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

  it("initTheme restores a stored matrix preference", async () => {
    localStorage.setItem("theme", "matrix");
    const { useTheme } = await freshTheme();
    const { theme, initTheme } = useTheme();

    initTheme();

    expect(theme.value).toBe("matrix");
    expect(document.documentElement.dataset.theme).toBe("matrix");
  });

  it("initTheme falls back to dark for an unknown stored value", async () => {
    localStorage.setItem("theme", "neon");
    const { useTheme } = await freshTheme();
    const { theme, initTheme } = useTheme();

    initTheme();

    expect(theme.value).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("setTheme applies and persists each theme", async () => {
    const { useTheme } = await freshTheme();
    const { theme, setTheme } = useTheme();

    setTheme("matrix");
    expect(theme.value).toBe("matrix");
    expect(localStorage.getItem("theme")).toBe("matrix");
    expect(document.documentElement.dataset.theme).toBe("matrix");

    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    setTheme("dark");
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

    const { theme, initTheme, setTheme } = useTheme();

    expect(() => initTheme()).not.toThrow();
    expect(() => setTheme("matrix")).not.toThrow();
    expect(theme.value).toBe("matrix");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
