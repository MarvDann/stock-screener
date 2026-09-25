import { createRouter, createWebHistory } from "vue-router";
import BreakoutView from "../views/BreakoutView.vue";
import HomeView from "../views/HomeView.vue";
import SectorRotationView from "../views/SectorRotationView.vue";
import StockDetailView from "../views/StockDetailView.vue";
import LoginView from "../views/LoginView.vue";
import TickersView from "../views/TickersView.vue";
import StockChartsView from "../views/StockChartsView.vue";
import SectorDrilldownView from "../views/SectorDrilldownView.vue";
import EtfsView from "../views/EtfsView.vue";
import { isAuthenticated } from "../api";

// `title` names a page for the stock detail page's back button.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView, meta: { title: "Home" } },
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/breakout", name: "breakout", component: BreakoutView, meta: { title: "Breakout" } },
    { path: "/stock-charts", name: "stock-charts", component: StockChartsView, meta: { title: "Stock Charts" } },
    { path: "/etfs", name: "etfs", component: EtfsView, meta: { title: "ETFs" } },
    { path: "/stock/:symbol", name: "stock-detail", component: StockDetailView },
    { path: "/sector-rotation", name: "sector-rotation", component: SectorRotationView, meta: { title: "Sector Rotation" } },
    { path: "/sector-drilldown", name: "sector-drilldown", component: SectorDrilldownView, meta: { title: "Sector Drilldown" } },
    { path: "/tickers", name: "tickers", component: TickersView, meta: { title: "Tickers" } },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated()) {
    return { name: "login" };
  }
  if (to.name === "login" && isAuthenticated()) {
    return { name: "home" };
  }
});

export default router;
