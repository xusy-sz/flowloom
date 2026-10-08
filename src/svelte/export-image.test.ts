// 导出图像生成器（票 56）：自包含 SVG 拼装的纯函数面——node 环境直测（link-render/
// minimap-model 先例同形）。三面：1) token 字面量表与 tokens.css 同步钉死（改 CSS 值
// 须连表一起改——tokens.test.ts 先例的导出侧镜像）；2) 结构与保真（节点盒/标题/widget
// 值文本/边箭头端口点/主题两档/背景两态/折叠/锁/状态四态/进度条）；3) 口径边界（空图/
// XML 转义/自定义 widget JSON 退化/非 hex 类别色不染）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildExportSvg, type ExportImageInput, type ExportTheme } from './export-image';
import { exportTokensOf } from './export-tokens';
import { createNodeRegistry } from '../kernel/registry';
import { resolveNodeLocks } from '../kernel/locks';
import type { CanvasGraphState, NodeRegistry } from '../kernel/index';

const dir = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(dir, 'tokens.css'), 'utf-8');

/** 声明块解析（tokens.test.ts 同款姿势——去注释+一文件一用不引 CSS 解析依赖）。 */
function declarations(block: string): Map<string, string> {
  const body = block
    .slice(block.indexOf('{') + 1, block.lastIndexOf('}'))
    .replace(/\/\*[\S\s]*?\*\//g, '');
  const map = new Map<string, string>();
  for (const line of body.split(';')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    map.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return map;
}

function cssBlock(pool: string, selector: string): Map<string, string> {
  const start = pool.indexOf(selector);
  expect(start, `${selector} 段在场`).toBeGreaterThan(-1);
  return declarations(pool.slice(start, pool.indexOf('}', start) + 1));
}

const cssLight = cssBlock(tokens, ':root {');
const cssDark = cssBlock(
  tokens.slice(tokens.indexOf('@media'), tokens.indexOf(':root[data-fl-theme')),
  ":root:not([data-fl-theme='light'])",
);

/** 有 widgets 的多面词表（类别色/边形状/各型 widget 一站）。 */
function richRegistry(): NodeRegistry {
  return createNodeRegistry([
    {
      typeId: 'task',
      label: '任务',
      color: '#2563eb',
      inputs: [{ portId: 'in', label: '输入口' }],
      outputs: [{ portId: 'out', label: '输出口' }],
      widgets: [
        { name: 'title', kind: 'text', label: '标题' },
        { name: 'count', kind: 'number', label: '数量' },
        { name: 'flag', kind: 'boolean', label: '开关' },
        { name: 'mode', kind: 'enum', label: '模式', options: ['快', '慢'] },
        { name: 'note', kind: 'textarea', label: '备注' },
        { name: 'extra', kind: 'vec2', label: '向量' },
      ],
    },
    { typeId: 'plain', label: '素节点', inputs: [], outputs: [] },
  ]);
}

function graphOf(overrides: Partial<CanvasGraphState> = {}): CanvasGraphState {
  return { nodes: [], edges: [], groups: [], subgraphs: [], ...overrides };
}

function inputOf(
  graph: CanvasGraphState,
  extra: Partial<ExportImageInput> = {},
  theme: ExportTheme = 'light',
): ExportImageInput {
  const registry = extra.source?.registry ?? richRegistry();
  return { source: { registry }, graph, theme, ...extra };
}

describe('token 字面量表与 tokens.css 同步钉死（改值须两处同改）', () => {
  it.each([
    ['light', cssLight],
    ['dark', cssDark],
  ] as const)('%s 档逐色值对账', (theme, css) => {
    const table = exportTokensOf(theme);
    const pairs: Array<[string, string]> = [
      [table.canvasBg, '--fl-canvas-bg'],
      [table.link, '--fl-link'],
      [table.linkValid, '--fl-link-valid'],
      [table.linkInvalid, '--fl-link-invalid'],
      [table.selection, '--fl-selection'],
      [table.groupBorder, '--fl-group-border'],
      [table.groupBg, '--fl-group-bg'],
      [table.subgraphBg, '--fl-subgraph-bg'],
      [table.subgraphFg, '--fl-subgraph-fg'],
      [table.nodeBg, '--fl-node-bg'],
      [table.nodeBorder, '--fl-node-border'],
      [table.nodeFg, '--fl-node-fg'],
      [table.nodeHeaderFg, '--fl-node-header-fg'],
      [table.fgMuted, '--fl-fg-muted'],
      [table.port, '--fl-port'],
      [table.reroute, '--fl-reroute'],
      [table.rerouteBg, '--fl-reroute-bg'],
    ];
    for (const [value, name] of pairs) expect(value).toBe(css.get(name));
  });

  it('几何/阴影/染色带数值面：浅深翻档的键翻、不翻的键恒同', () => {
    const light = exportTokensOf('light');
    const dark = exportTokensOf('dark');
    expect(light.catMix).toBe(0.4); // --fl-node-cat-mix 浅 40%
    expect(dark.catMix).toBe(0.3); // 深 30%（降浊——票 22）
    // 阴影族出 CSS 阴影串（0 1px 2px rgb(r g b / a%)）——浅 #0f172a@8%、深 #000@40%
    expect(light.shadowColor).toBe('#0f172a');
    expect(light.shadowOpacity).toBe(0.08);
    expect(dark.shadowColor).toBe('#000000');
    expect(dark.shadowOpacity).toBe(0.4);
    expect(light.canvasBg).not.toBe(dark.canvasBg); // 档位确实有别（对账面非同值假绿）
  });
});

describe('buildExportSvg：结构面', () => {
  it('根元素自包含三件：xmlns/显式宽高/viewBox；背景缺省=主题底色', () => {
    const node = { id: 'a', typeId: 'plain', x: 40, y: 20, data: {} };
    const { svg, width, height } = buildExportSvg(inputOf(graphOf({ nodes: [node] })));
    // 素节点 160×48 @ (40,20) + margin 50 → 域 (-10,-30)→(250,118) → 260×148
    expect(width).toBe(260);
    expect(height).toBe(148);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="260"');
    expect(svg).toContain('viewBox="0 0 260 148"');
    expect(svg).toContain('fill="#f6f7f9"'); // 浅档画布底
    expect(svg).toContain('translate(10 30)'); // 域原点平移
  });

  it('背景两态：显式串恒覆盖；transparent=零背景矩形（透明底）', () => {
    const graph = graphOf({ nodes: [{ id: 'a', typeId: 'plain', x: 0, y: 0, data: {} }] });
    const base = buildExportSvg(inputOf(graph));
    expect(base.svg).toMatch(/<rect x="0" y="0" width="[^"]+" height="[^"]+" fill="/);
    const over = buildExportSvg(inputOf(graph, { background: '#123456' }));
    expect(over.svg).toContain('fill="#123456"');
    expect(over.svg).not.toContain('fill="#f6f7f9"'); // 主题底不再作背景（端口点描边不在此列）
    const clear = buildExportSvg(inputOf(graph, { background: 'transparent' }));
    expect(clear.svg).not.toMatch(/<rect x="0" y="0" width="[^"]+" height="[^"]+" fill="/);
  });

  it('空图恒可用：margin 盒空白图（100×100），非报错面', () => {
    const { svg, width, height } = buildExportSvg(inputOf(graphOf()));
    expect(width).toBe(100);
    expect(height).toBe(100);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg.match(/<g opacity=/g)).toBeNull(); // 零节点零状态面
  });

  it('XML 转义：宿主标题/标签的 &<> 引号面不破文档', () => {
    const node = {
      id: 'a',
      typeId: 'plain',
      x: 0,
      y: 0,
      data: { 'fl:title': '<b>&"引"</b>' },
    };
    const { svg } = buildExportSvg(inputOf(graphOf({ nodes: [node] })));
    expect(svg).not.toMatch(/<b>/);
    expect(svg).toContain('&#60;b&#62;&#38;&#34;引&#34;&#60;/b&#62;');
  });
});

describe('buildExportSvg：节点保真面', () => {
  it('标题=displayNodeTitle 单源（自定义 fl:title 压词表名）+kernel 盒尺寸', () => {
    const node = { id: 'a', typeId: 'task', x: 0, y: 0, data: { 'fl:title': '自定义名' } };
    const { svg } = buildExportSvg(inputOf(graphOf({ nodes: [node] })));
    expect(svg).toContain('自定义名');
    expect(svg).not.toContain('>任务<');
    // task=标题条 24+1 端口行 20+6 widget 行（5×24+textarea 72）+块尾 8=244、宽=240
    expect(svg).toContain('width="240"');
    expect(svg).toContain('height="244"');
  });

  it('类别色染色带=tint 预混 rgba 字面量；非 hex 类别色不染（不设信）', () => {
    const hexNode = { id: 'a', typeId: 'task', x: 0, y: 0, data: {} };
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [hexNode] }))).svg;
    expect(svg).toContain('fill="rgba(37, 99, 235, 0.4)"'); // #2563eb 浅档 40% 预混
    const named = createNodeRegistry([
      { typeId: 'task', label: '任务', color: 'red', inputs: [], outputs: [] },
    ]);
    const raw = buildExportSvg(
      inputOf(graphOf({ nodes: [hexNode] }), { source: { registry: named } }),
    ).svg;
    expect(raw).not.toContain('rgba('); // 非 hex=无效预混不染
  });

  it('widget 值按型格式化：text/number 直显、boolean 是/否、enum 选项名、textarea 折行归一', () => {
    const node = {
      id: 'a',
      typeId: 'task',
      x: 0,
      y: 0,
      data: {
        title: '名字',
        count: 3,
        flag: true,
        mode: '快',
        note: '第一行\n第二行',
        extra: { x: 1, y: 2 },
      },
    };
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [node] }))).svg;
    expect(svg).toContain('>名字<');
    expect(svg).toContain('>3<');
    expect(svg).toContain('>是<');
    expect(svg).toContain('>快<');
    expect(svg).toContain('>第一行 第二行<');
    // 自定义型 vec2=JSON 短文本（诚实呈现而非空缺）+mono 字体面（引号面已转义）
    expect(svg).toContain('{&#34;x&#34;:1,&#34;y&#34;:2}');
    expect(svg).toContain('ui-monospace');
  });

  it('enum 离群值=空串（select 空显镜像）；boolean undefined=否（checkbox 未勾镜像）', () => {
    const node = {
      id: 'a',
      typeId: 'task',
      x: 0,
      y: 0,
      data: { mode: '不在选项里' },
    };
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [node] }))).svg;
    expect(svg).not.toContain('>不在选项里<');
    expect(svg).toContain('>否<');
  });

  it('折叠态跟随：折叠节点=标题条形（零端口标签行零 widget 行、chevron 右指）', () => {
    const node = { id: 'a', typeId: 'task', x: 0, y: 0, collapsed: true as const, data: {} };
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [node] }))).svg;
    expect(svg).toContain('height="32"'); // 折叠高=24+8（kernel 派生单源）
    expect(svg).not.toContain('>输入口<');
    expect(svg).not.toContain('>标题<'); // widget 标签不渲染
    expect(svg).toContain('points="16,9 10,13 16,17"'); // 右指 chevron（x 顶点在左）
  });

  it('锁角标跟随：🔒 glyph 在场=锁单命中（谓词形）', () => {
    const node = { id: 'a', typeId: 'plain', x: 0, y: 0, data: {} };
    const locks = resolveNodeLocks({ predicate: () => true });
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [node] }), { locks })).svg;
    expect(svg).toContain('&#128274;');
    const free = buildExportSvg(inputOf(graphOf({ nodes: [node] }))).svg;
    expect(free).not.toContain('&#128274;');
  });

  it('状态四态：running/done/error=边框+徽章用档色；todo=雾化透明度+空心徽章；未识值零解释', () => {
    const nodes = [
      { id: 'r', typeId: 'plain', x: 0, y: 0, data: {} },
      { id: 'd', typeId: 'plain', x: 300, y: 0, data: {} },
      { id: 'e', typeId: 'plain', x: 0, y: 200, data: {} },
      { id: 't', typeId: 'plain', x: 300, y: 200, data: {} },
      { id: 'x', typeId: 'plain', x: 600, y: 0, data: {} },
    ];
    const nodeStates = {
      r: { data: { status: 'running' } },
      d: { data: { status: 'done' } },
      e: { data: { status: 'error' } },
      t: { data: { status: 'todo' } },
      x: { data: { status: '自定义态' } },
    };
    const svg = buildExportSvg(inputOf(graphOf({ nodes }), { nodeStates })).svg;
    expect(svg).toContain('stroke="#2563eb" stroke-width="1"'); // running 边框=选区色
    expect(svg).toContain('stroke="#16a34a" stroke-width="1"'); // done=绿（--fl-link-valid）
    expect(svg).toContain('stroke="#dc2626" stroke-width="1"'); // error=红（--fl-link-invalid）
    expect(svg).toContain('<g opacity="0.55">'); // todo 雾化（组属性）
    expect(svg).toContain('fill="none" stroke="#64748b" stroke-width="1.5"'); // todo 空心徽章
    expect(svg.match(/<g opacity=/g)).toHaveLength(1); // 未识值不染——恰一节点雾化
  });

  it('进度条底缘条：vars.progress 百分数宽、fill=选区色；非百分形=零宽', () => {
    const nodes = [
      { id: 'a', typeId: 'plain', x: 0, y: 0, data: {} },
      { id: 'b', typeId: 'plain', x: 300, y: 0, data: {} },
    ];
    const nodeStates = {
      a: { vars: { progress: '42%' } },
      b: { vars: { progress: '0.42' } },
    };
    const svg = buildExportSvg(inputOf(graphOf({ nodes }), { nodeStates })).svg;
    expect(svg).toContain('width="67.2"'); // 160×42%=67.2
    // 坏值节点=零宽条（元素在场不可见——CSS width 非法值零宽的镜像）
    expect(svg.match(/width="0" height="4"/g)).toHaveLength(1);
    expect(svg.match(/height="4" fill="#2563eb"/g)).toHaveLength(2); // 恰两条进度条底缘
  });
});

