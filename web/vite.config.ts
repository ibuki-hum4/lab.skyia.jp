import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";
import vueDevTools from "vite-plugin-vue-devtools";

// Senri(server)の開発用のポート。server と同じく 3927
const API = "http://localhost:3927";

export default defineConfig({
    plugins: [
        vue(),
        // 開発中だけ、画面の左下に Vue DevTools が出る(ビルドには入らない)
        vueDevTools(),
        tailwindcss(),
        // `import IconX from "~icons/lucide/x"` と書いたアイコンだけを取り込む(auto-import はしない)
        Icons({ compiler: "vue3" }),
    ],
    server: {
        port: 5173,
        // 開発中は、ブラウザは Vite(5173)だけを開く。API は Vite が Senri へ回す
        proxy: {
            "/api": API,
            "/healthz": API,
        },
    },
    build: {
        outDir: "dist",
    },
});
