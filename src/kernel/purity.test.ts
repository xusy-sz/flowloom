// kernel 纯度红线机械钉死（spec 测试教义：教义红线用测试钉死而非注释约定）——
// 本层零 DOM/零 Svelte：源文件不得 import svelte 系模块、不得引用 DOM/渲染器全局。
// 扫描源文件而非依赖 lint globals（eslint 全 flowloom 放 browser globals 是 M0 既定姿态）。
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const kernelDir = dirname(fileURLToPath(import.meta.url));

function kernelSources(): string[] {
  return readdirSync(kernelDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(kernelDir, f));
}

describe('kernel 纯度（引擎无关红线：零 DOM/零 Svelte）', () => {
  it('所有 kernel 源文件不 import svelte 系模块', () => {
    for (const file of kernelSources()) {
      const src = readFileSync(file, 'utf8');
      expect(src.match(/from\s+['"][^'"]*svelte/i), `${file} 引入 svelte`).toBeNull();
    }
  });

  it('所有 kernel 源文件不引用 DOM/渲染器全局标识', () => {
    for (const file of kernelSources()) {
      const src = readFileSync(file, 'utf8');
      const hit = src.match(/\b(document|window|HTMLElement|navigator|SVGElement)\b/);
      expect(hit, `${file} 引用 DOM 全局：${hit?.[0]}`).toBeNull();
    }
  });
});
