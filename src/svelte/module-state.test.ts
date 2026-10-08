// 多实例隔离静态红线（票 16 / story 29）：库面零共享可变模块态——「一 controller
// 一实例」的构造前提住模块顶层：无可变绑定（let/var）、无模块级 runes
// （$state/$derived/$effect——.svelte.ts 模块的跨实例共享面）、无类静态字段、
// 容器常量（Map/Set/数组/对象字面量）只作只读数据表不被写。kernel purity.test.ts
// 同思路对账：扫源文件机械钉死而非注释约定；扫描域=src 全量非测试源
// （kernel+svelte 两层同守——实例隔离是库级属性，不分区）。
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** 扫描面：src 全量源文件（.ts 含 .svelte.ts；.svelte 查 module 块），
 * 排除 *.test.ts——测试自含构造不属库面。 */
function libraryFiles(): string[] {
  return walk(srcRoot).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.svelte')) && !f.endsWith('.test.ts'),
  );
}

function tsSources(): string[] {
  return libraryFiles().filter((f) => f.endsWith('.ts'));
}

/** 模块顶层行（列 0 起——函数体/类体经 prettier 恒缩进，列 0 即模块域）。 */
function topLevelLines(src: string): string[] {
  return src.split('\n').filter((line) => /\S/.test(line) && !line.startsWith(' '));
}

describe('多实例隔离静态红线（零共享可变模块态——票 16）', () => {
  it('模块顶层无可变绑定（let/var）与模块级 runes（$state/$derived/$effect）', () => {
    for (const file of tsSources()) {
      for (const line of topLevelLines(readFileSync(file, 'utf8'))) {
        expect(line.match(/^(?:export )?(?:let|var)\s/), `${file} 模块级可变绑定：${line}`).toBe(
          null,
        );
        expect(
          // 非导出 const 同查（code-review 判读采纳：只查 export 会漏模块私有 runes）
          line.match(/^(?:export )?const \w+[^=]*= *\$(?:state|derived|effect)\(/),
          `${file} 模块级 runes（跨实例共享响应态）：${line}`,
        ).toBe(null);
      }
    }
  });

  it('.svelte 组件 module 块零状态（实例间共享的只剩类型与只读注释）', () => {
    for (const file of libraryFiles().filter((f) => f.endsWith('.svelte'))) {
      const src = readFileSync(file, 'utf8');
      const block = src.match(/<script module[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
      expect(
        block.match(/\b(?:let|var)\s|\$(?:state|derived|effect)\(/),
        `${file} module 块含状态`,
      ).toBe(null);
    }
  });

  it('类静态字段为零（static=跨实例共享面——实例态一律住工厂闭包/实例字段）', () => {
    for (const file of tsSources()) {
      const hit = readFileSync(file, 'utf8').match(/\bstatic\s+[A-Za-z_$]/);
      expect(hit, `${file} 类静态字段：${hit?.[0]}`).toBe(null);
    }
  });

  /** 容器常量声明形（列 0 const+容器初始化器——收集写入点巡检的名册）。 */
  const CONTAINER_DECL = new RegExp(
    '^(?:export )?const ([A-Za-z_$][\\w$]*) *(?::[^=]+)? *= ' +
      '(?:new (?:Map|Set|WeakMap|WeakSet)|\\[|\\{)',
  );

  /** 容器变更方法族（重绑/索引位/属性位三写形之外的第四类——方法调用形）。 */
  const MUTATING_METHODS =
    'add|set|delete|clear|push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin';

  it('模块级容器常量只读（Map/Set/数组/对象字面量数据表无写入点）', () => {
    const sources = tsSources().map((file) => ({ file, src: readFileSync(file, 'utf8') }));
    // 收集列 0 容器常量名（export 与否均入册）
    const names = new Set<string>();
    for (const { src } of sources) {
      for (const line of topLevelLines(src)) {
        const m = line.match(CONTAINER_DECL);
        if (m !== null && m[1] !== undefined) names.add(m[1]);
      }
    }
    expect(names.size).toBeGreaterThan(0); // 扫描自证非空转
    const writes: RegExp[] = [];
    for (const name of names) {
      // 声明行（const/let/var 前缀）不算重绑；捕获索引位与属性位两类定点写
      writes.push(new RegExp(`(?<!const |let |var )\\b${name} *=([^=]|$)`)); // 整体重绑
      writes.push(new RegExp(`\\b${name}\\[[^\\]]*\\]\\s*=(?!=)`)); // 索引位写
      writes.push(new RegExp(`\\b${name}\\.\\w+(?:\\.\\w+)*\\s*=(?!=)`)); // 属性位写（含嵌套深写）
      writes.push(new RegExp(`\\b${name}\\.(?:${MUTATING_METHODS})\\(`)); // 方法调用写
    }
    for (const { file, src } of sources) {
      for (const re of writes) {
        const hit = src.match(re);
        expect(hit, `${file} 写模块级容器常量：${hit?.[0]}`).toBe(null);
      }
    }
  });
});
