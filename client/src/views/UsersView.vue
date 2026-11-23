<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchUsers } from "../api";
import type { UserSummary } from "../types";
import { PROVIDER_LABELS, type SocialProvider } from "../auth";

const users = ref<UserSummary[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : "Never";
}

function methodLabel(id: string): string {
  return id === "credential" ? "Password" : (PROVIDER_LABELS[id as SocialProvider] ?? id);
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    users.value = await fetchUsers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load users";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Users</h2>
      <span class="count">{{ users.length }} {{ users.length === 1 ? "account" : "accounts" }}</span>
    </div>

    <div v-if="error" class="error-state">
      <p>Couldn't load users — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>
    <p v-else-if="loading" class="muted">Loading…</p>
    <div v-else class="table-scroll">
      <table class="users">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Signs in with</th>
            <th>Joined</th>
            <th>Last active</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.name || "—" }}</td>
            <td class="email">
              {{ u.email }}
              <span v-if="!u.emailVerified" class="unverified" title="Hasn't clicked the link in their verification email yet">
                Unverified
              </span>
            </td>
            <td>
              <span :class="u.isAdmin ? 'role admin' : 'role'">{{ u.isAdmin ? "Admin" : "Member" }}</span>
            </td>
            <td class="muted">{{ u.signInMethods.map(methodLabel).join(", ") || "—" }}</td>
            <td class="date">{{ formatDate(u.createdAt) }}</td>
            <td class="date">{{ formatDate(u.lastActiveAt) }}</td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="6" class="muted">No users yet.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.count {
  color: var(--text-secondary);
  font-size: 13px;
}
.muted {
  color: var(--text-secondary);
  font-size: 13px;
}
.users {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  font-size: 13px;
}
.users th,
.users td {
  padding: 8px 12px;
  text-align: left;
  color: var(--text-primary);
}
.users td.muted {
  color: var(--text-secondary);
}
.users thead {
  background: var(--bg-elevated);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.users thead th {
  color: var(--text-secondary);
}
.users tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--border-subtle);
}
.users tbody tr:hover td {
  background: var(--surface-hover);
}
.email {
  white-space: nowrap;
}
.unverified {
  margin-left: 6px;
  font-size: 11px;
  color: var(--negative);
}
.role {
  font-size: 12px;
  color: var(--text-secondary);
}
.role.admin {
  color: var(--accent);
  font-weight: 600;
}
.date {
  white-space: nowrap;
  color: var(--text-secondary);
}
</style>
