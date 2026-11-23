import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
// Fonts are bundled and served from our own server, so visitors' browsers don't contact Google.
import "@fontsource-variable/instrument-sans/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./style.css";

createApp(App).use(router).mount("#app");
