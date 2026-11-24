<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChartCandlestick,
  Check,
  LayoutDashboard,
  ListChecks,
  ListPlus,
  Network,
  Repeat,
  TrendingUp,
  X,
} from "lucide-vue-next";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeSwitcher from "../components/ThemeSwitcher.vue";
import HeroArt from "../components/HeroArt.vue";
import { useTheme } from "../composables/useTheme";
import { fetchInterestToken, registerInterest } from "../api";

const { theme, initTheme } = useTheme();

// The dashboard screenshot matches the theme picked in the top bar.
const screenshot = computed(() => `/images/home-${theme.value}.png`);

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Market dashboard",
    text: "The day at a glance: major US and UK indices, how many stocks rose or fell, which sectors lead and lag, and the biggest movers.",
  },
  {
    icon: TrendingUp,
    title: "Breakout screen",
    text: "Finds stocks in strong uptrends forming tight bases (Mark Minervini's Trend Template and volatility contraction patterns), and flags the ones breaking out.",
  },
  {
    icon: Repeat,
    title: "Sector rotation",
    text: "Ranks the 11 market sectors by relative strength against the S&P 500 over 1, 3 and 6 months, to show where money is moving.",
  },
  {
    icon: Network,
    title: "Industry groups",
    text: "The strongest industry groups right now, each with its leading stock and closest competitors.",
  },
  {
    icon: ChartCandlestick,
    title: "Detailed charts",
    text: "Daily, weekly and monthly candlestick charts with moving averages and volume, the stock's Weinstein stage, financials, earnings and news.",
  },
  {
    icon: ListChecks,
    title: "Watchlists",
    text: "Keep your own lists of stocks to follow, each shown as a page of charts.",
  },
  {
    icon: ListPlus,
    title: "Add your own tickers",
    text: ["Missing a stock?", "Add any ticker Yahoo Finance covers, from any market, and it joins the screens and charts."],
  },
  {
    icon: CalendarDays,
    title: "Earnings calendar",
    text: "Which companies report this week, and whether before the open or after the close, in your local time.",
  },
  {
    icon: Activity,
    title: "Volatility",
    text: "The VIX and its relatives against the past year, and a warning when the volatility curve inverts.",
  },
];

// Said plainly so nobody signs up expecting a trading terminal.
const DOES = [
  "Screens about 870 stocks: the S&P 500 and the companies they compete with, plus over 100 UK-listed companies",
  "Lets you add any other stock Yahoo Finance covers, from any market",
  "Runs on end-of-day price history, which suits swing and position trading",
  "Reruns its scans whenever you open a page, so results reflect the latest session",
];
const DOESNT = [
  "No real-time streaming quotes: prices come from Yahoo Finance and can be delayed",
  "Sector rotation is measured with US sector funds, so it reflects the US market rather than the UK's",
  "No alerts, notifications or connection to a broker, and no trading",
  "Not financial advice: a tool to help you research, not a source of tips",
];

const email = ref("");
const name = ref("");
// Bot checks (see the server's interest.ts): a hidden field people never see, so never fill in, and a token
// from page load that the server only accepts after a few seconds, since people take longer than that to type.
const website = ref("");
const MIN_FILL_MS = 3500;
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
let token: { value: string; fetchedAt: number } | null = null;

async function loadToken() {
  token = { value: await fetchInterestToken(), fetchedAt: Date.now() };
}

onMounted(() => {
  initTheme();
  loadToken().catch(() => (token = null));
});
const sending = ref(false);
const sent = ref(false);
const error = ref("");

