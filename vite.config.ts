import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 组件测试（jsdom 文件级环境）里 bare 'svelte' 在 Node 解析命中 server 入口
// （mount 报 lifecycle_function_unavailable），且包 exports 封锁子路径——用
// 绝对文件路径别名直达 client 入口。仅测试进程生效，不影响 `vite build`。
const SVELTE_CLIENT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'node_modules',
  'svelte',
  'src',
  'index-client.js',
);
if (!fs.existsSync(SVELTE_CLIENT)) throw new Error(`svelte client 入口缺失：${SVELTE_CLIENT}`);

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'node',
    alias: [{ find: /^svelte$/, replacement: SVELTE_CLIENT }],
  },
});