describe('buildExportSvg：边/主题面', () => {
  it('边/箭头/端口点/中继点：link-render 方言复用+中性色；edgeShape 贯入自动跟随', () => {
    const nodes = [
      { id: 'a', typeId: 'task', x: 0, y: 0, data: {} },
      { id: 'b', typeId: 'task', x: 300, y: 200, data: {} },
    ];
    const edges = [
      {
        id: 'e1',
        from: { nodeId: 'a', portId: 'out' },
        to: { nodeId: 'b', portId: 'in' },
        reroutes: [{ x: 150, y: 300 }],
      },
    ];
    const svg = buildExportSvg(inputOf(graphOf({ nodes, edges }))).svg;
    expect(svg).toContain('<path d="M 240 34 C'); // bezier 首段（出锚 240=派生宽，→中继点）
    expect(svg.match(/<path d="[^"]+" fill="#64748b"/g)).toHaveLength(1); // 箭头（中性色）
    expect(svg).toContain('fill="#ffffff" stroke="#64748b" stroke-width="2"'); // 中继点 dot
    const step = buildExportSvg(inputOf(graphOf({ nodes, edges }), { edgeShape: 'step' })).svg;
    expect(step).toContain('<path d="M 240 34 L'); // 折线族命令流跟随（票 52 方言）
  });

  it('主题两档：同图两串有别、深档深值在场', () => {
    const graph = graphOf({ nodes: [{ id: 'a', typeId: 'plain', x: 0, y: 0, data: {} }] });
    const light = buildExportSvg(inputOf(graph, {}, 'light')).svg;
    const dark = buildExportSvg(inputOf(graph, {}, 'dark')).svg;
    expect(light).toContain('fill="#f6f7f9"');
    expect(dark).toContain('fill="#10131a"');
    expect(dark).toContain('fill="#1e293b"'); // 深档节点底
    expect(light).not.toBe(dark);
  });

  it('子图占位型：虚线边+保留型底/字色', () => {
    const node = { id: 's', typeId: 'fl:subgraph', x: 0, y: 0, data: {} };
    const svg = buildExportSvg(inputOf(graphOf({ nodes: [node] }))).svg;
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain('fill="rgb(37 99 235 / 4%)"');
  });
});