async function submit() {
  error.value = "";
  sending.value = true;
  try {
    // A tab left open a long time, or a failed load, gets a fresh token.
    if (!token || Date.now() - token.fetchedAt > TOKEN_MAX_AGE_MS) await loadToken();
    // Someone quick (e.g. with autofill) waits the last moment rather than being taken for a bot.
    const wait = token!.fetchedAt + MIN_FILL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    await registerInterest({ email: email.value.trim(), name: name.value.trim(), token: token!.value, website: website.value });
    sent.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Something went wrong — try again";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="welcome">
    <header class="topbar">
      <BrandLogo />
      <div class="topbar-actions">
        <ThemeSwitcher />
        <RouterLink to="/login" class="signin-link">Sign in</RouterLink>
      </div>
    </header>

    <section class="hero">
      <HeroArt class="hero-backdrop" />
      <div class="hero-text">
        <p class="eyebrow">Early access · invite only</p>
        <h1>Find the stocks that are leading the market</h1>
        <p class="lede">
          StockWatch is a stock screener and charting site for swing and position traders.<br />
          It screens US and UK stocks for strong trends and breakout setups, and shows which sectors and industries
          are leading.
        </p>
        <a href="#interest" class="btn-primary cta">Register your interest <ArrowRight :size="16" /></a>
      </div>
      <figure class="screenshot">
        <!-- Opens full size, mostly for phones, where it's too small to read. -->
        <a :href="screenshot" target="_blank" rel="noopener" aria-label="Open the screenshot full size">
          <img :src="screenshot" alt="The StockWatch home dashboard: index tiles, market breadth, sector rotation and top movers" />
        </a>
      </figure>
    </section>

    <section class="section">
      <h2>What's inside</h2>
      <div class="features">
        <article v-for="f in FEATURES" :key="f.title" class="feature">
          <component :is="f.icon" :size="20" class="feature-icon" />
          <h3>{{ f.title }}</h3>
          <!-- Each sentence on its own line. -->
          <p>
            <template v-for="(sentence, i) in [f.text].flat()" :key="i"><br v-if="i" />{{ sentence }}</template>
          </p>
        </article>
      </div>
    </section>

    <section class="section">
      <h2>What to expect</h2>
      <p class="section-lede">
        StockWatch is an early, independent project, not a full trading platform.<br />
        Here's what it does and doesn't do.
      </p>
      <div class="expect">
        <div class="expect-col">
          <h3>What it does</h3>
          <ul>
            <li v-for="item in DOES" :key="item"><Check :size="16" class="yes" />{{ item }}</li>
          </ul>
        </div>
        <div class="expect-col">
          <h3>What it doesn't do</h3>
          <ul>
            <li v-for="item in DOESNT" :key="item"><X :size="16" class="no" />{{ item }}</li>
          </ul>
        </div>
      </div>
      <p class="section-lede small">
        Features may change, data can occasionally be missing or wrong, and the site may sometimes be down while we
        work on it.
      </p>
    </section>

    <section id="interest" class="section interest">
      <div class="interest-card">
        <h2>Register your interest</h2>
        <template v-if="sent">
          <p class="form-success">
            Thanks! You're on the list.<br />
            We'll email you when there's a place for you.
          </p>
        </template>
        <template v-else>
          <p class="section-lede">
            We're letting people in a few at a time.<br />
            Leave your email and we'll invite you when there's room.
          </p>
          <form class="form" @submit.prevent="submit">
            <p v-if="error" class="form-error">{{ error }}</p>
            <label class="field">
              <span class="field-label">Email</span>
              <input v-model="email" type="email" required maxlength="254" autocomplete="email" class="field-input" />
            </label>
            <label class="field">
              <span class="field-label">Name <span class="optional">(optional)</span></span>
              <input v-model="name" type="text" maxlength="100" autocomplete="name" class="field-input" />
            </label>
            <!-- Hidden from people (and screen readers); bots filling in every field give themselves away. -->
            <label class="trap" aria-hidden="true">
              Website
              <input v-model="website" type="text" name="website" tabindex="-1" autocomplete="off" />
            </label>
            <button type="submit" class="form-submit btn-primary" :disabled="sending">
              {{ sending ? "Sending…" : "Register interest" }}
            </button>
            <p class="fine-print">
              We'll only use your email to invite you.<br />
              No newsletters. <RouterLink to="/privacy">Privacy</RouterLink>
            </p>
          </form>
        </template>
        <p class="form-footer">Already invited? <RouterLink to="/login">Sign in</RouterLink></p>
      </div>
    </section>

    <footer class="footer">
      <p>
        Market data from Yahoo Finance; prices may be delayed.<br />
        StockWatch is for information only and isn't financial advice.
      </p>
      <p><RouterLink to="/privacy">Privacy</RouterLink></p>
    </footer>
  </div>
</template>

<style scoped>
/* Even line lengths for headings and the short sentences between panels; no lone last word in longer text. */
.welcome h1,
.welcome h2,
.section-lede,
.fine-print,
.footer p {
  text-wrap: balance;
}
.lede,
.feature p,
.expect-col li {
  text-wrap: pretty;
}
.welcome {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text-primary);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px 24px;
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.signin-link {
  color: var(--text-primary);
  text-decoration: none;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 14px;
  transition: border-color 0.15s;
}
.signin-link:hover {
  border-color: var(--accent);
}

.hero {
  position: relative;
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px 24px 24px;
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 40px;
  align-items: center;
}
.hero-backdrop {
  inset: 0;
  opacity: 0.7;
}
.hero-text {
  position: relative;
}
.eyebrow {
  margin: 0 0 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  font-weight: 600;
}
.hero h1 {
  margin: 0 0 16px;
  font-size: clamp(30px, 4.5vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.02em;
}
.lede {
  margin: 0 0 24px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
}
.screenshot {
  position: relative;
  margin: 0;
}
.screenshot a {
  display: block;
}
.screenshot img {
  display: block;
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.section {
  max-width: 1120px;
  margin: 0 auto;
  padding: 56px 24px 0;
}
.section h2 {
  margin: 0 0 8px;
  font-size: 26px;
  letter-spacing: -0.01em;
}
.section-lede {
  margin: 0 0 24px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 680px;
}
.section-lede.small {
  margin: 20px 0 0;
  max-width: none;
  font-size: 13px;
}

.features {
  display: grid;
  /* Three across on wide screens, so the nine cards make a full grid. */
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: 16px;
  margin-top: 20px;
}
.feature {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 20px;
}
.feature-icon {
  color: var(--accent);
}
.feature h3 {
  margin: 10px 0 6px;
  font-size: 15px;
}
.feature p {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.expect {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 16px;
}
.expect-col {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 20px;
}
.expect-col h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.expect-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.expect-col li {
  display: flex;
  gap: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.expect-col li svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.yes {
  color: var(--positive);
}
.no {
  color: var(--negative);
}

.interest {
  display: flex;
  justify-content: center;
}
.interest-card {
  width: 100%;
  max-width: 520px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.interest-card .section-lede {
  margin: 0;
}
.optional {
  opacity: 0.7;
}
.trap {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.fine-print {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.fine-print a,
.footer a {
  color: var(--text-secondary);
}
.footer p {
  margin: 0 0 8px;
}
.footer {
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px 24px 32px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 800px) {
  .hero {
    grid-template-columns: 1fr;
    padding-top: 24px;
  }
  .section {
    padding-top: 40px;
  }
  .interest-card {
    padding: 24px 20px;
  }
}
</style>
