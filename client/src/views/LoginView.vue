<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useTheme } from "../composables/useTheme";

const router = useRouter();
const { theme, toggleTheme, initTheme } = useTheme();
const themeIcon = computed(() => (theme.value === "dark" ? "☼" : "☾"));
onMounted(initTheme);
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

    localStorage.setItem("token", data.token);
    router.push("/");
  } catch {
    error.value = "Network error";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <button class="theme-toggle" @click="toggleTheme" :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`">{{ themeIcon }}</button>
    <form class="login-card" @submit.prevent="submit">
      <h1 class="login-title">Stock Screener</h1>
      <p class="login-subtitle">{{ isRegister ? "Create an account" : "Sign in to continue" }}</p>

      <div v-if="error" class="login-error">{{ error }}</div>

      <label class="field">
        <span class="field-label">Email</span>
        <input v-model="email" type="email" required autocomplete="email" class="field-input" />
      </label>

      <label class="field">
        <span class="field-label">Password</span>
        <input
          v-model="password"
          type="password"
          required
          :minlength="isRegister ? 8 : undefined"
          autocomplete="current-password"
          class="field-input"
        />
      </label>

      <button type="submit" class="login-btn btn-primary" :disabled="loading">
        {{ loading ? "..." : isRegister ? "Register" : "Log in" }}
      </button>

      <p class="login-toggle">
        {{ isRegister ? "Already have an account?" : "Don't have an account?" }}
        <a href="#" @click.prevent="isRegister = !isRegister; error = ''">
          {{ isRegister ? "Log in" : "Register" }}
        </a>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
  position: relative;
}

.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 16px;
  padding: 6px 10px;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s;
}

.theme-toggle:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
}

.login-subtitle {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}

.login-error {
  background: var(--negative-soft);
  color: var(--negative);
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 6px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.field-input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: var(--font-ui);
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus {
  border-color: var(--accent);
}

.login-btn {
  margin-top: 8px;
  padding: 10px;
  font-size: 14px;
  font-weight: 500;
}

.login-toggle {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.login-toggle a {
  color: var(--accent);
  text-decoration: none;
}

.login-toggle a:hover {
  text-decoration: underline;
}
</style>
