/** 深色主题与节点 chrome 演示（票 22，载体非库面）：
 * - 主题切换=<html data-fl-theme>（"dark"/"light"）+集中 token 表两段覆写（库
 *   `flowloom/tokens.css`）；「自动」=摘属性缺省跟随系统 prefers-color-scheme。
 *   用户选择持久化在 localStorage——挂属性+持久化归宿主壳（README 使用章同款
 *   样例在此演练）。
 * - 节点 chrome：词表 NodeTypeDef.color? 染标题带（--fl-node-cat 注入+组件 CSS
 *   color-mix——库默认 A 染色带 40% 档）+PortDef.typeId? 取端口/连线类型色
 *   （--fl-port-{typeId} 开放集，宿主 CSS 供值——见本页 :root 段）。
 * - chrome 形态三档原型（票内 HITL 裁定面）：A 染色带（库默认）/B 实色带（ComfyUI
 *   legacy）/C 浅染+左色条——demo 侧 CSS 覆写（theme.html 内），切档零重建。
 * 读数面：像素采样走 tools/probe（浅深两套验收=票 19 blend 判据）。 */
import { mount } from 'svelte';
import 'flowloom/tokens.css';
import { addEdge, addNode, createGraph, createNodeRegistry, insertReroute } from 'flowloom/kernel';
import { CanvasView, createCanvasController } from 'flowloom/svelte';
import { mountThemeToggle } from './theme.js';

/** 词表带类别色+端口类型 id（票 22 声明面：内核只搬运不解释）。 */
const registry = createNodeRegistry([
  {
    typeId: 'ckpt',
    label: '模型检查点',
    color: '#b39ddb',
    inputs: [],
    outputs: [{ portId: 'out', label: 'MODEL', typeId: 'model' }],
    widgets: [
      { name: 'ckpt', kind: 'enum', label: '检查点', options: ['sd_xl_base', 'flux_dev'] },
      { name: 'tiled', kind: 'boolean', label: '分块' },
    ],
  },
  {
    typeId: 'prompt',
    label: '提示词',
    color: '#ffd500',
    inputs: [],
    outputs: [{ portId: 'out', label: 'TEXT', typeId: 'text' }],
    widgets: [{ name: 'text', kind: 'textarea', label: '正向' }],
  },
  {
    typeId: 'sampler',
    label: '采样器',
    color: '#ff9cf9',
    inputs: [
      { portId: 'model', label: 'MODEL', typeId: 'model' },
      { portId: 'text', label: 'TEXT', typeId: 'text' },
    ],
    outputs: [{ portId: 'out', label: 'LATENT', typeId: 'latent' }],
    widgets: [
      { name: 'steps', kind: 'number', label: '步数', min: 1, max: 150 },
      { name: 'sampler', kind: 'enum', label: '采样器', options: ['euler', 'ddim'] },
    ],
  },
  {
    typeId: 'decode',
    label: 'VAE 解码',
    color: '#64b5f6',
    inputs: [{ portId: 'latent', label: 'LATENT', typeId: 'latent' }],
    outputs: [{ portId: 'out', label: 'IMAGE', typeId: 'image' }],
  },
  {
    typeId: 'preview',
    label: '预览',
    color: '#81c784',
    inputs: [{ portId: 'image', label: 'IMAGE', typeId: 'image' }],
    outputs: [],
  },
]);

let g = createGraph();
g = addNode(g, { id: 'ckpt', typeId: 'ckpt', x: 40, y: 80, data: {} });
g = addNode(g, { id: 'prompt', typeId: 'prompt', x: 40, y: 320, data: {} });
g = addNode(g, { id: 'sampler', typeId: 'sampler', x: 380, y: 140, data: {} });
g = addNode(g, { id: 'decode', typeId: 'decode', x: 720, y: 160, data: {} });
g = addNode(g, { id: 'preview', typeId: 'preview', x: 1020, y: 180, data: {} });
g = addEdge(g, {
  id: 'e1',
  from: { nodeId: 'ckpt', portId: 'out' },
  to: { nodeId: 'sampler', portId: 'model' },
});
g = addEdge(g, {
  id: 'e2',
  from: { nodeId: 'prompt', portId: 'out' },
  to: { nodeId: 'sampler', portId: 'text' },
});
g = addEdge(g, {
  id: 'e3',
  from: { nodeId: 'sampler', portId: 'out' },
  to: { nodeId: 'decode', portId: 'latent' },
});
// e3 预置一中继点：暗色下 reroute 点同验（白心深环）
g = insertReroute(g, 'e3', 0, { x: 660, y: 300 });
g = addEdge(g, {
  id: 'e4',
  from: { nodeId: 'decode', portId: 'out' },
  to: { nodeId: 'preview', portId: 'image' },
});

const controller = createCanvasController({ registry, initialGraph: g });
const app = document.getElementById('fl-app');
mount(CanvasView, { target: app, props: { controller } });
controller.fitView(app.clientWidth, app.clientHeight, 60);

/* —— 主题切换（宿主壳职责样例：挂属性+localStorage 持久化——与主 demo 共用单源）—— */
mountThemeToggle(document.getElementById('fl-theme'));

/* —— chrome 形态三档（原型对比面；库默认恒 A 档）—— */
const variantLabel = document.getElementById('fl-v-label');
for (const [variant, label] of [
  ['tint', 'chrome：A 染色带 40%'],
  ['solid', 'chrome：B 实色带（legacy）'],
  ['strip', 'chrome：C 浅染+左色条'],
]) {
  document.getElementById(`fl-v-${variant}`).addEventListener('click', () => {
    app.dataset.flVariant = variant;
    variantLabel.textContent = label;
  });
}

// 票 23：一键重排（默认 L→R——本图 CKPT→采样器→解码→预览横向流水，widget 长高
// 经层内纵排收纳；排布后 e3 预置中继点清空重置=新语义演示）；键位同源经命令注册制
document.getElementById('fl-layout').addEventListener('click', () => {
  controller.commands.executeCommand('fl:auto-layout');
  controller.fitView(app.clientWidth, app.clientHeight, 60);
});

document.getElementById('fl-fit').addEventListener('click', () => {
  controller.fitView(app.clientWidth, app.clientHeight, 60);
});
