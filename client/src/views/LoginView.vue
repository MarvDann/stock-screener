<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import { setToken } from "../api";

const router = useRouter();
const isRegister = ref(false);
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function submit() {
  error.value = "";
  loading.value = true;

  const endpoint = isRegister.value ? "/api/auth/register" : "/api/auth/login";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });

    const data = await res.json();

    if (!res.ok) {
      error.value = data.error || "Something went wrong";
      return;
    }

    setToken(data.token);
    router.push("/");
  } catch {
    error.value = "Network error";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :subtitle="isRegister ? 'Create an account' : 'Sign in to continue'">
    <form class="form" @submit.prevent="submit">
      <p v-if="error" class="form-error">{{ error }}</p>

      <label class="field">
        <span class="field-label">Email</span>
        <input v-model="email" type="email" required autocomplete="email" class="field-input" />
      </label>

      <label class="field">
        <span class="field-label-row">
          <span class="field-label">Password</span>
          <RouterLink
            v-if="!isRegister"
            :to="{ name: 'forgot-password', query: email ? { email } : {} }"
            class="form-link forgot-link"
          >
            Forgot password?
          </RouterLink>
        </span>
        <input
          v-model="password"
          type="password"
          required
          :minlength="isRegister ? 8 : undefined"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          class="field-input"
        />
      </label>

      <button type="submit" class="form-submit btn-primary" :disabled="loading">
        {{ loading ? "..." : isRegister ? "Register" : "Log in" }}
      </button>

      <p class="form-footer">
        {{ isRegister ? "Already have an account?" : "Don't have an account?" }}
        <a href="#" @click.prevent="isRegister = !isRegister; error = ''">
          {{ isRegister ? "Log in" : "Register" }}
        </a>
      </p>
    </form>
  </AuthLayout>
</template>
