<script setup lang="ts">
import type { Component } from "vue";
import { Binary, Moon, Sun } from "lucide-vue-next";
import { THEMES, useTheme, type Theme } from "../composables/useTheme";

const OPTIONS: Record<Theme, { label: string; icon: Component }> = {
  dark: { label: "Dark", icon: Moon },
  light: { label: "Light", icon: Sun },
  matrix: { label: "Matrix", icon: Binary },
};

const { theme, setTheme } = useTheme();
</script>

<template>
  <div class="theme-switcher" role="radiogroup" aria-label="Theme">
    <button
      v-for="t in THEMES"
      :key="t"
      type="button"
      role="radio"
      class="theme-option"
      :class="{ active: theme === t }"
      :aria-checked="theme === t"
      :aria-label="`${OPTIONS[t].label} theme`"
      :title="`${OPTIONS[t].label} theme`"
      :data-theme-option="t"
      @click="setTheme(t)"
    >
      <component :is="OPTIONS[t].icon" :size="15" />
    </button>
  </div>
</template>

<style scoped>
.theme-switcher {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg-elevated);
}
.theme-option {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 5px 8px;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.theme-option:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}
.theme-option.active {
  color: var(--accent);
  background: var(--surface);
}
.theme-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
