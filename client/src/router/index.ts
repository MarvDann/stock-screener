import { createRouter, createWebHistory } from "vue-router";
import BreakoutView from "../views/BreakoutView.vue";
import SectorRotationView from "../views/SectorRotationView.vue";
import StockDetailView from "../views/StockDetailView.vue";
import LoginView from "../views/LoginView.vue";
import { isAuthenticated } from "../api";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/breakout" },
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/breakout", name: "breakout", component: BreakoutView },
    { path: "/stock/:symbol", name: "stock-detail", component: StockDetailView },
    { path: "/sector-rotation", name: "sector-rotation", component: SectorRotationView },
  ],
});

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthenticated()) {
    return { name: "login" };
  }
  if (to.name === "login" && isAuthenticated()) {
    return { name: "breakout" };
  }
});

export default router;
