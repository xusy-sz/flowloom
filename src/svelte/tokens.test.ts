// 主题 token 集中表静态钉死（票 22）：jsdom 测不了 CSS 变量解析——本缝为文本级
// 红线（module-state/BoxModel 同定位：钉死常见回归向量非全证明）。三面：
// 1) 两个深色段（prefers-color-scheme media 与 data-fl-theme 属性选择器）必须逐声明
//    相同——手工双份表的漂移向量机械封死（改值须两处同步）；
// 2) 深色段是浅色段的同键子集（只翻色不增删几何 token）；
// 3) 组件面引用的静态 --fl-* token 在集中表全有座（新 token 不入表=降级通道分叉
//    的回归向量）——开放集/内部间接 var 白名单除外。
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

const tokens = readFileSync(join(dir, 'tokens.css'), 'utf-8');

/** 声明块解析：选择器 → 有序键值对（去注释；一文件一用不引 CSS 解析依赖）。 */
function declarations(block: string): Map<string, string> {
  const body = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
  const cleaned = body.replace(/\/\*[\S\s]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const line of cleaned.split(';')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return map;
}

function blockOf(selectorNeedle: string): string {
  // 扁平块切分（tokens.css 无嵌套规则；@media 外层剥掉取内块）
  const media = tokens.match(/@media \(prefers-color-scheme: dark\) \{[\S\s]*?\n\}/)?.[0];
  const pool = selectorNeedle === ":root:not([data-fl-theme='light'])" ? (media ?? '') : tokens;
  const start = pool.indexOf(selectorNeedle);
  expect(start, `${selectorNeedle} 段在场`).toBeGreaterThan(-1);
  const open = pool.indexOf('{', start);
  return pool.slice(start, matchingBrace(pool, open) + 1);
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

describe('主题 token 集中表（票 22）', () => {
  const light = declarations(blockOf(':root {'));
  const darkMedia = declarations(blockOf(":root:not([data-fl-theme='light'])"));
  const darkAttr = declarations(blockOf(":root[data-fl-theme='dark']"));

  it('切换机制在场：data-fl-theme 属性段+系统深色 media 段（未锁浅即生效）', () => {
    expect(tokens).toContain('@media (prefers-color-scheme: dark)');
    expect(tokens).toContain(":root:not([data-fl-theme='light'])");
    expect(tokens).toContain(":root[data-fl-theme='dark']");
    // 锁浅出口：显式 light 属性在 media 段排除名单里（缺省跟随系统的机制面）
    expect(tokens).not.toContain(":root[data-fl-theme='light'] {");
  });

  it('两个深色段逐声明相同（手工双份表的漂移向量封死）', () => {
    expect([...darkAttr.entries()]).toEqual([...darkMedia.entries()]);
  });

  it('深色段=浅色段同键子集且值全翻（只翻色不增删几何 token）', () => {
    for (const key of darkAttr.keys()) {
      expect(light.has(key), `${key} 须在浅色段有座`).toBe(true);
      expect(darkAttr.get(key), `${key} 深色值须不同于浅色`).not.toBe(light.get(key));
    }
    // owner 已裁：选中族保蓝提亮一族一色贯穿浅深
    expect(light.get('--fl-selection')).toBe('#2563eb');
    expect(darkAttr.get('--fl-selection')).toBe('#60a5fa');
  });

  it('组件面引用的静态 token 全有座（降级通道不分叉）', () => {
    // 组件清单自动收集（.svelte 全量——新增组件漏检面不存在）
    const files = readdirSync(dir).filter((f) => f.endsWith('.svelte'));
    expect(files.length).toBeGreaterThan(10); // 采集面健全性（组件面规模下限）
    // 开放集（词表 typeId 指名宿主供值；票 33 --fl-state-* 同族——nodeStates vars
    // 袋逐键注根，值全宿主供不入集中表）、挂载点局部开关与嵌套回落键（不独立设值
    // ——--fl-reroute-active-bg 缺省回落 --fl-selection 一族一色）不入集中表
    const openSet = /^--fl-(port|link|state)-/;
    const localOnly = new Set(['--fl-widget-resize', '--fl-node-cat', '--fl-reroute-active-bg']);
    const referenced = new Set<string>();
    for (const file of files) {
      // 剥注释（「--fl-panel-* 系」类通配提及不是真实引用面）
      const src = readFileSync(join(dir, file), 'utf-8')
        .replace(/\/\*[\S\s]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/--fl-[a-z][a-z0-9-]*/g)) referenced.add(m[0]);
    }
    expect(referenced.size).toBeGreaterThan(20); // 采集面健全性（token 面规模下限）
    for (const name of referenced) {
      if (openSet.test(name) || localOnly.has(name)) continue;
      expect(light.has(name), `${name} 须在集中表有座`).toBe(true);
    }
  });

  it('节点体 token 化钉死：CanvasNodes 样式零裸色值（var() 回退通道除外）', () => {
    const style =
      readFileSync(join(dir, 'CanvasNodes.svelte'), 'utf-8').match(
        /<style>([\S\s]*)<\/style>/,
      )?.[1] ?? '';
    // 剥掉 var(...) 链（回退值是降级通道的合法 hex 载体）后不得再出现裸色值
    const withoutVarChains = style.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '');
    expect(withoutVarChains, '色值全走 var(--fl-*)——回退值除外').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(style).toContain('var(--fl-node-bg');
    expect(style).toContain('var(--fl-node-border');
    // 类别色 tint 档（原型裁定；owner 过目返工=比例 token 化浅 40%/深 30% 降浊）
    expect(style).toContain('var(--fl-node-cat, transparent) var(--fl-node-cat-mix, 40%)');
  });
});
