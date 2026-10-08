# flowloom 使用手册

面向把 flowloom 接进自家应用的宿主开发者：从装配基线到全部能力面。配套 flowloom 1.32+；示例为 TypeScript，JS 宿主去掉类型标注即可。

文档面一览：卖点与功能概览见 [README](../README.zh-CN.md)（[English](../README.md)）；本文为中文手册源面，英文镜像 [usage.en.md](usage.en.md)。变更史见 `CHANGELOG.md`。

## 目录

- [装配基线](#装配基线)
- [节点词表](#节点词表)
- [节点落位](#节点落位)
- [连线与连接校验](#连线与连接校验)
- [选区、复制与撤销](#选区复制与撤销)
- [分组、子图与连线路径](#分组子图与连线路径)
- [排布与对齐](#排布与对齐)
- [命令注册制与快捷键](#命令注册制与快捷键)
- [无障碍（键盘与 aria）](#无障碍键盘与-aria)
- [节点呈现定制](#节点呈现定制)
- [卫星组件](#卫星组件)
- [外部数据源与 AI agent 接入](#外部数据源与-ai-agent-接入)
- [持久化](#持久化)
- [PNG·SVG 导出](#pngsvg-导出)
- [TS 类型收窄](#ts-类型收窄)
- [无头内核](#无头内核)
- [API 参考](#api-参考)
- [本地演示页](#本地演示页)
- [dist 入口与源码消费](#dist-入口与源码消费)

## 装配基线

flowloom 是双件套：框架无关内核（`flowloom/kernel`，纯 TS 零 DOM 依赖）+ Svelte 5 渲染层（`flowloom/svelte`）。运行时零依赖，peerDependencies 仅 `svelte ^5`。

```js
import { createNodeRegistry, createGraph } from 'flowloom/kernel';
import { createCanvasController, CanvasView } from 'flowloom/svelte';
import 'flowloom/tokens.css'; // 浅色默认+深色覆写两段 token 表

const registry = createNodeRegistry([{ typeId: 'step', label: '步骤', inputs: [], outputs: [] }]);
const controller = createCanvasController({ registry, initialGraph: createGraph() });
// Svelte 宿主：<CanvasView {controller} />
// 非编译宿主（插件等）：mount(CanvasView, { target: el, props: { controller } })
```

主题：`tokens.css` 不挂属性时跟随系统 `prefers-color-scheme`；挂 `<html data-fl-theme="dark|light">` 即显式锁主题（挂属性与持久化归宿主壳，首帧前应用可免闪白）：

```js
const choice = localStorage.getItem('theme'); // '' | 'light' | 'dark'
if (choice === 'dark' || choice === 'light') {
  document.documentElement.dataset.flTheme = choice;
} // 无值不挂属性 = 跟随系统
```

一张画布一个 controller。卫星组件（NodeSearchBox / PropertiesPanel / Minimap / SelectionToolbox / ContextMenu）与画布共享同一 controller，各自挂载即用。`CanvasView` 自带 DOM 事件归一化管线：滚轮缩放（指针锚定）、空格或中键平移、FitView 开箱即用。

装配三件易漏项：① `tokens.css` 必须引入（不引则组件走内建浅色回退值）；② 主题属性挂 `<html>` 上；③ 容器尺寸归宿主测量（Minimap 除外，见[卫星组件](#卫星组件)）。

## 节点词表

节点词表（registry）是宿主数据：库不枚举任何节点型，`createNodeRegistry([...])` 注入开放集。每项 `NodeTypeDef` 声明节点形状：

```js
createNodeRegistry([
  {
    typeId: 'ckpt',                    // 型标识（宿主自定义）
    label: '模型检查点',                // 显示名
    color: '#b39ddb',                  // 可选：类别色，染标题带
    edgeShape: 'step',                 // 可选：该型作为边源时的形状（见「边形状」）
    inputs: [{ portId: 'in', label: '入' }],
    outputs: [{ portId: 'out', label: '出', typeId: 'model' }], // port typeId=数据类型 id
    widgets: [                          // 可选：节点体/属性面板双入口的控件声明
      { name: 'steps', kind: 'number', label: '步数', min: 1, max: 150 },
      { name: 'mode', kind: 'enum', label: '采样器', options: ['euler', 'ddim'] },
    ],
    initialData: () => ({ status: 'todo' }), // 可选：落位播种工厂（见下）
  },
]);
```

widget 内建五型：`text` / `number` / `boolean` / `enum` / `textarea`；自定义 kind 走注册位接管（见[节点呈现定制](#节点呈现定制)）。端口 `typeId` 是数据类型 id：端口点与连线取 `--fl-port-{typeId}` / `--fl-link-{typeId}` 开放集 token（宿主 CSS 供值，未声明走中性缺省）：

```css
:root { --fl-port-model: #b39ddb; --fl-link-model: #b39ddb; }
```

### initialData 播种

词表项声明 `initialData?: () => Record<string, unknown>` 工厂，落位时调用产节点初始 data：widget 默认值、必填字段种子的官方通道。工厂必须返回新对象（每次落位调用一次；裸对象会让同型多节点共享引用，克隆与撤销语义都会脏）。三条落位路（`placeNode` / `placeNodeConnected` / 搜索面板确认、侧栏拖放）统一吃播种，种子进落位的那一张快照，undo 一次即连点带线带种全消：

```js
const registry = createNodeRegistry([
  {
    typeId: 'phase',
    label: '阶段',
    inputs: [],
    outputs: [{ portId: 'next', label: '下一步' }],
    initialData: () => ({ status: 'todo', level: 1 }),
  },
]);
```

边界：未声明 `initialData` 或未注册型照旧 `data: {}`；`addNode` 是全自持通道，直带 data 不吃播种；外部门 `applyExternal` 不吃播种（`entry.data` 通道既有）；工厂抛错透传（落位中止，零快照）。返回类型恒为宽 `Record<string, unknown>`，泛型收窄不级联到返回值（见[TS 类型收窄](#ts-类型收窄)边界）。

## 节点落位

三路落位，全部产生恰一张可撤销快照：

1. **双击空白**弹出节点搜索面板（词表过滤 / 键盘导航 / 回车落位，CanvasView 内置接线）。
2. **侧栏拖放**：宿主侧栏项 dragstart 写结构化 MIME，画布侧自动放行并在放置点落节点：

```js
import { setNodeDragData } from 'flowloom/svelte';
// 侧栏项 dragstart：写入 application/x-flowloom-node-type + text/plain 回退
item.addEventListener('dragstart', (e) => {
  if (e.dataTransfer !== null) setNodeDragData(e.dataTransfer, def.typeId);
});
```

3. **拖线到空白**：弹出搜索面板，确认后落新节点并自动连兼容端口（同名优先）。宿主也可自接落位 UI：`controller.onLinkEmptyDrop = (origin, at) => {...}`。

命令式落位：

```js
controller.placeNode('step', 200, 140); // 返回新节点
controller.placeNodeConnected('step', 200, 140, originPortHit); // 落节点+连线一步
```

双击节点可改道宿主：`controller.onNodeDoubleClick = (node, screen) => openNodeDialog(node, screen)`，在位即接管（不吃内建改名），返回 `false` 回落内建原位改名；参数=命中节点+画布本地屏幕坐标（锚浮层用）。改道只及节点体：空白、子图占位双击照旧。

## 连线与连接校验

**端口拖线**：从输出端口拖到输入端口建边；拖已连输入端口=改连（旧边摘除新边顶替，同一张快照）；拖线到空白=落新节点自动连。连线视觉：边默认 3px `#64748b`（缩放不敏感线宽，`--fl-link` 可定制），端口点与中继点在节点缘可见，选中节点的邻接边高亮加粗（选区色，选中即见其连接面）。

**有向边箭头**：边 to 端实心三角，屏幕恒定 11px（镜头缩放箭头屏幕尺寸不变），色随边族（类型色同链 / 中性缺省 / 选中邻接变选区色 / 浅深主题自适应），后退边朝向自动反转，层序=边路径之上端口点之下（端口点压箭头尖=箭入端口）。

**连接校验**（`connectionRules`）：声明哪些连接合法。校验单是宿主旁边声明，不进 node.data / undo / semanticHash / UI 格式，换单即时生效（props 形卸载自动复位）。两形同供为 AND 合流：

```js
// 词表兼容矩阵糖：typeId 对 typeId 有向映射（纯类型图零样板，数据可序列化）
controller.setConnectionRules({
  portTypeCompat: { image: ['image', 'mask'], control: ['control'] },
});
// 谓词主形：动态逻辑（连接数上限/跨字段/运行时状态），入参=富载荷端点
controller.setConnectionRules({
  isValidConnection: (from, to) => from.node.id !== to.node.id,
});
controller.setConnectionRules(undefined); // 撤销（opt-out）
```

选型：纯类型图用矩阵（只拦在册行，from 型不在册即放行，免全枚举门槛）；动态逻辑用谓词（入参 `ConnectionEndpoint = { node, port, side }`，方向恒 from=输出侧→to=输入侧）。同节点自连=基础面放行、谓词裁量（环归消费者语义）。

作用域=三路刷卡、四门不刷。刷卡：拖线新手势、改连换头、拖线搜索确认的自动连；校验不过=预览线即时红档（`data-fl-link-valid='false'`）、松手静默终止零快照。不刷：`applyExternal` 两门（真源权威）、直连 `addEdge`（宿主自己的手）、undo/redo（回放既成历史）、粘贴（忠实再现不滤边）。锁定落点的拖线预览同样显红、松手静默终止，失败反馈无弹窗无 toast，红档即时可感。

## 选区、复制与撤销

**选区**：框选、Ctrl 点选增减、整体拖动、Delete 删除（均为手势级快照粒度：拖动帧不入队，松开恰一张）。

**复制粘贴**：画布聚焦时 Ctrl/Cmd+C 复制选中集、Ctrl/Cmd+V 粘贴。id 全量重映射、集内边保留、集外边不带入、连续粘贴逐次偏移、恰一张快照。剪贴板为版本化 JSON 契约（未知版本拒绝不炸），跨标签页/跨应用粘贴开箱成立：

```js
const text = controller.copySelection(); // 选区→契约文本；空选区 undefined
controller.paste(text); // 粘贴（缺省用本页内部缓存）；坏文本/未知版本 no-op
```

**撤销/重做**：`controller.undo()` / `controller.redo()`，快照式，覆盖一切图编辑（视口不入 undo）。栈状态查询 `canUndo()` / `canRedo()`，栈变必伴随 subscribe 通知，宿主按钮灰化免轮询。工具条按钮与键位同源：`controller.commands.executeCommand('fl:undo')`。

**多开标签**：每标签一套 controller+组件族独立实例，图/视口/选区/undo 四面互不串扰（库面零共享可变模块态）。切换形：

```js
const registry = createNodeRegistry([...]); // 词表只读，可跨标签共享
const tabs = new Map(); // tabId → controller（标签壳归宿主自管）
let view;

function activate(tabId) {
  if (view !== undefined) unmount(view); // 切走：卸载视图，controller 保留全量状态
  let controller = tabs.get(tabId);
  if (controller === undefined) {
    controller = createCanvasController({ registry, initialGraph: createGraph() });
    tabs.set(tabId, controller);
  }
  // 切回：同 controller 重挂即还原图/视口/选区/undo
  view = mount(CanvasView, { target: panelEl, props: { controller } });
}
function close(tabId) { tabs.delete(tabId); } // 关标签=丢弃引用；持久化按标签各存各键
```

常驻形（同页多 `CanvasView` 同时挂载）同样成立：实例互不感知，键位只在各自画布聚焦域触发；卫星组件按标签各挂各的，共享该标签的 controller。

## 分组、子图与连线路径

**分组**：Ctrl/Cmd+G 对选中集 toggle（选中集 ⊆ 某组即解组整组，否则成组；成员籍互斥，组框=成员包围盒+padding）。点组框=成员全选、拖组框=整组平移；Delete 删成员级联修剪、组随末成员消亡。组数据入 UI 格式布局半边，恒不入 semanticHash（分组是组织关注点，revision 不被扰动）：

```js
controller.toggleGroupSelection();
controller.fitGroupsToContents(); // 组框重算回包围盒
```

**子图**：Ctrl/Cmd+Shift+E 把选中集转换为嵌套容器，跨边界连线自动拆为「占位端口↔边界代理」配对（父层连线挂占位口、子层连线挂代理）。双击占位进入、面包屑回溯、`navigateBack()` 栈回退；每容器独立镜头（视口 LRU 记忆，重进复原）。子图入 UI 格式语义半边（转换/内容变更改变 semanticHash）；剪贴板不携子图：

```js
controller.convertSelectionToSubgraph(); // 空选区 no-op
controller.enterSubgraph('fls-1', { width, height }); // 尺寸可选=无镜头记忆时适配兜底
controller.exitSubgraph();
controller.navigateBack();
controller.getNavPath(); // 自根子图 id 链；getBreadcrumb() 取路径段
```

删占位=子图连同内容整体消亡；删边界代理=配对口与父侧挂口连线同删。节点/边 id 跨容器全局唯一。

**reroute 中继点**：点连线任意处原位加中继点（分段贝塞尔即时随动）、拖中继点改路径、点中继点删点，每个动作恰一张快照（手势级粒度）。中继点入 UI 格式布局半边（`layout.reroutes`，键=边 id）、恒不入 semanticHash；删边时随边级联消亡；剪贴板不携。纯手势交互，渲染层零接线即得；无头环境直喂归一化事件同效：

```js
controller.dispatchInput({ type: 'pointer-down', x, y, button: 0, modifiers: [] });
controller.getRerouteState(); // 在途手势
import { edgeWaypoints, insertReroute, hitTestEdgePath } from 'flowloom/kernel';
```

## 排布与对齐

kernel 排布数学是纯函数（零 DOM/零词表依赖），命令式门面均恰一张快照、排布后选区不丢、涉及组框自动重适配：

```js
controller.alignSelection('left'); // 六轴：left/center-x/right/top/center-y/bottom
controller.distributeSelection('horizontal'); // 等间隙分布（首末不动）
controller.autoLayout(); // 整图分层自动排布（Sugiyama 简化版：破环/分层/重心定序/锚定原域）
controller.autoLayout({ direction: 'tb' }); // 默认 L→R（层沿 x 推进）；显式回纵向
controller.autoLayoutSelection(); // 选区排布（分组域=点组框选全体成员后走此路）
```

排布时所涉边中继点清空重置（边随新分层直接走新路径，恰一张快照位移+清点同回）；已就位且无中继点可清时 no-op 零快照。默认单键 L（`fl:auto-layout` 命令，可换绑）。

## 命令注册制与快捷键

命令（id+label+可执行）与键位绑定分离：内建廿三命令已注册+默认键位表在册；宿主注册自家命令、换键、查表、存档全程不碰库码。键位只在画布聚焦域触发（不劫持宿主全局键）；未命中组合键照常落内核交互机：

```js
controller.commands.register({ id: 'host:ping', label: '宿主命令', run: () => {...} });
controller.commands.bind({ key: 'p', ctrl: true, alt: true, shift: false }, 'host:ping');
controller.commands.bindings(); // 当前绑定表（拷贝）
controller.commands.executeCommand('fl:undo'); // 工具条按钮与键位同源
import { serializeKeyBindings, parseKeyBindings } from 'flowloom/kernel';
const revived = parseKeyBindings(serializeKeyBindings(controller.commands.bindings()));
// 键位存档=独立键版本化文档，不入 UI 格式，存储介质归宿主；坏档 undefined→回退默认表
```

内建命令：`fl:undo` `fl:redo` `fl:copy` `fl:paste` `fl:delete-selection` `fl:cancel-gesture` `fl:fit-view` `fl:auto-layout` `fl:group-toggle` `fl:convert-subgraph` + 键盘面 `fl:select-next` `fl:select-prev` `fl:nudge-up/down/left/right` 与 `*-large` 八件、`fl:activate-selection` `fl:zoom-in` `fl:zoom-out`。

默认键位：Delete 删除 / Escape 取消手势 / Ctrl+C·V / Ctrl+Z·Ctrl+Shift+Z·Ctrl+Y / F 适配全图 / L 自动排布 / Ctrl+G / Ctrl+Shift+E + 键盘面（Tab·Shift+Tab 遍历 / 方向键 nudge / Shift+方向 大步 / Enter 激活 / +·=·- 缩放）。Delete/Escape 语义住内核交互机，命令是其绑定面别名，解绑后回落机内原语义。

## 无障碍（键盘与 aria）

声明口径照实：键盘能到达+能操作核心动作+读屏能识别的**最小声明集**（交互可达档）；不声明 WCAG 合规、不声明读屏完整叙事（aria-live 播报不做）。

键盘能力（键位只在画布聚焦域消费，全部经命令注册制可换绑）：

- **遍历**：Tab/Shift+Tab 图序遍历改选区（单选语义，与点击选中同权；无选区=图序首/末，循环 wrap）。「选区即焦点」：DOM 焦点恒留画布根（单 tab stop），节点无第二真源焦点态。
- **nudge**：方向键=选中集位移 1px、Shift+方向=10px，每有效按键恰一张快照；锁定节点放行（锁拦存在性/连接不拦挪位）；按住连击有 repeat 防抖。
- **Enter 激活**：选中节点上 Enter=双击面完整等效（`onNodeDoubleClick` 钩子改道优先，缺省回落原位改名）；子图占位=进入；空选区 no-op。
- **缩放**：`+`/`=`/`-` 绕视口中心步进 ×1.2。
- **平移**：空格按住+方向键=屏幕域 50px 步进。

Tab 默认绑定是行为变化（升级注意）：画布聚焦时 Tab 从「离开画布」变「遍历节点」，依赖 Tab 跳出画布的宿主可 `controller.commands.unbind({ key: 'tab', ctrl: false, alt: false, shift: false })`。

aria：画布根 `role="application"` + `aria-label` + `tabindex=0`；`aria-activedescendant` 跟随选区；节点 `role="group"` + `aria-label`=`displayNodeTitle` 单源；折叠钮两态 `aria-label`+`aria-expanded`。边不挂 aria（视觉路径关注点）、`aria-selected` 不用（中性容器角色不合法承载，选中语义由 activedescendant 单点表达）。i18n：库产 aria-label 经 `CanvasView` 可选 `labels` props 覆写：

```svelte
<CanvasView {controller} labels={{ canvas: 'Node canvas', collapseNode: 'Collapse node', expandNode: 'Expand node' }} />
```

键盘隔离守卫（表单兼容的前提）：起自控件域（节点内 widget `data-fl-widget` / 卫星件 `data-fl-satellite`）的键事件不进命令接线与派发环；画布聚焦时 Tab 遍历节点，输入框内 Tab 照常走宿主 tab 序不被吞。

## 节点呈现定制

**节点内 widget**：词表声明了 `widgets` 的节点在节点体上直接长出控件（标题条+端口标签行+widget 行三段形），与属性面板双入口同数据两视图零冲突。控件提交=`setNodeData` 恰一张快照；点控件不改选区不起节点拖动（widget 行事件自吞）；控件内键入不触发画布命令键。节点高度/宽度=kernel 派生单源（标题条 24+端口行 20×行数+widget 块；有 widgets 节点最小宽 240），端口沿新高度均分、组框/排布/连线锚定全吃新高度。

**复杂结构挂自定义 widget**：内建五型是扁平单值，嵌套结构（如 `data.pos = {x, y}`）表达不了。注册位 `widgetComponents` 按 kind 指名挂自定义组件，面板/节点体两入口同一覆盖面。三步：①词表声明自定义 kind、②写组件、③注册位贯入：

```js
// ① 词表声明自定义 kind（与内建型同一名空间，注册位指名即接管）：
createNodeRegistry([{
  typeId: 'mover', label: '移动节点', inputs: [], outputs: [],
  widgets: [{ name: 'pos', kind: 'vec2', label: '位置' }], // data.pos = { x, y }
}]);
```

②组件本体（与 `playground/vec2-widget.svelte` 逐字同源，演示页即活例）：

```svelte
<script lang="ts">
  /** 自定义 widget 活例组件：嵌套对象型 data（pos={x,y}，内建五型表达不了的结构）
   * 经注册位 widgetComponents 按 kind='vec2' 接管。props 契约=WidgetComponentProps：
   * value=节点 data 键现值、def=词表项描述、onCommit=提交单口（调用方接
   * controller.setNodeData，恰一张快照可撤销）。使用手册「复杂结构挂自定义 widget」
   * 样例与本品逐字同源（文档骗人零容忍）。 */
  import type { WidgetComponentProps } from 'flowloom/svelte';

  let { value, def, onCommit }: WidgetComponentProps = $props();

  /** 值宽松读：未初始化/缺键/异形 → 空对象兜底（组件自卫，首编辑前 data 无此键不炸）。 */
  const cur = $derived(
    typeof value === 'object' && value !== null
      ? (value as { x?: number; y?: number })
      : {},
  );

  /** 轴现值：缺键读 0（显示兜底非数据补全，不写回 data）。 */
  function axis(k: 'x' | 'y'): number {
    const v = cur[k];
    return typeof v === 'number' ? v : 0;
  }

  /** 无障碍标签：词表 label 冠头+轴名（def 随词表项原样到达，用不用随意）。 */
  function axisLabel(k: 'x' | 'y'): string {
    return `${def.label ?? def.name} ${k}`;
  }

  /** 每轴一提交：合法值整对象回写（浅合并单键 pos）恰一张快照可撤销；空串/非有限
   * 数不写、控件回显数据现值（内建 number 同款纪律：type=number 输入框非法输入
   * DOM 值即空串，空串须显式拒绝：Number('')===0 会被当合法 0 写入）。 */
  function commit(k: 'x' | 'y', e: Event & { currentTarget: HTMLInputElement }) {
    const raw = e.currentTarget.value;
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) {
      onCommit({ ...cur, [k]: n });
    } else {
      e.currentTarget.value = String(axis(k));
    }
  }
</script>

<div class="vec2-widget" data-fl-vec2>
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('x')}
    value={axis('x')}
    onchange={(e) => commit('x', e)}
  />
  <input
    class="vec2-input"
    type="number"
    aria-label={axisLabel('y')}
    value={axis('y')}
    onchange={(e) => commit('y', e)}
  />
</div>

<style>
  /* 自定义件自带样式（库 .fl-widget-input 是 WidgetControl 的 scoped 类不落宿主件，
   * 同 token 面手写同款视觉：两轴并排填满字段格；user-select 覆写=画布域
   * user-select:none 会杀输入框内文本选择，供件面同款）。 */
  .vec2-widget {
    display: flex;
    width: 100%;
    min-width: 0;
    gap: 4px;
  }
  .vec2-input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1;
    padding: var(--fl-panel-space-xs, 2px) var(--fl-panel-space-sm, 5px);
    border: 1px solid var(--fl-panel-border, #e2e8f0);
    border-radius: var(--fl-panel-radius, 4px);
    font: inherit;
    color: inherit;
    background: var(--fl-panel-bg, #ffffff);
    user-select: text;
  }
  .vec2-input:focus {
    outline: 2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);
    outline-offset: -1px;
  }
</style>
```

```js
// ③ 注册位贯入（两入口同形 props）：
import Vec2Widget from './Vec2Widget.svelte';
// mount(PropertiesPanel, { target: panelEl, props: { controller, widgetComponents: { vec2: Vec2Widget } } })
// mount(CanvasView, { target: el, props: { controller, widgetComponents: { vec2: Vec2Widget } } })
```

`def` 随词表项原样到达（label/min 等），消费与否随意；自定义件自带样式（token 面 `--fl-panel-*` 开放同用）。

**主题与节点 chrome**：暗色为 slate 冷灰族（画布底 `#10131a`/节点面 `#1e293b`，全表见 tokens.css）；选中族保蓝贯穿浅深（`--fl-selection` 浅 `#2563eb`/深 `#60a5fa`）。单 token 覆盖：表内任意 `--fl-*` 在宿主 CSS 可覆写（表先载入、宿主规则后写即胜）。类别色 `NodeTypeDef.color` 染标题带（color-mix 混节点底色，浅深自适应）。

**节点折叠**：词表声明了 `widgets` 的节点标题条左侧有 chevron 开关，点击折叠成标题条形（高 32，宽不变）、再点复原。恰一张快照可撤销：

```js
controller.toggleNodeCollapsed(nodeId); // true=已翻转；未知节点 false 零快照
```

折叠是纯视图关注点：随 UI 格式布局半边持久化（`layout.nodes[id].collapsed`）、恒不进 semanticHash、剪贴板不携（粘贴默认展开）。端口沿折叠高均分、组框/排布/命中全吃折叠高。

**节点状态呈现**（`nodeStates`）：per-instance 呈现数据（状态/进度等活图）经 props 直达渲染层，零 kernel 缝、零 node.data 写、零 undo/semanticHash 污染：呈现契约与存储分离，真源宿主持有（轮询/推送随意）。两子袋开放集键（status/priority/severity/progress/load…全走得通）：

```js
// 离散值走 data 轨（选择器钩）、连续量走 vars 轨（可参与 calc/width、携带颜色/带单位串）
const nodeStates = {
  n1: { data: { status: 'running' }, vars: { progress: '42%', load: 3, tone: '#ffd500' } },
};
// mount(CanvasView, { target, props: { controller, nodeStates } })
```

运输契约：`data` 袋逐键→节点根 `data-fl-state-{key}` 属性、`vars` 袋逐键→根 inline `--fl-state-{key}` 变量，只落节点根（宿主 CSS 后代选择器自根取用）；键形状守卫 `^[A-Za-z0-9_-]+$`（不合规键整对跳过）；活图更新=替换袋对象（新引用）。结构位两件（结构 CSS 入库、视觉面零预置，宿主不写即不可见）：徽章位=标题条右端 `.fl-node-badge` 空 span 恒渲染；进度条位=底缘 `.fl-node-progress` overlay（`vars.progress` 约定键在场才渲染）+fill `width: var(--fl-state-progress, 0)` 机械消费。两位皆盒内 overlay 零高度，kernel 几何不知情：

```css
/* 宿主视觉最小集（色/动效全权在宿主）。特异度姿势：库 scoped 节点样式与宿主属性
   选择器同特异度且注入在后赢平局，宿主选择器加 id 前缀提权 */
#app .fl-node[data-fl-state-status='running'] { border-color: #2563eb; }
#app .fl-node[data-fl-state-status='done'] .fl-node-badge { background: #16a34a; }
#app .fl-node-progress { background: rgb(100 116 139 / 20%); }
#app .fl-node-progress-fill { background: #2563eb; transition: width 120ms linear; }
```

**边形状**：连线几何路由四型 `EdgeShape = 'bezier' | 'straight' | 'step' | 'smoothstep'`，纯渲染层配置不进 kernel 图数据/序列化。横平竖直（step/smoothstep）是管线图/审批流/状态机一类图的版式语言。声明面双供，解析优先级=from 侧节点型词表 `NodeTypeDef.edgeShape` > 全局缺省 > `'bezier'`：

```js
mount(CanvasView, { target: el, props: { controller, edgeShape: 'smoothstep' } }); // 全局缺省
controller.setEdgeShape('step'); // 命令式同效（undefined=回 bezier）
```

四型对照：bezier=水平切线贝塞尔（缺省）；straight=两点直线（端口锚定制下后退边可能穿越节点，型内固有）；step=正交最少拐点折线；smoothstep=step 圆角档（拐点切角半径屏幕恒定 6px）。三连带：箭头朝向跟末段切向、边路径命中跟形状、拖线预览跟声明形状。reroute 中继点=固定必经拐点（折线形下相邻顶点间各自走形状段，所见即所得）。

**跨线桥**（`edgeJump`）：边-边交叉处往跳边插半圆弧「跳过」的清晰化件（工程制图惯例），连线密集的图里两条线在哪相交一眼可读。全局开关缺省 `false`，纯图面风格约定不进词表不进图数据/序列化/undo：

```js
mount(CanvasView, { target: el, props: { controller, edgeJump: true } });
```

跳边=边 id 字典序大者（稳定裁定，拖动时弧随交叉出现/消失而跳边不换侧不闪）；同端口扇出边的近锚交叉不画弧；弧半径屏幕恒定 7px。与绕障正交：本件只处理边-边交叉（不改道），边-节点穿越的绕障路由不在库内；minimap 无连带。

## 卫星组件

**属性面板 `PropertiesPanel`**：无壳卫星组件（不带容器壳，宿主嵌自有面板槽）。选中恰一节点即按词表 widget 描述渲染参数控件，编辑回写 data 恰一张快照；未注册 typeId / 无 widgets 的节点回退只读 data JSON 展示不炸。

**minimap `Minimap`**：缩略导航（节点矩形+中心连线+视口矩形随动；投影域=内容∪可视域恒同框）。点击=跳转、拖动=跟随（镜头不入 undo）。无壳无定位（宿主 overlay 自定）；颜色 token `--fl-minimap*` 可定制；开关=挂载/卸载。零接线即用：不传 `viewportSize` 时读 `controller.viewSize` 旁挂缓存（CanvasView 挂载即量自身容器发布、resize 经 ResizeObserver 随动）：

```svelte
<Minimap {controller} /> <!-- 缺省自量：零接线 -->
<Minimap {controller} viewportSize={() => ({ width: canvasEl.clientWidth, height: canvasEl.clientHeight })} />
<!-- 显式读取器恒覆盖，用于非常规装配（自管画布容器测量）；读取器须真读画布元素，
     传常量会让视口矩形恒错 -->
```

**选区浮动工具条 `SelectionToolbox`**：选中集非空浮现、手势在途隐藏；锚定选区包围盒上方随镜头实时重算。按钮=对齐六轴+分布两轴（缺席操作隐藏：对齐 ≥2 节点、分布 ≥3）+成组/解组+删除（与键位同源走 executeCommand）。坐标域=画布容器左上原点，挂在与画布同几何的 overlay 容器内即得。

**右键菜单 `ContextMenu`**：items 全宿主注入、库零预置项。`CanvasView` 可选 props `contextMenuItems`（getItems 回调为主+静态数组退化糖），未注入=右键特性整体 opt-out（原生菜单保留）。行为：右键改选=Windows 规则（点中选区内保选/点中选区外 replace/空白等不动选区；ctrl 右键=并入）；手势在途不弹；菜单期 SelectionToolbox 让位；Esc=只关菜单。菜单项形状 `{ label, shortcut?, disabled?, items?(子菜单递归), run? }`、null=分隔线：

```js
mount(CanvasView, {
  target: el,
  props: {
    controller,
    contextMenuItems: (context) =>
      context.kind === 'node'
        ? [{ label: '开始此票', run: () => dispatch(context.nodeId) }, null, { label: '删除', disabled: true }]
        : [{ label: '自动排布', shortcut: 'L', run: () => controller.autoLayout() }],
  },
});
```

无头同效：`controller.dispatchInput({ type: 'contextmenu', x, y, modifiers: [] })`；`getContextMenuState()` 读开面态、`closeContextMenu()` 收场。

**标题编辑**：双击节点标题=原位改名（Enter/失焦提交、Escape 取消，恰一张快照；CanvasView 内置接线）。自定义标题住节点 data 保留键 `fl:title`（显示名回退链=自定义 > 词表 label > typeId），随剪贴板携带；悬停节点出 tooltip（显示名+typeId）。

## 外部数据源与 AI agent 接入

真源在别处（文件/数据库/轮询/事件流/AI agent 产出）、画布做镜像呈现，是 flowloom 的一等场景。

**外部静默摄入**：外部写画布走 `controller.applyExternal(changes)`（变更单·原语）或 `controller.applyExternalGraph(graph)`（整图·糖，别名 `applyGraph`）。外部变化不是用户操作：**恒零快照不占历史格**，但进门先做快照栈再锚（undo/redo 两堆每张历史格补拍同一变更），撤销/重做后外部变化恒存活、撤销严格只回退用户操作。按数据源完整度选门：态源（感知变化=重读全量）走整图门，流源（天然产增量）走变更单门；节流定在门上（宿主并单递一次，一调用至多一次通知）：

```js
// 态源（轮询重读全量）。「册上没有=删除」：不镜像的集显式递 []：
controller.applyGraph({
  nodes: [
    { id: 'T-101', typeId: 'ticket', data: { title: '修复登录', state: 'done' } },
      { id: 'T-102', typeId: 'ticket', data: { title: '跟随票' } },
  ],
  edges: [{ id: 'e1', from: { nodeId: 'T-101', portId: 'out' }, to: { nodeId: 'T-102', portId: 'in' } }],
  groups: [],
});

// 流源（事件增量）：宿主并单一张递一次：
controller.applyExternal({
  nodes: {
    upsert: [{ id: 'T-103', typeId: 'ticket', near: 'T-102', data: { title: '跟随票' } }],
    remove: ['T-101'],
  },
});
```

字段政策（外部写语义不写手艺）：节点 data 整包替换（缺省读 `{}`，画布手编被下次同步盖掉正是镜像语义）、typeId/几何视图字段（x/y/宽高/折叠）既有节点恒不写（换型=删旧加新两张单）、边连通可写拐点不写、组成员名单可写框几何自动。新节点落位三级阶梯：①信封带 x/y 照用 → ②`near` 近旁提示（锚节点右缘一步垂直居中、被占沿 +x 步进）→ ③确定性默认（内容包围盒右外缘一步垂直居中、空图落原点；同态同单重放落点恒同）。三态保全：镜头不动、选区经 prune 收缩、拖拽在途撞入=这一下白拖不炸。辖域=根容器；形状坏大声抛错指明字段且零副作用。

状态与结构两缝分工：状态单走 `nodeStates` props（活图零污染），结构单走本门。同一份真源数据拆两张单。

**结构面锁**（`nodeLocks`）：「未来可重排、过去不可触碰」：锁定节点的结构半边（存在性+边连接）冻结、布局半边（挪位/框拖/分组/折叠）照旧。锁单是宿主旁边声明：不进 node.data/undo/semanticHash、不被 applyExternal 冲掉、换单即时生效（props 形与 `setNodeLocks()` 双入口同效）：

```js
// 谓词主形：策略推导，锁不落库，随宿主 data 字段派生（done 即锁，无需维护第二张名单）
mount(CanvasView, { target, props: { controller, nodeLocks: { predicate: (n) => n.data.status === 'done' } } });
// 编号集糖：状态快照，锁定名单来自别处的既成事实（Set 与数组双收）
controller.setNodeLocks({ ids: ['t27', 't31'] });
// 两形同供=并集；撤销 controller.setNodeLocks(undefined)
```

锁住什么：锁定节点不可删/不可被连拆线，其身上的边整条冻结；Delete 混选=过滤删除（只删可编辑部分）；复制放行、剪切=宿主复合复制+Delete；粘贴产物恒新 id（编号集形不在名单恒不锁，谓词形随克隆 data 自然推导）；子图转换含锁定者=整单 no-op；拖线落空白的自动连遵守锁单。与外部摄入对偶：锁拦的是画布上的用户手势与命令，外部门不刷卡（真源照常增删改锁定节点），宿主直连命令式 API 同样不刷卡。全图只读=谓词恒真的退化用法（`predicate: () => true`）。

**宿主响应式接线**：宿主 UI（侧栏/检查器）跟随「当前选中」用只读 store `createSelectionStore(controller)`（`svelte/store` readable 形、普通 `.ts` 模块），`$selection` 直用：

```js
import { createSelectionStore } from 'flowloom/svelte';

const selection = createSelectionStore(controller); // 值=选中节点对象数组（图序）
// Svelte 宿主模板内 $selection 直用（订阅/退订自动）；
// 非响应式场景：controller.getSelectedNodes() 一步拿节点对象
```

契约：订阅源=controller.subscribe 零第二真源（store 是投影非副本）；元素级发射去抖（图不可变值语义：节点未变=同引用，视口平移、未涉选区的图变零发射）；只读纪律=仅 `subscribe`。与 PropertiesPanel 共享同一 controller：面板编辑回写恰一张快照，侧栏经 store 同时看到新 data；删除选中节点经选区 prune 即发射新值不悬空。

**错误可教性**：公开门的 throw 消息带三要素（病因+合法选项+恢复动词），是写给 agent 的运行时文档：喂错形状（如把 `getState()` 产出直接回灌整图门）会得到指明字段与出路的报错，不会静默 no-op。图态已知键（subgraphs/selection/version/semantic/layout/viewport）命中给定向提示（疑似图态形→投影剥离机器面字段/不镜像的集显式递 []/增量源改走变更单门）。

## 持久化

UI 格式（语义+布局+视口一体）=唯一持久化形，存取归宿主（库不绑定存储介质）：

```js
import { fromUiFormat } from 'flowloom/kernel';

// 存：每次变更整体投影（单键单 JSON）
controller.subscribe(() => localStorage.setItem(KEY, JSON.stringify(controller.toUiFormat())));
// 取（重开装配）：
const ui = JSON.parse(localStorage.getItem(KEY));
const canvas = createCanvasController({
  registry,
  initialGraph: fromUiFormat(ui),
  initialViewport: ui.viewport,
});
// 坏存档不炸：fromUiFormat 对未知版本 fail-loud 抛错，宿主 catch 后换新图启动
```

`semanticHash(ui)` 恒不随布局/视口调整变，revision 判定不被拖图/缩放污染（机械锁死于测试）。

## PNG·SVG 导出

全图导出为自包含 SVG 串 / PNG Blob（报表/归档/文档嵌入）。数据出口门面（零快照零通知）：

```js
const svg = controller.exportSVG(); // 自包含 SVG 串（headless 全可用：纯字符串拼装）
const png = await controller.exportPNG({ pixelRatio: 2 }); // image/png Blob（需 DOM 光栅化环境）
// options：{ theme?: 'light' | 'dark', background?: string | 'transparent', pixelRatio?: number（PNG 独有，缺省 1） }
```

自包含口径：色值字面量化（token 表浅深两张随库、类别染色带预混成 rgba 字面量）、字体 `system-ui`/`ui-monospace` 声明随行不内嵌字体文件。域=全图唯一（节点∪组框∪边中继点+margin）；零过滤（要子图导出：先造子图再导）。主题缺省=旁挂槽 `controller.exportEnv`（CanvasView 挂载读 `data-fl-theme`/`prefers-color-scheme` 镜像发布，状态染色所见即所导）；浅深双出=传 `theme` 调两次。

保真口径（所见即所导·视觉 chrome 跟随、交互态不带）：跟随面=类别色染色带/节点状态四态（`status` 约定键 `todo`/`running`/`done`/`error` 档色、`vars.progress` 进度条）/锁角标（🔒）/折叠形/边形状四型/节点标题+widget 值文本（内建型按型格式化，自定义型退化为值 JSON 短文本）；不带面=选中高亮/框选/hover/拖拽预览/中继点编辑态（干净归档非交互快照）。`exportPNG` 在 headless 环境 fail-loud throw；`exportSVG` headless 全可用。

交付=返回产物不触发下载（下载是宿主 UX，一行接线）：

```js
const blob = await controller.exportPNG({ theme: 'dark' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'canvas.png'; // SVG 面：a.href = 'data:image/svg+xml,' + encodeURIComponent(svg)
a.click();
URL.revokeObjectURL(a.href);
```

边界：类型色族 `--fl-port-*`/`--fl-link-*`（宿主 CSS 开放集）导出面走中性色（宿主自定义色不进导出）；跨线桥弧不进导出（纯图面风格件）；状态四态呈现是导出侧固定档色（导出面无宿主 CSS 可搬）；文本溢出=节点矩形级裁剪；`background` 取值须为合法 CSS 色值；主题槽读取在发布时点（导出时显式传 `theme` 恒可用）；视口内裁剪/选中集过滤/JPEG 不在库内。

## TS 类型收窄

纯类型面公共 API（泛型参数全擦除，运行时零变；缺省参=既有宽形，存量代码零改动）。宿主声明「typeId→data 形状」映射表，`FlowloomNode<AppData>` 分布映射成判别联合：`node.typeId === 'phase'` 处 TypeScript 即把 data 收窄到 PhaseData：

```ts
import { createNodeRegistry, type FlowloomNode } from 'flowloom/kernel';
import { createCanvasController, createSelectionStore } from 'flowloom/svelte';

type PhaseData = { title: string; done: boolean }; // data 形状推荐 type alias 形（见下边界）
type ImageData = { path: string; scale: number };
type AppData = { phase: PhaseData; image: ImageData };
type AppNode = FlowloomNode<AppData>; // = CanvasNode<PhaseData,'phase'> | CanvasNode<ImageData,'image'>

const registry = createNodeRegistry<AppData>([
  // 词表漂移锁：typeId 编译期受映射表键约束（'bogus' 即报错）
  { typeId: 'phase', label: '阶段', inputs: [], outputs: [{ portId: 'out', label: '出' }] },
  { typeId: 'image', label: '图片', inputs: [{ portId: 'in', label: '入' }], outputs: [] },
]);
const controller = createCanvasController<AppNode>({ registry }); // 泛型槽（缺省=宽形零变化）

for (const node of controller.getSelectedNodes()) {
  if (node.typeId === 'phase') console.log(node.data.title); // data 已收窄：title 是 string
}
const selection = createSelectionStore(controller); // TNode 自 controller 推导，值流即 AppNode[]
```

收窄落位=读面与落位面五方法：`getSelectedNodes(): TNode[]`、`placeNode(typeId: TNode['typeId'], …): TNode`、`placeNodeConnected(…)`、`addNode(node: TNode)`、`setNodeData(id, patch: Partial<TNode['data']>)`（词表外键/错型值编译期拒）。词表先行（映射表后置）的宿主用 satisfies 锁反向：

```ts
import type { NodeTypeDef } from 'flowloom/kernel';

const defs = [
  { typeId: 'phase', label: '阶段', inputs: [], outputs: [] },
  { typeId: 'image', label: '图片', inputs: [], outputs: [] },
] satisfies readonly (NodeTypeDef & { typeId: keyof AppData })[]; // 'bogus' 在此即报错
```

边界（照实记档）：`getState()`/`toUiFormat()` 恒宽（图状态/序列化面不级联泛型）；回调属性（`onNodeDoubleClick` 等）恒宽 `CanvasNode`（回调内 `node as AppNode` 断言后判别）；TNode 是宿主断言非运行时校验：词表未声明 `initialData` 时落位 data 恒 `{}`，必填形状声明 `initialData` 工厂播种或映射表形状声明成全可选；data 形状推荐 type alias（interface 无隐式索引签名，在「窄 controller 递给宽消费者」等 Record 边界处被拦，TS 已知行为）。

## 无头内核

kernel 是纯 TS 零 DOM 依赖：node 环境可跑全部交互逻辑（测试即这么做的）。

```js
controller.dispatchInput({ type: 'wheel', x: 120, y: 60, deltaY: -100, modifiers: [] }); // 指针锚定缩放
controller.fitView(width, height); // 全图适配（含边距）；视口不入 undo
import { hitTestNode, hitTestPort, screenToGraph } from 'flowloom/kernel'; // 几何/命中纯函数
```

## API 参考

controller 公开面与 CanvasView props 全清单（对码全量盘点，勿凭记忆猜名：JS 里方法不存在是裸 TypeError，任何报错机制都拦不住调用之前的事）。TS 面签名以 `controller-types.ts` 与[TS 类型收窄](#ts-类型收窄)为准。

**controller 属性面**（4 只读+2 可置钩子）：

| 属性 | 语义 |
|---|---|
| `registry` | 词表注册表（构造注入） |
| `commands` | 命令注册制面：内建命令+bind/unbind/executeCommand/bindings |
| `viewSize` | 视图尺寸旁挂槽（CanvasView 挂载自量发布） |
| `exportEnv` | 导出环境旁挂槽（主题+状态袋） |
| `onLinkEmptyDrop` | 拖线到空白钩子（可置） |
| `onNodeDoubleClick` | 双击节点改道钩子（可置，返回 false 回落内建改名） |

**controller 方法面**（按主题分组）：

| 主题 | 方法 |
|---|---|
| 读态 | `getState()` / `getViewport()` / `getViewportMachineState()` / `getSelectionState()` / `getSelectedNodes()` / `getLinkState()` / `getRerouteState()` / `getContextMenuState()` / `getNavPath()` / `getBreadcrumb()` / `canUndo()` `canRedo()` / `toUiFormat()` |
| 订阅 | `subscribe(listener) → 退订函数` |
| 图写（恰一张快照） | `addNode(node)` / `removeNode(id)` / `addEdge(edge)` / `moveNode(id,x,y)` / `setNodeData(id,patch)` / `toggleNodeCollapsed(id)` |
| 落位 | `placeNode(typeId,x,y)` / `placeNodeConnected(typeId,x,y,origin)`（词表 `initialData` 在场则播种） |
| 外部摄入（恒零快照） | `applyExternal(changes)` 变更单主名 / `applyExternalGraph(graph)` 整图主名 / `applyGraph(graph)` 整图别名（≡applyExternalGraph） |
| 剪贴板 | `copySelection()` / `paste(text?)` |
| 组与排布 | `toggleGroupSelection()` / `fitGroupsToContents()` / `alignSelection(axis)` / `distributeSelection(axis)` / `autoLayout(options?)` / `autoLayoutSelection(options?)` |
| 子图 | `convertSelectionToSubgraph()` / `enterSubgraph(id,fitSize?)` / `exitSubgraph(fitSize?)` / `navigateTo(path,fitSize?)` / `navigateBack()` |
| 视口（不入 undo） | `setViewport(viewport)` / `fitView(width,height,margin?)` |
| 输入 | `dispatchInput(event)`（归一化事件，无头直喂） |
| 旁边声明（零快照零通知） | `setNodeLocks(locks?)` / `setConnectionRules(rules?)` / `setEdgeShape(shape?)` |
| 历史 | `undo()` / `redo()` |
| 右键菜单 | `closeContextMenu()` |
| 导出 | `exportSVG(options?) → string` / `exportPNG(options?) → Promise<Blob>` |

**CanvasView props 面**（`controller` 必填，余皆可选）：

| props | 语义 |
|---|---|
| `controller` | controller 实例（一画布一 controller） |
| `widgetComponents` | 自定义 widget 注册位 |
| `contextMenuItems` | 右键菜单 items 注入（未注入=opt-out 原生菜单） |
| `nodeStates` | 节点状态袋 |
| `nodeLocks` | 结构面锁单 |
| `connectionRules` | 连接校验单 |
| `edgeShape` | 边形状全局缺省 |
| `edgeJump` | 跨线桥开关 |
| `labels` | 库产 aria-label 词表覆写 |

### 消费指引

**执行态着色**（run 回放/执行反馈）：`nodeStates` props 直达渲染层，键开放集（`^[A-Za-z0-9_-]+$`）落节点根 `data-fl-state-{key}` 属性+`--fl-state-{key}` inline 变量，宿主样式表按属性选择器着色、动效走 keyframes：

```svelte
<CanvasView {controller} nodeStates={states} />
```

```js
// states: Record<nodeId, { data: 键值袋, vars: 键值袋 }>：活图更新姿势=替换袋对象
const states = { [nodeId]: { data: { status: 'running' }, vars: { progress: 0.4 } } };
```

```css
/* 宿主样式表（文件级，勿写进 Svelte 组件 <style>，缘由见本节末「宿主整合注意」） */
.fl-node[data-fl-state-status='running'] { border-color: var(--fl-selection); }
.fl-node[data-fl-state-status='error'] { border-color: #ef4444; }
.fl-node[data-fl-state-status='running'] .fl-node-badge { animation: fl-pulse 1.2s infinite; }
@keyframes fl-pulse { 50% { opacity: 0.35; } }
```

**`data-fl-node` 确定性选择器**（按节点 id 着色/高亮/双画布隔离）：节点根恒带 `data-fl-node="{id}"`（稳定、与挂载无关）。按 id 选节点用属性选择器 `[data-fl-node="n1"]`，同页双画布用容器作用域隔离（`.canvas-a [data-fl-node="n1"]`）。注意 DOM `id` 属性带每次挂载的随机前缀（`fl-{random6}-{nodeId}`，a11y `aria-activedescendant` 防撞设计），且 `idPrefix` 不是公开 prop：DOM id 不当选择器用，`data-fl-node` 才是稳定选择面。

**端口热区几何**（自动化测试/Playwright 拖线的实测口径）：命中是坐标制，端口 dot 是 SVG（`pointer-events:none`）、端口 label 不响应，拖 label 中心无效。展开态锚点公式（kernel `portPositions` 单源）：input 端口 x=节点左缘、output 端口 x=节点右缘，y=`node.y + 24（标题条）+ i×20（行高）+ 10（行心）`，首行即 `y+34`；命中半径 8px（屏幕坐标）。折叠态端口沿折叠条 `(i+1)/(n+1)` 均分。用 kernel 纯函数算坐标，别写死像素：`import { portPositions, nodeSize } from 'flowloom/kernel'`，或直接 `hitTestPort` 判命中。

**subscribe 退订**（Svelte 宿主防泄漏）：`$effect` 内订阅并返回退订函数，组件卸载即自动清理；「当前选中」跟随用 `createSelectionStore`（免手管退订）：

```svelte
<script>
  $effect(() => {
    const off = controller.subscribe(() => {
      /* 跟随图变化（读 getState 等） */
    });
    return off; // 清理函数=退订
  });
</script>
```

**宿主整合注意：Svelte 模板 `<style>` 是 raw-text 语境**：含 `</script>`、`<` 字样的 CSS 字面量会让 svelte-check 报错位。动态样式（运行时拼 keyframes 等）走 DOM `createElement('style')` 注入或宿主全局样式表，勿在组件 `<style>` 内拼字符串。

## 本地演示页

`npm run play` 启动 playground（vite，端口 5199），`playground/hub.html` 是演示枢纽（全能力清单直达+浅深主题联动）。各页演示内容：

| 页面 | 演示 |
|---|---|
| `index.html` | 主演练：基础八项能力逐项点亮 |
| `hub.html` | 演示枢纽：全能力导览直达+嵌套三镜头深链 |
| `nested.html` | 子图嵌套：转换/边界口代理/面包屑导航 |
| `layout.html` | 数据驱动布局：无坐标声明→自动排布+可读性读数 |
| `widgets.html` | 节点内 widget：三段形+宽度策略对照 |
| `theme.html` | 主题与节点 chrome：浅深切换+标题带染色三档 |
| `contextmenu.html` | 右键菜单：命中五路+改选两态+让位 |
| `dblclick.html` | 双击改道钩子 |
| `status.html` | 节点状态呈现：双轨透传/结构位/活图三版对照 |
| `arrows.html` | 有向边箭头：屏幕恒定+后退边反转 |
| `locks.html` | 结构面锁：谓词/编号集/无锁三档 |
| `integration.html` | 集成 demo I：六面同场（右键/改道/状态/外摄/箭头/锁） |
| `selection.html` | 宿主响应式接线：$selection 侧栏跟随+发射纪律 |
| `custom-widget.html` | 复杂结构自定义 widget：注册→渲染→编辑回写 |
| `a11y.html` | 无障碍键盘面+aria 读数 |
| `edge-shapes.html` | 边形状四型对照+词表 per-type 覆盖 |
| `edge-jump.html` | 跨线桥：交叉弧+开关对照 |
| `connection-rules.html` | 连接校验：矩阵例+谓词例+读数面 |
| `export.html` | PNG·SVG 导出：浅深两档+透明背景+pixelRatio |
| `dist.html` | dist 分发面：整页 import 走 dist 入口 |
| `integration2.html` | 集成 demo II：审批流六面同场（README 配图来源） |

## dist 入口与源码消费

本库暂未发布 npm（`private: true`）；私有分发的官方通道是**入仓 dist 预构建产物**。`exports` 双面：

- **源码四键** `flowloom` / `flowloom/kernel` / `flowloom/svelte` / `flowloom/tokens.css` → `./src` 树（本仓 playground 与单测直接消费）。
- **dist 四子键** `flowloom/dist` / `flowloom/dist/kernel` / `flowloom/dist/svelte` / `flowloom/dist/tokens.css` → 入仓产物。

产物=三入口 bundle ESM 各一文件+tokens.css 原样（`dist/{index,kernel,svelte}.js`）：`.svelte`/TS 全部预编完、组件 css `'injected'` 内嵌（自含 JS 零 CSS 文件面）、`svelte` 恒 external（peerDep 宿主自供）。**优先 dist 的理由**：产物是纯浏览器 ESM，宿主构建管线零 Svelte 编译知识；说明符 external 单一实例，天然免疫「双 Svelte 运行时」类宿主坑。消费=拷 dist 四件+`svelte` 说明符 external（或 vendor 重写为宿主自供路径）；重建=`npm run dist:build`（随版本 bump）。v1 不带 .d.ts：TS 宿主走源码键吃类型。

三件宿主易漏项：

1. **容器尺寸处处宿主喂（Minimap 除外）**：kernel/controller 无头零 DOM，`fitView(width, height)` 全图适配、`enterSubgraph(id, { width, height })` 无镜头记忆时兜底仍由宿主喂；Minimap 不传 `viewportSize` 即缺省自量（显式读取器恒覆盖，且须真读画布元素，传常量视口矩形恒错）。
2. **tokens.css 引入与 `data-fl-theme`**：dist 路=`<flowloom>/dist/tokens.css`（源码路=`src/svelte/tokens.css`）+主题属性挂 `<html>`。宿主管线无 CSS import 通道（如浏览器插件）自带注入。
3. **源码兜底路径：`.svelte.[tj]s` runes 模块须过 Svelte 编译器**：包内 `src/svelte/{placement,hover-tooltip,title-edit}.svelte.ts` 用 `$state` 等 runes，esbuild/swc 默认 TS 直转会留裸 `$state` 调用，运行时 `ReferenceError: $state is not defined`（组件渲染即崩；库侧零提示，源码消费路径必踩；dist 路径产物已预编天然免疫）。正解=构建管线 onLoad 双轨：`.svelte` 组件走 `compile`、`.svelte.[tj]s` 先剥 TS 再 `compileModule`：

```js
// esbuild onLoad 双轨（插件环境用 esbuild-wasm，Node 构建换 esbuild 同形 API）：
import fs from 'node:fs';

function svelteLoader() {
  return {
    name: 'flowloom-svelte',
    setup(build) {
      // 组件 .svelte：compile（css:'injected'：scoped 样式运行时注入）
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const compiler = await import('svelte/compiler');
        const source = fs.readFileSync(args.path, 'utf8');
        const result = compiler.compile(source, { generate: 'client', dev: false, css: 'injected' });
        return { contents: result.js.code, loader: 'js' };
      });
      // runes 模块 .svelte.ts/.svelte.js：TS 剥离→compileModule（直转留裸 $state 运行时崩）
      build.onLoad({ filter: /\.svelte\.[tj]s$/ }, async (args) => {
        const compiler = await import('svelte/compiler');
        const { transform } = await import('esbuild-wasm');
        const source = fs.readFileSync(args.path, 'utf8');
        const loader = args.path.endsWith('.ts') ? 'ts' : 'js';
        const stripped = (await transform(source, { loader, format: 'esm' })).code;
        const result = compiler.compileModule(stripped, { generate: 'client' });
        return { contents: result.js.code, loader: 'js' };
      });
    },
  };
}
// 三入口各一 bundle（与 exports 面同源；svelte 标 external：宿主自供单一运行时）：
// entryPoints: ['<flowloom-src>/src/index.ts', '<flowloom-src>/src/kernel/index.ts',
//               '<flowloom-src>/src/svelte/index.ts'],
// bundle: true, format: 'esm', external: ['svelte', 'svelte/*'], plugins: [svelteLoader()]
```
