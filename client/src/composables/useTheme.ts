import { ref } from "vue";

export type Theme = "dark" | "light";

const theme = ref<Theme>("dark");

function apply(t: Theme) {
  if (t === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function initTheme() {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light") theme.value = "light";
  } catch {}
  apply(theme.value);
}

export function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  try {
    localStorage.setItem("theme", theme.value);
  } catch {}
  apply(theme.value);
}

export function useTheme() {
  return { theme, toggleTheme, initTheme };
}
