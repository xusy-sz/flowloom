#!/usr/bin/env node
// flowloom dist 预构建管线（票 54——票 42 裁 2/3/6 产物）：vite lib mode 自建脚本，
// 零新增 devDep（vite+plugin-svelte 已在 devDeps；play:build 同管线实证编全 src 树
// 含三 .svelte.ts 的 compileModule）。产物形状（42 裁 2，与首消费者 vendor 产物同形）：
// 三入口 bundle ESM 各一文件 dist/{index,kernel,svelte}.js + tokens.css 原样拷贝；
// svelte 恒 external（peerDep 宿主自供——单一运行时）；组件 css compilerOptions
// 'injected'（样式内嵌自含 JS，零 CSS 文件面）。minify 关（esbuild bundle 缺省不压，
// 入仓产物可 grep 可 diff）。
//
// 三次独立构建（单次多入口会被 rollup 自动代码分割拆 shared chunk——入口变薄
// facade+产物超四件，与「各一文件」形状冲突）：kernel 先行零依赖成件 → svelte 构建
// 把 src/kernel/** 全 external 经 output.paths 归指 './kernel.js'（kernel 单家、不
// 复制）→ index 构建把两 barrel external 归指 './kernel.js'/'./svelte.js'（纯转出口
// 门面）。构建后机械断言形状（票 54 验收面）——与 src/dist-shape.test.ts 双保险
// （本脚本守构建时点，测试守入仓产物，口径同源）。
// 重建纪律（42 裁 6）：票收口随版本 bump 跑 npm run dist:build 重新提交（成仓检查单
// 有行）；check 面不挂新鲜度断言（迭代中途必红，裁轻面靠纪律执持）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const ENTRIES = ['index', 'kernel', 'svelte'];
const EXPECTED_FILES = [...ENTRIES.map((name) => `${name}.js`), 'tokens.css'];
// 入口间相对引用白面（index 转出口 kernel/svelte；svelte 层吃 kernel 纯函数）
const ENTRY_REFS = new Set(['./kernel.js', './svelte.js']);
// 语句锚定的 from 扫描（^|[;\n] 后接 import/export 关键字再无 ; 直到 from）：裸
// `\bfrom\s*'…'` 会被串字面量误伤（kernel assertKnownKeys 的 "from" 数组项实证）。
const FROM_SPEC_RE = /(?:^|[;\n])\s*(?:import|export)\s[^;]*?\bfrom\s*(['"])([^'"]+)\1/g;
// from 形盲区的两条补充扫描（code-review 当日补）：副作用 import `import "spec"` 与
// 动态 import()——svelte.js 实有 `import "svelte/internal/disclose-version"` 侧效形。
const SIDE_IMPORT_RE = /(?:^|[;\n])\s*import\s*(['"])([^'"]+)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1/g;

const norm = (id) => id.split(path.sep).join('/');
const isKernelModule = (id) => norm(id).includes('/src/kernel/');
const isSvelteBarrel = (id) => norm(id).endsWith('/src/svelte/index.ts');

fs.rmSync(distDir, { recursive: true, force: true });

await buildOne('kernel', 'src/kernel/index.ts', []);
await buildOne('svelte', 'src/svelte/index.ts', [isKernelModule]);
await buildOne('index', 'src/index.ts', [isKernelModule, isSvelteBarrel]);

fs.copyFileSync(path.join(root, 'src', 'svelte', 'tokens.css'), path.join(distDir, 'tokens.css'));

const problems = [...collectProblems()];
if (problems.length) {
  console.error(`dist 形状断言违规 ${problems.length} 处：\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const sizes = EXPECTED_FILES.map(
  (file) => `${file} ${Math.round(fs.statSync(path.join(distDir, file)).size / 1024)}KB`,
);
console.log(`dist:build 通过（${sizes.join(' · ')}）`);

/** 单入口一次 vite lib mode 构建：bare svelte 恒 external；crossRefs 额外 external
 * （绝对路径判据）并经 output.paths 归指对应入口件——kernel 单家不复制。 */
async function buildOne(name, entry, crossRefs) {
  const isCross = (id) => crossRefs.some((match) => match(id));
  await build({
    configFile: false,
    root,
    plugins: [svelte({ compilerOptions: { css: 'injected' } })],
    build: {
      outDir: 'dist',
      emptyOutDir: name === 'kernel',
      minify: false,
      lib: { entry, formats: ['es'], fileName: () => `${name}.js` },
      rollupOptions: {
        external: (id) => /^svelte(\/|$)/.test(id) || isCross(id),
        output: {
          entryFileNames: `${name}.js`,
          paths: (id) =>
            isKernelModule(id) ? './kernel.js' : isSvelteBarrel(id) ? './svelte.js' : id,
        },
      },
    },
  });
}

/** 形状断言（票 54 验收面）：文件集恰四件+tokens 原样+说明符面干净。 */
function* collectProblems() {
  const files = fs.readdirSync(distDir).sort();
  for (const file of files) {
    if (!EXPECTED_FILES.includes(file)) yield `多余文件：${file}（无 CSS 文件面/无共享 chunk）`;
  }
  for (const file of EXPECTED_FILES) {
    if (!files.includes(file)) yield `缺文件：${file}`;
  }
  if (files.includes('tokens.css')) {
    const source = fs.readFileSync(path.join(root, 'src', 'svelte', 'tokens.css'));
    const output = fs.readFileSync(path.join(distDir, 'tokens.css'));
    if (!source.equals(output)) yield 'tokens.css 非原样拷贝（内容漂移）';
  }
  for (const name of ENTRIES) {
    const code = fs.readFileSync(path.join(distDir, `${name}.js`), 'utf8');
    yield* specProblems(name, code);
  }
}

/** 说明符面断言：kernel 零依赖（引擎无关红线镜像）；bare 只许 svelte external；
 * 相对引用只许入口间；svelte.js 须有 svelte 说明符在场（被卷入即消失——反证）。 */
function* specProblems(name, code) {
  const specs = [
    ...code.matchAll(FROM_SPEC_RE),
    ...code.matchAll(SIDE_IMPORT_RE),
    ...code.matchAll(DYNAMIC_IMPORT_RE),
  ].map((m) => m[2]);
  if (name === 'kernel') {
    if (specs.length) yield `kernel.js 应零依赖（纯 TS 红线镜像），实有 ${specs.length} 条 import`;
    return;
  }
  for (const spec of specs) {
    if (/^svelte(\/|$)/.test(spec)) continue;
    if (/^\.\.?\//.test(spec)) {
      if (!ENTRY_REFS.has(spec)) yield `${name}.js 入口外相对引用：${spec}`;
      continue;
    }
    yield `${name}.js 意外 bare 说明符：${spec}（只许 svelte external——被卷入即违规）`;
  }
  if (name === 'svelte' && !specs.some((spec) => /^svelte(\/|$)/.test(spec))) {
    yield 'svelte.js 无 svelte 说明符在场——external 失效被卷入 bundle 的信号';
  }
}
