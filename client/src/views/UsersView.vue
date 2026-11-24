<script setup lang="ts">
import { onMounted, ref } from "vue";
import { allowAccess, fetchInterestRequests, fetchInvites, fetchUsers, removeInterestRequest, revokeAccess } from "../api";
import type { InterestRequest, PendingInvite, UserSummary } from "../types";
import { PROVIDER_LABELS, type SocialProvider } from "../auth";

const users = ref<UserSummary[]>([]);
const invites = ref<PendingInvite[]>([]);
const waiting = ref<InterestRequest[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
/** The outcome of the last button pressed. Each sentence goes on its own line. */
const message = ref<{ kind: "success" | "error"; text: string } | null>(null);
/** The email a button is working on, so its row's buttons can't be pressed twice. */
const busy = ref<string | null>(null);
const inviteEmail = ref("");

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
    [users.value, invites.value, waiting.value] = await Promise.all([fetchUsers(), fetchInvites(), fetchInterestRequests()]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load users";
  } finally {
    loading.value = false;
  }
}

/** Runs one button's action for `email`, shows how it went, and refreshes the lists. */
async function act(email: string, action: () => Promise<string>) {
  busy.value = email;
  message.value = null;
  try {
    message.value = { kind: "success", text: await action() };
    await load();
  } catch (err) {
    message.value = { kind: "error", text: err instanceof Error ? err.message : "Something went wrong — try again" };
  } finally {
    busy.value = null;
  }
}

/** Lets someone in (from the waiting list, restoring a revoked user, or a typed-in email) and emails them. */
function letIn(email: string, restoring = false) {
  return act(email, async () => {
    const { emailed } = await allowAccess(email);
    const done = restoring ? `Restored ${email}'s access.` : `${email} can now sign up.`;
    return emailed ? `${done}\nWe've emailed them to let them know.` : `${done}\nThe email didn't send, so let them know yourself.`;
  });
}

async function invite() {
  const email = inviteEmail.value.trim();
  if (!email) return;
  await letIn(email);
  if (message.value?.kind === "success") inviteEmail.value = "";
}

function revoke(email: string) {
  if (!confirm(`Revoke ${email}'s access?\n\nThey'll be signed out straight away and won't be able to sign in until you restore it.`)) return;
  return act(email, async () => {
    await revokeAccess(email);
    return `Revoked ${email}'s access.\nThey've been signed out.`;
  });
}

function removeRequest(email: string) {
  if (!confirm(`Remove ${email} from the waiting list?`)) return;
  return act(email, async () => {
    await removeInterestRequest(email);
    return `Removed ${email} from the waiting list.`;
  });
}

onMounted(load);
</script>

<template>
  <div>
    <div class="page-header">
      <h2>Users</h2>
      <span class="count">{{ users.length }} {{ users.length === 1 ? "account" : "accounts" }}</span>
    </div>

    <form class="invite-form" @submit.prevent="invite">
      <input
        v-model="inviteEmail"
        type="email"
        required
        placeholder="Invite someone by email"
        aria-label="Email to invite"
        class="field-input"
      />
      <button type="submit" class="btn-primary" :disabled="busy !== null">Invite</button>
    </form>

    <p v-if="message" :class="message.kind === 'success' ? 'form-success' : 'form-error'" class="message">{{ message.text }}</p>

    <div v-if="error" class="error-state">
      <p>Couldn't load users — try again.</p>
      <p class="detail">{{ error }}</p>
      <button @click="load">Retry</button>
    </div>
    <p v-else-if="loading && users.length === 0" class="muted">Loading…</p>
    <template v-else>
      <div class="table-scroll">
        <table class="users accounts">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Signs in with</th>
              <th>Joined</th>
              <th>Last active</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ revoked: u.access === 'revoked' }">
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
              <td class="access">
                <span v-if="u.access === 'server'" class="access-label" title="Set on the server (ALLOWED_EMAILS), so it can't be revoked here">
                  Always
                </span>
                <template v-else-if="u.access === 'allowed'">
                  <span class="access-label">Allowed</span>
                  <button type="button" class="row-btn danger" :disabled="busy !== null" @click="revoke(u.email)">Revoke</button>
                </template>
                <template v-else>
                  <span class="access-label revoked-label">Revoked</span>
                  <button type="button" class="row-btn" :disabled="busy !== null" @click="letIn(u.email, true)">Restore</button>
                </template>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="7" class="muted">No users yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="invites.length">
        <div class="page-header section-header">
          <h2>Invited</h2>
          <span class="count">{{ invites.length }} {{ invites.length === 1 ? "person" : "people" }}</span>
        </div>
        <p class="muted hint">Let in, but they haven't created an account yet.</p>
        <div class="table-scroll">
          <table class="users invites">
            <thead>
              <tr>
                <th>Email</th>
                <th>Invited</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in invites" :key="i.email">
                <td class="email">{{ i.email }}</td>
                <td class="date">{{ formatDate(i.invitedAt) }}</td>
                <td class="actions">
                  <button type="button" class="row-btn" :disabled="busy !== null" @click="letIn(i.email)">Resend email</button>
                  <button type="button" class="row-btn danger" :disabled="busy !== null" @click="revoke(i.email)">Revoke</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <div class="page-header section-header">
        <h2>Waiting list</h2>
        <span class="count">{{ waiting.length }} {{ waiting.length === 1 ? "person" : "people" }}</span>
      </div>
      <p class="muted hint">
        People who registered interest on the welcome page.<br />
        Letting someone in emails them a link to create their account.
      </p>
      <div class="table-scroll">
        <table class="users waiting">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Asked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in waiting" :key="r.email">
              <td class="email">{{ r.email }}</td>
              <td>{{ r.name || "—" }}</td>
              <td class="date">{{ formatDate(r.createdAt) }}</td>
              <td class="actions">
                <button type="button" class="row-btn primary" :disabled="busy !== null" @click="letIn(r.email)">Let in</button>
                <button type="button" class="row-btn danger" :disabled="busy !== null" @click="removeRequest(r.email)">
                  Remove
                </button>
              </td>
            </tr>
            <tr v-if="waiting.length === 0">
              <td colspan="4" class="muted">Nobody's waiting.</td>
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
.section-header {
  margin-top: 32px;
}
.invite-form {
  display: flex;
  gap: 8px;
  max-width: 440px;
  margin-bottom: 16px;
}
.invite-form .field-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
}
.message {
  margin-bottom: 16px;
}
.access,
.actions {
  white-space: nowrap;
}
.access-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-right: 8px;
}
.revoked-label {
  color: var(--negative);
  font-weight: 600;
}
.users tr.revoked td:not(.access) {
  opacity: 0.6;
}
.actions .row-btn + .row-btn {
  margin-left: 6px;
}
.hint {
  margin: 0 0 12px;
}
.row-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
}
.row-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.row-btn.danger:hover:not(:disabled) {
  border-color: var(--negative);
  color: var(--negative);
}
.row-btn.primary {
  border-color: var(--accent);
  color: var(--accent);
}
.row-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.date {
  white-space: nowrap;
  color: var(--text-secondary);
}
</style>
