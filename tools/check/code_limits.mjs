#!/usr/bin/env node
// 代码规约红线的机械检查（TS/JS/Svelte 源文件面；自孵化母仓随成仓迁入，
// 2026-09-30——阈值与豁免机制原样保留，扫描面改为本仓自有目录）。
//
// 检查项与阈值（口径与母仓后端检查脚本同源）：
//
// | 检查项 | 上限 | 本脚本的机械口径 |
// |---|---|---|
// | 行数   | 400 | 文件总行数（末行换行不计）|
// | 空行   | 连续 2 | 连续空行游程，每段报一次；豁免点＝游程前最后一个内容行 |
// | 行宽   | 100 | 制表符按 4 列展开 |
// | 函数体 | 40 | 花括号配平启发式（空行与注释计入，宁严勿漏；Script 面）|
// | 参数   | 4 | 函数声明行括号内顶层逗号切分（Script 面）|
// | 复杂度 | 10 | 1 + if / for / while / && / \|\| 计数（Script 面）|
// | 嵌套   | 4 | if / for / while 的块嵌套层数（Script 面）|
//
// 复杂度/嵌套/参数/函数行数四条红线的**权威裁决是 ESLint**（eslint.config.js 四规则
// + max-lines 文件级闸门）；本脚本是独立冗余实现，双保险防单点失灵。故本脚本的函数面
// 只认 `function` 声明（箭头函数、类方法体由 ESLint 覆盖），.svelte 的函数体不参与
// 函数检查（模板语法无花括号配平语义，ESLint 覆盖）；`switch` 臂是表驱动分派、不计
// 嵌套与复杂度（同后端 `match` 口径，见 §1.1），判据只取 if/for/while 与 &&/||。
//
// **逐项豁免**：标记形态见下方 MARKER 常量（字面形态不排于本文件头——本文件自身
// 在扫描面内，字面标记会被判格式违规），七项项名表见下方 ITEMS。
//
// 生效范围＝标记所在行 + 其后首个代码行（**隔空行即不附着**）；只豁免被点名的项，
// 同文件其他检查照常报红——「一行注释洗白整个文件」在机械上没有通道。裸标记（无
// 项名）或未知项名一律判格式违规（不静默忽略）。`--list-exemptions` 列出全部生效
// 豁免。
//
// 用法：node code_limits.mjs [路径...]（缺省扫描 src/ tools/ playground/ fixtures/）
//       node code_limits.mjs --list-exemptions [路径...]
// 退出码：0=通过；1=违规（含豁免标记格式违规）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILE_LINES = 400;
const MAX_BLANK_RUN = 2;
const MAX_FN_LINES = 40;
const MAX_PARAMS = 4;
const MAX_CYCLO = 10;
const MAX_NEST = 4;
const WIDTH = { '.ts': 100, '.tsx': 100, '.mts': 100, '.js': 100, '.mjs': 100, '.svelte': 100 };
// 函数面检查（函数体/参数/复杂度/嵌套）生效的扩展名：Svelte 模板无花括号配平语义
const SCRIPT_EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);
// 项名表（七项，与母仓逐项豁免词表同源）
const ITEMS = ['行数', '空行', '行宽', '函数体', '参数', '复杂度', '嵌套'];
// 标记字面量拆开拼接：本文件自身在扫描面内，裸标记会被判格式违规
const MARKER = '规约' + '豁免';
const MARKER_RE = new RegExp(`${MARKER}\\[([^\\]]*)\\]`);
// 标记向后附着的行数上限（紧贴声明的惯例；隔太多行不算同一条）
const LOOKAHEAD = 3;
const COMMENT_PREFIXES = ['//', '#', '*', '/*', '<!--', '{/*'];
const FN_DECL_RE = /\bfunction\s+(\w+)\s*\(/;
// 圈复杂度判据：分支 + 循环 + 逻辑运算符（switch 臂/三元不计，见文件头）
const DECISION_RE = /\bif\b|\bfor\b|\bwhile\b|&&|\|\|/g;
const CONTROL_RE = /\b(?:if|for|while)\b/g;
// 字符串字面量置空后再数括号与判据（字面量里的 `{`/`if` 不得干扰机械计数）
const STRING_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data', 'docs', 'target', '.mimosa']);
// 门禁自证面排除位（当前无；负例夹具若将来入库挂在此处）
const SKIP_RELS = [];

/** 读文本为行表（统一 LF；末行换行不计——与后端 splitlines 口径一致）。 */
function readLines(p) {
  const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function isComment(text) {
  return COMMENT_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/** 标记起首个代码行的行号（1 基）；**遇空行即止**，超限或无则 0。 */
function nextCodeLine(lines, start) {
  for (let i = start; i < Math.min(start + LOOKAHEAD, lines.length + 1); i++) {
    const text = lines[i - 1].trim();
    if (!text) return 0;
    if (!isComment(text)) return i;
  }
  return 0;
}

/** 解析逐项豁免标记 → {项: {生效行号}}, [[标记行, 项名表]], [格式违规行]。 */
function parseMarkers(lines) {
  const marks = new Map(ITEMS.map((item) => [item, new Set()]));
  const declared = [];
  const bad = [];
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const hit = MARKER_RE.exec(raw);
    if (!hit) {
      if (raw.includes(MARKER)) bad.push(lineNo);
      return;
    }
    const names = hit[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!names.length || names.some((n) => !ITEMS.includes(n))) {
      bad.push(lineNo);
      return;
    }
    const targets = new Set([lineNo]);
    const attached = nextCodeLine(lines, lineNo + 1);
    if (attached) targets.add(attached);
    for (const name of names) {
      for (const target of targets) marks.get(name).add(target);
    }
    declared.push([lineNo, names]);
  });
  return { marks, declared, bad };
}

/** 单文件检查上下文（参数打包：路径、行表、豁免表、是否 Script 面、违规收集）。 */
function newCtx(p, lines, marks) {
  return { p, lines, marks, isScript: SCRIPT_EXTS.has(path.extname(p)), issues: [] };
}

function checkFileLength(ctx) {
  if (ctx.lines.length > MAX_FILE_LINES && !ctx.marks.get('行数').size) {
    ctx.issues.push(`${ctx.p}: 文件 ${ctx.lines.length} 行 > ${MAX_FILE_LINES}`);
  }
}

/** 连续空行（每段报一次；豁免点＝该段之前最后一个内容行）。 */
function checkBlankRuns(ctx) {
  const exempt = ctx.marks.get('空行');
  let run = 0;
  ctx.lines.forEach((ln, idx) => {
    if (ln.trim()) {
      run = 0;
      return;
    }
    run += 1;
    if (run === MAX_BLANK_RUN + 1 && !exempt.has(idx + 1 - run)) {
      ctx.issues.push(`${ctx.p}:${idx + 1}: 连续空行 > ${MAX_BLANK_RUN}`);
    }
  });
}

/** 行宽（按扩展名取上限；豁免点＝该行本身）。 */
function checkWidth(ctx) {
  const limit = WIDTH[path.extname(ctx.p)];
  if (!limit) return;
  const exempt = ctx.marks.get('行宽');
  ctx.lines.forEach((ln, idx) => {
    const w = ln.replace(/\t/g, '    ').length;
    if (w > limit && !exempt.has(idx + 1)) {
      ctx.issues.push(`${ctx.p}:${idx + 1}: 行宽 ${w} > ${limit}`);
    }
  });
}

/** 函数体长度（花括号配平启发式；空行与注释计入，严于规约 §1 计数规则）。 */
function bodyLength(lines, start, end) {
  let depth = 0;
  let body = 0;
  for (let i = start; i <= end; i++) {
    const text = stripLine(lines[i - 1]);
    if (depth > 0) body += 1;
    for (const ch of text) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
  }
  return body;
}

function stripLine(raw) {
  const cut = raw.indexOf('//');
  return (cut < 0 ? raw : raw.slice(0, cut)).replace(STRING_RE, '""');
}

/** 圈复杂度（1 + if/for/while/&&/|| 计数；判据见文件头）。 */
function cyclomatic(lines, start, end) {
  let count = 1;
  for (let i = start; i <= end; i++) {
    count += stripLine(lines[i - 1]).match(DECISION_RE)?.length ?? 0;
  }
  return count;
}

/** 嵌套深度（普通块如对象字面量、闭包体不加深；判据见文件头）。 */
function nestingDepth(lines, start, end) {
  const stack = [];
  let pending = 0;
  let best = 0;
  for (let i = start; i <= end; i++) {
    const text = stripLine(lines[i - 1]);
    pending += [...text.matchAll(CONTROL_RE)].length;
    for (const ch of text) {
      if (ch === '{') {
        stack.push(pending > 0);
        if (pending > 0) {
          pending -= 1;
          best = Math.max(best, stack.filter(Boolean).length);
        }
      } else if (ch === '}' && stack.length) stack.pop();
    }
  }
  return best;
}

/** 函数声明行的参数个数（括号内顶层逗号切分；折行签名不在启发式面内，ESLint 兜底）。 */
function paramCount(header) {
  if (!header.includes('(')) return 0;
  const start = header.indexOf('(') + 1;
  const end = header.lastIndexOf(')');
  if (end <= start) return 0;
  return header
    .slice(start, end)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && x !== 'self').length;
}

