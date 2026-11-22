<script setup lang="ts">
import { onMounted } from "vue";
import { fetchIndustryGroups } from "../api";
import type { IndustryGroupsResponse } from "../types";
import WarningsBanner from "../components/WarningsBanner.vue";
import { useCachedResource } from "../composables/useCachedResource";
import { formatPrice } from "../utils/format";
import { sectorMeta } from "../utils/sectors";

const { data, loading, error, load, updatedLabel } = useCachedResource<IndustryGroupsResponse>(
  "industry-groups",
  fetchIndustryGroups
);

function signedPct(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function trendClass(value: number | null): string {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** RS of 80+ is leadership territory; under 50 is lagging the universe. */
function rsClass(rating: number | null): string {
  if (rating === null) return "flat";
  if (rating >= 80) return "strong";
  return rating < 50 ? "weak" : "flat";
}

function share(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

function badgeStyle(color: string) {
  return { color, background: `color-mix(in srgb, ${color} 16%, transparent)` };
}

onMounted(() => load());
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Industry Groups</h2>
      <div class="header-actions">
        <span v-if="updatedLabel" class="updated">{{ loading ? "Refreshing…" : updatedLabel }}</span>
        <button class="btn-primary" :disabled="loading" @click="load({ force: true })">
          {{ loading ? "Refreshing…" : "Refresh" }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't rank industry groups — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load({ force: true })">Retry</button>
    </div>

    <p v-if="!data && loading" class="muted">Scanning…</p>

    <template v-if="data">
      <WarningsBanner :warnings="data.warnings" />

      <p class="intro">
        The top {{ data.groups.length }} of {{ data.rankedGroups }} industry groups, ranked by their stocks' short-term
        relative strength — the average of each stock's 1-month and 3-month RS, its performance percentile across every
        tracked ticker<template v-if="data.asOf">, as of {{ data.asOf }}</template>. The first stock in each group is the
        leader; the rest are its closest competitors.
      </p>

      <p v-if="data.groups.length === 0" class="muted">
        No group has enough stocks with 3 months of history to rank yet.
      </p>

      <section
        v-for="g in data.groups"
        :key="g.industry"
        class="group"
        :style="{ '--sector': sectorMeta(g.sector).color }"
      >
        <header class="group-head">
          <span class="rank">{{ g.rank }}</span>
          <span class="badge" :style="badgeStyle(sectorMeta(g.sector).color)">
            <component :is="sectorMeta(g.sector).icon" :size="20" />
          </span>
          <div class="group-title">
            <h3>{{ g.industry }}</h3>
            <span class="group-meta">
              <span v-if="g.custom" class="tag custom-tag" title="Your own group, set on the Tickers page">Custom</span>
              {{ g.sector || "Uncategorized" }} · {{ g.memberCount }} stocks
            </span>
          </div>
          <dl class="group-stats">
            <div>
              <dt>RS score</dt>
              <dd :class="rsClass(g.rsScore)">{{ Math.round(g.rsScore) }}</dd>
            </div>
            <div>
              <dt>RS 1M</dt>
              <dd :class="rsClass(g.avgRs1m)">{{ Math.round(g.avgRs1m) }}</dd>
            </div>
            <div>
              <dt>RS 3M</dt>
              <dd :class="rsClass(g.avgRs3m)">{{ Math.round(g.avgRs3m) }}</dd>
            </div>
            <div>
              <dt>1M</dt>
              <dd :class="trendClass(g.perf1m)">{{ signedPct(g.perf1m) }}</dd>
            </div>
            <div>
              <dt>3M</dt>
              <dd :class="trendClass(g.perf3m)">{{ signedPct(g.perf3m) }}</dd>
            </div>
            <div>
              <dt>&gt; 50-day</dt>
              <dd>{{ share(g.aboveSma50, g.memberCount) }}</dd>
            </div>
            <div>
              <dt>Stage 2</dt>
              <dd>{{ g.stage2 }}/{{ g.memberCount }}</dd>
            </div>
          </dl>
        </header>

        <div class="table-wrap">
          <table class="members">
            <thead>
              <tr>
                <th>Stock</th>
                <th class="num">Price</th>
                <th class="num">RS 1M</th>
                <th class="num">RS 3M</th>
                <th class="num">1M</th>
                <th class="num">3M</th>
                <th class="num">Off high</th>
                <th>Trend</th>
                <th>Setup</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, i) in g.members" :key="m.symbol" :class="{ leader: i === 0 }">
                <td>
                  <RouterLink :to="{ name: 'stock-detail', params: { symbol: m.symbol } }" class="stock-link">
                    <span class="symbol">{{ m.symbol }}</span>
                    <span class="name">{{ m.name }}</span>
                  </RouterLink>
                  <span v-if="i === 0" class="tag leader-tag">Leader</span>
                </td>
                <td class="num">{{ formatPrice(m.close, m.currency) }}</td>
                <td class="num rs" :class="rsClass(m.rs1m)">{{ m.rs1m ?? "—" }}</td>
                <td class="num rs" :class="rsClass(m.rs3m)">{{ m.rs3m ?? "—" }}</td>
                <td class="num" :class="trendClass(m.perf1m)">{{ signedPct(m.perf1m) }}</td>
                <td class="num" :class="trendClass(m.perf3m)">{{ signedPct(m.perf3m) }}</td>
                <td class="num">{{ signedPct(m.pctFromHigh) }}</td>
                <td>
                  <span v-if="m.stage2" class="tag stage2">Stage 2</span>
                  <span v-else-if="m.aboveSma50" class="muted small">Above 50-day</span>
                  <span v-else class="muted small">Below 50-day</span>
                </td>
                <td>
                  <span v-if="m.setup" class="tag" :class="m.setup">
                    {{ m.setup === "triggered" ? "Triggered" : "Approaching" }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Sector Drilldown browses Yahoo's sub-sectors, which a custom group isn't one of. -->
        <RouterLink
          v-if="g.sector && !g.custom"
          :to="{ name: 'sector-drilldown', query: { sector: g.sector, industry: g.industry } }"
          class="all-link"
        >
          All {{ g.memberCount }} {{ g.industry }} charts →
        </RouterLink>
      </section>
    </template>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.updated {
  font-size: 12px;
  color: var(--text-secondary);
}
.intro {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 70ch;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.small {
  font-size: 12px;
}

.group {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background:
    radial-gradient(520px 140px at 0% 0%, color-mix(in srgb, var(--sector) 12%, transparent), transparent 70%),
    var(--bg-elevated);
}
.group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 14px;
}
.rank {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-muted);
  min-width: 1.5ch;
}
.badge {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}
.group-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.group-title h3 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}
.group-meta {
  font-size: 12px;
  color: var(--text-secondary);
}
.group-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 0;
}
.group-stats div {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.group-stats dt {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.group-stats dd {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.table-wrap {
  overflow-x: auto;
}
.members {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.members th,
.members td {
  padding: 8px 10px;
  text-align: left;
  color: var(--text-primary);
  white-space: nowrap;
}
.members th {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.members tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.members tbody tr:hover td {
  background: var(--surface-hover);
}
.members tr.leader td {
  background: color-mix(in srgb, var(--sector) 7%, transparent);
}
.members .num {
  text-align: right;
  font-family: var(--font-mono);
}
.members th.num {
  font-family: inherit;
}
.rs {
  font-weight: 700;
}
.stock-link {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  text-decoration: none;
}
.symbol {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-primary);
}
.name {
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stock-link:hover .symbol {
  color: var(--accent);
  text-decoration: underline;
}
.tag {
  display: inline-block;
  padding: 1px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}
.custom-tag {
  margin-right: 4px;
  color: var(--accent);
}
.leader-tag {
  margin-left: 8px;
  color: var(--sector);
}
.tag.stage2,
.tag.triggered {
  color: var(--positive);
}
.tag.approaching {
  color: var(--accent);
}
/* Qualified so they win over the table cells' and stats' base colour. */
.members td.up,
.members td.strong,
.group-stats dd.up,
.group-stats dd.strong {
  color: var(--positive);
}
.members td.down,
.members td.weak,
.group-stats dd.down,
.group-stats dd.weak {
  color: var(--negative);
}
.members td.flat,
.group-stats dd.flat {
  color: var(--text-secondary);
}
.all-link {
  align-self: flex-end;
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
.all-link:hover {
  text-decoration: underline;
}
</style>
