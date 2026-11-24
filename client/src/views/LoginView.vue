<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthLayout from "../components/AuthLayout.vue";
import {
  PROVIDER_LABELS,
  type SocialProvider,
  authClient,
  authErrorMessage,
  clearSessionCache,
  fetchAuthConfig,
  oauthErrorMessage,
} from "../auth";

const router = useRouter();
const route = useRoute();
// The invite email links to /login?register=1&email=..., opening sign-up with their email filled in.
const isRegister = ref(route.query.register === "1");
const email = ref(typeof route.query.email === "string" ? route.query.email : "");
const password = ref("");
// An OAuth sign-in that failed comes back here with ?error=<code>.
const error = ref(typeof route.query.error === "string" ? oauthErrorMessage(route.query.error) : "");
const notice = ref(route.query.reset ? "Password changed — log in with your new password." : "");
const loading = ref(false);
const providers = ref<SocialProvider[]>([]);
// While only invited emails can sign up, everyone else is pointed at the waiting list instead of Register.
const inviteOnly = ref(false);

onMounted(async () => {
  ({ providers: providers.value, inviteOnly: inviteOnly.value } = await fetchAuthConfig());
});

function toggleMode() {
  isRegister.value = !isRegister.value;
  error.value = "";
  notice.value = "";
}

async function signedIn() {
  clearSessionCache();
  await router.push("/");
}

async function submit() {
  error.value = "";
  notice.value = "";
  loading.value = true;
  try {
    if (isRegister.value) {
      const { data, error: err } = await authClient.signUp.email({
        email: email.value.trim(),
        password: password.value,
        // The server requires a name; the email's local part stands in for one.
        name: email.value.trim().split("@")[0],
        callbackURL: "/",
      });
      if (err) {
        error.value = authErrorMessage(err, "Registration failed");
      } else if (data?.token) {
        await signedIn();
      } else {
        notice.value = "Check your email to verify your account, then log in.";
        isRegister.value = false;
        password.value = "";
      }
      return;
    }

    const { error: err } = await authClient.signIn.email({
      email: email.value.trim(),
      password: password.value,
      callbackURL: "/",
    });
    if (err?.code === "EMAIL_NOT_VERIFIED") {
      notice.value = "Your email isn't verified yet — we've sent you a new verification link.";
    } else if (err) {
      error.value = authErrorMessage(err, "Log in failed");
    } else {
      await signedIn();
    }
  } catch {
    error.value = "Network error";
  } finally {
    loading.value = false;
  }
}

async function socialSignIn(provider: SocialProvider) {
  error.value = "";
  // On success the browser leaves for the provider's sign-in page.
  const { error: err } = await authClient.signIn.social({ provider, callbackURL: "/", errorCallbackURL: "/login" });
  if (err) error.value = authErrorMessage(err, `Couldn't start ${PROVIDER_LABELS[provider]} sign-in`);
}
</script>

<template>
  <AuthLayout :subtitle="isRegister ? 'Create an account' : 'Sign in to continue'">
    <form class="form" @submit.prevent="submit">
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="notice" class="form-success">{{ notice }}</p>

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

      <template v-if="providers.length">
        <p class="divider"><span>or</span></p>
        <button
          v-for="provider in providers"
          :key="provider"
          type="button"
          class="social-btn"
          :data-provider="provider"
          @click="socialSignIn(provider)"
        >
          Continue with {{ PROVIDER_LABELS[provider] }}
        </button>
      </template>

      <p v-if="inviteOnly && !isRegister" class="form-footer">
        Not invited yet? <RouterLink :to="{ name: 'welcome', hash: '#interest' }">Register your interest</RouterLink>
        <br />
        <a href="#" class="invited-link" @click.prevent="toggleMode">Invited? Create your account</a>
      </p>
      <p v-else class="form-footer">
        {{ isRegister ? "Already have an account?" : "Don't have an account?" }}
        <a href="#" @click.prevent="toggleMode">
          {{ isRegister ? "Log in" : "Register" }}
        </a>
      </p>
      <p class="privacy-link"><RouterLink to="/privacy">Privacy</RouterLink></p>
    </form>
  </AuthLayout>
</template>

<style scoped>
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}
.divider::before,
.divider::after {
  content: "";
  flex: 1;
  border-top: 1px solid var(--border);
}
.social-btn {
  background: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  font-size: 14px;
  font-family: var(--font-ui);
  cursor: pointer;
  transition: border-color 0.15s;
}
.privacy-link {
  margin: 0;
  text-align: center;
  font-size: 12px;
}
.privacy-link a {
  color: var(--text-secondary);
}
.invited-link {
  display: inline-block;
  margin-top: 6px;
}
.social-btn:hover {
  border-color: var(--accent);
}
</style>
