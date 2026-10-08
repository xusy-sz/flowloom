// flowloom playground 独立 vite 配置（与宿主底盘 vite.config.ts 互不相干——
// 独立 root+独立 svelte 插件实例；包说明符别名演练消费者 import 形态）。
// dist.html 载体页（票 54）吃包说明符 dist 面：flowloom/dist* 别名直指入仓产物
// ——同「消费者 import 形态演练」口径，dist 页与源码页互为对照（同一 demo 两路）。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, '..', 'src');
const dist = join(root, '..', 'dist');

export default defineConfig({
  root,
  plugins: [svelte()],
  resolve: {
    alias: [
      { find: /^flowloom$/, replacement: join(src, 'index.ts') },
      { find: /^flowloom\/kernel$/, replacement: join(src, 'kernel', 'index.ts') },
      { find: /^flowloom\/svelte$/, replacement: join(src, 'svelte', 'index.ts') },
      { find: /^flowloom\/tokens\.css$/, replacement: join(src, 'svelte', 'tokens.css') },
      { find: /^flowloom\/dist$/, replacement: join(dist, 'index.js') },
      { find: /^flowloom\/dist\/kernel$/, replacement: join(dist, 'kernel.js') },
      { find: /^flowloom\/dist\/svelte$/, replacement: join(dist, 'svelte.js') },
      { find: /^flowloom\/dist\/tokens\.css$/, replacement: join(dist, 'tokens.css') },
    ],
  },
  server: { port: 5199 },
  build: { outDir: 'dist' },
});
