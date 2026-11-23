<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchInterestRequests, fetchUsers, removeInterestRequest } from "../api";
import type { InterestRequest, UserSummary } from "../types";
import { PROVIDER_LABELS, type SocialProvider } from "../auth";

const users = ref<UserSummary[]>([]);
const waiting = ref<InterestRequest[]>([]);
const removeError = ref<string | null>(null);
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
    [users.value, waiting.value] = await Promise.all([fetchUsers(), fetchInterestRequests()]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load users";
  } finally {
    loading.value = false;
  }
}

async function removeRequest(email: string) {
  if (!confirm(`Remove ${email} from the waiting list?`)) return;
  removeError.value = null;
  try {
    await removeInterestRequest(email);
    waiting.value = waiting.value.filter((r) => r.email !== email);
  } catch (err) {
    removeError.value = err instanceof Error ? err.message : "Couldn't remove them";
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

    <template v-if="!loading && !error">
      <div class="page-header waiting-header">
        <h2>Waiting list</h2>
        <span class="count">{{ waiting.length }} {{ waiting.length === 1 ? "person" : "people" }}</span>
      </div>
      <p class="muted hint">
        People who registered interest on the welcome page. To let someone in, add their email to ALLOWED_EMAILS on the
        server and email them an invite, then remove them here.
      </p>
      <p v-if="removeError" class="form-error">{{ removeError }}</p>
      <div class="table-scroll">
        <table class="users waiting">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>How they trade</th>
              <th>Asked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in waiting" :key="r.email">
              <td class="email">{{ r.email }}</td>
              <td>{{ r.name || "—" }}</td>
              <td class="note">{{ r.note || "—" }}</td>
              <td class="date">{{ formatDate(r.createdAt) }}</td>
              <td><button type="button" class="remove-btn" @click="removeRequest(r.email)">Remove</button></td>
            </tr>
            <tr v-if="waiting.length === 0">
              <td colspan="5" class="muted">Nobody's waiting.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
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
.waiting-header {
  margin-top: 32px;
}
.hint {
  margin: 0 0 12px;
}
.note {
  max-width: 360px;
  white-space: pre-wrap;
}
.remove-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
}
.remove-btn:hover {
  border-color: var(--negative);
  color: var(--negative);
}
.date {
  white-space: nowrap;
  color: var(--text-secondary);
}
</style>
