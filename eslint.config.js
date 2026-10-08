// flowloom ESLint 平面配置：复杂度/嵌套/参数/函数行数四条红线 + 文件级 ≤400 行闸门
// 在此机械强制；与 tools/check/code_limits.mjs 双保险（eslint 权威裁决、脚本独立冗余）。
import js from '@eslint/js';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

/** 红线阈值（与 tools/check/code_limits.mjs 同源）。 */
const MAX_FILE_LINES = 400;
/** 逐项豁免标记：`规约豁免[项名]`（项名见 code_limits.mjs 七项表；标记是唯一豁免通道）。 */
const EXEMPT_RE = new RegExp('规约' + '豁免\\[([^\\]]*)\\]');

/**
 * 文件级红线规则：源文件 ≤ 400 行，豁免只认逐项标记——文件里存在带 `行数`
 * 项名的标记时放行（code_limits.mjs 同判，两处口径一致：不给文件级洗白留第二条路）。
 */
const redline = {
  rules: {
    'max-lines-marked': {
      meta: {
        type: 'problem',
        docs: { description: '源文件 ≤ 400 行（逐项豁免[行数] 可放行）' },
        schema: [],
        messages: {
          over: '文件 {{lines}} 行 > ' + MAX_FILE_LINES + '（豁免只认逐项标记）',
        },
      },
      create(context) {
        const source = context.sourceCode ?? context.getSourceCode();
        const total = source.lines.length;
        if (total <= MAX_FILE_LINES) return {};
        // HTML 注释不在 JS 注释表里（svelte-eslint-parser 的 getAllComments 只覆盖
        // script 面），故按源文本判标记——与 code_limits.mjs 的行级判定同口径。
        const hit = source.getText().match(EXEMPT_RE)?.[1] ?? '';
        if (hit.split(',').some((x) => x.trim() === '行数')) return {};
        return {
          Program(node) {
            context.report({ node, messageId: 'over', data: { lines: String(total) } });
          },
        };
      },
    },
  },
};

export default typescriptEslint.config(
  // 构建产物/依赖/本地运行态不入 lint 面（与 .gitignore 同口径）
  {
    ignores: ['node_modules/', '**/dist/', 'coverage/', 'data/', '.mimosa/'],
  },
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  { plugins: { redline }, rules: { 'redline/max-lines-marked': 'error' } },
  {
    // 四条红线规则全语言栈统一（所有指标可被工具自动检查）。
    files: ['**/*.{ts,svelte,js,mjs}'],
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // 测试裁量：describe/it 是结构容器非业务函数，仅豁免函数行数；
    // 复杂度/嵌套/参数红线照常生效，单个 it 保持小颗粒由 review 把关。
    files: ['**/*.test.{ts,mjs}'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    // 渲染层与 playground/fixtures 是浏览器面；kernel 零 DOM 是纪律约束，不靠
    // globals 收紧表达——由 src/kernel/purity.test.ts 机械钉死（spec 测试教义）。
    // playground 的 .svelte 同为浏览器面（载体组件用 Event/HTMLInputElement 等
    // DOM 全局——票 46 前该后缀漏列，svelte 载体件一引用 DOM 全局即 no-undef）。
    files: ['src/**/*.{ts,svelte}', 'playground/**/*.{js,ts,svelte}', 'fixtures/**/*.svelte'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: typescriptEslint.parser, extraFileExtensions: ['.svelte'] },
    },
  },
  {
    // Svelte 5 runes 纯 TS 模块（.svelte.ts，先例 placement.svelte.ts）：
    // eslint-plugin-svelte 默认把该后缀交给 svelte-eslint-parser（模板解析器），
    // 纯 TS 面（type 导入修饰符等）解析不了——覆写回 TS 解析器（runes 是普通标识符）。
    files: ['**/*.svelte.ts'],
    languageOptions: { parser: typescriptEslint.parser },
  },
  {
    // Node 侧脚本与配置：允许 Node 全局。
    files: ['tools/**/*.mjs', '*.config.js', '*.config.ts', 'playground/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
