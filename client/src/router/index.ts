import { createRouter, createWebHistory } from "vue-router";
import BreakoutView from "../views/BreakoutView.vue";
import HomeView from "../views/HomeView.vue";
import SectorRotationView from "../views/SectorRotationView.vue";
import StockDetailView from "../views/StockDetailView.vue";
import LoginView from "../views/LoginView.vue";
import WelcomeView from "../views/WelcomeView.vue";
import PrivacyView from "../views/PrivacyView.vue";
import ForgotPasswordView from "../views/ForgotPasswordView.vue";
import ResetPasswordView from "../views/ResetPasswordView.vue";
import AccountView from "../views/AccountView.vue";
import TickersView from "../views/TickersView.vue";
import StockChartsView from "../views/StockChartsView.vue";
import SectorDrilldownView from "../views/SectorDrilldownView.vue";
import EtfsView from "../views/EtfsView.vue";
import WatchlistsView from "../views/WatchlistsView.vue";
import EarningsView from "../views/EarningsView.vue";
import VolatilityView from "../views/VolatilityView.vue";
import IndustryGroupsView from "../views/IndustryGroupsView.vue";
import UsersView from "../views/UsersView.vue";
import { getSessionUser } from "../auth";

// `title` names a page for the stock detail page's back button.
const router = createRouter({
  history: createWebHistory(),
  // Only links to a section (e.g. the login page's "/welcome#interest") scroll; other navigation is left as it was.
  scrollBehavior: (to) => (to.hash ? { el: to.hash } : undefined),
  routes: [
    { path: "/", name: "home", component: HomeView, meta: { title: "Home" } },
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    // What visitors who aren't signed in see at "/": the features, and a form to join the waiting list.
    { path: "/welcome", name: "welcome", component: WelcomeView, meta: { public: true } },
    { path: "/privacy", name: "privacy", component: PrivacyView, meta: { public: true } },
    { path: "/forgot-password", name: "forgot-password", component: ForgotPasswordView, meta: { public: true } },
    // Public so an emailed link works whether or not you're logged in.
    { path: "/reset-password", name: "reset-password", component: ResetPasswordView, meta: { public: true } },
    { path: "/account", name: "account", component: AccountView, meta: { title: "Account" } },
    { path: "/breakout", name: "breakout", component: BreakoutView, meta: { title: "Breakout" } },
    { path: "/stock-charts", name: "stock-charts", component: StockChartsView, meta: { title: "Stock Charts" } },
    { path: "/etfs", name: "etfs", component: EtfsView, meta: { title: "ETFs" } },
    { path: "/watchlists", name: "watchlists", component: WatchlistsView, meta: { title: "Watchlists" } },
    { path: "/volatility", name: "volatility", component: VolatilityView, meta: { title: "Volatility" } },
    { path: "/earnings", name: "earnings", component: EarningsView, meta: { title: "Earnings" } },
    { path: "/stock/:symbol", name: "stock-detail", component: StockDetailView },
    { path: "/sector-rotation", name: "sector-rotation", component: SectorRotationView, meta: { title: "Sector Rotation" } },
    { path: "/sector-drilldown", name: "sector-drilldown", component: SectorDrilldownView, meta: { title: "Sector Drilldown" } },
    { path: "/industry-groups", name: "industry-groups", component: IndustryGroupsView, meta: { title: "Industry Groups" } },
    { path: "/tickers", name: "tickers", component: TickersView, meta: { title: "Tickers" } },
    { path: "/users", name: "users", component: UsersView, meta: { title: "Users", admin: true } },
  ],
});

// The session is cached after the first lookup, so this only waits on the server once per sign-in.
router.beforeEach(async (to) => {
  if (to.meta.public && to.name !== "login") return;
  const user = await getSessionUser();
  if (!to.meta.public && !user) {
    // A failed email verification link lands on "/?error=..."; keep the error so the login page can show it.
    if (typeof to.query.error === "string") return { name: "login", query: { error: to.query.error } };
    // A new visitor arriving at the site sees what it is; a deep link (e.g. a bookmarked page) goes to sign-in.
    return { name: to.name === "home" ? "welcome" : "login" };
  }
  if (to.name === "login" && user) {
    return { name: "home" };
  }
  // The server refuses non-admins too; this just keeps them off an empty page.
  if (to.meta.admin && !user?.isAdmin) {
    return { name: "home" };
  }
});

export default router;