/** 函数边界扫描游标（跨行复用：花括号深度 + 当前函数起点）。 */
function newFnCursor() {
  return { name: '', header: '', start: 0, depthAtOpen: 0, depth: 0 };
}

function rememberDecl(cur, raw, text) {
  const hit = FN_DECL_RE.exec(text);
  if (!hit) return;
  cur.name = hit[1];
  cur.header = raw;
}

function openBrace(cur, lineNo) {
  cur.depth += 1;
  if (cur.start || !cur.name) return;
  cur.start = lineNo;
  cur.depthAtOpen = cur.depth;
}

function closeBrace(cur, lineNo, out) {
  cur.depth -= 1;
  if (!cur.start || cur.depth !== cur.depthAtOpen - 1) return;
  out.push({ name: cur.name, header: cur.header, decl: cur.start, end: lineNo });
  cur.start = 0;
  cur.name = '';
}

/** 扫描函数边界（启发式花括号配平；返回 {name, header, decl, end} 清单）。 */
function findFunctions(lines) {
  const out = [];
  const cur = newFnCursor();
  for (let i = 1; i <= lines.length; i++) {
    const text = stripLine(lines[i - 1]);
    if (!cur.start) rememberDecl(cur, lines[i - 1], text);
    for (const ch of text) {
      if (ch === '{') openBrace(cur, i);
      else if (ch === '}') closeBrace(cur, i, out);
    }
  }
  return out;
}

