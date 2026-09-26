<script setup lang="ts">
import { computed, ref } from "vue";
import { filterAndRank } from "../utils/search";

const MAX_SUGGESTIONS = 8;

const props = withDefaults(
  defineProps<{
    options: { symbol: string; name: string }[];
    /** Symbols to leave out of the suggestions, e.g. ones already on the list. */
    exclude?: string[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { exclude: () => [], placeholder: "Search stocks and ETFs…", disabled: false }
);

const emit = defineEmits<{ (e: "pick", symbol: string): void }>();

const text = ref("");
const open = ref(false);
/** Highlighted suggestion; -1 means none, so Enter adds the typed symbol as-is. */
const active = ref(-1);
const input = ref<HTMLInputElement | null>(null);

const matches = computed(() => {
  const q = text.value.trim().toLowerCase();
  if (!q) return [];
  const excluded = new Set(props.exclude);
  return filterAndRank(
    props.options.filter((o) => !excluded.has(o.symbol)),
    q
  ).slice(0, MAX_SUGGESTIONS);
});

function onInput() {
  open.value = true;
  // Highlight the best match so Enter picks it, like most search boxes.
  active.value = matches.value.length > 0 ? 0 : -1;
}

function pick(symbol: string) {
  emit("pick", symbol);
  text.value = "";
  open.value = false;
  active.value = -1;
}

function move(step: number) {
  if (!open.value || matches.value.length === 0) return;
  const n = matches.value.length;
  active.value = (active.value + step + n) % n;
}

function submit() {
  const choice = open.value ? matches.value[active.value] : undefined;
  if (choice) pick(choice.symbol);
  // Nothing matched: let the server say whether the typed symbol is valid.
  else if (text.value.trim()) pick(text.value.trim().toUpperCase());
}

function close() {
  open.value = false;
  active.value = -1;
}

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="symbol-picker">
    <input
      ref="input"
      v-model="text"
      type="search"
      class="picker-input"
      role="combobox"
      aria-label="Add a stock"
      aria-autocomplete="list"
      :aria-expanded="open && matches.length > 0"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      autocomplete="off"
      @input="onInput"
      @focus="open = true"
      @blur="close"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="submit"
      @keydown.esc="close"
    />
    <ul v-if="open && matches.length > 0" class="suggestions" role="listbox">
      <!-- mousedown, not click, so it lands before the input's blur closes the list. -->
      <li
        v-for="(m, i) in matches"
        :key="m.symbol"
        role="option"
        :aria-selected="i === active"
        :class="{ active: i === active }"
        @mousedown.prevent="pick(m.symbol)"
        @mouseenter="active = i"
      >
        <span class="symbol">{{ m.symbol }}</span>
        <span class="name">{{ m.name }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.symbol-picker {
  position: relative;
  width: 100%;
  max-width: 360px;
}
.picker-input {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 13px;
  padding: 8px 12px;
  outline: none;
  transition: border-color 0.15s;
}
.picker-input::placeholder {
  color: var(--text-muted);
}
.picker-input:focus {
  border-color: var(--accent);
}
.suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.suggestions li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.suggestions li.active {
  background: var(--surface-hover);
}
.symbol {
  flex-shrink: 0;
  min-width: 64px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}
.name {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
