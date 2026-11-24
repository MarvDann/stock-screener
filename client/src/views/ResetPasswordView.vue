<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import { authClient, authErrorMessage } from "../auth";

const MIN_LENGTH = 8;

const route = useRoute();
const router = useRouter();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
// The server redirects here with ?error=INVALID_TOKEN when the link has expired or was already used.
const linkExpired = computed(() => route.query.error === "INVALID_TOKEN");
const password = ref("");
const confirm = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  if (password.value !== confirm.value) {
    error.value = "The passwords don't match";
    return;
  }
  loading.value = true;
  try {
    const { error: err } = await authClient.resetPassword({ newPassword: password.value, token: token.value });
    if (err) {
      error.value =
        err.code === "INVALID_TOKEN"
          ? "This reset link is invalid or has expired — request a new one"
          : authErrorMessage(err, "Something went wrong");
      return;
    }
    // Resetting doesn't sign you in, so log in with the new password.
    await router.push({ name: "login", query: { reset: "1" } });
  } catch {
    error.value = "Network error";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout subtitle="Choose a new password">
    <div v-if="linkExpired" class="form">
      <p class="form-error">This reset link is invalid or has expired.</p>
      <p class="form-footer"><RouterLink :to="{ name: 'forgot-password' }">Request a new link</RouterLink></p>
    </div>

    <div v-else-if="!token" class="form">
      <p class="form-error">This reset link is incomplete.<br />Open the link from the email again, or request a new one.</p>
      <p class="form-footer"><RouterLink :to="{ name: 'forgot-password' }">Request a new link</RouterLink></p>
    </div>

    <form v-else class="form" @submit.prevent="submit">
      <p v-if="error" class="form-error">
        {{ error }}
        <template v-if="error.includes('expired')">
          <br /><RouterLink :to="{ name: 'forgot-password' }" class="form-link">Request a new link</RouterLink>
        </template>
      </p>

      <label class="field">
        <span class="field-label">New password</span>
        <input
          v-model="password"
          type="password"
          required
          :minlength="MIN_LENGTH"
          autocomplete="new-password"
          class="field-input"
        />
      </label>

      <label class="field">
        <span class="field-label">Confirm new password</span>
        <input v-model="confirm" type="password" required autocomplete="new-password" class="field-input" />
      </label>

      <button type="submit" class="form-submit btn-primary" :disabled="loading">
        {{ loading ? "Saving…" : "Set new password" }}
      </button>
      <p class="form-footer">You'll be signed out everywhere else.</p>
    </form>
  </AuthLayout>
</template>
