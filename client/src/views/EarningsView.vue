<script setup lang="ts">
import { computed, onMounted } from "vue";
import { fetchEarnings } from "../api";
import type { EarningsEvent, EarningsResponse, EarningsSession } from "../types";
import WarningsBanner from "../components/WarningsBanner.vue";
import { useCachedResource } from "../composables/useCachedResource";
import { UNCATEGORIZED, sectorMeta } from "../utils/sectors";

/** Matches the server's earnings cache. */
const EARNINGS_TTL_MS = 60 * 60 * 1000;

const SESSION_LABELS: Record<EarningsSession, string> = {
  "before-open": "Before open",
  "during-market": "During market",
  "after-close": "After close",
};

const { data, loading, error, load, updatedLabel } = useCachedResource<EarningsResponse>(
  "earnings",
  fetchEarnings,
  EARNINGS_TTL_MS
);

interface Day {
  key: string;
  label: string;
  events: EarningsEvent[];
}

/** Local calendar day, e.g. "2026-10-13", for grouping. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const full = date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  if (dayKey(date) === dayKey(today)) return `Today · ${full}`;
  if (dayKey(date) === dayKey(tomorrow)) return `Tomorrow · ${full}`;
  return full;
}

/** Reports grouped by the viewer's local day; the server sends them soonest first. */
const days = computed<Day[]>(() => {
  const groups = new Map<string, Day>();
  for (const e of data.value?.earnings ?? []) {
    const date = new Date(e.date);
    const key = dayKey(date);
    if (!groups.has(key)) groups.set(key, { key, label: dayLabel(date), events: [] });
    groups.get(key)!.events.push(e);
  }
  return [...groups.values()];
});

const timeZoneName = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
  .formatToParts(new Date())
  .find((p) => p.type === "timeZoneName")?.value;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sectorLabel(sector: string | null): string {
  return sector || UNCATEGORIZED;
}

function countLabel(n: number): string {
  return `${n} report${n === 1 ? "" : "s"}`;
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h2>Earnings</h2>
        <p class="subtitle">
          Tracked companies reporting in the next 7 days.<br />
          Times in your local time{{ timeZoneName ? ` (${timeZoneName})` : "" }}.
        </p>
      </div>
      <div class="header-actions">
        <span v-if="updatedLabel" class="updated">{{ updatedLabel }}</span>
        <button class="btn-primary" :disabled="loading" @click="load({ force: true })">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </div>

    <div v-if="error && !data" class="error-state">
      <p>Couldn't load the earnings calendar — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load({ force: true })">Retry</button>
    </div>

    <p v-else-if="!data" class="muted">Loading…</p>

    <template v-else>
      <WarningsBanner :warnings="data.warnings" />

      <p v-if="days.length === 0" class="muted empty">No tracked companies report in the next 7 days.</p>

      <section v-for="day in days" :key="day.key" class="day">
        <h3 class="day-heading">
          <span>{{ day.label }}</span>
          <span class="day-count">{{ countLabel(day.events.length) }}</span>
        </h3>
        <table class="earnings">
          <tbody>
            <tr v-for="e in day.events" :key="e.symbol">
              <td class="time">{{ formatTime(e.date) }}</td>
              <td class="session-cell">
                <span class="session" :class="e.session">{{ SESSION_LABELS[e.session] }}</span>
              </td>
              <td class="company">
                <RouterLink :to="{ name: 'stock-detail', params: { symbol: e.symbol } }" class="company-link">
                  <span class="symbol">{{ e.symbol }}</span>
                  <span class="name">{{ e.name }}</span>
                </RouterLink>
              </td>
              <td class="sector">
                <span class="sector-dot" :style="{ background: sectorMeta(sectorLabel(e.sector)).color }"></span>
                {{ sectorLabel(e.sector) }}
              </td>
              <td class="status">
                <span v-if="e.estimated" class="estimated" title="Projected by Yahoo; the company hasn't confirmed this date">
                  Estimated
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.updated {
  font-size: 12px;
  color: var(--text-secondary);
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.day {
  margin-bottom: 24px;
}
.day-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.day-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
}
.earnings {
  width: 100%;
  /* Fixed so columns line up from one day's table to the next. */
  table-layout: fixed;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.earnings td {
  padding: 10px 12px;
  color: var(--text-primary);
}
.earnings tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.earnings tr:hover td {
  background: var(--surface-hover);
}
.time {
  width: 90px;
  font-family: var(--font-mono);
  white-space: nowrap;
}
.session-cell {
  width: 130px;
}
.session {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
}
.session.before-open {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.session.during-market {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 14%, transparent);
}
.session.after-close {
  color: #a78bfa;
  background: color-mix(in srgb, #a78bfa 16%, transparent);
}
.company-link {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  color: var(--text-primary);
  text-decoration: none;
}
.company-link:hover .symbol {
  color: var(--accent);
  text-decoration: underline;
}
.symbol {
  font-family: var(--font-mono);
  font-weight: 600;
}
.name {
  color: var(--text-secondary);
}
.company {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sector {
  width: 200px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sector-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.status {
  width: 100px;
  text-align: right;
}
.estimated {
  font-size: 11px;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
@media (max-width: 760px) {
  .sector {
    display: none;
  }
  .earnings td {
    padding: 10px 8px;
  }
  .time {
    width: 64px;
  }
  .session-cell {
    width: 104px;
  }
  .status {
    width: 84px;
  }
}
</style>
