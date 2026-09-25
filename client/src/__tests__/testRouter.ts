import { createMemoryHistory, createRouter, type LocationQueryRaw, type Router } from "vue-router";

const blank = { template: "<div />" };

/** An in-memory router with the page under test at "/" and a stock detail route for its links. */
export function makeTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: blank },
      { path: "/stock/:symbol", name: "stock-detail", component: blank },
    ],
  });
}

/** A router already at "/" with `query`, e.g. to mount a page as if opened from a shared link. */
export async function routerAt(query: LocationQueryRaw = {}): Promise<Router> {
  const router = makeTestRouter();
  await router.push({ path: "/", query });
  await router.isReady();
  return router;
}
