import vue from "@vitejs/plugin-vue";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vitest/config";

// 部品のテスト(src/**/*.test.ts)。DOM は happy-dom
export default defineConfig({
    plugins: [vue(), Icons({ compiler: "vue3" })],
    test: {
        environment: "happy-dom",
        include: ["src/**/*.test.ts"],
    },
});
