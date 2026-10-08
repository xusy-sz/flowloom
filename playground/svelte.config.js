// flowloom playground 的 svelte 配置（与宿主仓根同款）：vitePreprocess 承接
// <script lang="ts"> 的完整 TS 语法（svelte 5 编译器原生只兜类型注解面）。
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
