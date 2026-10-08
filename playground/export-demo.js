/** PNG·SVG 导出载体页（票 56 落地）：真库面交互——exportSVG/exportPNG 门面+
 * exportEnv 旁挂槽（CanvasView 挂载镜像 tokens.css 级联发布）。场面：a（task，
 * running+进度 42%）→b（task，done）两边+折叠的 c（plain，todo 雾化）——状态四态/
 * 锁角标/折叠形同场。读数面：SVG 串长/视图域尺寸/最近 PNG 尺寸·blob 大小·角像素
 * alpha·节点面像素采样（透明对照与主题两档的像素级判据）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { createNodeRegistry } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { applyStoredTheme, mountThemeToggle } from './theme.js';

applyStoredTheme(); // 票 24 枢纽联动：boot 应用已存主题选择
mountThemeToggle(document.getElementById('fl-theme'));

/** 场面词表：task=类别色+widgets（各型各一）；plain=素节点。 */
const registry = createNodeRegistry([
  {
    typeId: 'task',
    label: '任务',
    color: '#2563eb',
    inputs: [{ portId: 'in', label: '输入' }],
    outputs: [{ portId: 'out', label: '输出' }],
    widgets: [
      { name: 'mode', kind: 'enum', label: '模式', options: ['快', '慢'] },
      { name: 'count', kind: 'number', label: '数量' },
      { name: 'ok', kind: 'boolean', label: '开关' },
      { name: 'vec', kind: 'vec2', label: '向量' },
    ],
  },
  { typeId: 'plain', label: '素节点', inputs: [], outputs: [] },
]);

/** 场面：a=running+progress、b=done、c=折叠 todo（锁一枚=c）。 */
function demoGraph() {
  return {
    nodes: [
      { id: 'a', typeId: 'task', x: 0, y: 0, data: { mode: '快', count: 3, ok: true } },
      { id: 'b', typeId: 'task', x: 340, y: 60, data: { mode: '慢' } },
      { id: 'c', typeId: 'plain', x: 60, y: 260, collapsed: true, data: {} },
    ],
    edges: [{ id: 'e1', from: { nodeId: 'a', portId: 'out' }, to: { nodeId: 'b', portId: 'in' } }],
    groups: [],
    subgraphs: [],
  };
}

const nodeStates = {
  a: { data: { status: 'running' }, vars: { progress: '42%' } },
  b: { data: { status: 'done' } },
  c: { data: { status: 'todo' } },
};

const app = document.getElementById('app');
const controller = createCanvasController({ registry, initialGraph: demoGraph() });
const view = mount(CanvasView, {
  target: app,
  // 锁单走 props（旁边声明双入口——props 形挂载置入，直调 setNodeLocks 会被挂载
  // 复位冲掉[卸载面 opt-out 语义]）；nodeStates 同路（导出槽发布+渲染直达两消费面）
  props: { controller, nodeStates, nodeLocks: { ids: ['c'] } },
});

const previewEl = document.getElementById('fl-export-preview');
let lastPng = { label: '—', width: 0, height: 0, size: 0, cornerAlpha: -1, nodePixel: '' };

/** PNG 像素采样：blob→canvas→ImageData（角像素 alpha=透明判据、节点面像素=主题判据）。 */
async function samplePng(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // 采样点：左上角（2,2）=背景面（alpha 判据）；节点 a 标题带干净位=图 (150,12)+域平移
    // 50 → 产物 (200,62)（避标题字面/徽章——tint 预混带的主题判据采样）
    const at = (x, y) => {
      const i = (y * canvas.width + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    };
    const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return {
      width: img.width,
      height: img.height,
      cornerAlpha: at(2, 2)[3],
      nodePixel: hex(at(200, 62)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function runPng(label, options) {
  const blob = await controller.exportPNG(options);
  const sampled = await samplePng(blob);
  lastPng = { label, size: blob.size, ...sampled };
  const url = URL.createObjectURL(blob);
  previewEl.hidden = false;
  previewEl.classList.toggle('fl-transparent', options?.background === 'transparent');
  if (previewEl.dataset.url) URL.revokeObjectURL(previewEl.dataset.url);
  previewEl.dataset.url = url;
  previewEl.src = url;
  previewEl.alt = `导出 PNG 预览（${label}）`;
  refreshStats();
  return { blob, size: blob.size, ...sampled };
}

/* ============ 读数面（订阅随动+导出后刷新） ============ */
function refreshStats() {
  const svg = controller.exportSVG();
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  document.getElementById('fl-demo-stats').textContent =
    `导出域：${viewBox ? `${viewBox[1]}×${viewBox[2]}` : '—'} · SVG 串 ${svg.length} 字符\n` +
    `槽主题（CanvasView 发布）：${controller.exportEnv.getTheme() ?? '（空）'}\n` +
    `最近 PNG：${lastPng.label} · ${lastPng.width}×${lastPng.height}` +
    ` · ${(lastPng.size / 1024).toFixed(1)}KB\n` +
    `角像素 alpha=${lastPng.cornerAlpha}（透明=0）· 节点面采样=${lastPng.nodePixel || '—'}\n` +
    `节点 ${controller.getState().nodes.length} / 边 ${controller.getState().edges.length}`;
  // SVG 源文本读数（票面字义：截前 1600 字符展示——自包含口径的目视面）
  document.getElementById('fl-svg-src').textContent =
    `${svg.slice(0, 1600)}\n…（共 ${svg.length} 字符）`;
}
controller.subscribe(refreshStats);

/* ============ 演示条接线 ============ */
document.getElementById('fl-png-light').addEventListener('click', () => {
  void runPng('浅色', { theme: 'light' });
});
document.getElementById('fl-png-dark').addEventListener('click', () => {
  void runPng('深色', { theme: 'dark' });
});
document.getElementById('fl-png-clear').addEventListener('click', () => {
  void runPng('透明底', { theme: 'light', background: 'transparent' });
});
document.getElementById('fl-png-r2').addEventListener('click', () => {
  void runPng('pixelRatio×2', { theme: 'light', pixelRatio: 2 });
});
document.getElementById('fl-dl-png').addEventListener('click', async () => {
  const blob = await controller.exportPNG(); // 槽主题缺省（所见即所导）
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flowloom.png';
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById('fl-dl-svg').addEventListener('click', () => {
  const svg = controller.exportSVG();
  const a = document.createElement('a');
  a.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  a.download = 'flowloom.svg';
  a.click();
});

// boot 适配：IAB 后台标签首帧前 rect 可为 0×0（layout 未起）——fitView 失败即重试
(function boot(fallback) {
  if (!view.fitView(60) && fallback > 0) setTimeout(() => boot(fallback - 1), 120);
})(3);

// 真浏览器验收驱动面（demo 私有）：导出读数复算+像素采样
window.flDemo = {
  get controller() {
    return controller;
  },
  get slotTheme() {
    return controller.exportEnv.getTheme();
  },
  svgString(options) {
    return controller.exportSVG(options);
  },
  async exportPng(options) {
    return runPng('验收', options ?? {});
  },
  get lastPng() {
    return lastPng;
  },
};
refreshStats();