/** 函数级四项红线（项名、报文字段、上限、单位、度量函数）。 */
const FN_RULES = [
  { item: '函数体', label: '体', limit: MAX_FN_LINES, unit: ' 行', metric: 'body' },
  { item: '参数', label: '参数', limit: MAX_PARAMS, unit: ' 个', metric: 'params' },
  { item: '复杂度', label: '圈复杂度', limit: MAX_CYCLO, unit: '', metric: 'cyclo' },
  { item: '嵌套', label: '嵌套', limit: MAX_NEST, unit: ' 层', metric: 'nest' },
];

function fnMetrics(lines, fn) {
  return {
    body: bodyLength(lines, fn.decl, fn.end),
    params: paramCount(fn.header),
    cyclo: cyclomatic(lines, fn.decl, fn.end),
    nest: nestingDepth(lines, fn.decl, fn.end),
  };
}

/** 单项函数级判定（豁免点＝函数声明行）。 */
function reportFn(ctx, fn, rule, value) {
  if (value <= rule.limit || ctx.marks.get(rule.item).has(fn.decl)) return;
  ctx.issues.push(
    `${ctx.p}:${fn.decl}: 函数 ${fn.name} ${rule.label} ${value}${rule.unit} > ${rule.limit}`,
  );
}

/** 函数级四项检查（函数体/参数/复杂度/嵌套；Svelte 与箭头函数由 ESLint 覆盖）。 */
function checkFunctions(ctx) {
  if (!ctx.isScript) return;
  for (const fn of findFunctions(ctx.lines)) {
    const metrics = fnMetrics(ctx.lines, fn);
    for (const rule of FN_RULES) reportFn(ctx, fn, rule, metrics[rule.metric]);
  }
}

/** → (违规清单, 生效豁免清单)。 */
function checkFile(p) {
  const lines = readLines(p);
  const { marks, declared, bad } = parseMarkers(lines);
  const ctx = newCtx(p, lines, marks);
  for (const i of bad) {
    ctx.issues.push(`${p}:${i}: 豁免标记非法（缺项名或项名未知，见 §1.1）`);
  }
  checkFileLength(ctx);
  checkBlankRuns(ctx);
  checkWidth(ctx);
  checkFunctions(ctx);
  const live = declared.flatMap(([i, names]) => names.map((n) => `${p}:${i}: ${n}`));
  return { issues: ctx.issues, live };
}

function underSkip(root, p) {
  const parts = path.relative(root, p).split(path.sep);
  if (SKIP_DIRS.has(parts[0])) return true;
  return SKIP_RELS.some((rel) => rel.every((seg, i) => parts[i] === seg));
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!underSkip(dir, full)) walk(full, out);
      continue;
    }
    if (WIDTH[path.extname(entry.name)]) out.push(full);
  }
}

function collectTargets(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = argv.slice(2).filter((a) => !a.startsWith('--'));
  const defaults = ['src', 'tools', 'playground', 'fixtures'].map((d) => path.join(root, d));
  const targets = (args.length ? args.map((a) => path.resolve(a)) : defaults).filter((t) =>
    fs.existsSync(t),
  );
  if (!targets.length) return [root];
  return targets;
}

/** 展开扫描面（扩展名命中；跳过构建/VCS/文档目录与负例夹具）。 */
function scan(targets) {
  const out = [];
  for (const t of targets) {
    const base = fs.statSync(t).isDirectory() ? t : t.parent;
    if (fs.statSync(t).isDirectory()) walk(t, out);
    else if (WIDTH[path.extname(t)] && !underSkip(base, t)) out.push(t);
  }
  return out;
}

function main() {
  const exceptionsOnly = process.argv.includes('--list-exemptions');
  const issues = [];
  const live = new Set();
  for (const f of scan(collectTargets(process.argv))) {
    const got = checkFile(f);
    issues.push(...got.issues);
    for (const x of got.live) live.add(x);
  }
  if (exceptionsOnly) {
    console.log(`生效豁免 ${live.size} 处（逐项级）：`);
    for (const x of [...live].sort()) console.log('  ' + x);
    return 0;
  }
  if (issues.length) {
    console.log(`规约红线违规 ${issues.length} 处：`);
    for (const x of issues) console.log('  ' + x);
    return 1;
  }
  console.log(`code_limits: 通过（0 违规；生效豁免 ${live.size} 处）`);
  return 0;
}

process.exit(main());
