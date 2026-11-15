import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";

export default defineConfigWithVueTs(
    { ignores: ["dist/**"] },
    pluginVue.configs["flat/recommended"],
    vueTsConfigs.recommended,
    // 部品の名前は仕様のとおり(Avatar・Stamp)。1 語でもよい
    { rules: { "vue/multi-word-component-names": "off" } },
);
