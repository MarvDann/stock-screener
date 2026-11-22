<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  PROVIDER_LABELS,
  type SocialProvider,
  authClient,
  authErrorMessage,
  fetchAuthProviders,
  getSessionUser,
} from "../auth";

const MIN_LENGTH = 8;

const email = ref<string | null>(null);
// Provider ids of the sign-in methods linked to this account; "credential" is email + password.
const linked = ref<string[] | null>(null);
const providers = ref<SocialProvider[]>([]);
const accountsError = ref("");

const hasPassword = computed(() => linked.value?.includes("credential") ?? false);
const unlinked = computed(() => providers.value.filter((p) => !linked.value?.includes(p)));
const linkedSocial = computed(() =>
  (linked.value ?? []).filter((id): id is SocialProvider => id in PROVIDER_LABELS)
);

onMounted(async () => {
  const [user, accounts, configured] = await Promise.all([
    getSessionUser(),
    authClient.listAccounts().catch(() => ({ data: null, error: { message: "Network error" } })),
    fetchAuthProviders(),
  ]);
  email.value = user?.email ?? null;
  providers.value = configured;
  if (accounts.data) {
    linked.value = accounts.data.map((a) => a.providerId);
  } else {
    accountsError.value = authErrorMessage(accounts.error, "Couldn't load your sign-in methods");
  }
});

const current = ref("");
const next = ref("");
const confirm = ref("");
const error = ref("");
const success = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  success.value = "";
  if (next.value !== confirm.value) {
    error.value = "The new passwords don't match";
    return;
  }
  loading.value = true;
  try {
    const { error: err } = await authClient.changePassword({
      currentPassword: current.value,
      newPassword: next.value,
      revokeOtherSessions: true,
    });
    if (err) {
      error.value = authErrorMessage(err, "Couldn't change your password");
      return;
    }
    success.value = "Password changed. You've been signed out on other devices.";
    current.value = next.value = confirm.value = "";
  } catch {
    error.value = "Network error";
  } finally {
    loading.value = false;
  }
}

async function connect(provider: SocialProvider) {
  accountsError.value = "";
  // On success the browser leaves for the provider and comes back to this page.
  const { error: err } = await authClient.linkSocial({ provider, callbackURL: "/account" });
  if (err) accountsError.value = authErrorMessage(err, `Couldn't connect ${PROVIDER_LABELS[provider]}`);
}
</script>

<template>
  <div class="account">
    <div class="page-header">
      <h2>Account</h2>
    </div>

    <section class="panel">
      <h3>Signed in as</h3>
      <p class="email">{{ email ?? "—" }}</p>
    </section>

    <section class="panel">
      <h3>Connected accounts</h3>
      <p v-if="accountsError" class="form-error">{{ accountsError }}</p>
      <ul v-if="linked" class="accounts">
        <li v-if="hasPassword"><span>Email and password</span><span class="status">Connected</span></li>
        <li v-for="provider in linkedSocial" :key="provider">
          <span>{{ PROVIDER_LABELS[provider] }}</span><span class="status">Connected</span>
        </li>
        <li v-for="provider in unlinked" :key="provider">
          <span>{{ PROVIDER_LABELS[provider] }}</span>
          <button type="button" class="btn-primary connect-btn" :data-provider="provider" @click="connect(provider)">
            Connect
          </button>
        </li>
      </ul>
    </section>

    <section v-if="linked && !hasPassword" class="panel">
      <h3>Password</h3>
      <p class="note">You sign in with {{ linkedSocial.map((p) => PROVIDER_LABELS[p]).join(" or ") }}, so this account has no password to change.</p>
    </section>

    <section v-else-if="hasPassword" class="panel">
      <h3>Change password</h3>
      <form class="form" @submit.prevent="submit">
        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="success" class="form-success">{{ success }}</p>

        <label class="field">
          <span class="field-label">Current password</span>
          <input v-model="current" type="password" required autocomplete="current-password" class="field-input" />
        </label>
        <label class="field">
          <span class="field-label">New password</span>
          <input v-model="next" type="password" required :minlength="MIN_LENGTH" autocomplete="new-password" class="field-input" />
        </label>
        <label class="field">
          <span class="field-label">Confirm new password</span>
          <input v-model="confirm" type="password" required autocomplete="new-password" class="field-input" />
        </label>

        <button type="submit" class="form-submit btn-primary" :disabled="loading">
          {{ loading ? "Saving…" : "Change password" }}
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.account {
  max-width: 440px;
}
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px 20px;
  margin-bottom: 16px;
}
.panel h3 {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.email {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}
.accounts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.accounts li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: var(--text-primary);
}
.status {
  font-size: 12px;
  color: var(--positive);
}
.note {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.form-submit {
  align-self: flex-start;
  padding: 8px 16px;
}
</style>
