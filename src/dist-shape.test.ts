// dist 预构建产物形状测试（票 54 验收面）：入仓 dist 四件套的机械钉死——三入口
// ESM+tokens.css 原样、svelte 未被卷入（bare 说明符只许 svelte external）、零 CSS
// 文件面（文件集恰四件）。与 tools/dist-build.mjs 构建后断言双保险（脚本守构建
// 时点、本测试守入仓产物——票 42 裁 6：check 不挂新鲜度断言，形状断言不辖重建）。
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist');
// 语句锚定的 from 扫描（^|[;\n] 后接 import/export 关键字再无 ; 直到 from）：裸
// `\bfrom\s*'…'` 会被串字面量误伤（kernel assertKnownKeys 的 "from" 数组项实证）。
// from 形盲区两条补充：副作用 import `import "spec"` 与动态 import()——svelte.js 实有
// `import "svelte/internal/disclose-version"` 侧效形（code-review 当日补）。
const FROM_SPEC_RE = /(?:^|[;\n])\s*(?:import|export)\s[^;]*?\bfrom\s*(['"])([^'"]+)\1/g;
const SIDE_IMPORT_RE = /(?:^|[;\n])\s*import\s*(['"])([^'"]+)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1/g;

function specifiersOf(name: string): string[] {
  // 组 2 在整式命中时恒参与（(?:…)外层捕获）；?? '' 只过 noUncheckedIndexedAccess 门
  const code = readFileSync(join(distDir, name), 'utf8');
  return [
    ...code.matchAll(FROM_SPEC_RE),
    ...code.matchAll(SIDE_IMPORT_RE),
    ...code.matchAll(DYNAMIC_IMPORT_RE),
  ].map((m) => m[2] ?? '');
}

describe('dist 预构建产物形状（票 54）', () => {
  it('文件集恰四件：三入口 js+tokens.css（零 CSS 文件面/无共享 chunk）', () => {
    expect([...readdirSync(distDir).sort()]).toEqual([
      'index.js',
      'kernel.js',
      'svelte.js',
      'tokens.css',
    ]);
  });

  it('tokens.css 原样拷贝（与 src/svelte/tokens.css 逐字节同——Buffer.equals）', () => {
    const source = readFileSync(join(repoRoot, 'src', 'svelte', 'tokens.css'));
    expect(readFileSync(join(distDir, 'tokens.css')).equals(source)).toBe(true);
  });

  it('kernel.js 零依赖（引擎无关红线在产物面的镜像）', () => {
    expect(specifiersOf('kernel.js')).toEqual([]);
  });

  it('index.js 纯转出口门面：只引两入口件', () => {
    expect([...specifiersOf('index.js').sort()]).toEqual(['./kernel.js', './svelte.js']);
  });

  it('svelte.js 未卷入 svelte：bare 只许 svelte external 且至少一条在场（反证）', () => {
    const specs = specifiersOf('svelte.js');
    const bare = specs.filter((spec) => !spec.startsWith('.'));
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.every((spec) => /^svelte(\/|$)/.test(spec))).toBe(true);
    expect(specs.filter((spec) => spec.startsWith('.'))).toEqual(['./kernel.js']);
  });
});
