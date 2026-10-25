import { ref } from "vue";

export const THEMES = ["dark", "light", "matrix"] as const;
export type Theme = (typeof THEMES)[number];

const theme = ref<Theme>("dark");

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** Dark is the stylesheet's default, so it's the one theme without a data-theme attribute. */
function apply(t: Theme) {
  if (t === "dark") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = t;
  }
}

export function initTheme() {
  try {
    const stored = localStorage.getItem("theme");
    if (isTheme(stored)) theme.value = stored;
  } catch {}
  apply(theme.value);
}

export function setTheme(t: Theme) {
  theme.value = t;
  try {
    localStorage.setItem("theme", t);
  } catch {}
  apply(t);
}

export function useTheme() {
  return { theme, setTheme, initTheme };
}
