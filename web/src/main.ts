import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
// 字は @fontsource から(外の CDN は使わない)。日本語は unicode-range で分かれていて、使う字のぶんだけ読む
import "@fontsource/ibm-plex-sans-jp/400.css";
import "@fontsource/ibm-plex-sans-jp/500.css";
import "@fontsource/ibm-plex-sans-jp/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./style.css";

createApp(App).use(router).mount("#app");
