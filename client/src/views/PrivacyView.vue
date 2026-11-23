<script setup lang="ts">
import { onMounted } from "vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeSwitcher from "../components/ThemeSwitcher.vue";
import { useTheme } from "../composables/useTheme";

const { initTheme } = useTheme();
onMounted(initTheme);

/** Where people write about their data. Forwards to the site owner. */
const CONTACT_EMAIL = "privacy@stockwatch.cloud";
const LAST_UPDATED = "23 November 2026";
</script>

<template>
  <div class="privacy">
    <header class="topbar">
      <RouterLink to="/" aria-label="StockWatch home"><BrandLogo /></RouterLink>
      <ThemeSwitcher />
    </header>

    <article class="doc">
      <h1>Privacy</h1>
      <p class="updated">Last updated {{ LAST_UPDATED }}</p>

      <p>
        StockWatch is a small, independent project run by one person, Martin Dann, in the UK. This page explains
        what we keep about you, why, and how to have it removed. In short: we keep only what's needed to run the
        site, we don't track you, and we never sell or share your data for marketing.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>
          <strong>If you register interest:</strong> your email address, and your name and the note about how you
          trade if you give them, with the date you asked. We use them to decide who to invite next and to email you
          an invite.
        </li>
        <li>
          <strong>If you have an account:</strong> your email address and name, your password (stored only as a
          secure hash, so nobody can read it), and the watchlists you create. If you sign in with Google or GitHub, we
          receive your name, email address and profile picture from them.
        </li>
        <li>
          <strong>While you're signed in:</strong> a record of each sign-in session, including your IP address and
          browser type, so you can stay signed in and we can spot misuse.
        </li>
        <li>
          <strong>Server logs:</strong> like most websites, the server logs the IP address and page of each request.
          We use them only to fix problems and keep the site secure.
        </li>
      </ul>

      <h2>Cookies and storage</h2>
      <p>
        We use one cookie, which keeps you signed in. It's essential for the site to work, so there's no cookie
        banner. Your browser also stores your theme, chart settings and a cache of market data so pages load faster;
        these stay on your device and are never sent to us. There are no analytics, advertising or tracking cookies,
        and no third-party scripts.
      </p>

      <h2>Who else handles your data</h2>
      <ul>
        <li><strong>Hostinger</strong> runs the server the site and its database live on.</li>
        <li>
          <strong>Resend</strong> delivers our emails (invites, verification and password reset links), so it
          receives your email address and the message.
        </li>
        <li><strong>Google or GitHub</strong>, only if you choose to sign in with them.</li>
      </ul>
      <p>
        Market data comes from Yahoo Finance, but none of your information is sent to them. Some of these companies
        may process data outside the UK, under their own safeguards for international transfers.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Waiting list entries: until you're invited or ask to be removed.</li>
        <li>Accounts and watchlists: until you ask us to delete your account.</li>
        <li>Sign-in sessions: they expire after 7 days without use.</li>
        <li>Server logs and database backups: about 14 days.</li>
      </ul>

      <h2>Why we're allowed to</h2>
      <p>
        We keep waiting list details because you asked us to contact you, account details because they're needed to
        provide the service you signed up for, and logs and session records because we have a legitimate interest in
        keeping the site secure.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct it, or ask us to delete it, including taking you off
        the waiting list or closing your account. Email
        <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a> and we'll reply within a month. If you're unhappy
        with how we've handled your data, you can complain to the UK's Information Commissioner's Office at
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk</a>.
      </p>

      <h2>Changes</h2>
      <p>If we change what we collect or who handles it, we'll update this page and the date at the top.</p>

      <p class="back"><RouterLink to="/">← Back to StockWatch</RouterLink></p>
    </article>
  </div>
</template>

<style scoped>
.privacy {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 24px;
}
.topbar a {
  text-decoration: none;
}
.doc {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 24px 64px;
  font-size: 15px;
  line-height: 1.65;
}
.doc h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: -0.02em;
}
.updated {
  margin: 4px 0 24px;
  font-size: 13px;
  color: var(--text-secondary);
}
.doc h2 {
  margin: 32px 0 8px;
  font-size: 18px;
}
.doc p,
.doc li {
  color: var(--text-secondary);
}
.doc strong {
  color: var(--text-primary);
  font-weight: 600;
}
.doc ul {
  padding-left: 20px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.doc a {
  color: var(--accent);
}
.back {
  margin-top: 40px;
}
.back a {
  text-decoration: none;
}
</style>
