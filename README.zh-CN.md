# flowloom

[English](README.md) | 中文

全功能节点编辑器画布库：**框架无关内核（kernel）+ Svelte 5 渲染层**。MIT 许可。

![集成演示：审批流（浅色）](docs/assets/demo-light.png)

## 为什么选 flowloom

**1. 完整的节点编辑器交互面，全部内置**

拖线连线/改连、拖线到空白落新节点自动连、双击搜索落位、侧栏拖放、框选多选、跨标签页复制粘贴、快照式撤销重做、分组、嵌套子图、reroute 中继点、minimap、六轴对齐+等间隙分布+分层自动排布、选区浮动工具条、右键菜单、原位改名、节点折叠、连接校验、边形状四型+跨线桥、有向箭头。下表能力全部内置于内核与组件，不是插件拼装。

**2. 为外部数据源与 AI agent 设计**

真源在别处（数据库/轮询/事件流/agent 产出）、画布做镜像呈现，是一等场景：`applyExternal` / `applyGraph` 让外部变化恒零快照，撤销重做后恒存活，**撤销严格只回退用户操作**。库不在 AI 训练语料内，所以公开门的报错文本按「病因+合法选项+恢复动词」三要素写，是给 agent 的运行时文档；词表 `initialData` 播种、连接校验、结构锁让 agent 产出安全落位。

**3. 轻量，且内核 headless 可用**

零运行时依赖，peerDependencies 仅 `svelte ^5`。内核是纯 TS 零 DOM 依赖：交互状态机、命令注册表、排布数学全部可独立运行，node 环境直喂归一化事件即跑全部交互逻辑，无头测试与视口运算不依赖浏览器。

![跨线桥特写：边-边交叉处半圆弧跳过](docs/assets/edge-jump-closeup.png)

## 安装与快速上手

本库暂未发布 npm（`private: true`）；私有分发的官方通道是入仓 dist 预构建产物（拷四件+`svelte` external 即用，见[使用手册](docs/usage.md)）。

```js
import { createNodeRegistry, createGraph } from 'flowloom/kernel';
import { createCanvasController, CanvasView } from 'flowloom/svelte';
import 'flowloom/tokens.css';

const registry = createNodeRegistry([
  { typeId: 'step', label: '步骤', inputs: [], outputs: [{ portId: 'out', label: '下一步' }] },
]);
const controller = createCanvasController({ registry, initialGraph: createGraph() });
// Svelte 宿主：<CanvasView {controller} />；滚轮缩放、平移、FitView、双击搜索、拖线连线开箱即用
```

![集成演示：审批流（深色）](docs/assets/demo-dark.png)

## 功能全表

| 域 | 能力 |
|---|---|
| 落位与连线 | 双击空白搜索落位 / 侧栏拖放 / 拖线到空白落新节点自动连；端口拖线、改连；连接校验（词表兼容矩阵∧谓词 AND）；边形状 bezier/straight/step/smoothstep（词表 per-type+全局）；跨线桥（边-边交叉半圆弧）；有向边箭头（屏幕恒定 11px，后退边自动反转）；reroute 中继点链 |
| 选区与编辑 | 框选 / Ctrl 点选 / 整体拖动 / Delete；复制粘贴（版本化契约、跨标签页、逐次偏移）；快照式 undo/redo（手势级粒度）；原位改名；节点折叠两态；选区浮动工具条；右键菜单（items 全宿主注入） |
| 结构组织 | 分组 group（成组/解组/组框适配）；嵌套子图（边界口代理配对+面包屑+每容器视口记忆）；六轴对齐+等间隙分布+分层自动排布（默认 L→R） |
| 呈现与定制 | 浅深主题 token 表（`data-fl-theme`/跟随系统）；类别色与端口类型色（词表声明+开放集 token）；节点内 widget（内建五型+自定义组件注册位）；属性面板供件；minimap（零接线自量）；节点状态呈现（状态/进度活图，零 undo 污染）；PNG·SVG 导出（自包含、所见即所导） |
| 集成面 | 外部静默摄入（变更单+整图两门，快照栈再锚）；结构面锁（谓词+编号集）；命令注册制快捷键（命令/键位分离可换绑存档，画布聚焦域不劫持宿主）；a11y 键盘面+aria 最小集；TS 泛型收窄（判别联合）；多实例隔离；无头内核；UI 格式持久化（语义/布局/视口分键） |

## 文档

- [使用手册（中文）](docs/usage.md) / [Usage (English)](docs/usage.en.md)：装配基线到全部能力面，含 API 参考全表
- 在线演示：待部署（本地 `npm run play` 可跑 21 个演示页，`playground/hub.html` 枢纽导览）
- [CHANGELOG](CHANGELOG.md)（发版史）

## 设计原则

1. **节点定义=宿主数据**：节点词表是注册表驱动的开放集，库不枚举任何节点型。
2. **内核 schema 无关**：内核只见「节点=泛型记录+端口描述」；领域 schema（UI↔执行格式投影、校验、节点目录）归消费者适配层。
3. **引擎无关内核+宿主渲染分离**：交互状态机/命令注册表/排布数学住 kernel（纯函数+状态机 over 抽象输入事件，零 DOM/Svelte 依赖）；Svelte 层只做渲染与事件归一化。
4. **双格式分离**：UI 格式=语义+布局分键+视口；布局不入语义 hash，revision 判定不被用户整理污染。

## 致谢

本库的能力基线与若干设计参照了这些先行者：

- [ComfyUI](https://www.comfy.org/)：节点画布交互能力基线（连线、落位、分组、子图、reroute、折叠等交互档以此为对齐参考）
- [React Flow / Svelte Flow（xyflow）](https://xyflow.com/)：API 命名与类型面惯例（连接校验、边形状、泛型收窄）
- [GoJS](https://gojs.net/)：跨线桥（边-边交叉处跳弧清晰化）的交互惯例
- [litegraph.js](https://github.com/jagenjo/litegraph.js)：引擎与渲染分层的权衡参照
- Sugiyama 分层排布算法：自动排布的数学基础

## License

MIT
