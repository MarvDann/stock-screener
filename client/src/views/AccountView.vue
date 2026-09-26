<script setup lang="ts">
import { ref } from "vue";
import { changePassword, currentUserEmail, setToken } from "../api";

const MIN_LENGTH = 8;

const email = currentUserEmail();
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
    setToken(await changePassword(current.value, next.value));
    success.value = "Password changed. You've been signed out on other devices.";
    current.value = next.value = confirm.value = "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Couldn't change your password";
  } finally {
    loading.value = false;
  }
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
.form-submit {
  align-self: flex-start;
  padding: 8px 16px;
}
</style>
