import { createRouter, createWebHistory } from "vue-router";
import BreakoutView from "../views/BreakoutView.vue";
import SectorRotationView from "../views/SectorRotationView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/breakout" },
    { path: "/breakout", name: "breakout", component: BreakoutView },
    { path: "/sector-rotation", name: "sector-rotation", component: SectorRotationView },
  ],
});

export default router;
