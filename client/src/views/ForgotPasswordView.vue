<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import { requestPasswordReset } from "../api";

const route = useRoute();
// Prefilled when coming from the login form.
const email = ref(typeof route.query.email === "string" ? route.query.email : "");
const sentMessage = ref<string | null>(null);
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  loading.value = true;
  try {
    sentMessage.value = await requestPasswordReset(email.value.trim());
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Something went wrong";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout subtitle="Reset your password">
    <div v-if="sentMessage" class="form">
      <p class="form-success">{{ sentMessage }}</p>
      <p class="form-footer">The link works once, for the next hour. Check your spam folder if it doesn't arrive.</p>
      <p class="form-footer"><RouterLink to="/login">Back to log in</RouterLink></p>
    </div>

    <form v-else class="form" @submit.prevent="submit">
      <p class="form-footer">Enter your account's email and we'll send you a link to choose a new password.</p>
      <p v-if="error" class="form-error">{{ error }}</p>

      <label class="field">
        <span class="field-label">Email</span>
        <input v-model="email" type="email" required autocomplete="email" class="field-input" />
      </label>

      <button type="submit" class="form-submit btn-primary" :disabled="loading">
        {{ loading ? "Sending…" : "Send reset link" }}
      </button>

      <p class="form-footer"><RouterLink to="/login">Back to log in</RouterLink></p>
    </form>
  </AuthLayout>
</template>
