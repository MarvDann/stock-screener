<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import { resetPassword, setToken } from "../api";

const MIN_LENGTH = 8;

const route = useRoute();
const router = useRouter();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
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
    setToken(await resetPassword(token.value, password.value));
    router.push("/");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Something went wrong";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout subtitle="Choose a new password">
    <div v-if="!token" class="form">
      <p class="form-error">This reset link is incomplete. Open the link from the email again, or request a new one.</p>
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
