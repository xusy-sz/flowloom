import { DEFAULT_EDGE_SHAPE, DEFAULT_KEY_BINDINGS, DEFAULT_VIEWPORT_LIMITS, FIT_VIEW_MARGIN, NODE_HEADER_HEIGHT, PORT_ROW_HEIGHT, SUBGRAPH_TYPE_ID, TITLE_DATA_KEY, WIDGET_BLOCK_TAIL, addEdge, addNode, alignNodes, applyExternalChangeSet, autoLayoutNodes, bezierPointAt, boxRect, centerViewportOn, clampNavPath, clipboardFromSelection, containerViewAt, convertSelectionToSubgraph, createCommandTable, createGraph, createSnapshotStore, createViewportMemory, diffExternalGraph, displayNodeTitle, distributeNodes, edgeArrowDirection, edgeIdOf, edgeShapeOf, edgeWaypoints, exportBounds, firstAllowedPortOn, fitSelectedGroupsToContents, fitView, globalNodeIds, graphBounds, graphToScreen, groupContainingAll, groupIdOf, hasEdgeBetween, hitTestEdgePath, hitTestNode, initialLinkMachineState, initialRerouteMachineState, initialSelectionMachineState, initialViewportMachineState, isNodeLocked, isReservedNode, keyComboFrom, linkControlPoints, moveNode, moveNodes, nextEdgeSeq, nextGroupSeq, nodeById, nodeCategoryColor, nodeCustomTitle, nodeSize, nodeWidgets, nodesBounding, parseClipboard, pasteClipboard, pastedAt, portAnchor, portPositions, portRefOf, portRowPairs, pruneSelection, pruneSubgraphCascades, reduceLinkEvent, reduceRerouteEvent, reduceSelectionEvent, reduceViewportEvent, removeNode, resolveConnectionRules, resolveContextHit, resolveNodeLocks, screenToGraph, selectedNodes, selectionAnchor, serializeClipboard, shapePolyline, stepCorners, subgraphById, subgraphConversionLocked, subgraphDefaultName, subgraphIdOf, toUiFormat, toggleGroup, toggleNodeCollapse, traverseSelection, updateNodeData, widgetRowHeight, withContainer, zoomAt } from "./kernel.js";
import { readable } from "svelte/store";
import "svelte/internal/disclose-version";
import * as $ from "svelte/internal/client";
//#region src/svelte/ids.ts
/** 图对象 id 分配器（门面私有）：节点/边/组/子图四类取号的单点——kernel 持取号纯函数
* （边 fle-/组 flg-/子图 fls- 前缀与查重跳号住各自模块），节点 id 政策（fl-N 前缀+
* 活图查重跳号）随本模块收编；计数器是有状态面，住门面侧不入 kernel（kernel 纯函数
* 红线）。票 10 起 id 空间全局唯一（跨容器同命名空间）——查重域=根态全部容器
* ∪ 累积图（粘贴/转换在途产出的新对象尚未写回根态时经 extra 参数补入查重域）。 */
/** 自动落位节点的 id 前缀（顺序号；与宿主自定 id 撞号则跳过）。 */
var NODE_ID_PREFIX = "fl-";
function createGraphIdSource() {
	let nodeSeq = 0;
	let edgeSeq = 0;
	let groupSeq = 0;
	let subgraphSeq = 0;
	return {
		node(root, extra) {
			const taken = globalNodeIds(root);
			if (extra !== void 0) for (const n of extra.nodes) taken.add(n.id);
			let id = `${NODE_ID_PREFIX}${nodeSeq += 1}`;
			while (taken.has(id)) id = `${NODE_ID_PREFIX}${nodeSeq += 1}`;
			return id;
		},
		edge(root, extra) {
			edgeSeq = nextEdgeSeq(edgeSeq, { edges: edgeProbe(root, extra) });
			return edgeIdOf(edgeSeq);
		},
		group(root, extra) {
			groupSeq = nextGroupSeq(groupSeq, { groups: groupProbe(root, extra) });
			return groupIdOf(groupSeq);
		},
		subgraph(root) {
			const nodeTaken = globalNodeIds(root);
			const recordTaken = new Set(root.subgraphs.map((s) => s.id));
			let seq = subgraphSeq;
			let id;
			do {
				seq += 1;
				id = subgraphIdOf(seq);
			} while (nodeTaken.has(id) || recordTaken.has(id));
			subgraphSeq = seq;
			return {
				id,
				seq
			};
		}
	};
}
/** 边查重域（根+累积图的全容器边集）。 */
function edgeProbe(root, extra) {
	const edges = [...root.edges, ...extra?.edges ?? []];
	for (const sub of root.subgraphs) edges.push(...sub.edges);
	return edges;
}
/** 组查重域（根+累积图的全容器组集）。 */
function groupProbe(root, extra) {
	const groups = [...root.groups, ...extra?.groups ?? []];
	for (const sub of root.subgraphs) groups.push(...sub.groups);
	return groups;
}
//#endregion
//#region src/svelte/command-actions.ts
/** 命令面（票 14）：controller 的命令注册制门面——kernel 命令表（数据+纯查询，
* commands.ts）+内建命令执行体（宿主回调注入——layout-actions/dispatch-loop 先例）
* +绑定改写。命令与绑定分离（spec 命令注册制契约）：绑定只指命令 id，可先于命令
* 注册存在（恢复存档次序自由）。
* 内建执行体两类：无头可执行（undo/redo/剪贴板内存路/分组/子图/Delete·Escape=
* 机内别名——重派发同一内核事件，交互机仍是语义单源）；量测/系统桥类（fit-view
* 量容器、copy/paste 桥系统剪贴板）无头缺省为 no-op 占位，CanvasView 挂载时经
* setRunner 覆写（渲染层职责——门面无头零 DOM）。 */
/** 键盘缩放步进因子（票 50 票内定）：×1.2/按——与滚轮一档 1.105 相邻偏粗的键面档。 */
var KEYBOARD_ZOOM_FACTOR = 1.2;
/** 内建命令 id 常量（宿主覆写/绑定的引用面；默认键位表指涉同款）。 */
var BUILTIN_COMMANDS = {
	undo: "fl:undo",
	redo: "fl:redo",
	copy: "fl:copy",
	paste: "fl:paste",
	deleteSelection: "fl:delete-selection",
	cancelGesture: "fl:cancel-gesture",
	fitView: "fl:fit-view",
	autoLayout: "fl:auto-layout",
	groupToggle: "fl:group-toggle",
	convertSubgraph: "fl:convert-subgraph",
	selectNext: "fl:select-next",
	selectPrev: "fl:select-prev",
	nudgeUp: "fl:nudge-up",
	nudgeDown: "fl:nudge-down",
	nudgeLeft: "fl:nudge-left",
	nudgeRight: "fl:nudge-right",
	nudgeUpLarge: "fl:nudge-up-large",
	nudgeDownLarge: "fl:nudge-down-large",
	nudgeLeftLarge: "fl:nudge-left-large",
	nudgeRightLarge: "fl:nudge-right-large",
	activateSelection: "fl:activate-selection",
	zoomIn: "fl:zoom-in",
	zoomOut: "fl:zoom-out"
};
/** 无头占位（fit-view 量容器/activate-selection 需屏幕坐标——CanvasView setRunner 覆写）。 */
var noMeasure = () => {};
/** 命令面基座十命令（票 14/23；无头可执行体=门面闭包，Delete/Escape=机内别名）。 */
function commandBuiltins(host) {
	return [
		{
			id: BUILTIN_COMMANDS.undo,
			label: "撤销",
			run: () => host.undo()
		},
		{
			id: BUILTIN_COMMANDS.redo,
			label: "重做",
			run: () => host.redo()
		},
		{
			id: BUILTIN_COMMANDS.copy,
			label: "复制选区",
			run: () => host.copySelection()
		},
		{
			id: BUILTIN_COMMANDS.paste,
			label: "粘贴",
			run: () => host.paste()
		},
		{
			id: BUILTIN_COMMANDS.deleteSelection,
			label: "删除选中",
			run: () => host.dispatchKey("Delete")
		},
		{
			id: BUILTIN_COMMANDS.cancelGesture,
			label: "取消手势/清空选区",
			run: () => host.dispatchKey("Escape")
		},
		{
			id: BUILTIN_COMMANDS.fitView,
			label: "适配全图",
			run: noMeasure
		},
		{
			id: BUILTIN_COMMANDS.autoLayout,
			label: "自动排布",
			run: () => host.autoLayout()
		},
		{
			id: BUILTIN_COMMANDS.groupToggle,
			label: "成组/解组",
			run: () => host.toggleGroupSelection()
		},
		{
			id: BUILTIN_COMMANDS.convertSubgraph,
			label: "转为子图",
			run: () => host.convertSelectionToSubgraph()
		}
	];
}
/** nudge 基档四命令（票 50：方向键无修饰=1px——**固定行为命令**，Shift 大步语义在
* 绑定表非执行体；锁定节点让位同拖动面放行——票 36 布局半边）。 */
function nudgeBuiltins(host) {
	return [
		{
			id: BUILTIN_COMMANDS.nudgeUp,
			label: `上移 1px`,
			run: () => host.nudgeSelection(0, -1)
		},
		{
			id: BUILTIN_COMMANDS.nudgeDown,
			label: `下移 1px`,
			run: () => host.nudgeSelection(0, 1)
		},
		{
			id: BUILTIN_COMMANDS.nudgeLeft,
			label: `左移 1px`,
			run: () => host.nudgeSelection(-1, 0)
		},
		{
			id: BUILTIN_COMMANDS.nudgeRight,
			label: `右移 1px`,
			run: () => host.nudgeSelection(1, 0)
		}
	];
}
/** nudge 大步四命令（票 50：Shift+方向=10px 档——RF 同款肌肉记忆，票 47 裁 3）。 */
function nudgeLargeBuiltins(host) {
	return [
		{
			id: BUILTIN_COMMANDS.nudgeUpLarge,
			label: `上移 10px`,
			run: () => host.nudgeSelection(0, -10)
		},
		{
			id: BUILTIN_COMMANDS.nudgeDownLarge,
			label: `下移 10px`,
			run: () => host.nudgeSelection(0, 10)
		},
		{
			id: BUILTIN_COMMANDS.nudgeLeftLarge,
			label: `左移 10px`,
			run: () => host.nudgeSelection(-10, 0)
		},
		{
			id: BUILTIN_COMMANDS.nudgeRightLarge,
			label: `右移 10px`,
			run: () => host.nudgeSelection(10, 0)
		}
	];
}
/** 遍历/激活/缩放命令（票 50：Tab/Enter/± 的执行体；激活无头占位待渲染层覆写）。 */
function keyboardNavBuiltins(host) {
	return [
		{
			id: BUILTIN_COMMANDS.selectNext,
			label: "选中下一节点",
			run: () => host.selectAdjacent(1)
		},
		{
			id: BUILTIN_COMMANDS.selectPrev,
			label: "选中上一节点",
			run: () => host.selectAdjacent(-1)
		},
		{
			id: BUILTIN_COMMANDS.activateSelection,
			label: "激活选中（双击等效）",
			run: noMeasure
		},
		{
			id: BUILTIN_COMMANDS.zoomIn,
			label: "放大",
			run: () => host.zoomBy(KEYBOARD_ZOOM_FACTOR)
		},
		{
			id: BUILTIN_COMMANDS.zoomOut,
			label: "缩小",
			run: () => host.zoomBy(1 / KEYBOARD_ZOOM_FACTOR)
		}
	];
}
var CommandActions = class {
	table;
	constructor(host) {
		this.table = createCommandTable([
			...commandBuiltins(host),
			...nudgeBuiltins(host),
			...nudgeLargeBuiltins(host),
			...keyboardNavBuiltins(host)
		], DEFAULT_KEY_BINDINGS);
	}
	/** 声明/覆写命令（同 id=替换整条记录——宿主覆写内建或自家命令不碰库码）。 */
	register(command) {
		this.table.register(command);
	}
	/** 只换执行体（元数据不动）——渲染层覆写量测/系统桥类执行体的单点；未知 id
	* fail-loud（id 拼错必须在覆写期暴露）。 */
	setRunner(id, run) {
		const record = this.table.lookup(id);
		if (record === void 0) throw new Error(`命令未注册：${id}（先 commands.register 注册或核对 id 拼写）`);
		this.table.register({
			...record,
			run
		});
	}
	/** 执行命令：命中即跑（返回 true）；未注册 id 返回 false（绑定先于注册的路）。 */
	executeCommand(id) {
		const record = this.table.lookup(id);
		if (record === void 0) return false;
		record.run();
		return true;
	}
	all() {
		return this.table.all();
	}
	/** 声明/改写绑定（同组合键+作用域=覆写——宿主换键位单点；作用域缺省画布聚焦域）。 */
	bind(combo, commandId, scope = "canvas") {
		this.table.bind({
			combo,
			commandId,
			scope
		});
	}
	unbind(combo, scope = "canvas") {
		this.table.unbind(combo, scope);
	}
	match(combo, scope = "canvas") {
		return this.table.match(combo, scope);
	}
	/** 当前绑定表（拷贝——serializeKeyBindings 存档单源）。 */
	bindings() {
		return this.table.bindings();
	}
};
//#endregion
//#region src/svelte/dispatch-guard.ts
/** 指针三式判定：对版本化可辨识联合显式列举（不做事由前缀字符串嗅探）。 */
function isPointerEvent(event) {
	return event.type === "pointer-down" || event.type === "pointer-move" || event.type === "pointer-up";
}
/** 镜头手势占用指针判定（选区机/连线机共用的分流守卫单点）：
* 空格按住或平移中的按下/移动归镜头；结束平移的那次松开归镜头（多键交错不串结算）。 */
function panOccupied(event, prevMachine, nextMachine) {
	if (!isPointerEvent(event)) return false;
	if (event.type !== "pointer-up") return nextMachine.spaceDown || nextMachine.panning;
	return prevMachine.panning || nextMachine.panning;
}
//#endregion
//#region src/svelte/dispatch-loop.ts
var ESCAPE_KEY = "Escape";
var DispatchLoop = class {
	host;
	machineState = initialViewportMachineState();
	selectionState = initialSelectionMachineState();
	linkState = initialLinkMachineState();
	rerouteState = initialRerouteMachineState();
	viewport;
	/** 右键菜单开面态（票 31 旁挂位——渲染层经 getContextMenuState 观察）。 */
	contextMenu;
	/** 结构面锁单解析形（票 36 旁边声明）：连线/选区机喂机世界与命令面共读；
	* reroute 机不消费（拐点=布局半边照旧）。setNodeLocks 单点写入，零通知零快照。 */
	locks;
	/** 连接校验单（票 51 旁边声明）：连线机喂机世界与落位命令面共读（合法判单源
	* linkDropAllowed 的注入面）；reroute 机不消费。setConnectionRules 单点写入，
	* 零通知零快照。 */
	rules;
	/** 边形状全局缺省（票 52 旁边带）：reroute 机命中跟形状连带消费（每边生效形状
	* =from 侧词表>此缺省>'bezier'）；连线机不消费。setEdgeShape 单点写入零通知。 */
	edgeShape;
	constructor(initialViewport, host) {
		this.host = host;
		this.viewport = initialViewport;
	}
	/** 锁单写入（两形归一；undefined/空形状=无锁 opt-out——交互零变化基线）。 */
	setLocks(input) {
		this.locks = resolveNodeLocks(input);
	}
	/** 校验单写入（空形状归一；undefined=opt-out 交互零变化——setLocks 同款零通知）。 */
	setRules(input) {
		this.rules = resolveConnectionRules(input);
	}
	/** 边形状全局缺省写入（undefined='bezier' 基线——零通知零快照，渲染配置非图数据）。 */
	setEdgeShape(shape) {
		this.edgeShape = shape;
	}
	/** 静默落镜头（导航复原/适配路——通知归导航收口一次发）。 */
	setViewportSilent(viewport) {
		this.viewport = viewport;
	}
	/** 归一化输入事件派发进内核交互机（票 01 起唯一入口；通知去抖单点）。
	* contextmenu（契约 v2）与菜单开面期的 Escape 经 bypass 旁路——四机不认前者、
	* 菜单开着时后者归关菜单（不清选区）。 */
	dispatch(event) {
		if (this.routeBypass(event)) return;
		const prevGraph = this.host.view();
		const prevViewport = this.viewport;
		const prevMachine = this.machineState;
		const prevSelection = this.selectionState;
		const prevLink = this.linkState;
		const prevReroute = this.rerouteState;
		const viewResult = reduceViewportEvent(prevMachine, prevViewport, event, this.host.limits);
		this.machineState = viewResult.state;
		this.viewport = viewResult.viewport;
		if (!this.applyRerouteEvent(event, prevMachine, viewResult.state)) {
			if (!this.applyLinkEvent(event, prevMachine, viewResult.state)) this.applySelectionEvent(event, prevMachine, viewResult.state);
		}
		if (this.host.view() !== prevGraph || this.viewport !== prevViewport || this.machineState !== prevMachine || this.selectionState !== prevSelection || this.linkState !== prevLink || this.rerouteState !== prevReroute) this.host.notify();
	}
	/** reroute 机派发（票 11，链首）：镜头手势占用指针时不喂（panOccupied 单点守卫）。
	* 返回是否「消费」本事件——边路径/中继点按压起拖即消费（link/selection 不得
	* 同一下：按压不落框选）；手势存续期指针流与 Escape 均归本机；按压命中节点/
	* 端口自查让位（选区机/连线机域）。图效果按手势级快照粒度落账。 */
	applyRerouteEvent(event, prevMachine, nextMachine) {
		const active = this.rerouteState.gesture.kind === "drag";
		if (panOccupied(event, prevMachine, nextMachine)) return active;
		const view = this.host.view();
		const result = reduceRerouteEvent(this.rerouteState, this.machineWorld(view), event);
		this.rerouteState = result.state;
		if (result.graph !== view) this.host.writeView(result.graph);
		if (result.commit) this.host.commit();
		return active || this.rerouteState.gesture.kind === "drag";
	}
	/** 喂机世界（连线机/reroute 机共用的容器视图投影——同形单点；类型标注
	* LinkWorld——与 placement.linkWorldOf 同形由类型契约钉死防漂移；票 51 增校验单
	* 贯入——连线机吃、reroute 机不吃[LinkWorld 可选带]；票 52 增边形状缺省——
	* reroute 机命中跟形状吃、连线机不吃）。 */
	machineWorld(view) {
		return {
			graph: view,
			viewport: this.viewport,
			registry: this.host.registry,
			subgraphs: view.subgraphs,
			locks: this.locks,
			rules: this.rules,
			edgeShape: this.edgeShape
		};
	}
	/** 连线机派发（票 03）：镜头手势占用指针时不喂（panOccupied 单点守卫）。
	* 返回是否「消费」本事件——端口热区的 pointer-down 起连线手势即消费（选区机
	* 不得同一下，点端口不落节点拖动）；手势存续期指针流与 Escape 均归连线机
	* （中止优先于清选区；Delete 等其余键不致图在手势中途被改）。空白落点终局经
	* onLinkEmptyDrop 钩子交渲染层开搜索面板（拖线落位路）。 */
	applyLinkEvent(event, prevMachine, nextMachine) {
		const active = this.linkState.gesture.kind === "drag";
		if (panOccupied(event, prevMachine, nextMachine)) return active;
		const view = this.host.view();
		const result = reduceLinkEvent(this.linkState, this.machineWorld(view), event);
		this.linkState = result.state;
		if (result.graph !== view) this.host.writeView(result.graph);
		if (result.commit) this.host.commit();
		if (result.outcome?.kind === "empty") this.host.onLinkEmptyDrop()?.(result.outcome.origin, result.outcome.at);
		return active || this.linkState.gesture.kind === "drag";
	}
	/** 选区机派发：镜头手势占用指针时不喂（panOccupied 单点守卫——多键交错不串结算，
	* 其余松开照喂防空格中途按下滞留手势）。图效果按手势级快照粒度落账：容器写回
	* （含级联 prune）逐帧进行；commit=true 恰 commit 一张快照（否则暂存不入队）。 */
	applySelectionEvent(event, prevMachine, nextMachine) {
		if (panOccupied(event, prevMachine, nextMachine)) return;
		const view = this.host.view();
		const world = {
			graph: view,
			viewport: this.viewport,
			registry: this.host.registry,
			subgraphs: view.subgraphs,
			locks: this.locks
		};
		const result = reduceSelectionEvent(this.selectionState, world, event);
		this.selectionState = result.state;
		if (result.graph !== view) this.host.writeView(result.graph);
		if (result.commit) this.host.commit();
	}
	/** 旁路路由（票 31）：contextmenu 归菜单观察处置；菜单开面期 Escape 归关菜单
	* （不清选区——Windows 习惯，ComfyUI 缺 Esc 的补位）。返回是否已终局处置。 */
	routeBypass(event) {
		if (event.type === "contextmenu") {
			this.handleContextMenu(event);
			return true;
		}
		if (event.type === "key-down" && event.key === ESCAPE_KEY && this.contextMenu !== void 0) {
			this.closeContextMenu();
			return true;
		}
		return false;
	}
	/** 菜单开面收场（渲染层关闭交互的外点/Esc/点项终局都汇此单点；未开 no-op）。 */
	closeContextMenu() {
		if (this.contextMenu === void 0) return;
		this.contextMenu = void 0;
		this.host.notify();
	}
	/** contextmenu 观察（让位两吞→命中解析→Windows 改选→开面；不改图零快照）。 */
	handleContextMenu(event) {
		if (this.menuYielded()) return;
		const hit = resolveContextHit(this.viewport, this.machineWorld(this.host.view()), event);
		this.reselectForContext(event, hit);
		this.contextMenu = {
			hit,
			screen: {
				x: event.x,
				y: event.y
			}
		};
		this.host.notify();
	}
	/** 让位两吞（票 31 件 4）：四机手势在途（gesture.kind!=='idle'——对齐 ComfyUI
	* 拖动不弹）+空格平移态（票 21 panYield 同款姿态）。 */
	menuYielded() {
		return this.machineState.panning || this.machineState.spaceDown || this.selectionState.gesture.kind !== "idle" || this.linkState.gesture.kind !== "idle" || this.rerouteState.gesture.kind !== "idle";
	}
	/** 右键改选 Windows 规则（票 31 件 5，票 27 追加裁定）：命中节点/端口且在选区
	* 外→喂既有 select 面一次左键点选（按下+松开一对——松开收拖动手势；同坐标同
	* 几何源必中同一节点，端口锚点在节点矩形内）；命中空白/边/reroute/组框不动
	* 选区（背景菜单形——菜单目标走命中载荷与选区解耦）。无位移零快照（commit 同
	* 引用被忽略）、零 semanticHash 扰动——选区=交互态。增选修饰随事件（ctrl 右键
	* =并入，与左键同语义）。 */
	reselectForContext(event, hit) {
		if (hit.kind !== "node" && hit.kind !== "port") return;
		if (this.selectionState.selected.has(hit.nodeId)) return;
		this.applySelectionEvent({
			type: "pointer-down",
			x: event.x,
			y: event.y,
			button: 0,
			modifiers: event.modifiers
		}, this.machineState, this.machineState);
		this.applySelectionEvent({
			type: "pointer-up",
			x: event.x,
			y: event.y,
			modifiers: event.modifiers
		}, this.machineState, this.machineState);
	}
};
//#endregion
//#region src/svelte/keyboard-actions.ts
/** 键盘面命令执行体（票 50，票 47 裁 6 命令表路径）：遍历（fl:select-next/prev）/
* nudge（fl:nudge-*, 1px 与 10px 两档）/缩放（fl:zoom-in/out）三族的门面侧实现——
* LayoutCommands 同款 deps 注入模块（kernel 纯函数住 selection.ts/viewport.ts，
* 本层收口选区写/快照粒度/视口通知）。三面快照口径：遍历=零快照零图变化（选区=
* 交互态）；nudge=恰一张快照可撤销（命令式位移，与拖动面同粒度）；缩放=零快照
*（视口域不入 undo，fitView 同款）。锁定节点 nudge 让位语义同拖动面（票 36 布局
* 半边放行——锁拦存在性/连接不拦挪位，moveNodes 全集平移）。 */
var KeyboardActions = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	/** Tab/Shift+Tab 遍历：kernel traverseSelection 单源（图序末位锚步进、循环 wrap、
	* 无选区=图序首/末）；结果与现选区同内容=零写零通知（单节点环回自身档）。 */
	selectAdjacent(step) {
		const current = this.deps.selected();
		const next = traverseSelection(this.deps.view().nodes, current, step);
		if (next === void 0) return false;
		if (next.size === current.size && [...next].every((id) => current.has(id))) return false;
		this.deps.setSelection(next);
		this.deps.notify();
		return true;
	}
	/** 方向键 nudge：选中集整体位移（图坐标域增量），恰一张快照可撤销（拖动面同
	* 让位语义——锁定者照移）；空选区/零位移零快照零通知返回 false。 */
	nudgeSelection(dx, dy) {
		const selected = this.deps.selected();
		if (selected.size === 0 || dx === 0 && dy === 0) return false;
		const view = this.deps.view();
		const next = moveNodes(view, selected, dx, dy);
		if (next === view) return false;
		this.deps.mutate(next);
		return true;
	}
	/** 步进缩放（± 命令）：绕**视口中心**（viewSize 槽供锚——票 45；未发布/零尺寸
	* 回退屏幕原点=offset 投影点，票 47 裁 5「无头回退 offset 中心」）；视口域不入
	* undo；贴限 no-op 返回 false（zoomAt 同引用契约）。 */
	zoomBy(factor) {
		if (!(factor > 0) || factor === 1) return false;
		const size = this.deps.viewSize.get();
		const anchor = size !== void 0 && size.width > 0 && size.height > 0 ? {
			x: size.width / 2,
			y: size.height / 2
		} : {
			x: 0,
			y: 0
		};
		const next = zoomAt(this.deps.viewport(), anchor, factor, this.deps.limits);
		if (next === this.deps.viewport()) return false;
		this.deps.writeViewport(next);
		return true;
	}
};
//#endregion
//#region src/svelte/layout-actions.ts
var LayoutCommands = class {
	host;
	constructor(host) {
		this.host = host;
	}
	/** 六轴对齐（选区包围盒基准）。 */
	align(axis) {
		return this.commit(alignNodes(this.host.source(), this.host.view(), this.host.selected(), axis));
	}
	/** 等间隙分布（水平/垂直，首末不动）。 */
	distribute(axis) {
		return this.commit(distributeNodes(this.host.source(), this.host.view(), this.host.selected(), axis));
	}
	/** 整图自动排布（当前容器全部节点）：默认 L→R（票 23 owner 裁定——ComfyUI 流
	* 向）；{direction:'tb'} 显式回票 13 原纵向语义。 */
	autoLayout(options) {
		return this.commit(autoLayoutNodes(this.host.source(), this.host.view(), void 0, options));
	}
	/** 选区自动排布（分组域=点组框选全体成员后走此路，不设第三方法——票内裁定）；
	* 方向语义同 autoLayout。 */
	autoLayoutSelection(options) {
		return this.commit(autoLayoutNodes(this.host.source(), this.host.view(), this.host.selected(), options));
	}
	/** Ctrl+G 分岔（选中集 ⊆ 某组=解组；否则非空成组偷员）；空选区 false 零快照。 */
	toggleGroup() {
		const next = toggleGroup(this.host.source(), this.host.view(), (g) => this.host.nextGroupId(g), this.host.selected());
		if (next === void 0) return false;
		this.host.mutate(next);
		return true;
	}
	/** 涉及组重适配（FitGroupToContents 选集版）；返回适配组数（0=零快照）。 */
	fitGroups() {
		const { graph, changed } = fitSelectedGroupsToContents(this.host.source(), this.host.view(), this.host.selected());
		if (changed > 0) this.host.mutate(graph);
		return changed;
	}
	/** no-op 同引用契约：零快照零订阅返回 false。 */
	commit(next) {
		if (next === this.host.view()) return false;
		this.host.mutate(next);
		return true;
	}
};
//#endregion
//#region src/svelte/subgraph-actions.ts
/** 取号分配→记录名分器（subgraph-N 命名——kernel subgraphDefaultName 单源；
* 门面装配行瘦身助手）。 */
function subgraphAllocOf(alloc) {
	return {
		id: alloc.id,
		name: subgraphDefaultName(alloc.seq)
	};
}
var SubgraphCommands = class {
	host;
	constructor(host) {
		this.host = host;
	}
	/** 选中集→转换 plan（kernel 纯函数；空选区/全保留型 undefined；票 36 涉锁
	* undefined——过滤转换会重构冻结边界边[跨界存储边必拆配对]，无法只转可转的）。 */
	plan() {
		const view = this.host.view();
		if (subgraphConversionLocked(this.host.locks(), view, this.host.selected())) return void 0;
		return convertSelectionToSubgraph(this.host.source(), view, this.host.selected(), {
			subgraph: () => this.host.allocSubgraph(),
			node: () => this.host.allocNode(),
			edge: () => this.host.allocEdge()
		});
	}
};
//#endregion
//#region src/svelte/clipboard.ts
var MSG_WRITE_FAILED = "flowloom: 选区复制写入系统剪贴板失败（本页内部缓存仍可粘贴）";
var MSG_READ_FAILED = "flowloom: 系统剪贴板读取失败（回退本页内部复制缓存）";
function systemClipboard() {
	return typeof navigator !== "undefined" ? navigator.clipboard : void 0;
}
/** fl:copy 执行体：文本既写系统剪贴板（跨标签页粘贴的桥）也存门面内部缓存（本页
* 粘贴回退源）。写失败（权限拒绝等）记日志不中断——内部缓存已存，本页粘贴不受影响。 */
function copyToSystemClipboard(controller) {
	const text = controller.copySelection();
	if (text === void 0) return;
	const clipboard = systemClipboard();
	if (clipboard === void 0) return;
	clipboard.writeText(text).catch((cause) => console.warn(MSG_WRITE_FAILED, { cause }));
}
/** fl:paste 执行体：系统剪贴板文本优先（跨标签页/跨应用），读不到才回退门面内部
* 缓存；读得到的内容（含空串/非本库格式）原样交门面——拒绝面自收束为 no-op 不炸。 */
async function pasteFromSystemClipboard(controller) {
	let text;
	const clipboard = systemClipboard();
	if (clipboard === void 0) {
		controller.paste();
		return;
	}
	try {
		text = await clipboard.readText();
	} catch (cause) {
		console.warn(MSG_READ_FAILED, { cause });
	}
	controller.paste(text);
}
/** 剪贴板状态对（票 05 立面，票 21 自 controller 搬入本模块守 400 行红线）：
* 本页复制缓存（copySelection 存文本——系统剪贴板不可得时的粘贴回退源）与
* 连续粘贴计数（落点逐次偏移的序号，复制时归零、undo 不回退——票 05 契约）。 */
var Pasteboard = class {
	host;
	text;
	seq = 0;
	constructor(host) {
		this.host = host;
	}
	/** 复制选中集→版本化 JSON 文本（空选区 undefined）；缓存+计数归零。 */
	copy() {
		const payload = clipboardFromSelection(this.host.view(), this.host.selected());
		if (payload === void 0) return void 0;
		const text = serializeClipboard(payload);
		this.text = text;
		this.seq = 0;
		return text;
	}
	/** 粘贴（缺省读内部缓存）：坏载荷/空节点 no-op；新集即选区；恰一张快照可撤销
	* （undo 后选区随 pruneSelection 清空——新 id 皆死）。 */
	paste(text) {
		const source = text ?? this.text;
		if (source === void 0) return void 0;
		const payload = parseClipboard(source);
		if (payload === void 0 || payload.nodes.length === 0) return void 0;
		const result = pasteClipboard(payload, this.host.view(), pastedAt(payload.origin, this.seq), {
			nodeId: (g) => this.host.allocNode(g),
			edgeId: (g) => this.host.allocEdge(g)
		});
		this.seq += 1;
		this.host.setSelection(result.selected);
		this.host.mutate(result.graph);
		return result.selected;
	}
};
//#endregion
//#region src/svelte/placement.ts
var Placement = class {
	host;
	constructor(host) {
		this.host = host;
	}
	/** 落节点到图坐标：id 自动生成、节点中心对准落点。 */
	place(typeId, x, y) {
		const node = this.record(typeId, x, y);
		this.host.mutate(addNode(this.host.view(), node));
		return node;
	}
	/** 复合落位（票 03）：place+自动连兼容端口，恰一张快照（一次 undo 连点带线全消）。
	* 票 36：自动连边遵守锁单——origin 端或新节点（谓词视角）任一锁定只落节点不连线。
	* 票 51：候选端口刷卡（firstAllowedPortOn——锁/矩阵/谓词三面单源），校验不过的
	* 端口域内过滤，全不过=只落节点（与「无兼容端口只落节点」合流）。 */
	placeConnected(typeId, x, y, origin) {
		const node = this.record(typeId, x, y);
		const view = this.host.view();
		const port = firstAllowedPortOn({
			graph: view,
			registry: this.host.registry,
			subgraphs: view.subgraphs,
			locks: this.host.locks(),
			rules: this.host.rules()
		}, node, origin);
		let next = addNode(view, node);
		let edge;
		if (port !== void 0) {
			const ref = {
				nodeId: node.id,
				portId: port.portId
			};
			const from = origin.side === "output" ? portRefOf(origin) : ref;
			const to = origin.side === "output" ? ref : portRefOf(origin);
			if (!hasEdgeBetween(next, from, to)) {
				edge = {
					id: this.host.edgeId(next),
					from,
					to
				};
				next = addEdge(next, edge);
			}
		}
		this.host.mutate(next);
		return {
			node,
			edge
		};
	}
	/** 落位记录（id 自动生成+中心对准落点——按派生尺寸折半，widget 长高节点照常
	* 居中；place 与 placeConnected 共用）。词表播种（票 59，消费者反馈 F6）：词表项声明
	* initialData 工厂则落位调用播种（工厂非裸值——每次调用产新引用；未声明/未注册
	* 型照旧 data:{}；entry.data ?? {} 外部门同款 nullish 兜底；工厂抛错透传）。 */
	record(typeId, x, y) {
		const node = {
			id: this.host.nodeId(),
			typeId,
			x,
			y,
			data: this.host.registry.lookup(typeId)?.initialData?.() ?? {}
		};
		const source = {
			registry: this.host.registry,
			subgraphs: this.host.view().subgraphs
		};
		const size = nodeSize(source, node);
		return {
			...node,
			x: x - size.width / 2,
			y: y - size.height / 2
		};
	}
};
//#endregion
//#region src/svelte/external-actions.ts
var ExternalGate = class {
	host;
	constructor(host) {
		this.host = host;
	}
	/** 变更单门（原语主名，票 29 裁 7）：无返回值以通知为准。 */
	apply(changes) {
		const root = this.host.root();
		const source = this.host.sizeSource();
		const next = applyExternalChangeSet(source, root, changes);
		this.host.rebase((state) => pruneSubgraphCascades(applyExternalChangeSet(source, state, changes, { resilient: true })));
		if (next !== root) this.host.absorb(next);
	}
	/** 整图门（糖）：进门差分走同一条执行路。 */
	applyGraph(graph) {
		this.apply(diffExternalGraph(this.host.root(), graph));
	}
};
//#endregion
//#region src/svelte/controller-wiring.ts
/** WiringHost 构造（票 56 自 controller.ts 搬入——行为零迁移）：私有成员的函数式
* 视图，装配期闭包惰性求值（成员初始化序不敏感：调用时点读当前值）。 */
function wiringHostOf(impl) {
	return {
		registry: impl.registry,
		limits: impl.limits,
		view: () => impl.graph,
		root: () => impl.root,
		selected: () => impl.loop.selectionState.selected,
		setSelection: (ids) => {
			impl.loop.selectionState = {
				selected: ids,
				gesture: { kind: "idle" }
			};
		},
		writeView: (next) => impl.writeView(next),
		mutate: (next) => impl.mutate(next),
		commit: () => impl.snapshots.commit(impl.root),
		rebase: (transform) => impl.snapshots.rebase(transform),
		absorb: (next) => impl.absorbExternal(next),
		notify: () => impl.notify(),
		sizeSource: () => impl.sizeSource(),
		onLinkEmptyDrop: () => impl.onLinkEmptyDrop,
		ids: () => impl.ids,
		locks: () => impl.loop.locks,
		viewSize: impl.viewSize
	};
}
/** 六模块装配（初始视口缺省原点单位缩放——票 10 既有语义零迁移）。 */
function wireController(initialViewport, host) {
	const loop = wireLoop(initialViewport, host);
	return {
		loop,
		keyboard: new KeyboardActions({
			view: host.view,
			selected: host.selected,
			setSelection: host.setSelection,
			mutate: host.mutate,
			notify: host.notify,
			viewport: () => loop.viewport,
			writeViewport: (next) => {
				loop.setViewportSilent(next);
				host.notify();
			},
			limits: host.limits,
			viewSize: host.viewSize
		}),
		...wireCommandModules(host, loop)
	};
}
/** 三机派发环装配（票 10 既有语义）：初始视口缺省原点单位缩放。 */
function wireLoop(initialViewport, host) {
	return new DispatchLoop(initialViewport ?? {
		scale: 1,
		offsetX: 0,
		offsetY: 0
	}, {
		registry: host.registry,
		limits: host.limits,
		view: host.view,
		writeView: host.writeView,
		commit: host.commit,
		onLinkEmptyDrop: host.onLinkEmptyDrop,
		notify: host.notify
	});
}
/** 落位/排布/子图/剪贴板/外部门五模块装配（锁单贯入落位与子图两命令面——票 36；
* 校验单贯入落位命令面——票 51，读派发环旁边位[装配期已持 loop，不扩 host 缝]）。 */
function wireCommandModules(host, loop) {
	const root = host.root;
	const selected = host.selected;
	return {
		placement: new Placement({
			registry: host.registry,
			view: host.view,
			locks: host.locks,
			rules: () => loop.rules,
			nodeId: () => host.ids().node(root()),
			edgeId: (graph) => host.ids().edge(root(), graph),
			mutate: host.mutate
		}),
		layout: new LayoutCommands({
			view: host.view,
			source: host.sizeSource,
			selected,
			nextGroupId: (g) => host.ids().group(root(), g),
			mutate: host.mutate
		}),
		subgraph: wireSubgraph(host, root, selected),
		pasteboard: wirePasteboard(host, root, selected),
		external: new ExternalGate({
			root,
			sizeSource: host.sizeSource,
			rebase: host.rebase,
			absorb: host.absorb
		})
	};
}
/** 命令面装配（票 36 自 controller 搬入守行数红线——行为零迁移）：内建执行体=
* 门面方法闭包（Delete/Escape=机内键别名重派发，语义单源在内核交互机）+键盘面
* 三族（票 50——KeyboardActions 模块注入，遍历/nudge/缩放）。 */
function wireCommands(facade, keyboard) {
	return new CommandActions({
		undo: () => facade.undo(),
		redo: () => facade.redo(),
		copySelection: () => facade.copySelection(),
		paste: (text) => facade.paste(text),
		dispatchKey: (key) => facade.dispatchInput({
			type: "key-down",
			key,
			modifiers: []
		}),
		toggleGroupSelection: () => facade.toggleGroupSelection(),
		convertSelectionToSubgraph: () => facade.convertSelectionToSubgraph(),
		autoLayout: () => facade.autoLayout(),
		selectAdjacent: (step) => keyboard.selectAdjacent(step),
		nudgeSelection: (dx, dy) => keyboard.nudgeSelection(dx, dy),
		zoomBy: (factor) => keyboard.zoomBy(factor)
	});
}
/** 子图转换模块装配（取号惰性——拒绝路不烧号；锁单贯入票 36 转换拦）。 */
function wireSubgraph(host, root, selected) {
	return new SubgraphCommands({
		view: host.view,
		source: host.sizeSource,
		selected,
		locks: host.locks,
		allocSubgraph: () => subgraphAllocOf(host.ids().subgraph(root())),
		allocNode: () => host.ids().node(root()),
		allocEdge: () => host.ids().edge(root())
	});
}
/** 剪贴板状态对装配（粘贴后新集即选区）。 */
function wirePasteboard(host, root, selected) {
	return new Pasteboard({
		view: host.view,
		root,
		selected,
		setSelection: host.setSelection,
		allocNode: (g) => host.ids().node(root(), g),
		allocEdge: (g) => host.ids().edge(root(), g),
		mutate: host.mutate
	});
}
//#endregion
//#region src/svelte/view-size.ts
function createViewSizeSlot() {
	let size;
	const listeners = /* @__PURE__ */ new Set();
	return {
		set(next) {
			if (next === void 0 && size === void 0 || next !== void 0 && size !== void 0 && size.width === next.width && size.height === next.height) return;
			size = next === void 0 ? void 0 : {
				width: next.width,
				height: next.height
			};
			for (const listener of [...listeners]) listener();
		},
		get() {
			return size;
		},
		subscribe(listener) {
			listeners.add(listener);
			listener();
			return () => listeners.delete(listener);
		}
	};
}
/** CanvasView 侧发布接线：挂载即量自身容器（clientWidth/Height——fitView 同款读数）
* 写旁挂缓存；resize 经 ResizeObserver 随动重发（jsdom 无实现，容错跳过——挂载期
* 一次发布已足）；**兜底复量**：槽空或 0×0（布局晚到的嵌入环境——无头工具视口
* 实测 RO 零投递）时随 controller 通知复量（下次交互即对，票 12 已知边界同款降
* 级级；槽已有实际尺寸则零 DOM 读零成本）；卸载清空（未挂 CanvasView 时 Minimap
* 缺省回退不炸）。返回清理面。 */
function attachViewSizePublish(controller, el) {
	if (el === void 0) return () => {};
	const publish = () => {
		controller.viewSize.set({
			width: el.clientWidth,
			height: el.clientHeight
		});
	};
	publish();
	const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(publish);
	observer?.observe(el);
	const off = controller.subscribe(() => {
		const cur = controller.viewSize.get();
		if (cur === void 0 || cur.width === 0 && cur.height === 0) publish();
	});
	return () => {
		off();
		observer?.disconnect();
		controller.viewSize.set(void 0);
	};
}
//#endregion
//#region src/svelte/edge-jump.ts
/** 共享锚点邻域（世界 px——票内小裁：3× 端口点半径 4；同锚扇出退化交叉排除面）。 */
var ANCHOR_EPSILON = 12;
/** bezier 检测折线采样密度（shapePolyline 缺省 12 同步——段 index↔参数映射面）。 */
var BEZIER_SAMPLES = 12;
/** 全边交叉裁定（票 53 主检测）：返回 边 id → 沿程排序去重的跳段表（无跳边不设键）。
* 两两包围盒预筛 O(E²)，重叠对才做逐段精确线段测试；平行/共线不交（重叠不画弧）。 */
function detectEdgeJumps(edges) {
	const cuts = /* @__PURE__ */ new Map();
	if (edges.length < 2) return cuts;
	const prepared = edges.map((input) => {
		const polyline = detectionPolyline(input.waypoints, input.shape);
		return {
			input,
			polyline,
			box: boxOf(polyline)
		};
	});
	for (let i = 0; i < prepared.length; i++) for (let j = i + 1; j < prepared.length; j++) collectPairCuts(prepared[i], prepared[j], cuts);
	for (const [id, list] of cuts) {
		list.sort((p, q) => p.segment - q.segment || p.t - q.t);
		const deduped = list.filter((cut, i) => i === 0 || dist$2(list[i - 1].point, cut.point) >= 1);
		if (deduped.length === 0) cuts.delete(id);
		else cuts.set(id, deduped);
	}
	return cuts;
}
/** 检测折线：shapePolyline 逐段展开去共享端点——直/折线族=发射顶点同列（段 index
* 直通发射器）；bezier=每段 12 弦（段 index→参数=floor(k/12) 映射）。 */
function detectionPolyline(waypoints, shape) {
	const pts = [];
	for (let i = 0; i + 1 < waypoints.length; i++) {
		const seg = shapePolyline(waypoints[i], waypoints[i + 1], shape, BEZIER_SAMPLES);
		pts.push(...pts.length === 0 ? seg : seg.slice(1));
	}
	return pts;
}
function boxOf(pts) {
	const box = {
		minX: Infinity,
		minY: Infinity,
		maxX: -Infinity,
		maxY: -Infinity
	};
	for (const p of pts) {
		box.minX = Math.min(box.minX, p.x);
		box.minY = Math.min(box.minY, p.y);
		box.maxX = Math.max(box.maxX, p.x);
		box.maxY = Math.max(box.maxY, p.y);
	}
	return box;
}
/** 闭域重叠（真 X 恒有内部重叠；贴边相切=退化不进线段测试）。 */
function boxesOverlap(a, b) {
	return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}
function dist$2(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
/** 精确线段相交（denom≈0 平行/共线=无交；端点相接 t/u∈[0,1] 闭域算交）。 */
function segmentCross(p1, p2, p3, p4) {
	const d1x = p2.x - p1.x;
	const d1y = p2.y - p1.y;
	const d2x = p4.x - p3.x;
	const d2y = p4.y - p3.y;
	const denom = d1x * d2y - d1y * d2x;
	if (Math.abs(denom) < 1e-9) return void 0;
	const ex = p3.x - p1.x;
	const ey = p3.y - p1.y;
	const t = (ex * d2y - ey * d2x) / denom;
	const u = (ex * d1y - ey * d1x) / denom;
	if (t < 0 || t > 1 || u < 0 || u > 1) return void 0;
	return {
		point: {
			x: p1.x + t * d1x,
			y: p1.y + t * d1y
		},
		t,
		u
	};
}
/** 两折线端点对中相近者（世界 epsilon 内=共享锚候选——同端口扇出/近距端口）。 */
function sharedAnchors(a, b) {
	const anchors = [];
	for (const p of [a[0], a[a.length - 1]]) for (const q of [b[0], b[b.length - 1]]) if (dist$2(p, q) < ANCHOR_EPSILON) anchors.push(p);
	return anchors;
}
function nearAnchor(anchors, at) {
	return anchors.some((s) => dist$2(s, at) < ANCHOR_EPSILON);
}
/** 单对边裁定：预筛→逐段测试→同锚排除→记在跳边（id 字典序大者）名下——
* jumper/grounded 定序后交叉参数恒取跳边侧（cutOn 单形）。 */
function collectPairCuts(a, b, cuts) {
	if (!boxesOverlap(a.box, b.box)) return;
	const [jumper, grounded] = a.input.id > b.input.id ? [a, b] : [b, a];
	const own = cuts.get(jumper.input.id) ?? [];
	cuts.set(jumper.input.id, own);
	const anchors = sharedAnchors(a.polyline, b.polyline);
	for (let si = 0; si + 1 < jumper.polyline.length; si++) for (let sj = 0; sj + 1 < grounded.polyline.length; sj++) {
		const cross = segmentCross(jumper.polyline[si], jumper.polyline[si + 1], grounded.polyline[sj], grounded.polyline[sj + 1]);
		if (cross === void 0 || nearAnchor(anchors, cross.point)) continue;
		own.push(cutOn(jumper.polyline, si, cross.t, cross.point));
	}
}
/** 跳边侧的跳段规格（段方向=行进单位向量）。 */
function cutOn(polyline, segment, t, point) {
	const from = polyline[segment];
	const to = polyline[segment + 1];
	const len = dist$2(from, to);
	return {
		point,
		direction: len === 0 ? {
			x: 1,
			y: 0
		} : {
			x: (to.x - from.x) / len,
			y: (to.y - from.y) / len
		},
		segment,
		t
	};
}
//#endregion
//#region src/svelte/edge-jump-path.ts
/** 带跳段的边路径 d 串：四型各自重建。cuts 出自 detectEdgeJumps 的同边表项。 */
function jumpEdgePathD(waypoints, shape, radii, cuts) {
	if (shape === "bezier") return bezierJumpD(waypoints, radii.jump, cuts);
	const verts = detectionPolyline(waypoints, shape);
	return shape === "smoothstep" ? roundedJumpD(verts, cuts, radii.corner, radii.jump) : polylineJumpD(verts, cuts, radii.jump);
}
/** cuts 按折线段分组（段内按 t 升序——沿程插弧序）。 */
function cutsBySegment(cuts) {
	const map = /* @__PURE__ */ new Map();
	for (const cut of cuts) {
		const list = map.get(cut.segment) ?? [];
		list.push(cut);
		map.set(cut.segment, list);
	}
	for (const list of map.values()) list.sort((a, b) => a.t - b.t);
	return map;
}
/** 腿上弧串：按序插半圆弧（钳 cursor/limit 防溢段端与弧叠）；半腿 <0.5 的退化
* 不产弧（顶点零距交叉）。 */
function legArcs(cuts, cursor, limit, jumpRadius) {
	let d = "";
	for (const cut of cuts) {
		const half = Math.min(jumpRadius, dist$1(cut.point, cursor), dist$1(cut.point, limit));
		if (half < .5) continue;
		d += arcD(cut, half);
		cursor = {
			x: cut.point.x + half * cut.direction.x,
			y: cut.point.y + half * cut.direction.y
		};
	}
	return d;
}
/** 单跳段命令流：L 弧起点 + 恰半圆 A（rx=半腿长、sweep=1 凸行进方向左侧）。 */
function arcD(cut, half) {
	const a = {
		x: cut.point.x - half * cut.direction.x,
		y: cut.point.y - half * cut.direction.y
	};
	const b = {
		x: cut.point.x + half * cut.direction.x,
		y: cut.point.y + half * cut.direction.y
	};
	return ` L ${a.x} ${a.y} A ${half} ${half} 0 0 1 ${b.x} ${b.y}`;
}
/** straight/step：顶点直落（与 edgePathD radius=0 形逐字同构）+腿上切弧。 */
function polylineJumpD(verts, cuts, jumpRadius) {
	const bySegment = cutsBySegment(cuts);
	let d = `M ${verts[0].x} ${verts[0].y}`;
	for (let i = 0; i + 1 < verts.length; i++) {
		d += legArcs(bySegment.get(i) ?? [], verts[i], verts[i + 1], jumpRadius);
		d += ` L ${verts[i + 1].x} ${verts[i + 1].y}`;
	}
	return d;
}
/** smoothstep：内顶点 Q 切角保留（切入/切出钳半腿长——roundedPathD 同式）+腿上
* 插弧；弧与切角相邻的极窄腿=退化观感记档（钳制保不溢）。 */
function roundedJumpD(verts, cuts, cornerRadius, jumpRadius) {
	const bySegment = cutsBySegment(cuts);
	let d = `M ${verts[0].x} ${verts[0].y}`;
	let cursor = verts[0];
	for (let i = 0; i + 1 < verts.length; i++) {
		const to = verts[i + 1];
		const inner = i + 2 < verts.length;
		const limit = inner ? toward$1(to, verts[i], Math.min(cornerRadius, dist$1(verts[i], to) / 2)) : to;
		d += legArcs(bySegment.get(i) ?? [], cursor, limit, jumpRadius);
		d += ` L ${limit.x} ${limit.y}`;
		if (inner) {
			const out = toward$1(to, verts[i + 2], Math.min(cornerRadius, dist$1(to, verts[i + 2]) / 2));
			d += ` Q ${to.x} ${to.y}, ${out.x} ${out.y}`;
			cursor = out;
		} else cursor = limit;
	}
	return d;
}
function dist$1(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
/** 自 from 朝 to 行进 length 的点（零段=from 原样——roundedPathD 同式私有副本）。 */
function toward$1(from, to, length) {
	const len = dist$1(from, to);
	if (len === 0) return {
		x: from.x,
		y: from.y
	};
	return {
		x: from.x + (to.x - from.x) / len * length,
		y: from.y + (to.y - from.y) / len * length
	};
}
/** bezier：逐 waypoint 段——无 cuts 段恒原 C 串；有 cuts 段=弧长定位切窗、de
* Casteljau 依窗劈段、切点桥接半圆弧（curve(t_a)≈A 桥接差采样量级、不可见）。 */
function bezierJumpD(waypoints, jumpRadius, cuts) {
	let d = `M ${waypoints[0].x} ${waypoints[0].y}`;
	for (let i = 0; i + 1 < waypoints.length; i++) {
		const a = waypoints[i];
		const b = waypoints[i + 1];
		const segCuts = cuts.filter((c) => Math.floor(c.segment / 12) === i);
		d += segCuts.length === 0 ? bezierPlainD(a, b) : bezierCutD(a, b, segCuts, jumpRadius);
	}
	return d;
}
function bezierPlainD(a, b) {
	const [c1, c2] = linkControlPoints(a, b);
	return ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
}
/** 弧长表（折线累积长）。 */
function cumulativeLengths(poly) {
	const lens = [0];
	for (let i = 1; i < poly.length; i++) lens.push(lens[i - 1] + dist$1(poly[i - 1], poly[i]));
	return lens;
}
/** 点到折线最近投影的弧长（交叉点回读定位）。 */
function arcLengthAt(poly, lens, at) {
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i + 1 < poly.length; i++) {
		const proj = projectOnChord(at, poly[i], poly[i + 1]);
		const dd = dist$1(at, proj);
		if (dd < bestDist) {
			bestDist = dd;
			best = lens[i] + dist$1(poly[i], proj);
		}
	}
	return best;
}
function projectOnChord(at, p, q) {
	const dx = q.x - p.x;
	const dy = q.y - p.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return {
		x: p.x,
		y: p.y
	};
	const t = Math.max(0, Math.min(1, ((at.x - p.x) * dx + (at.y - p.y) * dy) / len2));
	return {
		x: p.x + t * dx,
		y: p.y + t * dy
	};
}
/** 弧长→bezier 参数（折线累积长线性回读）。 */
function paramAtLength(lens, target) {
	const clamped = Math.max(0, Math.min(target, lens[lens.length - 1]));
	for (let i = 1; i < lens.length; i++) if (lens[i] >= clamped) {
		const segLen = lens[i] - lens[i - 1];
		const frac = segLen === 0 ? 0 : (clamped - lens[i - 1]) / segLen;
		return (i - 1 + frac) / 12;
	}
	return 1;
}
/** 有 cuts 的 bezier 段发射：切窗（弧长定位、钳段端与窗叠）→依序劈段→桥接弧。 */
function bezierCutD(a, b, cuts, jumpRadius) {
	const [cp1, cp2] = linkControlPoints(a, b);
	const curve = [
		a,
		cp1,
		cp2,
		b
	];
	const poly = shapePolyline(a, b, "bezier", 12);
	const lens = cumulativeLengths(poly);
	const total = lens[lens.length - 1];
	const hits = cuts.map((cut) => ({
		cut,
		s: arcLengthAt(poly, lens, cut.point)
	})).sort((p, q) => p.s - q.s).filter((hit) => Math.min(jumpRadius, hit.s, total - hit.s) >= .5);
	if (hits.length === 0) return bezierPlainD(a, b);
	const spans = cutSpans(lens, hits, jumpRadius);
	const pieces = bezierSplitAt(curve, spans.flatMap((sp) => [sp.ta, sp.tb]));
	let d = cubicD(pieces[0]);
	spans.forEach((sp, i) => {
		const bridge = bezierPointAt(curve, sp.tb);
		d += `${arcD(sp.cut, sp.half)} L ${bridge.x} ${bridge.y}`;
		d += cubicD(pieces[2 * i + 2]);
	});
	return d;
}
/** 切窗参数组（弧长定位；cursor 单调钳制防窗叠）。 */
function cutSpans(lens, hits, jumpRadius) {
	let cursor = 0;
	return hits.map((hit) => {
		const half = Math.min(jumpRadius, hit.s, lens[lens.length - 1] - hit.s);
		const ta = Math.min(Math.max(paramAtLength(lens, hit.s - half), cursor), 1);
		const tb = Math.max(paramAtLength(lens, hit.s + half), Math.min(ta + 1e-6, 1));
		cursor = tb;
		return {
			cut: hit.cut,
			half,
			ta,
			tb
		};
	});
}
function cubicD(piece) {
	const [, c1, c2, end] = piece;
	return ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
/** de Casteljau 单劈（t∈[0,1]）。 */
function bezierSplit(curve, t) {
	const mix = (p, q) => ({
		x: p.x + (q.x - p.x) * t,
		y: p.y + (q.y - p.y) * t
	});
	const [p0, p1, p2, p3] = curve;
	const q0 = mix(p0, p1);
	const q1 = mix(p1, p2);
	const q2 = mix(p2, p3);
	const r0 = mix(q0, q1);
	const r1 = mix(q1, q2);
	const s = mix(r0, r1);
	return [[
		p0,
		q0,
		r0,
		s
	], [
		s,
		r1,
		q2,
		p3
	]];
}
/** 依序劈多刀（ts 升序；每刀参数重映射到余段）。 */
function bezierSplitAt(curve, ts) {
	const pieces = [];
	let rest = curve;
	let prev = 0;
	for (const raw of ts) {
		const t = Math.max(Math.min(raw, 1), 0);
		const local = prev >= 1 ? 0 : (t - prev) / (1 - prev);
		const [head, tail] = bezierSplit(rest, local);
		pieces.push(head);
		rest = tail;
		prev = Math.max(prev, t);
	}
	pieces.push(rest);
	return pieces;
}
//#endregion
//#region src/svelte/link-render.ts
/** 分段路径串（形状分派，票 52）：bezier=既有水平切线贝塞尔（逐段 C）；折线族=
* waypoints 逐段展开顶点（step/smoothstep 段插 stepCorners 中点拐点）后单条命令流。
* radius>0 且 smoothstep 时内顶点 quadratic 切角圆角（世界域半径——屏幕恒定由调用
* 方按镜头 1/scale 折算；钳半腿长防短腿过冲；共线/回折顶点切角退化为直线无害）。 */
function edgePathD(waypoints, shape = "bezier", radius = 0) {
	if (shape === "bezier") {
		let d = `M ${waypoints[0].x} ${waypoints[0].y}`;
		for (let i = 0; i + 1 < waypoints.length; i++) {
			const [c1, c2] = linkControlPoints(waypoints[i], waypoints[i + 1]);
			d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${waypoints[i + 1].x} ${waypoints[i + 1].y}`;
		}
		return d;
	}
	return roundedPathD(polylineVertices(waypoints, shape), shape === "smoothstep" ? radius : 0);
}
/** 折线族全程顶点：waypoints 逐段展开（step 段插中点拐点对）；reroute 顶点原样
* 保留（固定必经拐点——票 40 裁 4，拖到哪拐点就在哪）。 */
function polylineVertices(waypoints, shape) {
	const verts = [waypoints[0]];
	for (let i = 0; i + 1 < waypoints.length; i++) {
		const a = waypoints[i];
		const b = waypoints[i + 1];
		if (shape === "step" || shape === "smoothstep") {
			const [c1, c2] = stepCorners(a, b);
			verts.push(c1, c2);
		}
		verts.push(b);
	}
	return verts;
}
/** 折线命令流（内顶点 quadratic 切角）：M 首点→逐内顶点 L 切入点+Q 拐点+切出点
* →末点 L 收；radius=0 纯折线。切角长=min(radius, 半腿长)——短腿自适应防过冲。 */
function roundedPathD(verts, radius) {
	let d = `M ${verts[0].x} ${verts[0].y}`;
	for (let i = 1; i < verts.length - 1; i++) {
		const prev = verts[i - 1];
		const corner = verts[i];
		const next = verts[i + 1];
		if (radius <= 0) {
			d += ` L ${corner.x} ${corner.y}`;
			continue;
		}
		const pIn = toward(corner, prev, Math.min(radius, dist(prev, corner) / 2));
		const pOut = toward(corner, next, Math.min(radius, dist(corner, next) / 2));
		d += ` L ${pIn.x} ${pIn.y} Q ${corner.x} ${corner.y}, ${pOut.x} ${pOut.y}`;
	}
	const last = verts[verts.length - 1];
	return `${d} L ${last.x} ${last.y}`;
}
function dist(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
/** 自 from 朝 to 行进 length 的点（切角端点；零段=from 原样）。 */
function toward(from, to, length) {
	const len = dist(from, to);
	if (len === 0) return {
		x: from.x,
		y: from.y
	};
	return {
		x: from.x + (to.x - from.x) / len * length,
		y: from.y + (to.y - from.y) / len * length
	};
}
/** 箭头常量（票 35 owner 原型裁定）：实心三角、屏幕恒定长 11px（配 3px 不缩线宽
* ≈3.7:1）、高=长×0.55（真浏览器长短边/缩放档对比定形——载体页记档）。 */
var ARROW_LENGTH = 11;
var ARROW_HEIGHT_RATIO = .55;
/** smoothstep 圆角半径（屏幕 px——票 52 票内小裁：箭头 11px 同族的 6px，观感
* 比例经载体页实拍定档）。 */
var SMOOTHSTEP_RADIUS_PX = 6;
/** to 端实心三角箭头 d 串（票 35；票 52 朝向泛化）：尖在 to 锚、底边朝回。朝向=
* 末段进锚切向向量（kernel edgeArrowDirection 形状感知——bezier 与既有水平特例
* 恒同值含退化回落朝右；straight 任意角；step/smoothstep 末腿水平）。scale=镜头
* 缩放——屏幕恒定=世界长 11/scale 补偿（世界层 CSS 缩放会被同倍放大）；非正数
* 回落 1。 */
function arrowPathD(waypoints, scale = 1, shape = "bezier") {
	const to = waypoints[waypoints.length - 1];
	const prev = waypoints[waypoints.length - 2] ?? to;
	const u = edgeArrowDirection(prev, to, shape);
	const n = {
		x: u.y,
		y: -u.x
	};
	const length = ARROW_LENGTH / (scale > 0 ? scale : 1);
	const half = length * ARROW_HEIGHT_RATIO;
	const bx = to.x - length * u.x;
	const by = to.y - length * u.y;
	const c1 = {
		x: bx + half * n.x,
		y: by + half * n.y
	};
	const c2 = {
		x: bx - half * n.x,
		y: by - half * n.y
	};
	const [p, q] = c1.y < c2.y || c1.y === c2.y && c1.x <= c2.x ? [c1, c2] : [c2, c1];
	return `M ${to.x} ${to.y} L ${p.x} ${p.y} L ${q.x} ${q.y} Z`;
}
function linkRenderModel(source, graph, gesture, extras = {}) {
	const world = {
		...source,
		nodes: graph.nodes
	};
	const scale = extras.scale ?? 1;
	const shapes = {
		...world,
		edgeShape: extras.edgeShape
	};
	const radius = SMOOTHSTEP_RADIUS_PX / (scale > 0 ? scale : 1);
	const movedEdgeId = gesture.kind === "drag" ? gesture.movedEdgeId : void 0;
	const reroute = extras.reroute ?? { kind: "idle" };
	const { edges, reroutes } = edgeViews(world, graph, {
		movedEdgeId,
		grabKey: reroute.kind === "drag" ? `${reroute.edgeId}:${reroute.index}` : void 0,
		selected: extras.selected ?? /* @__PURE__ */ new Set(),
		scale,
		shapes,
		radii: {
			corner: radius,
			jump: extras.edgeJump === true ? 7 / (scale > 0 ? scale : 1) : 0
		},
		edgeJump: extras.edgeJump === true
	});
	return {
		edges,
		reroutes,
		preview: previewView(world, gesture, previewShape(shapes, gesture), radius),
		ports: portDotViews(world, graph)
	};
}
/** 既有边分段曲线+箭头+中继点 dots（形状分派：每边生效形状=from 侧词表>全局缺省；
* 跨线桥=可见边集一趟两两裁定——有跳段的边走 edge-jump 发射器重建 d）。 */
function edgeViews(world, graph, filters) {
	const edges = [];
	const dots = [];
	const outputTypeIds = outputTypeIdIndex(world);
	const visible = [];
	for (const edge of graph.edges) {
		if (edge.id === filters.movedEdgeId) continue;
		visible.push({
			edge,
			waypoints: edgeWaypoints(world, edge),
			shape: edgeShapeOf(filters.shapes, edge)
		});
	}
	const cuts = filters.edgeJump ? detectEdgeJumps(visible.map(({ edge, waypoints, shape }) => ({
		id: edge.id,
		waypoints,
		shape
	}))) : void 0;
	for (const { edge, waypoints, shape } of visible) {
		const edgeCuts = cuts?.get(edge.id);
		edges.push({
			id: edge.id,
			d: edgeCuts === void 0 ? edgePathD(waypoints, shape, filters.radii.corner) : jumpEdgePathD(waypoints, shape, filters.radii, edgeCuts),
			arrow: arrowPathD(waypoints, filters.scale, shape),
			highlighted: filters.selected.has(edge.from.nodeId) || filters.selected.has(edge.to.nodeId),
			typeId: outputTypeIds.get(`${edge.from.nodeId}:${edge.from.portId}`)
		});
		dots.push(...rerouteDotViews(edge, filters.grabKey));
	}
	return {
		edges,
		reroutes: dots
	};
}
/** 输出端口→词表 typeId 索引（键=`nodeId:portId`）——portPositions 单一几何源
* 顺带投影，逐节点一建避免边循环内重复展开。 */
function outputTypeIdIndex(world) {
	const index = /* @__PURE__ */ new Map();
	for (const node of world.nodes) for (const port of portPositions(world, node)) if (port.side === "output" && port.typeId !== void 0) index.set(`${node.id}:${port.portId}`, port.typeId);
	return index;
}
function rerouteDotViews(edge, grabKey) {
	return (edge.reroutes ?? []).map((point, i) => {
		const key = `${edge.id}:${i}`;
		return {
			key,
			x: point.x,
			y: point.y,
			active: key === grabKey
		};
	});
}
/** 拖线预览形状（票 52 连带）：起线端口所属节点型词表声明 > 全局缺省（同解析
* 优先级——预览与落成边同形，所见即所连）。 */
function previewShape(shapes, gesture) {
	if (gesture.kind !== "drag") return DEFAULT_EDGE_SHAPE;
	return edgeShapeOf(shapes, { from: portRefOf$1(gesture.origin) });
}
/** 拖动预览（origin 端口→指针图坐标；形状=previewShape 解析；valid=机内合法判
* 单源读数[票 51]，渲染层零重算零校验单注入——锁面/矩阵/谓词红档自然并入）。 */
function previewView(world, gesture, shape, radius) {
	if (gesture.kind !== "drag") return void 0;
	return {
		d: edgePathD([portAnchor(world, portRefOf$1(gesture.origin), gesture.origin.side), gesture.current], shape, radius),
		valid: gesture.valid
	};
}
/** 端口点（注册表驱动，逐节点展开——typeId 词表可选透传随行）。 */
function portDotViews(world, graph) {
	const ports = [];
	for (const node of graph.nodes) for (const port of portPositions(world, node)) ports.push({
		key: `${node.id}:${port.side}:${port.portId}`,
		x: port.x,
		y: port.y,
		side: port.side,
		typeId: port.typeId
	});
	return ports;
}
/** 命中面 PortRef 换算（预览固定端锚定用）。 */
function portRefOf$1(hit) {
	return {
		nodeId: hit.nodeId,
		portId: hit.portId
	};
}
//#endregion
//#region src/svelte/export-tokens.ts
var LIGHT_TOKENS = {
	canvasBg: "#f6f7f9",
	link: "#64748b",
	linkValid: "#16a34a",
	linkInvalid: "#dc2626",
	selection: "#2563eb",
	groupBorder: "#c6d0dd",
	groupBg: "rgb(100 116 139 / 6%)",
	subgraphBg: "rgb(37 99 235 / 4%)",
	subgraphFg: "#475569",
	nodeBg: "#ffffff",
	nodeBorder: "#cbd5e1",
	nodeFg: "#334155",
	nodeHeaderFg: "#334155",
	shadowColor: "#0f172a",
	shadowOpacity: .08,
	catMix: .4,
	fgMuted: "#64748b",
	port: "#64748b",
	reroute: "#64748b",
	rerouteBg: "#ffffff"
};
var DARK_TOKENS = {
	canvasBg: "#10131a",
	link: "#94a3b8",
	linkValid: "#4ade80",
	linkInvalid: "#f87171",
	selection: "#60a5fa",
	groupBorder: "#475569",
	groupBg: "rgb(148 163 184 / 5%)",
	subgraphBg: "rgb(96 165 250 / 8%)",
	subgraphFg: "#a8b3c4",
	nodeBg: "#1e293b",
	nodeBorder: "#3c4a5f",
	nodeFg: "#e2e8f0",
	nodeHeaderFg: "#e2e8f0",
	shadowColor: "#000000",
	shadowOpacity: .4,
	catMix: .3,
	fgMuted: "#94a3b8",
	port: "#94a3b8",
	reroute: "#a8b3c4",
	rerouteBg: "#334155"
};
/** 两档 token 表（测试对账面——shadow 族自 CSS 阴影串取值，见测试）。 */
function exportTokensOf(theme) {
	return theme === "dark" ? DARK_TOKENS : LIGHT_TOKENS;
}
var FOG_OPACITY = .55;
function statusStyle(tokens, status) {
	switch (status) {
		case "running": return {
			border: tokens.selection,
			badge: tokens.selection
		};
		case "done": return {
			border: tokens.linkValid,
			badge: tokens.linkValid
		};
		case "error": return {
			border: tokens.linkInvalid,
			badge: tokens.linkInvalid
		};
		case "todo": return {
			badge: tokens.fgMuted,
			hollow: true,
			fog: FOG_OPACITY
		};
		default: return {};
	}
}
//#endregion
//#region src/svelte/node-states.ts
/** 键形状守卫（票 22 typeId 先例）：属性/变量名注入面的唯一闸——不合规键整对
* 跳过不设信（不炸不漏名）。 */
var STATE_KEY = /^[A-Za-z0-9_-]+$/;
/** 进度条结构位约定键（票 28）：机械键在场检查非值解释（collapsed 不渲染端口行
* 同款）——vars.progress 在场才渲染位，fill 消费 var(--fl-state-progress)。 */
function hasProgressVar(state) {
	return state?.vars !== void 0 && "progress" in state.vars;
}
/** data 袋→节点根属性：逐键 diff（新键 set/退场键拆；不合规键跳过不进账）。 */
function transportData(el, data, prev) {
	const next = /* @__PURE__ */ new Set();
	for (const [key, value] of Object.entries(data)) {
		if (!STATE_KEY.test(key)) continue;
		el.setAttribute(`data-fl-state-${key}`, String(value));
		next.add(key);
	}
	for (const key of prev) if (!next.has(key)) el.removeAttribute(`data-fl-state-${key}`);
	return next;
}
/** vars 袋→节点根 inline 变量（同款 diff；setProperty 怪值 CSSOM 惰性拒绝）。 */
function transportVars(el, vars, prev) {
	const next = /* @__PURE__ */ new Set();
	for (const [key, value] of Object.entries(vars)) {
		if (!STATE_KEY.test(key)) continue;
		el.style.setProperty(`--fl-state-${key}`, String(value));
		next.add(key);
	}
	for (const key of prev) if (!next.has(key)) el.style.removeProperty(`--fl-state-${key}`);
	return next;
}
/** 运输 action（票 33）：袋→节点根。只落根（结构位不重复携带——宿主 CSS 后代
* 选择器命位）；update 逐键 diff（键退场即拆）；元素销毁随 DOM 走。宿主活图
* 更新姿势=替换袋对象（nodeStates[id] 换新引用）——action 参数变即重跑。 */
function nodeStateTransport(el, state) {
	let dataKeys = /* @__PURE__ */ new Set();
	let varKeys = /* @__PURE__ */ new Set();
	function apply(next) {
		dataKeys = transportData(el, next?.data ?? {}, dataKeys);
		varKeys = transportVars(el, next?.vars ?? {}, varKeys);
	}
	apply(state);
	return { update: apply };
}
//#endregion
//#region src/svelte/widgets.ts
/** 控件显示文本：undefined/null 显空串，其余 String 化（input value 域皆字符串）。 */
function widgetTextValue(value) {
	return value === void 0 || value === null ? "" : String(value);
}
/** number 控件提交解析：空串/非有限数拒绝为 undefined（调用方不写不炸、回显现值）；
* 合法值按描述约束钳制进 [min,max]（宿主词表约束在提交口生效）。 */
function parseWidgetNumber(def, raw) {
	if (raw.trim() === "") return void 0;
	const value = Number(raw);
	if (!Number.isFinite(value)) return void 0;
	let clamped = value;
	if (def.min !== void 0) clamped = Math.max(clamped, def.min);
	if (def.max !== void 0) clamped = Math.min(clamped, def.max);
	return clamped;
}
//#endregion
//#region src/svelte/export-node.ts
/** XML 转义（宿主标题/标签/值文本进 <text> 内容面）。 */
function esc(text) {
	return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
/** 坐标/尺寸数字字面量化（两位小数内——可读产物，可 grep 可 diff）。 */
function fmt(n) {
	return String(Math.round(n * 100) / 100);
}
/** 类别色染色带（票 22 tint 档的导出预混）：#hex → rgba 字面量（color-mix 的字面
* 量化）；非 hex 色值不染（宿主数据不设信——无效 color-mix 交互面回落透明的镜像）。 */
function tintFill(color, mix) {
	const hit = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color?.trim() ?? "");
	if (hit === null) return void 0;
	const hex = hit[1].length === 3 ? [...hit[1]].map((c) => c + c).join("") : hit[1];
	return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${mix})`;
}
/** 自定义 widget JSON 短文本截断帽（票内小裁「短文本」：80 字符+省略号，越界长值
* 另由节点矩形裁剪兜底）。 */
var JSON_CAP = 80;
function jsonShortText(value) {
	const json = JSON.stringify(value ?? null);
	return json.length > JSON_CAP ? `${json.slice(0, 79)}…` : json;
}
/** enum 值文本：选项名（离群值=空串——select 空显镜像）。 */
function enumText(def, value) {
	return typeof value === "string" && def.options?.includes(value) === true ? value : "";
}
/** widget 值显示文本（票 48 裁 5）：内建型按型格式化（toggle→是/否、enum→选项名、
* textarea 折行归一）；自定义型=JSON 短文本（交互面 WidgetControl 只读回退的同源
* 姿势——诚实呈现而非空缺）。 */
function widgetValueText(def, value) {
	switch (def.kind) {
		case "boolean": return value === true ? "是" : "否";
		case "enum": return enumText(def, value);
		case "textarea": return widgetTextValue(value).replace(/\s+/g, " ").trim();
		case "text":
		case "number": return widgetTextValue(value);
		default: return jsonShortText(value);
	}
}
/** 进度条宽比例：vars.progress 约定键的百分数读数（非百分形/坏值=0——CSS width 对
* 非法值零宽的机械镜像），0..1 钳制。 */
function progressRatio(state) {
	const raw = state?.vars?.progress;
	if (raw === void 0) return 0;
	const hit = /^([\d.]+)\s*%$/.exec(String(raw));
	const pct = hit === null ? NaN : Number(hit[1]);
	if (!Number.isFinite(pct)) return 0;
	return Math.min(100, Math.max(0, pct)) / 100;
}
var SUBGRAPH_TYPES = /* @__PURE__ */ new Set([
	"fl:subgraph",
	"fl:subgraph-input",
	"fl:subgraph-output"
]);
/** 标题条左 padding 10（票 22 chrome 布局）；三段形标题起点=padding+折叠钮 16+gap 4。 */
var TITLE_X = 10;
var TITLE_X_RICH = 30;
var FONT = {
	family: "system-ui, sans-serif",
	size: 13,
	mono: "ui-monospace, monospace"
};
function nodeCtxOf(input, node, tokens) {
	const state = input.nodeStates?.[node.id];
	return {
		input,
		node,
		size: nodeSize(input.source, node),
		tokens,
		status: statusStyle(tokens, state?.data?.status),
		state,
		subgraph: SUBGRAPH_TYPES.has(node.typeId),
		locked: isNodeLocked(input.locks, node)
	};
}
function nodeSvg(ctx, index) {
	const { node, size, tokens, status } = ctx;
	const fill = ctx.subgraph ? tokens.subgraphBg : tokens.nodeBg;
	const dash = ctx.subgraph ? " stroke-dasharray=\"5 3\"" : "";
	const lines = [`<g${status.fog !== void 0 ? ` opacity="${status.fog}"` : ""}>`];
	lines.push(`<rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(size.width)}" height="${fmt(size.height)}" rx="6" fill="${fill}" stroke="${status.border ?? tokens.nodeBorder}" stroke-width="1"${dash} filter="url(#fl-export-shadow)"/>`);
	lines.push(`<g clip-path="url(#fl-export-clip-${index})">`);
	lines.push(headerSvg(ctx));
	if (node.collapsed !== true) {
		lines.push(portRowsSvg(ctx));
		lines.push(widgetRowsSvg(ctx));
	}
	if (hasProgressVar(ctx.state)) lines.push(progressSvg(ctx));
	lines.push("</g></g>");
	return lines.join("\n");
}
/** 标题条：染色带（类别色 tint 预混）+chevron（三段形——折叠态右指）+标题字面。 */
function headerSvg(ctx) {
	const { node, size, tokens } = ctx;
	const lines = [];
	const band = tintFill(nodeCategoryColor(ctx.input.source, node), tokens.catMix);
	if (band !== void 0) lines.push(`<rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(size.width)}" height="${NODE_HEADER_HEIGHT}" fill="${band}"/>`);
	const cy = node.y + NODE_HEADER_HEIGHT / 2;
	const fg = ctx.subgraph ? tokens.subgraphFg : tokens.nodeHeaderFg;
	const rich = nodeWidgets(ctx.input.source, node).length > 0;
	if (rich) {
		const left = node.x + TITLE_X;
		const points = node.collapsed === true ? `${left + 6},${cy - 3} ${left},${cy + 1} ${left + 6},${cy + 5}` : `${left},${cy - 2} ${left + 5},${cy + 2} ${left + 10},${cy - 2}`;
		lines.push(`<polyline points="${points}" fill="none" stroke="${fg}" stroke-width="1.5"/>`);
	}
	const title = displayNodeTitle(ctx.input.source.registry, ctx.input.graph.subgraphs, node);
	lines.push(textSvg({
		x: node.x + (rich ? TITLE_X_RICH : TITLE_X),
		y: cy,
		size: FONT.size,
		fill: fg,
		text: esc(title),
		bold: true
	}));
	lines.push(headerMarksSvg(ctx, cy, fg));
	return lines.join("\n");
}
/** 标题条右端角标：锁角标（🔒 文本 glyph）+状态徽章（四态色点/空心圈）。 */
function headerMarksSvg(ctx, cy, fg) {
	const { node, size, status } = ctx;
	const lines = [];
	if (ctx.locked) lines.push(textSvg({
		x: node.x + size.width - 8,
		y: cy,
		size: 11,
		fill: fg,
		text: "&#128274;",
		anchor: "end"
	}));
	if (status.badge !== void 0) {
		const cx = node.x + size.width - 12.5 - (ctx.locked ? 16 : 0);
		const paint = status.hollow === true ? ` fill="none" stroke="${status.badge}" stroke-width="1.5"` : ` fill="${status.badge}"`;
		lines.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="4.5"${paint}/>`);
	}
	return lines.join("\n");
}
/** 端口标签行（行心=端口锚点同一几何源 kernel portRowPairs 配对；左入右出对排）。 */
function portRowsSvg(ctx) {
	const { node, size, tokens } = ctx;
	const lines = [];
	portRowPairs(ctx.input.source, node).forEach((row, i) => {
		const cy = node.y + NODE_HEADER_HEIGHT + i * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2;
		if (row.input !== void 0) lines.push(textSvg({
			x: node.x + 8,
			y: cy,
			size: 12,
			fill: tokens.fgMuted,
			text: esc(row.input.label)
		}));
		if (row.output !== void 0) lines.push(textSvg({
			x: node.x + size.width - 8,
			y: cy,
			size: 12,
			fill: tokens.fgMuted,
			text: esc(row.output.label),
			anchor: "end"
		}));
	});
	return lines.join("\n");
}
var BUILTIN_WIDGET_KINDS = /* @__PURE__ */ new Set([
	"text",
	"number",
	"boolean",
	"enum",
	"textarea"
]);
/** widget 行：标签（muted）+值文本（右对齐——行布局与 kernel 派生 nodeSize 同源：
* 同一份词表行数据 widgetRowHeight 驱动两侧；自定义型走 JSON 短文本=mono 面镜像）。 */
function widgetRowsSvg(ctx) {
	const { node, input, size, tokens } = ctx;
	const lines = [];
	const rows = portRowPairs(input.source, node).length;
	let top = node.y + NODE_HEADER_HEIGHT + rows * PORT_ROW_HEIGHT;
	for (const def of nodeWidgets(input.source, node)) {
		const height = widgetRowHeight(def);
		const cy = top + height / 2;
		lines.push(textSvg({
			x: node.x + 10,
			y: cy,
			size: 12,
			fill: tokens.fgMuted,
			text: esc(def.label ?? def.name)
		}));
		const value = widgetValueText(def, node.data[def.name]);
		if (value !== "") {
			const mono = !BUILTIN_WIDGET_KINDS.has(def.kind);
			lines.push(textSvg({
				x: node.x + size.width - 10,
				y: cy,
				size: mono ? 11 : FONT.size,
				fill: mono ? tokens.fgMuted : tokens.nodeFg,
				text: esc(value),
				anchor: "end",
				mono
			}));
		}
		top += height;
	}
	return lines.join("\n");
}
function textSvg(spec) {
	const attrs = `${spec.anchor !== void 0 ? ` text-anchor="${spec.anchor}"` : ""} font-family="${spec.mono === true ? FONT.mono : FONT.family}" font-size="${spec.size}"${spec.bold === true ? " font-weight=\"600\"" : ""} fill="${spec.fill}"`;
	return `<text x="${fmt(spec.x)}" y="${fmt(spec.y)}" dominant-baseline="central"${attrs}>${spec.text}</text>`;
}
/** 底缘进度条（票 33 结构位的导出侧：4px 高、fill=选区色、宽=vars.progress 百分数）。 */
function progressSvg(ctx) {
	const { node, size, tokens } = ctx;
	const width = size.width * progressRatio(ctx.state);
	return `<rect x="${fmt(node.x)}" y="${fmt(node.y + size.height - 4)}" width="${fmt(width)}" height="4" fill="${tokens.selection}"/>`;
}
/** 节点矩形裁剪域（文本溢出的免测量截断——行级省略号的节点矩形级近似，票内小裁）。 */
function clipDef(input, node, index) {
	const size = nodeSize(input.source, node);
	return `<clipPath id="fl-export-clip-${index}"><rect x="${fmt(node.x)}" y="${fmt(node.y)}" width="${fmt(size.width)}" height="${fmt(size.height)}" rx="6"/></clipPath>`;
}
//#endregion
//#region src/svelte/export-image.ts
/** 主入口：整图自包含 SVG（层序镜像交互面：组框→边/箭头→端口点→中继点→节点；
* 域=exportBounds[节点∪组框∪中继点+margin]；空图=margin 盒空白图恒可用）。 */
function buildExportSvg(input) {
	const tokens = exportTokensOf(input.theme);
	const bounds = exportBounds(input.source, input.graph);
	const width = bounds.maxX - bounds.minX;
	const height = bounds.maxY - bounds.minY;
	const links = linkRenderModel(input.source, input.graph, { kind: "idle" }, {
		scale: 1,
		edgeShape: input.edgeShape
	});
	const out = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
		"<defs>",
		`<filter id="fl-export-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="${tokens.shadowColor}" flood-opacity="${tokens.shadowOpacity}"/></filter>`,
		...input.graph.nodes.map((node, i) => clipDef(input, node, i)),
		"</defs>"
	];
	if (input.background !== "transparent") out.push(`<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="${input.background ?? tokens.canvasBg}"/>`);
	out.push(`<g transform="translate(${fmt(-bounds.minX)} ${fmt(-bounds.minY)})">`);
	out.push(...groupSvgs(input.graph, tokens));
	out.push(...edgeSvgs(links.edges, tokens));
	out.push(...dotSvgs(links, tokens));
	input.graph.nodes.forEach((node, i) => out.push(nodeSvg(nodeCtxOf(input, node, tokens), i)));
	out.push("</g></svg>");
	return {
		svg: out.join("\n"),
		width,
		height
	};
}
function groupSvgs(graph, tokens) {
	return graph.groups.map((group) => `<rect x="${fmt(group.x)}" y="${fmt(group.y)}" width="${fmt(group.width)}" height="${fmt(group.height)}" rx="8" fill="${tokens.groupBg}" stroke="${tokens.groupBorder}" stroke-width="1"/>`);
}
function edgeSvgs(edges, tokens) {
	const out = [];
	for (const edge of edges) {
		out.push(`<path d="${edge.d}" fill="none" stroke="${tokens.link}" stroke-width="3"/>`);
		out.push(`<path d="${edge.arrow}" fill="${tokens.link}"/>`);
	}
	return out;
}
/** 端口点+中继点 dots（交互面 CanvasLinks 层序镜像：端口在中继点之下）。 */
function dotSvgs(links, tokens) {
	const out = links.ports.map((dot) => `<circle cx="${fmt(dot.x)}" cy="${fmt(dot.y)}" r="4" fill="${tokens.port}" stroke="${tokens.canvasBg}" stroke-width="1"/>`);
	out.push(...links.reroutes.map((dot) => `<circle cx="${fmt(dot.x)}" cy="${fmt(dot.y)}" r="4" fill="${tokens.rerouteBg}" stroke="${tokens.reroute}" stroke-width="2"/>`));
	return out;
}
//#endregion
//#region src/svelte/export-actions.ts
function createExportEnvSlot() {
	let theme;
	let states;
	return {
		setTheme(next) {
			theme = next;
		},
		getTheme: () => theme,
		setStates(next) {
			states = next;
		},
		getStates: () => states
	};
}
var ExportActions = class {
	host;
	constructor(host) {
		this.host = host;
	}
	svg(options) {
		return buildExportSvg(this.inputOf(options)).svg;
	}
	png(options) {
		const { svg, width, height } = buildExportSvg(this.inputOf(options));
		return rasterizePng(svg, width, height, options?.pixelRatio ?? 1);
	}
	/** 主题解析单点：显式 options.theme > 旁挂槽 > 'light'（显式恒覆盖）。 */
	inputOf(options) {
		const view = this.host.view();
		return {
			source: {
				registry: this.host.registry,
				subgraphs: view.subgraphs
			},
			graph: view,
			theme: options?.theme ?? this.host.env.getTheme() ?? "light",
			background: options?.background,
			locks: this.host.locks(),
			edgeShape: this.host.edgeShape(),
			nodeStates: this.host.env.getStates()
		};
	}
};
/** 光栅化四步（票 48 裁 2）：fail-loud 单点——headless（无 document）与 jsdom（无
* canvas 实现，getContext null）皆同步拒绝，消息面指路 exportSVG。 */
function rasterizePng(svg, width, height, pixelRatio) {
	if (typeof document === "undefined") return Promise.reject(new Error(PNG_HEADLESS_MSG));
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (ctx === null) return Promise.reject(new Error(PNG_HEADLESS_MSG));
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
	const img = new Image();
	const loaded = new Promise((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(/* @__PURE__ */ new Error("flowloom: exportPNG 光栅化失败——SVG 载入即拒（产物串见 exportSVG 排查）"));
		img.src = url;
	});
	return (async () => {
		try {
			await loaded;
			canvas.width = Math.max(1, Math.round(width * pixelRatio));
			canvas.height = Math.max(1, Math.round(height * pixelRatio));
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			return await new Promise((resolve, reject) => {
				canvas.toBlob((blob) => {
					if (blob === null) reject(new Error(PNG_HEADLESS_MSG));
					else resolve(blob);
				}, "image/png");
			});
		} finally {
			URL.revokeObjectURL(url);
		}
	})();
}
var PNG_HEADLESS_MSG = "flowloom: exportPNG 需要 DOM 光栅化环境（Blob URL/Image/canvas）——headless 下不可用；改用 exportSVG（headless 全可用）或在浏览器环境调用";
/** CanvasView 侧导出环境发布接线（票 56）：nodeStates props 透传+挂载读
* documentElement 的 data-fl-theme（absent→matchMedia prefers-color-scheme——镜像
* tokens.css 三段级联：显式属性>系统偏好>light；无 matchMedia 环境[jsdom] 回落
* light）。已知边界：主题读取在发布时点（挂载+nodeStates 变更触发的重发布顺带重读
* ——幂等）——宿主后翻属性不保证随动（导出时显式传 theme 恒可用）；卸载清空（回退
* light/无状态袋）。props 在 effect 内读取——袋替换即重发布。 */
function attachExportEnvPublish(controller, nodeStates) {
	controller.exportEnv.setStates(nodeStates);
	controller.exportEnv.setTheme(readDocumentTheme());
	return () => {
		controller.exportEnv.setStates(void 0);
		controller.exportEnv.setTheme(void 0);
	};
}
function readDocumentTheme() {
	if (typeof document === "undefined") return void 0;
	const attr = document.documentElement.getAttribute("data-fl-theme");
	if (attr === "dark" || attr === "light") return attr;
	if (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
	return "light";
}
//#endregion
//#region src/svelte/subgraph-navigation.ts
/** 子图导航核心（票 10）：导航路径+回溯栈+视口 LRU 记忆的状态面——controller 的
* 状态副手（无 DOM，node 环境可单测）。织入口径：导航=视口域关注点（不入 undo——
* 快照只收图编辑）；离开容器即 remember 当前镜头、进入容器先 recall（LRU touch），
* 无记忆且调用方给了容器尺寸则对目标容器节点适配兜底（fitView 放大封顶 1）。
* 路径合法性由 clampNavPath 单点守（kernel）——undo/restore 后由 controller 调
* clamp() 静默钳制（不入回溯栈）。 */
/** 容器的镜头记忆键（根=''/子图=其 id）。 */
function containerKey(path) {
	return path.length === 0 ? "" : path[path.length - 1];
}
var SubgraphNavigation = class {
	host;
	path = [];
	backStack = [];
	memory = createViewportMemory();
	constructor(host) {
		this.host = host;
	}
	get current() {
		return this.path;
	}
	canBack() {
		return this.backStack.length > 0;
	}
	/** 进入当前容器内的子图占位（失活段被钳制=无效果 false）。 */
	enter(id, fitSize) {
		return this.go([...this.path, id], fitSize);
	}
	/** 退到父容器（根上 false）。 */
	exit(fitSize) {
		return this.go(this.path.slice(0, -1), fitSize);
	}
	/** 面包屑/宿主跳转：自根子图 id 链（失活段自动钳制——钳后与现路径同则 no-op）。 */
	navigateTo(target, fitSize) {
		return this.go(target, fitSize);
	}
	/** 导航栈回溯一步（弹栈即走——不再入栈）。死栈项弹掉弃置：栈不随 undo 清理，
	* 项内子图可能已被 undo 消灭——弹出目标先钳制，钳后与现路径重合即丢弃该步
	* 续弹（回溯永不抛、永不落到死段）。 */
	back() {
		while (this.backStack.length > 0) {
			const target = this.backStack.pop();
			const next = clampNavPath(this.host.root(), target);
			if (samePath(next, this.path)) continue;
			this.apply(next);
			return true;
		}
		return false;
	}
	/** undo/restore 后的路径钳制（静默——不入回溯栈）。返回是否发生了钳制。 */
	clamp() {
		const alive = clampNavPath(this.host.root(), this.path);
		if (alive.length === this.path.length) return false;
		this.path = alive;
		return true;
	}
	go(target, fitSize) {
		const next = clampNavPath(this.host.root(), target);
		if (samePath(next, this.path)) return false;
		this.backStack.push(this.path);
		this.apply(next, fitSize);
		return true;
	}
	/** 落位一条已验证路径：离开记忆+进入复原/适配。 */
	apply(path, fitSize) {
		this.memory.remember(containerKey(this.path), this.host.viewport());
		this.path = [...path];
		const recalled = this.memory.recall(containerKey(this.path));
		if (recalled !== void 0) this.host.setViewport(recalled);
		else if (fitSize !== void 0) {
			const fitted = fitView(this.host.source(), containerViewAt(this.host.root(), this.path).nodes, {
				width: fitSize.width,
				height: fitSize.height
			});
			if (fitted !== void 0) this.host.setViewport(fitted);
		}
	}
};
function samePath(a, b) {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}
/** 面包屑数据（票 25 自 controller 下沉——导航域纯函数）：[根]+路径各段 {id,name}
* （根段 id=''/name=''——显示名归宿主渲染层；段名=记录名兜底 id）。 */
function breadcrumbOf(root, path) {
	return [{
		id: "",
		name: ""
	}, ...path.map((id) => ({
		id,
		name: subgraphById(root, id)?.name ?? id
	}))];
}
//#endregion
//#region src/svelte/controller.ts
var CanvasControllerImpl = class {
	registry;
	/** 根态（快照/序列化/记录集持有面）。装配面公开（ControllerInternals 内部缝——类不出模块）。 */
	root;
	/** 当前容器视图缓存（交互面——getState/交互机/命令的镜头）。 */
	graph;
	limits;
	snapshots;
	listeners = /* @__PURE__ */ new Set();
	/** 节点/边/组/子图四类 id 取号单点（计数器住门面——kernel 只持纯函数，见 ids.ts）。 */
	ids = createGraphIdSource();
	/** 子图导航状态面（路径+回溯栈+视口 LRU——视口域不入 undo）。 */
	nav;
	/** 落位/排布与分组/子图转换/外部摄入命令面——placement/layout-actions/subgraph-actions/external-actions。 */
	placement;
	layout;
	subgraph;
	external;
	/** 票 14 起命令注册制面（命令表+绑定表+内建命令执行体——command-actions.ts）。 */
	commands;
	viewSize = createViewSizeSlot();
	/** 三机派发环（视口机+连线机+选区机状态与 dispatchInput 织入——dispatch-loop.ts）。 */
	loop;
	/** 票 05 粘贴状态对（票 21 起 Pasteboard 承载——clipboard.ts）。 */
	pasteboard;
	/** 导出面（票 56）：exportSVG/exportPNG 实现体+导出环境旁挂槽（export-actions.ts）。 */
	exportEnv = createExportEnvSlot();
	exports;
	onLinkEmptyDrop;
	onNodeDoubleClick;
	constructor(options) {
		this.registry = options.registry;
		const initial = options.initialGraph;
		this.root = initial === void 0 ? createGraph() : {
			...initial,
			subgraphs: initial.subgraphs ?? []
		};
		this.limits = options.viewportLimits ?? DEFAULT_VIEWPORT_LIMITS;
		this.nav = new SubgraphNavigation({
			root: () => this.root,
			viewport: () => this.loop.viewport,
			setViewport: (viewport) => this.loop.setViewportSilent(viewport),
			source: () => this.sizeSource()
		});
		const wired = wireController(options.initialViewport, wiringHostOf(this));
		this.loop = wired.loop;
		this.placement = wired.placement;
		this.layout = wired.layout;
		this.subgraph = wired.subgraph;
		this.pasteboard = wired.pasteboard;
		this.external = wired.external;
		this.graph = containerViewAt(this.root, []);
		this.snapshots = createSnapshotStore(this.root, options.undoLimit ?? 100);
		this.commands = wireCommands(this, wired.keyboard);
		this.exports = new ExportActions(this.exportHost());
	}
	exportHost() {
		return {
			registry: this.registry,
			view: () => this.graph,
			locks: () => this.loop.locks,
			edgeShape: () => this.loop.edgeShape,
			env: this.exportEnv
		};
	}
	getState() {
		return this.graph;
	}
	getViewport() {
		return this.loop.viewport;
	}
	getViewportMachineState() {
		return this.loop.machineState;
	}
	getSelectionState() {
		return this.loop.selectionState;
	}
	getSelectedNodes() {
		return selectedNodes(this.graph, this.loop.selectionState.selected);
	}
	getLinkState() {
		return this.loop.linkState;
	}
	getRerouteState() {
		return this.loop.rerouteState;
	}
	getNavPath() {
		return this.nav.current;
	}
	getBreadcrumb() {
		return breadcrumbOf(this.root, this.nav.current);
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	applyExternal(changes) {
		this.external.apply(changes);
	}
	applyExternalGraph(graph) {
		this.external.applyGraph(graph);
	}
	/** 别名（票 58）：applyGraph ≡ applyExternalGraph——语义见 controller-types 同名 JSDoc。 */
	applyGraph = (graph) => this.applyExternalGraph(graph);
	addNode(node) {
		this.mutate(addNode(this.graph, node));
	}
	placeNode(typeId, x, y) {
		return this.placement.place(typeId, x, y);
	}
	placeNodeConnected(typeId, x, y, origin) {
		return this.placement.placeConnected(typeId, x, y, origin);
	}
	removeNode(nodeId) {
		this.mutate(removeNode(this.graph, nodeId));
	}
	addEdge(edge) {
		this.mutate(addEdge(this.graph, edge));
	}
	moveNode(nodeId, x, y) {
		this.mutate(moveNode(this.graph, nodeId, x, y));
	}
	setNodeData(nodeId, patch) {
		const next = updateNodeData(this.graph, nodeId, patch);
		if (next === this.graph) return;
		this.mutate(next);
	}
	toggleNodeCollapsed(nodeId) {
		const next = toggleNodeCollapse(this.graph, nodeId);
		if (next === this.graph) return false;
		this.mutate(next);
		return true;
	}
	copySelection() {
		return this.pasteboard.copy();
	}
	paste(text) {
		return this.pasteboard.paste(text);
	}
	toggleGroupSelection() {
		return this.layout.toggleGroup();
	}
	fitGroupsToContents() {
		return this.layout.fitGroups();
	}
	alignSelection(axis) {
		return this.layout.align(axis);
	}
	distributeSelection(axis) {
		return this.layout.distribute(axis);
	}
	autoLayout(options) {
		return this.layout.autoLayout(options);
	}
	autoLayoutSelection(options) {
		return this.layout.autoLayoutSelection(options);
	}
	convertSelectionToSubgraph() {
		const plan = this.subgraph.plan();
		if (plan === void 0) return false;
		const written = withContainer(this.root, this.nav.current, plan.container);
		this.root = pruneSubgraphCascades({
			...written,
			subgraphs: [...written.subgraphs, plan.subgraph]
		});
		this.refreshView();
		this.loop.selectionState = {
			selected: /* @__PURE__ */ new Set([plan.subgraph.id]),
			gesture: { kind: "idle" }
		};
		this.snapshots.commit(this.root);
		this.notify();
		return true;
	}
	enterSubgraph(id, fitSize) {
		return this.navigate(() => this.nav.enter(id, fitSize));
	}
	exitSubgraph(fitSize) {
		return this.navigate(() => this.nav.exit(fitSize));
	}
	navigateTo(path, fitSize) {
		return this.navigate(() => this.nav.navigateTo(path, fitSize));
	}
	navigateBack() {
		return this.navigate(() => this.nav.back());
	}
	/** 导航后收口：视图重取+选区跨容器修剪+一次订阅通知（导航本身零快照）。 */
	navigate(attempt) {
		if (!attempt()) return false;
		this.refreshView();
		this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
		this.notify();
		return true;
	}
	setViewport(viewport) {
		this.loop.setViewportSilent(viewport);
		this.notify();
	}
	fitView(width, height, margin = FIT_VIEW_MARGIN) {
		const next = fitView(this.sizeSource(), this.graph.nodes, {
			width,
			height
		}, {
			margin,
			limits: this.limits
		});
		if (next === void 0) return false;
		this.setViewport(next);
		return true;
	}
	dispatchInput(event) {
		this.loop.dispatch(event);
	}
	setNodeLocks(locks) {
		this.loop.setLocks(locks);
	}
	setConnectionRules(rules) {
		this.loop.setRules(rules);
	}
	setEdgeShape(shape) {
		this.loop.setEdgeShape(shape);
	}
	getContextMenuState() {
		return this.loop.contextMenu;
	}
	closeContextMenu() {
		this.loop.closeContextMenu();
	}
	canUndo() {
		return this.snapshots.canUndo();
	}
	canRedo() {
		return this.snapshots.canRedo();
	}
	undo() {
		return this.restore(this.snapshots.undo());
	}
	redo() {
		return this.restore(this.snapshots.redo());
	}
	toUiFormat() {
		return toUiFormat(this.root, this.loop.viewport);
	}
	exportSVG(options) {
		return this.exports.svg(options);
	}
	exportPNG(options) {
		return this.exports.png(options);
	}
	/** 命令式变更收口（票 01-10 各命令路）：容器写回+级联 prune+视图重取+选区修剪+恰一张快照+通知。 */
	mutate(next) {
		this.writeView(next);
		this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
		this.snapshots.commit(this.root);
		this.notify();
	}
	/** 外部摄入收口（票 34）：写根态+级联 prune+视图重取+选区修剪+通知——恒零快照（栈再锚归 ExternalGate 先行）。 */
	absorbExternal(next) {
		this.root = pruneSubgraphCascades(next);
		this.refreshView();
		this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
		this.notify();
	}
	/** 派生尺寸查询源（票 21 单点）：注册表+根态记录集——视图无关，容器切换/根态变更后恒新鲜重建。 */
	sizeSource() {
		return {
			registry: this.registry,
			subgraphs: this.root.subgraphs
		};
	}
	/** 容器写回收口：withContainer 落三集→级联 prune→路径钳制→视图缓存重取；快照/通知归调用方（手势帧 vs 命令的粒度差异）。 */
	writeView(next) {
		this.root = pruneSubgraphCascades(withContainer(this.root, this.nav.current, next));
		this.nav.clamp();
		this.refreshView();
	}
	/** 视图缓存重取（路径已钳制——containerViewAt 不抛）。 */
	refreshView() {
		this.graph = containerViewAt(this.root, this.nav.current);
	}
	restore(state) {
		if (state === void 0) return false;
		this.root = state;
		this.nav.clamp();
		this.refreshView();
		this.loop.selectionState = pruneSelection(this.loop.selectionState, this.graph);
		this.notify();
		return true;
	}
	notify() {
		for (const listener of [...this.listeners]) listener();
	}
};
/** 泛型槽（票 55）：TNode=判别联合节点型；实现恒宽断言归工厂；界=CanvasNode 宽形（ReturnType 按约束实例化——详 controller-types 头注）。 */
function createCanvasController(options) {
	return new CanvasControllerImpl(options);
}
//#endregion
//#region src/svelte/selection-store.ts
/** 选区只读 store（票 44 宿主人体工学 P2）：宿主侧栏跟随「当前选中」的接缝——
* Svelte 宿主 $store 直用（零 tick 咒语），非 Svelte 宿主照常 subscribe。形状基线
* （票 38 裁 6）：svelte/store readable() 落普通 .ts（运行时件非 runes——完全绕开
* .svelte.ts 源码消费编译坑；src 首个 svelte/store 依赖为新落点）；订阅源=既有
* controller.subscribe 零第二真源（store 是投影非副本：每次通知现读 getSelectedNodes，
* 不持独立状态机）；只读纪律=readable 面仅 subscribe（不暴露 set）。 */
/** 元素级同值判定（发射去抖）：图不可变值语义下节点未变=同对象引用；数组每次
* 现建故逐位比——无关通知（视口/未涉选区图变）重读后同值零发射。 */
function sameSelection(prev, next) {
	return prev.length === next.length && prev.every((node, i) => node === next[i]);
}
/** 选中节点对象只读 store：值=kernel selectedNodes 投影（图序保形）。选中节点
* 的 data/坐标变更（含 PropertiesPanel 编辑回写）=节点对象换新——发射（侧栏跟随
* 的成立条件）；删除选中节点经选区 prune——发射新值不悬空。
*
* 泛型槽（票 55）：TNode 自 controller 入参推导（窄 controller 出窄节点流），
* 缺省宽形零变化。 */
function createSelectionStore(controller) {
	let current = controller.getSelectedNodes();
	const refresh = (set) => {
		const next = controller.getSelectedNodes();
		if (sameSelection(current, next)) return;
		current = next;
		set(next);
	};
	return readable(current, (set) => {
		refresh(set);
		return controller.subscribe(() => refresh(set));
	});
}
//#endregion
//#region src/svelte/BreadcrumbBar.svelte
var root$11 = $.from_html(`<span class="fl-breadcrumb-sep svelte-195b9vh">›</span>`);
var root_1$9 = $.from_html(`<!> <button type="button"> </button>`, 1);
var root_2$8 = $.from_html(`<nav class="fl-breadcrumb svelte-195b9vh" data-fl-breadcrumb="" aria-label="子图导航"></nav>`);
var $$css$13 = {
	hash: "svelte-195b9vh",
	code: ".fl-breadcrumb.svelte-195b9vh {position:absolute;top:8px;left:8px;z-index:1;display:flex;gap:4px;align-items:center;padding:2px 6px;border:1px solid var(--fl-group-border, #c6d0dd);border-radius:6px;background:var(--fl-canvas-bg, #f6f7f9);font:12px/1.6 system-ui, sans-serif;box-shadow:0 1px 2px rgb(15 23 42 / 8%);}.fl-breadcrumb-item.svelte-195b9vh {border:none;background:none;padding:0 4px;font:inherit;color:var(--fl-subgraph-fg, #475569);cursor:pointer;}.fl-breadcrumb-item.svelte-195b9vh:not([disabled]):hover {color:var(--fl-selection, #2563eb);text-decoration:underline;}.fl-breadcrumb-current.svelte-195b9vh {font-weight:600;cursor:default;}.fl-breadcrumb-sep.svelte-195b9vh {color:var(--fl-group-border, #c6d0dd);}"
};
function BreadcrumbBar($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$13);
	var nav = root_2$8();
	$.each(nav, 23, () => $$props.crumbs, (crumb) => crumb.id, ($$anchor, crumb, index) => {
		var fragment = root_1$9();
		var node = $.first_child(fragment);
		var consequent = ($$anchor) => {
			var span = root$11();
			$.append($$anchor, span);
		};
		$.if(node, ($$render) => {
			if ($.get(index) > 0) $$render(consequent);
		});
		var button = $.sibling(node, 2);
		let classes;
		var text = $.only_child(button, true);
		$.template_effect(() => {
			classes = $.set_class(button, 1, "fl-breadcrumb-item svelte-195b9vh", null, classes, { "fl-breadcrumb-current": $.get(index) === $$props.crumbs.length - 1 });
			$.set_attribute(button, "data-fl-crumb", $.get(crumb).id);
			button.disabled = $.get(index) === $$props.crumbs.length - 1;
			$.set_text(text, $.get(crumb).name === "" ? "根" : $.get(crumb).name);
		});
		$.delegated("pointerdown", button, (e) => e.stopPropagation());
		$.delegated("click", button, () => $$props.onNavigate($.get(index)));
		$.append($$anchor, fragment);
	});
	$.reset(nav);
	$.append($$anchor, nav);
	$.pop();
}
$.delegate(["pointerdown", "click"]);
//#endregion
//#region src/svelte/RerouteDots.svelte
var root$10 = $.from_svg(`<circle r="4" vector-effect="non-scaling-stroke"></circle>`);
var $$css$12 = {
	hash: "svelte-p7r0i5",
	code: "\n  /* 中继点（票 11）：连线同色小圆点，拖拽中高亮为选区色。\n   * 半径走 r 属性不走 CSS（票 19：CSS 几何属性含 var() 首挂不绘） */.fl-reroute.svelte-p7r0i5 {fill:var(--fl-reroute-bg, #ffffff);stroke:var(--fl-reroute, #64748b);stroke-width:2;}.fl-reroute-active.svelte-p7r0i5 {fill:var(--fl-reroute-active-bg, var(--fl-selection, #2563eb));stroke:var(--fl-selection, #2563eb);}"
};
function RerouteDots($$anchor, $$props) {
	$.append_styles($$anchor, $$css$12);
	var fragment = $.comment();
	var node = $.first_child(fragment);
	$.each(node, 17, () => $$props.dots, (dot) => dot.key, ($$anchor, dot) => {
		var circle = root$10();
		let classes;
		$.template_effect(() => {
			classes = $.set_class(circle, 0, "fl-reroute svelte-p7r0i5", null, classes, { "fl-reroute-active": $.get(dot).active });
			$.set_attribute(circle, "data-fl-reroute", $.get(dot).key);
			$.set_attribute(circle, "cx", $.get(dot).x);
			$.set_attribute(circle, "cy", $.get(dot).y);
		});
		$.append($$anchor, circle);
	});
	$.append($$anchor, fragment);
}
//#endregion
//#region src/svelte/CanvasLinks.svelte
var root$9 = $.from_svg(`<path vector-effect="non-scaling-stroke"></path>`);
var root_1$8 = $.from_svg(`<path></path>`);
var root_2$7 = $.from_svg(`<circle class="fl-port svelte-u00ce2" r="4" vector-effect="non-scaling-stroke"></circle>`);
var root_3$7 = $.from_svg(`<path class="fl-link-preview svelte-u00ce2" data-fl-link-preview="" vector-effect="non-scaling-stroke"></path>`);
var root_4$3 = $.from_svg(`<svg class="fl-edges svelte-u00ce2"><!><!><!><!><!></svg>`);
var $$css$11 = {
	hash: "svelte-u00ce2",
	code: ".fl-edges.svelte-u00ce2 {position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;}\n  /* 半径走 r 属性不走 CSS（票 19）：CSS 几何属性含 var() 在 Chromium 首挂不绘\n   * （jsdom 亦不解析）——几何属性化是引擎无关的确定性路径。\n   * 连线色（票 22）：类型色经 --fl-link-own 内联间接（inline 自定属性→样式表解\n   * 析——不高亮类与类型色争 inline 优先级；类型色边悬停/选中高亮仍让位选区色）。 */.fl-edges.svelte-u00ce2 path:where(.svelte-u00ce2) {fill:none;stroke:var(--fl-link-own, var(--fl-link, #64748b));stroke-width:3;}\n  /* 选中邻接边（票 19）：选区色+加粗——选节点的连接指引（特异性压过类型色行） */.fl-edges.svelte-u00ce2 path.fl-edge-highlighted:where(.svelte-u00ce2) {stroke:var(--fl-selection, #2563eb);stroke-width:4;}\n  /* to 端箭头（票 35）：实心三角屏恒定 11px（几何面已按镜头 1/scale 补偿）；色走\n   * 边的类型色同链（inline 间接同款）——类型色/中性缺省自动跟随；选中邻接随高亮\n   * 变选区色。stroke:none 必须在（同特异度的）边高亮行之后——箭头是 fill 件，吃\n   * 通配边规则的 3px 世界单位描边会随镜头增减破屏幕恒定（挂载缝静态红线钉死） */.fl-edges.svelte-u00ce2 path.fl-arrow:where(.svelte-u00ce2) {fill:var(--fl-link-own, var(--fl-link, #64748b));stroke:none;}.fl-edges.svelte-u00ce2 path.fl-edge-highlighted.fl-arrow:where(.svelte-u00ce2) {fill:var(--fl-selection, #2563eb);}\n  /* 端口点类型色（票 22）：inline style:fill 直接覆写（点无类竞争态——比边简洁，\n   * 不需间接层）；未类型化走本规则中性色 */.fl-port.svelte-u00ce2 {fill:var(--fl-port, #64748b);stroke:var(--fl-canvas-bg, #f6f7f9);stroke-width:1;}.fl-link-preview.svelte-u00ce2 {stroke:var(--fl-link-valid, #16a34a);}.fl-link-preview[data-fl-link-valid='false'].svelte-u00ce2 {stroke:var(--fl-link-invalid, #dc2626);}"
};
function CanvasLinks($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$11);
	/** CanvasLinks 连线渲染内部件（票 15 自 CanvasView 抽出守 400 行文件红线——
	* RerouteDots 抽取同款先例，行为零改既有挂载缝测试为对照面）：既有边分段曲线
	* +to 端箭头（票 35 实心三角，屏幕恒定经 scale 补偿）+中继点 dots+端口点+拖动
	* 实时预览，模型单源 link-render（端口源含根记录集——占位/代理口合成，票 10；
	* reroute 机态供拖点高亮，票 11）。票 22 增类型色消费点：端口点/连线按词表
	* typeId 取 --fl-port-{typeId}/--fl-link-{typeId}（宿主 CSS 供值的开放集；未声明
	* 走中性缺省）。不出 barrel——CanvasView 私有。 */
	let scale = $.prop($$props, "scale", 3, 1), edgeJump = $.prop($$props, "edgeJump", 3, false);
	/** 镜头缩放（票 35）：箭头屏幕恒定补偿（11/scale 世界长）；缺省 1。 */
	/** 边形状全局缺省（票 52）：词表 per-type 覆盖优先；缺省 'bezier'。 */
	/** 跨线桥开关（票 53）：边-边交叉处半圆弧跳过；缺省 false 零行为变化。 */
	const links = $.derived(() => linkRenderModel({
		registry: $$props.registry,
		subgraphs: $$props.subgraphs
	}, $$props.graph, $$props.linkGesture, {
		reroute: $$props.rerouteGesture,
		selected: $$props.selected,
		scale: scale(),
		edgeShape: $$props.edgeShape,
		edgeJump: edgeJump()
	}));
	/** 类型色 var 链（票 22）：token 名形状守卫——typeId 非安全形状（词表宿主数据
	* 不设信）走 undefined=中性缺省，不产坏 var 名。 */
	function typeColorVar(family, typeId) {
		if (typeId === void 0 || !/^[A-Za-z0-9_-]+$/.test(typeId)) return void 0;
		return `var(--fl-${family}-${typeId}, var(${family === "port" ? "--fl-port" : "--fl-link"}, #64748b))`;
	}
	var svg = root_4$3();
	var node = $.child(svg);
	$.each(node, 17, () => $.get(links).edges, (view) => view.id, ($$anchor, view) => {
		var path = root$9();
		let classes;
		let styles;
		$.template_effect(($0) => {
			$.set_attribute(path, "d", $.get(view).d);
			$.set_attribute(path, "data-fl-edge", $.get(view).id);
			classes = $.set_class(path, 0, "svelte-u00ce2", null, classes, { "fl-edge-highlighted": $.get(view).highlighted });
			styles = $.set_style(path, "", styles, { "--fl-link-own": $0 });
		}, [() => typeColorVar("link", $.get(view).typeId)]);
		$.append($$anchor, path);
	});
	var node_1 = $.sibling(node);
	$.each(node_1, 17, () => $.get(links).edges, (view) => view.id, ($$anchor, view) => {
		var path_1 = root_1$8();
		let classes_1;
		let styles_1;
		$.template_effect(($0) => {
			classes_1 = $.set_class(path_1, 0, "fl-arrow svelte-u00ce2", null, classes_1, { "fl-edge-highlighted": $.get(view).highlighted });
			$.set_attribute(path_1, "data-fl-arrow", $.get(view).id);
			$.set_attribute(path_1, "d", $.get(view).arrow);
			styles_1 = $.set_style(path_1, "", styles_1, { "--fl-link-own": $0 });
		}, [() => typeColorVar("link", $.get(view).typeId)]);
		$.append($$anchor, path_1);
	});
	var node_2 = $.sibling(node_1);
	$.each(node_2, 17, () => $.get(links).ports, (dot) => dot.key, ($$anchor, dot) => {
		var circle = root_2$7();
		let styles_2;
		$.template_effect(($0) => {
			$.set_attribute(circle, "data-fl-port-side", $.get(dot).side);
			$.set_attribute(circle, "cx", $.get(dot).x);
			$.set_attribute(circle, "cy", $.get(dot).y);
			styles_2 = $.set_style(circle, "", styles_2, { fill: $0 });
		}, [() => typeColorVar("port", $.get(dot).typeId)]);
		$.append($$anchor, circle);
	});
	var node_3 = $.sibling(node_2);
	RerouteDots(node_3, { get dots() {
		return $.get(links).reroutes;
	} });
	var node_4 = $.sibling(node_3);
	var consequent = ($$anchor) => {
		var path_2 = root_3$7();
		$.template_effect(() => {
			$.set_attribute(path_2, "data-fl-link-valid", $.get(links).preview.valid);
			$.set_attribute(path_2, "d", $.get(links).preview.d);
		});
		$.append($$anchor, path_2);
	};
	$.if(node_4, ($$render) => {
		if ($.get(links).preview) $$render(consequent);
	});
	$.reset(svg);
	$.append($$anchor, svg);
	$.pop();
}
//#endregion
//#region src/svelte/satellite.ts
/** 卫星件事件隔离的公共面（票 15 统裁——票 12 记档「第三份阈值已到，票 15 加
* 卫星件时统裁提取」）：swallow 自吞函数+隔离属性展开面。票 02 立策「卫星件自
* 包含」经此退守为「卫星件自带隔离属性」（一行 `{...satelliteIsolation}` 展开）
* ——隔离双机制（属性式吞冒泡+data-fl-satellite 根标记）契约面不变，契约原文
* 仍住 NodeSearchBox 的 module 注释。Minimap 等自有 pointer 处理器的卫星件在
* 展开后显式覆写（Svelte 属性后写优先）。 */
function swallow(e) {
	e.stopPropagation();
}
/** 隔离属性展开面：票 02 契约的完整事件面七件（pointer 三件+wheel+dblclick+key
* 两件）全部自吞——阻断冒泡到画布根（画布交互机对卫星件内容保持惰性）。 */
var satelliteIsolation = {
	onpointerdown: swallow,
	onpointermove: swallow,
	onpointerup: swallow,
	onwheel: swallow,
	ondblclick: swallow,
	onkeydown: swallow,
	onkeyup: swallow
};
/** 事件起自隔离标记树（画布侧通用让位判定——wheel/contextmenu 等画布根处理器
* 共用；票 21 起标记分名）：卫星件（data-fl-satellite）或节点内控件
* （data-fl-widget——嵌 fl-world 变换层跟节点走，机制复用标记不混用）。
* 票 31 起自 CanvasView 抽入本模块（右键菜单接线共用同判）。 */
function isIsolatedEventTarget(target) {
	if (!(target instanceof Element)) return false;
	return target.closest("[data-fl-satellite],[data-fl-widget]") !== null;
}
//#endregion
//#region src/svelte/WidgetControl.svelte
var root$8 = $.from_html(`<input class="fl-widget-input svelte-p6enxa" type="text"/>`);
var root_1$7 = $.from_html(`<input class="fl-widget-input svelte-p6enxa" type="number"/>`);
var root_2$6 = $.from_html(`<input class="fl-widget-check svelte-p6enxa" type="checkbox"/>`);
var root_3$6 = $.from_html(`<option> </option>`);
var root_4$2 = $.from_html(`<select class="fl-widget-input svelte-p6enxa"></select>`);
var root_5$2 = $.from_html(`<textarea class="fl-widget-input fl-widget-textarea svelte-p6enxa"></textarea>`);
var root_6$1 = $.from_html(`<code class="fl-widget-json svelte-p6enxa" data-fl-widget-json=""> </code>`);
var $$css$10 = {
	hash: "svelte-p6enxa",
	code: "\n  /* 控件自持样式（两消费方共用面）：填满包裹格；user-select 覆写——宿主节点/面板\n   * 画布域 user-select:none 会杀输入框内文本选择（票 21 供件面）。token 全部\n   * 「宿主可定制+缺省」形态（复用 --fl-panel-* 系，票 07 面板视觉延续）。 */.fl-widget-input.svelte-p6enxa {box-sizing:border-box;width:100%;height:100%;min-width:0;padding:var(--fl-panel-space-xs, 2px) var(--fl-panel-space-sm, 5px);border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 4px);font:inherit;color:inherit;background:var(--fl-panel-bg, #ffffff);user-select:text;}.fl-widget-input.svelte-p6enxa:focus {outline:2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);outline-offset:-1px;}.fl-widget-check.svelte-p6enxa {accent-color:var(--fl-selection, #2563eb);margin:0;}\n  /* textarea：节点体内由行高定高（kernel 3 行=72px）；面板侧无定高容器——\n   * min-height 给出 3 行固有高（票 07 面板多行形态延续）。resize 走令牌：\n   * 面板侧允许竖向拖调（票 07 原行为），节点体内禁调（盒契约——DOM 盒=kernel 矩形）。 */.fl-widget-textarea.svelte-p6enxa {resize:var(--fl-widget-resize, none);min-height:58px;}.fl-widget-json.svelte-p6enxa {overflow-wrap:anywhere;font-family:ui-monospace, monospace;font-size:var(--fl-panel-font-size-muted, 11px);color:var(--fl-fg-muted, #94a3b8);user-select:text;}"
};
function WidgetControl($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$10);
	/** WidgetControl=widget 控件分发链内部件（票 21 自 PropertiesPanel 抽出——属性面板
	* 与节点体两消费方同源单实现，票 07 契约零改）：注册位指名覆盖（kind→组件）>
	* 内建通用五型（text/number/boolean/enum/textarea）>未注册 kind 只读 JSON 回退
	* （不炸不写）。提交=onCommit 单口——控件「值已定」的 change 一次提交（文本/数字
	* 失焦或 Enter、布尔/枚举即点即提交、长文本失焦提交——Enter 是插行不是提交），
	* 调用方接 controller.setNodeData（恰一张快照可撤销）；控件本地键入态不进 undo。
	* 事件隔离归调用方包裹层（面板=satelliteIsolation、节点体=widget 行隔离+标记
	* 分名 data-fl-widget——机制复用票内裁定）。 */
	let components = $.prop($$props, "components", 19, () => ({}));
	/** 当前值（节点 data 键现值）。 */
	/** 词表 widget 描述（型/约束/值域）。 */
	/** 提交单口（值已定的 change 一次调用）。 */
	/** 自定义 widget 注册位（kind→组件）——覆盖内建通用件（PropertiesPanel 同形）。 */
	const label = $.derived(() => $$props.def.label ?? $$props.def.name);
	const Custom = $.derived(() => components()[$$props.def.kind]);
	function commitText(e) {
		$$props.onCommit(e.currentTarget.value);
	}
	/** number 提交：空/非法不写不炸、控件回显现值（DOM 值已被改而 data 未动）。 */
	function commitNumber(e) {
		const parsed = parseWidgetNumber($$props.def, e.currentTarget.value);
		if (parsed === void 0) {
			e.currentTarget.value = widgetTextValue($$props.value);
			return;
		}
		$$props.onCommit(parsed);
	}
	function commitChecked(e) {
		$$props.onCommit(e.currentTarget.checked);
	}
	/** enum 提交面=描述 options 值域（宿主数据不设信）：现值离群时 select 空显不炸，
	* 变更值不在 options（含空选的空串）不写零快照。 */
	function commitSelected(e) {
		const next = e.currentTarget.value;
		if (!$$props.def.options?.includes(next)) return;
		$$props.onCommit(next);
	}
	var fragment = $.comment();
	var node = $.first_child(fragment);
	var consequent = ($$anchor) => {
		var fragment_1 = $.comment();
		var node_1 = $.first_child(fragment_1);
		$.component(node_1, () => $.get(Custom), ($$anchor, Custom_1) => {
			Custom_1($$anchor, {
				get value() {
					return $$props.value;
				},
				get def() {
					return $$props.def;
				},
				get onCommit() {
					return $$props.onCommit;
				}
			});
		});
		$.append($$anchor, fragment_1);
	};
	var consequent_1 = ($$anchor) => {
		var input = root$8();
		$.remove_input_defaults(input);
		$.template_effect(($0) => {
			$.set_attribute(input, "aria-label", $.get(label));
			$.set_value(input, $0);
		}, [() => widgetTextValue($$props.value)]);
		$.delegated("change", input, commitText);
		$.append($$anchor, input);
	};
	var consequent_2 = ($$anchor) => {
		var input_1 = root_1$7();
		$.remove_input_defaults(input_1);
		$.template_effect(($0) => {
			$.set_attribute(input_1, "aria-label", $.get(label));
			$.set_value(input_1, $0);
			$.set_attribute(input_1, "min", $$props.def.min);
			$.set_attribute(input_1, "max", $$props.def.max);
			$.set_attribute(input_1, "step", $$props.def.step);
		}, [() => widgetTextValue($$props.value)]);
		$.delegated("change", input_1, commitNumber);
		$.append($$anchor, input_1);
	};
	var consequent_3 = ($$anchor) => {
		var input_2 = root_2$6();
		$.remove_input_defaults(input_2);
		$.template_effect(() => {
			$.set_attribute(input_2, "aria-label", $.get(label));
			$.set_checked(input_2, $$props.value === true);
		});
		$.delegated("change", input_2, commitChecked);
		$.append($$anchor, input_2);
	};
	var consequent_4 = ($$anchor) => {
		var select = root_4$2();
		$.each(select, 20, () => $$props.def.options ?? [], (opt) => opt, ($$anchor, opt) => {
			var option = root_3$6();
			var text = $.only_child(option, true);
			var option_value = {};
			$.template_effect(() => {
				$.set_text(text, opt);
				if (option_value !== (option_value = opt)) option.value = (option.__value = option_value) ?? "";
			});
			$.append($$anchor, option);
		});
		$.reset(select);
		var select_value;
		$.init_select(select);
		$.template_effect(($0) => {
			$.set_attribute(select, "aria-label", $.get(label));
			if (select_value !== (select_value = $0)) select.value = (select.__value = select_value) ?? "", $.select_option(select, select_value);
		}, [() => widgetTextValue($$props.value)]);
		$.delegated("change", select, commitSelected);
		$.append($$anchor, select);
	};
	var consequent_5 = ($$anchor) => {
		var textarea = root_5$2();
		$.remove_textarea_child(textarea);
		$.template_effect(($0) => {
			$.set_attribute(textarea, "aria-label", $.get(label));
			$.set_value(textarea, $0);
		}, [() => widgetTextValue($$props.value)]);
		$.delegated("change", textarea, commitText);
		$.append($$anchor, textarea);
	};
	var alternate = ($$anchor) => {
		var code = root_6$1();
		var text_1 = $.only_child(code, true);
		$.template_effect(($0) => $.set_text(text_1, $0), [() => JSON.stringify($$props.value ?? null)]);
		$.append($$anchor, code);
	};
	$.if(node, ($$render) => {
		if ($.get(Custom)) $$render(consequent);
		else if ($$props.def.kind === "text") $$render(consequent_1, 1);
		else if ($$props.def.kind === "number") $$render(consequent_2, 2);
		else if ($$props.def.kind === "boolean") $$render(consequent_3, 3);
		else if ($$props.def.kind === "enum") $$render(consequent_4, 4);
		else if ($$props.def.kind === "textarea") $$render(consequent_5, 5);
		else $$render(alternate, -1);
	});
	$.append($$anchor, fragment);
	$.pop();
}
$.delegate(["change"]);
//#endregion
//#region src/svelte/CanvasNodes.svelte
var root$7 = $.from_html(`<button><svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" class="svelte-a4vsv2"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.5"></path></svg></button>`);
var root_1$6 = $.from_html(`<span class="fl-port-label svelte-a4vsv2"> </span>`);
var root_2$5 = $.from_html(`<span class="fl-port-label fl-port-label-out svelte-a4vsv2"> </span>`);
var root_3$5 = $.from_html(`<div class="fl-node-port-row svelte-a4vsv2"><!> <!></div>`);
var root_4$1 = $.from_html(`<div class="fl-node-ports svelte-a4vsv2"></div>`);
var root_5$1 = $.from_html(`<div><span class="fl-node-widget-label svelte-a4vsv2"> </span> <span class="fl-node-widget-field svelte-a4vsv2"><!></span></div>`);
var root_6 = $.from_html(`<div class="fl-node-widgets svelte-a4vsv2"></div>`);
var root_7 = $.from_html(`<div class="fl-node-progress svelte-a4vsv2" data-fl-node-progress="" aria-hidden="true"><div class="fl-node-progress-fill svelte-a4vsv2" data-fl-node-progress-fill=""></div></div>`);
var root_8 = $.from_html(`<div role="group"><div class="fl-node-header svelte-a4vsv2" data-fl-node-header=""><!> <span class="fl-node-title svelte-a4vsv2"> </span> <span class="fl-node-badge svelte-a4vsv2" data-fl-node-badge="" aria-hidden="true"></span></div> <!> <!> <!></div>`);
var $$css$9 = {
	hash: "svelte-a4vsv2",
	code: ".fl-node.svelte-a4vsv2 {position:absolute;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:0;border:1px solid var(--fl-node-border, #cbd5e1);border-radius:var(--fl-node-radius, 6px);background:var(--fl-node-bg, #ffffff);color:var(--fl-node-fg, #334155);font:var(--fl-node-font-size, 13px)/1.4 system-ui, sans-serif;box-shadow:var(--fl-node-shadow, 0 1px 2px rgb(15 23 42 / 8%));user-select:none;box-sizing:border-box;}.fl-node.fl-selected.svelte-a4vsv2 {border-color:var(--fl-selection, #2563eb);box-shadow:0 0 0 2px color-mix(in srgb, var(--fl-selection, #2563eb) 25%, transparent);}\n  /* 子图占位（票 10）：虚线边+浅底与普通节点可辨；边界代理同风格弱化。\n   * 保留型不供件（合成 def 无 widgets）——恒标题条形。 */.fl-node[data-fl-type='fl:subgraph'].svelte-a4vsv2,\n  .fl-node[data-fl-type='fl:subgraph-input'].svelte-a4vsv2,\n  .fl-node[data-fl-type='fl:subgraph-output'].svelte-a4vsv2 {border-style:dashed;background:var(--fl-subgraph-bg, rgb(37 99 235 / 4%));color:var(--fl-subgraph-fg, #475569);}\n  /* 三段形标记（票 21）：fl-node-rich=有 widgets 的语义位（测试/查询消费；排版\n   * 统一形化后无独立规则）——盒契约：kernel 高=标题条 24+端口行 20×行数+Σ行高+\n   * 块尾 8，CSS 不得增减。 */.fl-node-header.svelte-a4vsv2 {display:flex;align-items:center;gap:4px;padding:0 10px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fl-node-header-fg, #334155);font-weight:600;\n    /* 状态徽章位的 absolute 锚（票 33 结构位） */position:relative;\n    /* 类别色标题带（票 22 原型三版对比裁定=tint 档；owner 过目返工：比例 token 化\n     * 浅 40%/深 30%——深色下降浊去「土」）：词表 def.color 经 --fl-node-cat 注入，\n     * 与节点底色 color-mix 混成自适应染色带（浅深两套通吃、任意宿主色下标题字\n     * 可读）；未声明=transparent 无染色（中性，ComfyUI 全中性先例）。边框不吃\n     * 类别色（照 ComfyUI）。原型对比页 playground/theme.html。\n     * 信任面：color 不拼 token 名（无 typeId 的形状守卫必要）——坏值=color-mix\n     * 无效→background 回退初始透明，不炸不漏色（宿主数据不设信姿态）。 */background:color-mix(\n      in srgb,\n      var(--fl-node-cat, transparent) var(--fl-node-cat-mix, 40%),\n      transparent\n    );}.fl-node-ports.svelte-a4vsv2 {display:flex;flex-direction:column;flex:none;}.fl-node-port-row.svelte-a4vsv2 {display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px;flex:none;min-width:0;}.fl-port-label.svelte-a4vsv2 {max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fl-fg-muted, #64748b);font-size:12px;}\n  /* 折叠开关（票 26）：标题条内 16px 命中区、图标随标题字色（currentColor——\n   * 零裸色值红线）；折叠态箭头右指（展开下指）——纯装饰旋转变换，几何不变 */.fl-node-collapse.svelte-a4vsv2 {display:flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;padding:0;border:none;background:transparent;color:inherit;cursor:pointer;}.fl-node-collapse.svelte-a4vsv2 svg:where(.svelte-a4vsv2) {transform:rotate(0deg);}.fl-node.fl-node-collapsed.svelte-a4vsv2 .fl-node-collapse:where(.svelte-a4vsv2) svg:where(.svelte-a4vsv2) {transform:rotate(-90deg);}\n  /* 标题字面（票 26 独立成 span——标题条复合体 chevron+标题后文本锚点单一）：\n   * flex 子项溢出省略需要 min-width:0 收缩 */.fl-node-title.svelte-a4vsv2 {min-width:0;overflow:hidden;text-overflow:ellipsis;}.fl-port-label-out.svelte-a4vsv2 {text-align:right;}.fl-node-widgets.svelte-a4vsv2 {display:flex;flex-direction:column;flex:1;min-height:0;}.fl-node-widget.svelte-a4vsv2 {display:flex;align-items:center;gap:6px;padding:0 10px;flex:none;}.fl-node-widget-label.svelte-a4vsv2 {flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fl-fg-muted, #64748b);font-size:12px;}.fl-node-widget-field.svelte-a4vsv2 {flex:1;min-width:0;height:100%;display:flex;align-items:center;justify-content:flex-end;}\n  /* 节点状态结构位（票 28 裁定、票 33 入库）：结构 CSS 入库、视觉面零预置（色/动效\n   * 全宿主 CSS——宿主不写即不可见）；几何不变——两位皆既有盒内 overlay 零高度，\n   * kernel nodeSize 不知情（盒契约），断言节点高不随状态/结构位变。徽章=纯结构钩\n   * （空 span 零内容约定，宿主 CSS ::after 或直填——absolute 锚需标题条\n   * position:relative，见上方 .fl-node-header 主规则）；进度条=fill 消费约定变量键\n   * progress（width 吃 --fl-state-progress——键在场才渲染位，CanvasNodes 模板）。 */.fl-node-badge.svelte-a4vsv2 {position:absolute;right:8px;top:50%;translate:0 -50%;width:10px;height:10px;border-radius:50%;pointer-events:none;}.fl-node-progress.svelte-a4vsv2 {position:absolute;left:0;right:0;bottom:0;height:4px;overflow:hidden;border-radius:0 0 5px 5px;pointer-events:none;}.fl-node-progress-fill.svelte-a4vsv2 {height:100%;width:var(--fl-state-progress, 0);}"
};
function CanvasNodes($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$9);
	/** CanvasNodes=节点渲染内部件（票 21 自 CanvasView 抽出守 400 行红线——CanvasLinks
	* 先例；不出 barrel）。票 22 chrome 统一形：全部节点=标题条+端口标签行+widget 行
	* 三段可选叠加（退化居中单行形收编——观感统一归本票；零端口零控件=仅标题条）。
	* 盒契约（票 18 延续）：DOM 盒=kernel 派生矩形——标题条高/端口行高/widget 行高/
	* 块尾 padding 四常量自 kernel 内联进 style，CSS 不另立第二数值源。类别色=词表
	* def.color 透传注入 --fl-node-cat（kernel 只搬运），标题带 CSS 侧 color-mix 混
	* 节点底色（浅深两套自适应——原型三版对比裁定，见票 22）；未声明=var 缺省透明
	* （中性）。widget 行=事件隔离包裹层（satelliteIsolation 机制复用+标记分名
	* data-fl-widget——控件嵌 fl-world 变换层非卫星浮面板，票 21 裁定）：点控件不改
	* 选区不起拖、控件内键入不触发画布命令键（断冒泡即隔离——监听在画布根）、
	* textarea 滚轮不缩放画布；平移态（空格按住/平移手势中）隔离让位——pointer
	* 事件转发画布起平移（R1 直接输入：平移手势压过控件命中）。
	* 票 26 折叠两态：三段形（有 widgets）节点标题条供 chevron 开关——命令路
	* controller.toggleNodeCollapsed（恰一张快照）；折叠态=标题条形（端口行/widget
	* 块不渲染——DOM 盒=kernel 折叠矩形 32，禁 display:none 藏行），端口点由
	* CanvasLinks 沿折叠高均分锚定（kernel portPositions 单源）。退化形（无
	* widgets）默认不供开关（票内裁定：价值低）；chevron 事件自吞（同 widget 行
	* 机制——不与拖动/标题双击改名冲突，平移态让位同款）。
	* 票 33 增节点状态呈现：nodeStates props 直达（零 kernel 缝零 node.data 写零
	* undo/semanticHash 污染）——双轨透传落节点根（nodeStateTransport action，键
	* 形状守卫）+结构位两件（徽章恒渲染纯结构钩/进度条 vars.progress 键在场才渲
	* 染）——几何不变：两位皆既有盒内 overlay 零高度，nodeSize 不知情。票 50 增
	* aria 面：节点根 role="group"+aria-label=displayNodeTitle 单源+DOM id
	* （aria-activedescendant 引用面）；折叠钮两态文案经 labels 覆写贯入。 */
	let panYield = $.prop($$props, "panYield", 3, false), widgetComponents = $.prop($$props, "widgetComponents", 19, () => ({})), idPrefix = $.prop($$props, "idPrefix", 3, "fl-node"), collapseLabel = $.prop($$props, "collapseLabel", 3, "折叠节点"), expandLabel = $.prop($$props, "expandLabel", 3, "放开节点");
	/** 平移态让位（票 21 R1 直接输入）：true=widget 行不吞 pointer 事件（画布起平移）。 */
	/** 自定义 widget 注册位（kind→组件）——覆盖内建通用件（PropertiesPanel 同形）。 */
	/** 节点状态袋（票 33）：nodeId→NodeState 双轨透传落节点根；活图更新=替换袋对象。 */
	/** 节点 DOM id 前缀（票 50）：`${idPrefix}-${node.id}`——aria-activedescendant 引用面。 */
	/** 折叠钮两态 aria-label（票 50 labels 覆写贯入；缺省=票 26 既有中文文案）。 */
	/** 派生尺寸查询源（registry+记录集——与端口合成同源）。 */
	const source = $.derived(() => ({
		registry: $$props.controller.registry,
		subgraphs: $$props.graph.subgraphs
	}));
	/** 隔离展开面：平移态让位（不吞——转发画布），常态全吞。 */
	const isolation = $.derived(() => panYield() ? {} : satelliteIsolation);
	/** 节点显示名单源（票 15 kernel displayNodeTitle）。 */
	function nodeLabel(node) {
		return displayNodeTitle($$props.controller.registry, $$props.graph.subgraphs, node);
	}
	/** 回写缝（票 21）：控件提交=setNodeData 恰一张快照（PropertiesPanel 同款零新
	* 裁定——命令式口径红线，不进内核输入契约）。 */
	function commitWidget(nodeId, w, value) {
		$$props.controller.setNodeData(nodeId, { [w.name]: value });
	}
	var fragment = $.comment();
	var node_1 = $.first_child(fragment);
	$.each(node_1, 17, () => $$props.graph.nodes, (node) => node.id, ($$anchor, node) => {
		const size = $.derived(() => nodeSize($.get(source), $.get(node)));
		const widgets = $.derived(() => nodeWidgets($.get(source), $.get(node)));
		const portRows = $.derived(() => portRowPairs($.get(source), $.get(node)));
		const category = $.derived(() => nodeCategoryColor($.get(source), $.get(node)));
		const state = $.derived(() => $$props.nodeStates?.[$.get(node).id]);
		var div = root_8();
		let classes;
		let styles;
		var div_1 = $.child(div);
		let styles_1;
		var node_2 = $.child(div_1);
		var consequent = ($$anchor) => {
			var button = root$7();
			var event_handler = () => $$props.controller.toggleNodeCollapsed($.get(node).id);
			$.attribute_effect(button, () => ({
				type: "button",
				class: "fl-node-collapse",
				"data-fl-collapse": $.get(node).id,
				"aria-label": $.get(node).collapsed === true ? expandLabel() : collapseLabel(),
				"aria-expanded": $.get(node).collapsed !== true,
				...$.get(isolation),
				onclick: event_handler
			}), void 0, void 0, void 0, "svelte-a4vsv2");
			$.append($$anchor, button);
		};
		$.if(node_2, ($$render) => {
			if ($.get(widgets).length > 0) $$render(consequent);
		});
		var span = $.sibling(node_2, 2);
		var text = $.only_child(span, true);
		$.next(2);
		$.reset(div_1);
		var node_3 = $.sibling(div_1, 2);
		var consequent_3 = ($$anchor) => {
			var div_2 = root_4$1();
			$.each(div_2, 21, () => $.get(portRows), $.index, ($$anchor, row) => {
				var div_3 = root_3$5();
				let styles_2;
				var node_4 = $.child(div_3);
				var consequent_1 = ($$anchor) => {
					var span_1 = root_1$6();
					var text_1 = $.only_child(span_1, true);
					$.template_effect(() => {
						$.set_attribute(span_1, "data-fl-port-label", `in:${$.get(row).input.portId ?? ""}`);
						$.set_text(text_1, $.get(row).input.label);
					});
					$.append($$anchor, span_1);
				};
				$.if(node_4, ($$render) => {
					if ($.get(row).input !== void 0) $$render(consequent_1);
				});
				var node_5 = $.sibling(node_4, 2);
				var consequent_2 = ($$anchor) => {
					var span_2 = root_2$5();
					var text_2 = $.only_child(span_2, true);
					$.template_effect(() => {
						$.set_attribute(span_2, "data-fl-port-label", `out:${$.get(row).output.portId ?? ""}`);
						$.set_text(text_2, $.get(row).output.label);
					});
					$.append($$anchor, span_2);
				};
				$.if(node_5, ($$render) => {
					if ($.get(row).output !== void 0) $$render(consequent_2);
				});
				$.reset(div_3);
				$.template_effect(() => styles_2 = $.set_style(div_3, "", styles_2, { height: `${PORT_ROW_HEIGHT ?? ""}px` }));
				$.append($$anchor, div_3);
			});
			$.reset(div_2);
			$.append($$anchor, div_2);
		};
		$.if(node_3, ($$render) => {
			if ($.get(node).collapsed !== true && $.get(portRows).length > 0) $$render(consequent_3);
		});
		var node_6 = $.sibling(node_3, 2);
		var consequent_4 = ($$anchor) => {
			var div_4 = root_6();
			let styles_3;
			$.each(div_4, 21, () => $.get(widgets), (w) => w.name, ($$anchor, w) => {
				var div_5 = root_5$1();
				$.attribute_effect(div_5, ($0) => ({
					class: "fl-node-widget",
					"data-fl-widget": $.get(w).name,
					...$.get(isolation),
					[$.STYLE]: { height: $0 }
				}), [() => `${widgetRowHeight($.get(w)) ?? ""}px`], void 0, void 0, "svelte-a4vsv2");
				var span_3 = $.child(div_5);
				var text_3 = $.only_child(span_3, true);
				var span_4 = $.sibling(span_3, 2);
				WidgetControl($.child(span_4), {
					get value() {
						return $.get(node).data[$.get(w).name];
					},
					get def() {
						return $.get(w);
					},
					get components() {
						return widgetComponents();
					},
					onCommit: (v) => commitWidget($.get(node).id, $.get(w), v)
				});
				$.reset(span_4);
				$.reset(div_5);
				$.template_effect(() => $.set_text(text_3, $.get(w).label ?? $.get(w).name));
				$.append($$anchor, div_5);
			});
			$.reset(div_4);
			$.template_effect(() => styles_3 = $.set_style(div_4, "", styles_3, { "padding-bottom": `${WIDGET_BLOCK_TAIL ?? ""}px` }));
			$.append($$anchor, div_4);
		};
		$.if(node_6, ($$render) => {
			if ($.get(node).collapsed !== true && $.get(widgets).length > 0) $$render(consequent_4);
		});
		var node_8 = $.sibling(node_6, 2);
		var consequent_5 = ($$anchor) => {
			var div_6 = root_7();
			$.append($$anchor, div_6);
		};
		var d = $.derived(() => hasProgressVar($.get(state)));
		$.if(node_8, ($$render) => {
			if ($.get(d)) $$render(consequent_5);
		});
		$.reset(div);
		$.action(div, ($$node, $$action_arg) => nodeStateTransport?.($$node, $$action_arg), () => $.get(state));
		$.template_effect(($0, $1, $2) => {
			classes = $.set_class(div, 1, "fl-node svelte-a4vsv2", null, classes, {
				"fl-node-rich": $.get(widgets).length > 0,
				"fl-node-collapsed": $.get(node).collapsed === true,
				"fl-selected": $0
			});
			$.set_attribute(div, "data-fl-node", $.get(node).id);
			$.set_attribute(div, "data-fl-type", $.get(node).typeId);
			$.set_attribute(div, "id", `${idPrefix()}-${$.get(node).id}`);
			$.set_attribute(div, "aria-label", $1);
			styles = $.set_style(div, "", styles, {
				left: `${$.get(node).x ?? ""}px`,
				top: `${$.get(node).y ?? ""}px`,
				width: `${$.get(size).width ?? ""}px`,
				height: `${$.get(size).height ?? ""}px`,
				"--fl-node-cat": $.get(category)
			});
			styles_1 = $.set_style(div_1, "", styles_1, { height: `${NODE_HEADER_HEIGHT ?? ""}px` });
			$.set_text(text, $2);
		}, [
			() => $$props.selected.has($.get(node).id),
			() => nodeLabel($.get(node)),
			() => nodeLabel($.get(node))
		]);
		$.append($$anchor, div);
	});
	$.append($$anchor, fragment);
	$.pop();
}
//#endregion
//#region src/svelte/input-normalize.ts
/** deltaMode=line 的近似行高（像素域换算，Firefox 触控板/滚轮常见）。 */
var LINE_HEIGHT_PX = 16;
/** 画布元素的本地矩形（未挂载/零布局环境回退零原点——jsdom 全零 rect 同型）。 */
function elementRect(el) {
	return el?.getBoundingClientRect() ?? {
		left: 0,
		top: 0
	};
}
function normalizeModifiers(e) {
	const mods = [];
	if (e.altKey) mods.push("alt");
	if (e.ctrlKey) mods.push("ctrl");
	if (e.metaKey) mods.push("meta");
	if (e.shiftKey) mods.push("shift");
	return mods;
}
function normalizePointer(e, rect) {
	const base = {
		x: e.clientX - rect.left,
		y: e.clientY - rect.top,
		modifiers: normalizeModifiers(e)
	};
	if (e.type === "pointerdown") return {
		type: "pointer-down",
		...base,
		button: e.button
	};
	if (e.type === "pointermove") return {
		type: "pointer-move",
		...base
	};
	if (e.type === "pointerup") return {
		type: "pointer-up",
		...base
	};
	throw new Error(`非指针事件类型：${e.type}`);
}
function normalizeWheel(e, rect) {
	const mode = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? Math.max(1, rect.height ?? 0) : 1;
	return {
		type: "wheel",
		x: e.clientX - rect.left,
		y: e.clientY - rect.top,
		deltaY: e.deltaY * mode,
		modifiers: normalizeModifiers(e)
	};
}
function normalizeKey(e, when) {
	return {
		type: when,
		key: e.key,
		modifiers: normalizeModifiers(e)
	};
}
/** contextmenu（票 31 契约 v2）：DOM 右键事件→归一化结构体（画布本地坐标）；
* preventDefault 压系统菜单归调用方（CanvasView 接线——吞路同压）。 */
function normalizeContextMenu(e, rect) {
	return {
		type: "contextmenu",
		x: e.clientX - rect.left,
		y: e.clientY - rect.top,
		modifiers: normalizeModifiers(e)
	};
}
/** 画布 wheel 守卫接线（票 01 起在 CanvasView、票 36 搬入本模块守行数红线）：
* passive:false 才能 preventDefault（阻止页面滚动）——属性式监听不可配，手动挂。
* 卫星件（搜索面板/minimap）与节点内控件（textarea 滚轮）内的滚轮归属件自己，
* 不缩放画布——标记是画布侧的通用隔离契约（控件行另有自吞，此处双保险——票 21
* 标记分名 data-fl-widget 非卫星语义），不依赖其自身是否自吞。 */
function attachWheelGuard(el, controller) {
	if (el === void 0) return void 0;
	const onWheel = (e) => {
		if (isIsolatedEventTarget(e.target)) return;
		e.preventDefault();
		controller.dispatchInput(normalizeWheel(e, el.getBoundingClientRect()));
	};
	el.addEventListener("wheel", onWheel, { passive: false });
	return () => el.removeEventListener("wheel", onWheel);
}
//#endregion
//#region src/svelte/context-menu.ts
/** 两形归一：回调携开面命中现算、静态数组原样。 */
function resolveContextMenuItems(source, context) {
	return typeof source === "function" ? source(context) : source;
}
/** DOM contextmenu 接线（CanvasView 挂）：隔离让位（卫星件/节点内控件=件自己的
* 原生菜单，不压不派发）→preventDefault 压系统菜单（吞路同压——拖动在途右键
* 也不弹浏览器菜单）→归一化（画布本地）→dispatchInput 进派发环（契约 v2 事件，
* 让位/命中/改选/开面全在环的旁挂位裁决）。 */
function createContextMenuDom(deps) {
	return { onContextMenu(e) {
		if (deps.items() === void 0) return;
		if (isIsolatedEventTarget(e.target)) return;
		e.preventDefault();
		deps.controller.dispatchInput(normalizeContextMenu(e, elementRect(deps.root())));
	} };
}
//#endregion
//#region src/svelte/ContextMenuList.svelte
var root$6 = $.from_html(`<div class="fl-ctx-sep svelte-1e8qffv" role="separator"></div>`);
var root_1$5 = $.from_html(`<div class="fl-ctx-submenu svelte-1e8qffv"><!></div>`);
var root_2$4 = $.from_html(`<div><button type="button" aria-haspopup="menu"><span class="fl-ctx-label svelte-1e8qffv"> </span> <span class="fl-ctx-arrow svelte-1e8qffv" aria-hidden="true">▸</span></button> <!></div>`);
var root_3$4 = $.from_html(`<span class="fl-ctx-kbd svelte-1e8qffv"> </span>`);
var root_4 = $.from_html(`<button type="button"><span class="fl-ctx-label svelte-1e8qffv"> </span> <!></button>`);
var root_5 = $.from_html(`<div class="fl-ctx-list svelte-1e8qffv" role="menu"></div>`);
var $$css$8 = {
	hash: "svelte-1e8qffv",
	code: ".fl-ctx-list.svelte-1e8qffv {display:flex;flex-direction:column;padding:var(--fl-panel-space-xs, 4px);min-width:0;}.fl-ctx-cell.svelte-1e8qffv {position:relative; /* 子菜单几何参照（fixed 锚取其矩形） */}.fl-ctx-item.svelte-1e8qffv {display:flex;align-items:center;gap:var(--fl-panel-space, 8px);width:100%;padding:var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);border:none;border-radius:var(--fl-panel-radius, 6px);background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;white-space:nowrap;}.fl-ctx-item.svelte-1e8qffv:hover,\n  .fl-ctx-sub-trigger.svelte-1e8qffv {background:color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);}\n  /* 禁用=降亮+默认光标；监听不挂（onclick undefined）——ComfyUI 同构 */.fl-ctx-item.fl-ctx-disabled.svelte-1e8qffv {color:var(--fl-fg-muted, #94a3b8);cursor:default;}.fl-ctx-item.fl-ctx-disabled.svelte-1e8qffv:hover {background:none;}.fl-ctx-label.svelte-1e8qffv {overflow:hidden;text-overflow:ellipsis;}.fl-ctx-kbd.svelte-1e8qffv {margin-left:auto;flex:none;font:var(--fl-panel-font-size-muted, 11px)/1.4 ui-monospace, monospace;color:var(--fl-fg-muted, #94a3b8);}.fl-ctx-arrow.svelte-1e8qffv {margin-left:auto;flex:none;color:var(--fl-fg-muted, #94a3b8);}.fl-ctx-sep.svelte-1e8qffv {margin:var(--fl-panel-space-xs, 4px) 0;border-top:1px solid var(--fl-panel-border, #e2e8f0);}\n  /* 子菜单=fixed 浮面板（锚父项右缘、右缘放不下向左翻——JS 定位）：菜单根是\n   * overflow 滚动容器，absolute 子树会被裁剪（overflow-x 陪随 auto），fixed 是\n   * 逃逸裁剪的单通道；自带面板 chrome（走出根的边框/底色之外）。 */.fl-ctx-submenu.svelte-1e8qffv {position:fixed;max-width:var(--fl-ctx-width, 220px);border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);background:var(--fl-panel-bg, #ffffff);box-shadow:var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));}"
};
function ContextMenuList_1($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$8);
	/** 菜单列表内部件（票 31——递归自引用渲染子菜单，Svelte 5 官方递归形：组件
	* import 自身；不出 barrel，ContextMenu 私有）。渲染面=最小集：分隔线（null
	* 项）/禁用（降亮+不挂监听——ComfyUI 同构）/子菜单（悬停开+点击切换，锚父
	* 右缘——fixed 定位逃逸菜单根滚动容器的裁剪，右缘放不下向左翻）/shortcut
	* 提示 chip。点叶项=run+关菜单（onClose 上汇）。 */
	/** 本层展开的子菜单序（单开——移入他项即收；悬停开+点击切换两路）。 */
	let openSubmenu = $.state(void 0);
	/** 子菜单 fixed 锚（px——真浏览器几何；jsdom 零布局下仅取占位值不影响 DOM 面测试）。 */
	let submenuAt = $.state(void 0);
	let submenuEl = $.state(void 0);
	/** 子菜单判定（items 在场即子菜单形——类型收窄谓词）。 */
	const isSubmenu = (item) => item.items !== void 0;
	function openSubmenuFrom(btn, i) {
		const rect = (btn.parentElement ?? btn).getBoundingClientRect();
		const flip = rect.right + 220 + 8 > window.innerWidth;
		$.set(submenuAt, {
			left: Math.max(8, flip ? rect.left - 220 : rect.right),
			top: rect.top
		}, true);
		$.set(openSubmenu, i, true);
	}
	/** 子菜单下缘收边（码后几何自纠——锚定渲染后量实高，溢出视口即上提；写回后
	* 重跑一次即收敛，jsdom 零高度 no-op）。 */
	$.user_effect(() => {
		if ($.get(submenuEl) === void 0 || $.get(submenuAt) === void 0) return;
		const over = $.get(submenuAt).top + $.get(submenuEl).offsetHeight - (window.innerHeight - 8);
		if (over > 0) $.set(submenuAt, {
			...$.get(submenuAt),
			top: Math.max(8, $.get(submenuAt).top - over)
		}, true);
	});
	function closeSubmenu() {
		$.set(openSubmenu, void 0);
		$.set(submenuAt, void 0);
	}
	function pickLeaf(item) {
		if (item.disabled || item.run === void 0) return;
		item.run();
		$$props.onClose();
	}
	var div = root_5();
	$.each(div, 21, () => $$props.items, $.index, ($$anchor, item, i) => {
		var fragment = $.comment();
		var node = $.first_child(fragment);
		var consequent = ($$anchor) => {
			var div_1 = root$6();
			$.append($$anchor, div_1);
		};
		var consequent_2 = ($$anchor) => {
			var div_2 = root_2$4();
			let classes;
			var button = $.child(div_2);
			let classes_1;
			var span = $.child(button);
			var text = $.only_child(span, true);
			$.next(2);
			$.reset(button);
			var node_1 = $.sibling(button, 2);
			var consequent_1 = ($$anchor) => {
				var div_3 = root_1$5();
				let styles;
				ContextMenuList_1($.child(div_3), {
					get items() {
						return $.get(item).items;
					},
					get onClose() {
						return $$props.onClose;
					}
				});
				$.reset(div_3);
				$.bind_this(div_3, ($$value) => $.set(submenuEl, $$value), () => $.get(submenuEl));
				$.template_effect(() => styles = $.set_style(div_3, "", styles, {
					left: `${$.get(submenuAt).left ?? ""}px`,
					top: `${$.get(submenuAt).top ?? ""}px`
				}));
				$.append($$anchor, div_3);
			};
			$.if(node_1, ($$render) => {
				if ($.get(openSubmenu) === i && $.get(submenuAt) !== void 0) $$render(consequent_1);
			});
			$.reset(div_2);
			$.template_effect(() => {
				classes = $.set_class(div_2, 1, "fl-ctx-cell svelte-1e8qffv", null, classes, { "fl-ctx-cell-open": $.get(openSubmenu) === i });
				classes_1 = $.set_class(button, 1, "fl-ctx-item svelte-1e8qffv", null, classes_1, { "fl-ctx-sub-trigger": $.get(openSubmenu) === i });
				$.set_attribute(button, "aria-expanded", $.get(openSubmenu) === i);
				$.set_attribute(button, "data-fl-ctx-item", $.get(item).label);
				$.set_text(text, $.get(item).label);
			});
			$.event("pointerenter", button, (e) => openSubmenuFrom(e.currentTarget, i));
			$.delegated("click", button, (e) => $.get(openSubmenu) === i ? closeSubmenu() : openSubmenuFrom(e.currentTarget, i));
			$.append($$anchor, div_2);
		};
		var d = $.derived(() => isSubmenu($.get(item)));
		var alternate = ($$anchor) => {
			var button_1 = root_4();
			let classes_2;
			var span_1 = $.child(button_1);
			var text_1 = $.only_child(span_1, true);
			var node_3 = $.sibling(span_1, 2);
			var consequent_3 = ($$anchor) => {
				var span_2 = root_3$4();
				var text_2 = $.only_child(span_2, true);
				$.template_effect(() => $.set_text(text_2, $.get(item).shortcut));
				$.append($$anchor, span_2);
			};
			$.if(node_3, ($$render) => {
				if ($.get(item).shortcut !== void 0) $$render(consequent_3);
			});
			$.reset(button_1);
			$.template_effect(() => {
				classes_2 = $.set_class(button_1, 1, "fl-ctx-item svelte-1e8qffv", null, classes_2, { "fl-ctx-disabled": $.get(item).disabled === true });
				$.set_attribute(button_1, "aria-disabled", $.get(item).disabled === true || void 0);
				$.set_attribute(button_1, "data-fl-ctx-item", $.get(item).label);
				$.set_text(text_1, $.get(item).label);
			});
			$.event("pointerenter", button_1, closeSubmenu);
			$.delegated("click", button_1, function(...$$args) {
				($.get(item).disabled === true ? void 0 : () => pickLeaf($.get(item)))?.apply(this, $$args);
			});
			$.append($$anchor, button_1);
		};
		$.if(node, ($$render) => {
			if ($.get(item) === null) $$render(consequent);
			else if ($.get(d)) $$render(consequent_2, 1);
			else $$render(alternate, -1);
		});
		$.append($$anchor, fragment);
	});
	$.reset(div);
	$.append($$anchor, div);
	$.pop();
}
$.delegate(["click"]);
//#endregion
//#region src/svelte/ContextMenu.svelte
var root$5 = $.from_html(`<div><!></div>`);
var $$css$7 = {
	hash: "svelte-1q2qn1z",
	code: ".fl-ctx.svelte-1q2qn1z {position:absolute;z-index:var(--fl-panel-z, 10);width:max-content;max-width:var(--fl-ctx-width, 220px);max-height:var(--fl-ctx-max-height, 320px);overflow-y:auto;border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);background:var(--fl-panel-bg, #ffffff);box-shadow:var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);pointer-events:auto;}"
};
function ContextMenu($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$7);
	/** ContextMenu 右键菜单卫星件（票 31，SelectionToolbox 量级）：共享同一
	* controller（SelectionToolbox 先例——订阅 getContextMenuState 观察派发环旁挂
	* 开面态）；items 全宿主注入（getItems 回调为主+静态数组退化糖——库零预置项，
	* 语义全归宿主）；开面时刻画布本地屏幕锚定+视口收边+不跟随镜头（NodeSearchBox
	* 双锚先例）；关闭=外点/Esc（document 级兜底——补 ComfyUI 无 Esc 的缺口）/
	* 右键点菜单自身/点叶项终局（全汇 controller.closeContextMenu）。
	* 无壳供件：挂载点归宿主 overlay（与画布几何对齐即得正确定位域）。 */
	/** 宿主 items 注入源（两形协议见 context-menu.ts；每次开菜单现算）。 */
	let open = $.state($.proxy($$props.controller.getContextMenuState()));
	$.user_effect(() => {
		return $$props.controller.subscribe(() => {
			$.set(open, $$props.controller.getContextMenuState(), true);
		});
	});
	const resolved = $.derived(() => $.get(open) === void 0 ? [] : resolveContextMenuItems($$props.items, $.get(open).hit));
	$.user_effect(() => {
		if ($.get(open) === void 0) return;
		const onDocPointerDown = () => $$props.controller.closeContextMenu();
		const onDocKeyDown = (e) => {
			if (e.key === "Escape") $$props.controller.closeContextMenu();
		};
		document.addEventListener("pointerdown", onDocPointerDown);
		document.addEventListener("keydown", onDocKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onDocPointerDown);
			document.removeEventListener("keydown", onDocKeyDown);
		};
	});
	/** 右键点菜单自身：压原生菜单+收场（不冒泡——画布根不重复派发）。 */
	function onSelfContextMenu(e) {
		e.preventDefault();
		e.stopPropagation();
		$$props.controller.closeContextMenu();
	}
	/** 面板几何常量：与 CSS var 缺省值成对出现（收边按估宽上限钳制——内容窄于
	* 估宽时早收无害，宽于估宽被 max-width 截断，两向保右/下缘不溢出）。 */
	const MENU_MAX_HEIGHT_PX = 320;
	/** 定位表达式：钳制在画布内（NodeSearchBox clampExpr 同款）。 */
	function clampExpr(pos, sizeExpr) {
		return `max(0px, min(${pos}px, calc(100% - ${sizeExpr})))`;
	}
	const widthExpr = `var(--fl-ctx-width, 220px)`;
	const heightExpr = `var(--fl-ctx-max-height, ${MENU_MAX_HEIGHT_PX}px)`;
	const leftExpr = $.derived(() => $.get(open) === void 0 ? "" : clampExpr($.get(open).screen.x, widthExpr));
	const topExpr = $.derived(() => $.get(open) === void 0 ? "" : clampExpr($.get(open).screen.y, heightExpr));
	var fragment = $.comment();
	var node = $.first_child(fragment);
	var consequent = ($$anchor) => {
		var div = root$5();
		$.attribute_effect(div, () => ({
			class: "fl-ctx",
			"data-fl-context-menu": true,
			"data-fl-satellite": "",
			role: "menu",
			...satelliteIsolation,
			oncontextmenu: onSelfContextMenu,
			[$.STYLE]: {
				left: $.get(leftExpr),
				top: $.get(topExpr)
			}
		}), void 0, void 0, void 0, "svelte-1q2qn1z");
		ContextMenuList_1($.child(div), {
			get items() {
				return $.get(resolved);
			},
			onClose: () => $$props.controller.closeContextMenu()
		});
		$.reset(div);
		$.append($$anchor, div);
	};
	$.if(node, ($$render) => {
		if ($.get(open) !== void 0) $$render(consequent);
	});
	$.append($$anchor, fragment);
	$.pop();
}
//#endregion
//#region src/svelte/keybindings.ts
/** 命令键接线（票 14）：DOM 键事件→组合键域归一（Ctrl/Cmd 合并主修饰）→当前
* 绑定表查找→执行命令。**作用域=画布容器聚焦**：本处理器只挂在画布根——收到的
* 键事件天然起自画布域内（画布失焦/宿主别处的键到不了这里=不触发、不劫持宿主
* 全局键）；命中即消费（preventDefault+执行，返回 true——调用方不再派发进内核
* 交互机）；key repeat 只消费不执行（票 09/10 防抖口径统一收编）；未命中返回
* false 照常走归一化派发管线——交互机语义原样（Delete/Escape 解绑后回落机内
* 原语义，不是禁用）。本模块为 CanvasView 内部接线不出 barrel——宿主换键/查表/
* 存档走 controller.commands 公共面。 */
/** DOM 键事件→组合键域：归一化（normalizeModifiers）后经 kernel `keyComboFrom`
* 单点入域（小写化+Ctrl/Cmd 合并主修饰的单一实现——跨平台同键位）。 */
function comboFromKeyboardEvent(e) {
	return keyComboFrom(e.key, normalizeModifiers(e));
}
/** 键盘事件是否命中画布命令绑定：命中即消费（preventDefault+执行，返回 true）；
* 未命中返回 false 照常走归一化派发管线。绑定表事件时取值恒新鲜（placement
* getter 先例——宿主改键即时生效，无需订阅重渲）。
* 键盘隔离守卫（票 50，票 47 裁 7）：起自控件域（data-fl-satellite/widget）的键
* 恒不命中——本函数的独立防线（包裹层自吞之外的双保险；wheel/contextmenu 同款
* isIsolatedEventTarget 收编）。 */
function handleCommandKey(e, controller) {
	if (isIsolatedEventTarget(e.target)) return false;
	const combo = comboFromKeyboardEvent(e);
	const binding = controller.commands.match(combo);
	if (binding === void 0) return false;
	e.preventDefault();
	if (!e.repeat) controller.commands.executeCommand(binding.commandId);
	return true;
}
//#endregion
//#region src/svelte/keyboard.ts
function createKeyboardBridge(deps) {
	return {
		onKeyDown(e) {
			if (isIsolatedEventTarget(e.target)) return;
			if (e.key === " ") e.preventDefault();
			if (deps.machine().spaceDown && e.key.startsWith("Arrow")) {
				e.preventDefault();
				deps.controller.dispatchInput(normalizeKey(e, "key-down"));
				return;
			}
			if (handleCommandKey(e, deps.controller)) return;
			deps.controller.dispatchInput(normalizeKey(e, "key-down"));
		},
		onKeyUp(e) {
			if (isIsolatedEventTarget(e.target)) return;
			deps.controller.dispatchInput(normalizeKey(e, "key-up"));
		},
		onBlur() {
			deps.controller.dispatchInput({
				type: "key-up",
				key: " ",
				modifiers: []
			});
		}
	};
}
//#endregion
//#region src/svelte/labels.ts
/** 库产 aria-label 词表覆写（票 50，票 47 裁 8 i18n）：CanvasView 可选 `labels`
* props 覆写库自产的无障碍文案——缺省中文（=现状零行为变化）；英文宿主/发布叙事
* 可覆写（SF ariaLabelConfig 极简版）。覆写面=库**新造**文案三处（画布根/折叠钮
* 两态）；节点 aria-label=displayNodeTitle 单源（票 15——文案本就归宿主词表/自定义
* 标题，无库产面、不经此覆写）。 */
/** 缺省词表（中文现状——零覆写时逐值等价票 26 既有文案）。 */
var DEFAULT_CANVAS_LABELS = {
	canvas: "画布",
	collapseNode: "折叠节点",
	expandNode: "放开节点"
};
/** 解析合并（浅合并+缺省填充——未传键走中文现状）。 */
function resolveCanvasLabels(labels) {
	return {
		...DEFAULT_CANVAS_LABELS,
		...labels
	};
}
/** aria-activedescendant 值（票 50）：图序末位选中锚点（selectionAnchor 单源）的
* DOM id——`${prefix}-${nodeId}`（CanvasNodes 节点根同式渲染 id）；空选区 undefined
*（属性不落）。多选只指一个=已知边界（票 47 裁 2 记档——锚点即「指那一个」）。 */
function activeDescendantId(nodes, selected, prefix) {
	const anchor = selectionAnchor(nodes, selected);
	return anchor === void 0 ? void 0 : `${prefix}-${anchor.id}`;
}
//#endregion
//#region src/svelte/sidecar-props.ts
/** 置入三张旁边声明并返回复位函数（卸载/重挂时回 undefined——opt-out 语义）。 */
function attachSidecarDecls(controller, decls) {
	controller.setNodeLocks(decls.nodeLocks);
	controller.setConnectionRules(decls.connectionRules);
	controller.setEdgeShape(decls.edgeShape);
	return () => {
		controller.setNodeLocks(void 0);
		controller.setConnectionRules(void 0);
		controller.setEdgeShape(void 0);
	};
}
//#endregion
//#region src/svelte/search.ts
/** 词表过滤：typeId/label 大小写不敏感子串匹配（票面两命中面）；
* 空白查询=全量词表（面板初开即浏览）。 */
function filterVocabulary(defs, query) {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [...defs];
	return defs.filter((def) => def.typeId.toLowerCase().includes(needle) || def.label.toLowerCase().includes(needle));
}
/** 键盘上下导航的环绕推进：末项再下回到首项、首项再上绕到末项；空列表恒 0。 */
function wrapIndex(current, step, length) {
	if (length <= 0) return 0;
	return (current + step + length) % length;
}
//#endregion
//#region src/svelte/NodeSearchBox.svelte
var root$4 = $.from_html(`<div class="fl-search-empty svelte-147pmmm"></div>`);
var root_1$4 = $.from_html(`<button type="button"><span class="fl-search-label svelte-147pmmm"> </span> <span class="fl-search-type svelte-147pmmm"> </span></button>`);
var root_2$3 = $.from_html(`<div class="fl-search-list svelte-147pmmm"></div>`);
var root_3$3 = $.from_html(`<div><input class="fl-search-input svelte-147pmmm"/> <!></div>`);
var $$css$6 = {
	hash: "svelte-147pmmm",
	code: "\n  /* 面板 token 全部「宿主可定制+缺省」形态（同 --fl-selection 先例）：\n  * 颜色/圆角/宽高/间距（三档 space/space-sm/space-xs）/字号/z-index 皆可宿主覆写。 */.fl-search.svelte-147pmmm {position:absolute;z-index:var(--fl-panel-z, 10);width:var(--fl-panel-width, 240px);max-height:var(--fl-panel-max-height, 320px);display:flex;flex-direction:column;border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);background:var(--fl-panel-bg, #ffffff);box-shadow:var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);}.fl-search-input.svelte-147pmmm {margin:var(--fl-panel-space, 8px);padding:var(--fl-panel-space-sm, 5px) var(--fl-panel-space, 8px);border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);font:inherit;color:inherit;}.fl-search-input.svelte-147pmmm:focus {outline:2px solid color-mix(in srgb, var(--fl-selection, #2563eb) 45%, transparent);outline-offset:-1px;}.fl-search-list.svelte-147pmmm {overflow-y:auto;padding:0 var(--fl-panel-space-xs, 4px) var(--fl-panel-space-xs, 4px);}.fl-search-item.svelte-147pmmm {display:flex;justify-content:space-between;gap:var(--fl-panel-space, 8px);width:100%;padding:var(--fl-panel-space-sm, 5px) var(--fl-panel-space, 8px);border:none;border-radius:var(--fl-panel-radius, 6px);background:none;font:inherit;text-align:left;cursor:pointer;}.fl-search-item.fl-highlighted.svelte-147pmmm,\n  .fl-search-item.svelte-147pmmm:hover {background:color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);}.fl-search-item.fl-highlighted.svelte-147pmmm .fl-search-type:where(.svelte-147pmmm) {color:var(--fl-selection, #2563eb);}.fl-search-label.svelte-147pmmm {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.fl-search-type.svelte-147pmmm {flex:none;color:var(--fl-fg-muted, #94a3b8);font-size:var(--fl-panel-font-size-muted, 11px);align-self:center;}.fl-search-empty.svelte-147pmmm {padding:var(--fl-panel-space, 8px)\n      calc(var(--fl-panel-space, 8px) + var(--fl-panel-space-xs, 4px))\n      calc(var(--fl-panel-space, 8px) + var(--fl-panel-space-xs, 4px));color:var(--fl-fg-muted, #94a3b8);}"
};
function NodeSearchBox($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$6);
	/** NodeSearchBox 节点搜索面板（票 02）——首个卫星组件，立「共享同一 controller
	* 的卫星件」模式：挂载缝测试覆盖交互全链、事件隔离（见上 module 注释）、
	* 关闭交互（Escape/外点——面板内部事件已被自吞，能冒到 document 的必是外点）。
	* 确认即落位：双击路 placeNode 落节点到 graphPoint（票 02）；拖线路（linkOrigin
	* 携起拖端口）placeNodeConnected 复合落位+自动连兼容端口（票 03）——随后 onClose。 */
	/** 落点（图坐标）——双击位置/拖线空白落点经屏幕→图逆变换；面板存续期间视口再变也不跟随。 */
	/** 面板定位（画布本地屏幕坐标，随开面板时刻锚定）。 */
	/** 拖线落位路的起拖端口（票 03；双击路 undefined）。 */
	const TEXT_SEARCH_LABEL = "搜索节点";
	/** 面板几何常量：与 CSS var 缺省值成对出现（钳制表达式与宽度/高度共用一份缺省）。 */
	const PANEL_OFFSET_PX = 8;
	const PANEL_WIDTH_PX = 240;
	const PANEL_MAX_HEIGHT_PX = 320;
	let query = $.state("");
	let highlighted = $.state(0);
	let inputEl = $.state(void 0);
	const items = $.derived(() => filterVocabulary($$props.controller.registry.all(), $.get(query)));
	$.user_effect(() => {
		$.get(inputEl)?.focus();
	});
	$.user_effect(() => {
		const onDocPointerDown = () => $$props.onClose();
		const onDocKeyDown = (e) => {
			if (e.key === "Escape") $$props.onClose();
		};
		document.addEventListener("pointerdown", onDocPointerDown);
		document.addEventListener("keydown", onDocKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onDocPointerDown);
			document.removeEventListener("keydown", onDocKeyDown);
		};
	});
	function onInput(e) {
		$.set(query, e.currentTarget.value, true);
		$.set(highlighted, 0);
	}
	function onKeydown(e) {
		if (e.isComposing) return;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			$.set(highlighted, wrapIndex($.get(highlighted), e.key === "ArrowDown" ? 1 : -1, $.get(items).length), true);
		} else if (e.key === "Enter") pick($.get(highlighted));
		else if (e.key === "Escape") $$props.onClose();
	}
	/** 确认：落位并关闭——双击路落节点到双击图坐标；拖线路复合落位+自动连起拖端口
	* 的兼容端口（同名/首个——controller.placeNodeConnected，点+线恰一张快照）；
	* 空列表/越界高亮 no-op。 */
	function pick(index) {
		const def = $.get(items)[index];
		if (def === void 0) return;
		if ($$props.linkOrigin === void 0) $$props.controller.placeNode(def.typeId, $$props.graphPoint.x, $$props.graphPoint.y);
		else $$props.controller.placeNodeConnected(def.typeId, $$props.graphPoint.x, $$props.graphPoint.y, $$props.linkOrigin);
		$$props.onClose();
	}
	/** 定位表达式：钳制在画布内（右/下缘不溢出，min/max 于含位块的百分比）。 */
	function clampExpr(pos, sizeExpr) {
		return `max(0px, min(${pos}px, calc(100% - ${sizeExpr} - ${PANEL_OFFSET_PX}px)))`;
	}
	const widthExpr = `var(--fl-panel-width, ${PANEL_WIDTH_PX}px)`;
	const heightExpr = `var(--fl-panel-max-height, ${PANEL_MAX_HEIGHT_PX}px)`;
	const leftExpr = $.derived(() => clampExpr($$props.screenPoint.x + PANEL_OFFSET_PX, widthExpr));
	const topExpr = $.derived(() => clampExpr($$props.screenPoint.y + PANEL_OFFSET_PX, heightExpr));
	var div = root_3$3();
	$.attribute_effect(div, () => ({
		class: "fl-search",
		"data-fl-search": true,
		"data-fl-satellite": "",
		...satelliteIsolation,
		[$.STYLE]: {
			left: $.get(leftExpr),
			top: $.get(topExpr)
		}
	}), void 0, void 0, void 0, "svelte-147pmmm");
	var input = $.child(div);
	$.remove_input_defaults(input);
	$.set_attribute(input, "aria-label", TEXT_SEARCH_LABEL);
	$.set_attribute(input, "placeholder", TEXT_SEARCH_LABEL);
	$.bind_this(input, ($$value) => $.set(inputEl, $$value), () => $.get(inputEl));
	var node = $.sibling(input, 2);
	var consequent = ($$anchor) => {
		var div_1 = root$4();
		div_1.textContent = "无匹配节点";
		$.append($$anchor, div_1);
	};
	var alternate = ($$anchor) => {
		var div_2 = root_2$3();
		$.each(div_2, 23, () => $.get(items), (def) => def.typeId, ($$anchor, def, i) => {
			var button = root_1$4();
			let classes;
			var span = $.child(button);
			var text = $.only_child(span, true);
			var span_1 = $.sibling(span, 2);
			var text_1 = $.only_child(span_1, true);
			$.reset(button);
			$.template_effect(() => {
				classes = $.set_class(button, 1, "fl-search-item svelte-147pmmm", null, classes, { "fl-highlighted": $.get(i) === $.get(highlighted) });
				$.set_attribute(button, "data-fl-search-item", $.get(def).typeId);
				$.set_attribute(button, "aria-current", $.get(i) === $.get(highlighted) ? "true" : void 0);
				$.set_text(text, $.get(def).label);
				$.set_text(text_1, $.get(def).typeId);
			});
			$.delegated("click", button, () => pick($.get(i)));
			$.append($$anchor, button);
		});
		$.reset(div_2);
		$.append($$anchor, div_2);
	};
	$.if(node, ($$render) => {
		if ($.get(items).length === 0) $$render(consequent);
		else $$render(alternate, -1);
	});
	$.reset(div);
	$.template_effect(() => $.set_value(input, $.get(query)));
	$.delegated("input", input, onInput);
	$.delegated("keydown", input, onKeydown);
	$.append($$anchor, div);
	$.pop();
}
$.delegate([
	"input",
	"keydown",
	"click"
]);
//#endregion
//#region src/svelte/TitleEditor.svelte
var root$3 = $.from_html(`<input/>`);
var $$css$5 = {
	hash: "svelte-fkkpyg",
	code: "\n  /* 无壳：绝对定位由锚位 props 直给（宿主可 CSS 覆写）；token 全部「宿主可定制+\n   * 缺省」形态（--fl-panel-* 系，同 NodeSearchBox/PropertiesPanel）。 */.fl-title-input.svelte-fkkpyg {position:absolute;z-index:var(--fl-panel-z, 10);box-sizing:border-box;padding:var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);border:1px solid var(--fl-selection, #2563eb);border-radius:var(--fl-panel-radius, 6px);font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);background:var(--fl-panel-bg, #ffffff);box-shadow:0 0 0 2px color-mix(in srgb, var(--fl-selection, #2563eb) 25%, transparent);outline:none;}"
};
function TitleEditor($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$5);
	/** TitleEditor 原位标题编辑（票 15）——卫星组件（票 02 模式：共享同一
	* controller、事件隔离经 satelliteIsolation 统裁面）：宿主可自挂，CanvasView
	* 亦内部接线（双击普通节点开编辑——NodeSearchBox「导出+内部用」同款）。
	* 本组件只报值不裁定：提交裁定（同串零写/空串清自定义/恰一张快照）单源住
	* title-edit.svelte.ts 的 commit——onCommit 上抛原始输入值。提交=命令式
	* 单事件（widget change 同款口径）：Enter/失焦提交、Escape 取消；编辑目标
	* 节点消亡（undo/别处 Delete）经订阅自动收场（onCancel 路零写）。 */
	/** 编辑目标节点 id（存在性随订阅复核）。 */
	/** 初值（开面时刻显示名——title-edit 单源）。 */
	/** 屏幕锚（画布本地坐标——开面时刻锚定）。 */
	/** 输入宽（px）。 */
	/** 提交路（Enter/失焦）：上抛原始输入值，裁定在调用方。 */
	/** 取消路（Escape/目标节点消亡）：零写收场。 */
	const TEXT_TITLE_LABEL = "节点标题";
	let inputEl = $.state(void 0);
	let settled = false;
	let graph = $.state($.proxy($$props.controller.getState()));
	$.user_effect(() => {
		return $$props.controller.subscribe(() => {
			$.set(graph, $$props.controller.getState(), true);
		});
	});
	$.user_effect(() => {
		$.get(inputEl)?.focus();
		$.get(inputEl)?.select();
	});
	/** 目标节点消亡即收场（订阅驱动——undo/别处 Delete 后不留孤儿编辑器）。 */
	const gone = $.derived(() => !$.get(graph).nodes.some((n) => n.id === $$props.nodeId));
	$.user_effect(() => {
		if ($.get(gone) && !settled) cancelEdit();
	});
	function submit() {
		if (settled) return;
		settled = true;
		$$props.onCommit($.get(inputEl)?.value ?? "");
	}
	function cancelEdit() {
		settled = true;
		$$props.onCancel();
	}
	function onKeydown(e) {
		if (e.isComposing) return;
		if (e.key === "Enter") {
			e.preventDefault();
			submit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			cancelEdit();
		}
	}
	var input = root$3();
	var event_handler = (e) => {
		e.stopPropagation();
		onKeydown(e);
	};
	var event_handler_1 = () => submit();
	$.attribute_effect(input, () => ({
		class: "fl-title-input",
		"data-fl-title-editor": true,
		"data-fl-satellite": "",
		"aria-label": TEXT_TITLE_LABEL,
		value: $$props.initial,
		...satelliteIsolation,
		onkeydown: event_handler,
		onblur: event_handler_1,
		[$.STYLE]: {
			left: `${$$props.screen.x ?? ""}px`,
			top: `${$$props.screen.y ?? ""}px`,
			width: `${$$props.width ?? ""}px`
		}
	}), void 0, void 0, void 0, "svelte-fkkpyg", true);
	$.bind_this(input, ($$value) => $.set(inputEl, $$value), () => $.get(inputEl));
	$.append($$anchor, input);
	$.pop();
}
//#endregion
//#region src/svelte/Tooltip.svelte
var root$2 = $.from_html(`<div class="fl-tooltip svelte-1adk6sk" data-fl-tooltip="" role="tooltip"><span class="fl-tooltip-title"> </span> <span class="fl-tooltip-type svelte-1adk6sk"> </span></div>`);
var $$css$4 = {
	hash: "svelte-1adk6sk",
	code: "\n  /* 跟随件：纯展示——不吞事件不聚焦；无壳（定位=指针偏移直给）；token「宿主可\n   * 定制+缺省」形态。 */.fl-tooltip.svelte-1adk6sk {position:absolute;z-index:var(--fl-panel-z, 10);display:flex;flex-direction:column;gap:2px;pointer-events:none;padding:var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);background:var(--fl-panel-bg, #ffffff);box-shadow:var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);white-space:nowrap;}.fl-tooltip-type.svelte-1adk6sk {font-family:ui-monospace, monospace;font-size:var(--fl-panel-font-size-muted, 11px);color:var(--fl-fg-muted, #94a3b8);}"
};
function Tooltip($$anchor, $$props) {
	$.append_styles($$anchor, $$css$4);
	/** Tooltip 节点悬停提示（票 15）——**跟随件**（票内裁定：纯展示无事件面，
	* pointer-events:none——卫星隔离机制无事可做，故不出 barrel、CanvasView 私有
	* 内部件，BreadcrumbBar/RerouteDots 先例）。内容两行（票内定）：首行=显示名
	* （displayNodeTitle 单源：自定义标题>词表 label>typeId）、次行=typeId（等宽
	* 淡色）。锚=进入节点时刻的指针位+固定偏移（不逐帧跟随——v1 裁定）。 */
	/** 指针位（画布本地坐标——CanvasView 换算后注入）。 */
	/** 与 CSS 偏移缺省成对的常量（测试手算同源）。 */
	const TOOLTIP_OFFSET_X = 12;
	const TOOLTIP_OFFSET_Y = 16;
	var div = root$2();
	let styles;
	var span = $.child(div);
	var text = $.only_child(span, true);
	var span_1 = $.sibling(span, 2);
	var text_1 = $.only_child(span_1, true);
	$.reset(div);
	$.template_effect(() => {
		$.set_attribute(div, "data-fl-tooltip-title", $$props.title);
		$.set_attribute(div, "data-fl-tooltip-type", $$props.typeId);
		styles = $.set_style(div, "", styles, {
			left: `${$$props.x + TOOLTIP_OFFSET_X}px`,
			top: `${$$props.y + TOOLTIP_OFFSET_Y}px`
		});
		$.set_text(text, $$props.title);
		$.set_text(text_1, $$props.typeId);
	});
	$.append($$anchor, div);
}
//#endregion
//#region src/svelte/dragdrop.ts
/** 拖放落节点契约（票 02）：宿主侧栏/外部源经 dataTransfer 携带 typeId 拖入画布。
* MIME 对齐 ComfyUI 先例（application/x-comfy-node）形制：结构化自定义 MIME 为主，
* text/plain 为外部源回退。回退收紧（code-review 裁定）：结构化 MIME=宿主明确意图，
* 未注册 typeId 也放行（回退显示面）；text/plain=环境文本，任意内容放行会让
* 「拖段普通文字进画布」产垃圾节点——须词表命中（registry.lookup）才落。 */
/** 本库结构化拖放 MIME（宿主侧栏 dragstart 时写入）。 */
var FLOWLOOM_NODE_MIME = "application/x-flowloom-node-type";
var PLAIN_TEXT_MIME = "text/plain";
/** dragover 阶段判定：是否本库认可的节点拖放（dragover 下 getData 受保护，
* 只能按 types 判——命中才 preventDefault 允许放置；text/plain 可能最终不落，
* 放行只是允许 drop 手势，drop 时再收紧）。 */
function isNodeDragDataTransfer(dt) {
	return dt.types.includes("application/x-flowloom-node-type") || dt.types.includes(PLAIN_TEXT_MIME);
}
/** drop 阶段读取被拖的 typeId：自定义 MIME 优先（明确意图，未注册型放行——
* 渲染回退显示 typeId）；text/plain 回退需词表命中（lookup 注入时）。
* 无载荷/空白内容/回退未命中返回 undefined（渲染层忽略本次 drop）。 */
function readDraggedTypeId(dt, lookup) {
	const typeId = (dt.types.includes("application/x-flowloom-node-type") ? dt.getData(FLOWLOOM_NODE_MIME) : dt.types.includes(PLAIN_TEXT_MIME) ? dt.getData(PLAIN_TEXT_MIME) : "").trim();
	if (typeId === "") return void 0;
	if (!dt.types.includes("application/x-flowloom-node-type") && lookup !== void 0 && lookup.lookup(typeId) === void 0) return;
	return typeId;
}
/** 宿主侧栏 dragstart 侧的写入助手：双格式齐写（结构化 + 纯文本回退），
* 与 readDraggedTypeId 成对——拖放契约单点成文。 */
function setNodeDragData(dt, typeId) {
	dt.setData(FLOWLOOM_NODE_MIME, typeId);
	dt.setData(PLAIN_TEXT_MIME, typeId);
}
//#endregion
//#region src/svelte/placement.svelte.ts
function createNodePlacement(deps) {
	let search = $.state(void 0);
	function onDblClick(e) {
		const spot = dblClickSpot(deps, e.clientX, e.clientY);
		if (spot !== void 0) $.set(search, {
			...spot,
			linkOrigin: void 0
		}, true);
	}
	function openLinkSearch(origin, at) {
		$.set(search, {
			graph: at,
			screen: graphToScreen(deps.viewport(), at),
			linkOrigin: origin
		}, true);
	}
	function onDrop(e) {
		const typeId = draggedTypeId(deps, e);
		if (typeId === void 0) return;
		e.preventDefault();
		const p = screenToGraph(deps.viewport(), localPoint(deps, e.clientX, e.clientY));
		deps.controller.placeNode(typeId, p.x, p.y);
		closeSearch();
	}
	function closeSearch() {
		$.set(search, void 0);
	}
	return {
		get search() {
			return $.get(search);
		},
		onDblClick,
		onDragOver: dragOverGuard,
		onDrop,
		closeSearch,
		openLinkSearch,
		activateSelection: () => activateAnchor(deps)
	};
}
/** Enter 激活选中（票 50）：平移态让位（双击面等效含 yield）；锚=图序末位选中
*（selectionAnchor——与 aria-activedescendant 同锚单源）；屏幕锚=节点左上投影。 */
function activateAnchor(deps) {
	const machine = deps.machine();
	if (machine.panning || machine.spaceDown) return;
	const anchor = selectionAnchor(deps.graph().nodes, deps.selection());
	if (anchor === void 0) return;
	activateNodeAt(deps, anchor, graphToScreen(deps.viewport(), {
		x: anchor.x,
		y: anchor.y
	}));
}
/** 双击落点判定（票 15 双击面统一收口）：平移模式（空格按住/平移中）不弹；
* 命中子图占位→进入该子图（票 10，ComfyUI 同构）；命中普通节点→改道钩子优先、
* 缺省回落分派标题编辑（story 26——票 32）；命中保留代理→忽略；未命中节点但
* 命中边路径→不弹面板（story 10 语义=双击**空白**——票 11 记档的「边路径双击
* 照弹搜索面板」噪声就此收口）；真空白→双锚开面。 */
function dblClickSpot(deps, clientX, clientY) {
	const machine = deps.machine();
	if (machine.panning || machine.spaceDown) return void 0;
	const local = localPoint(deps, clientX, clientY);
	const view = deps.graph();
	const hit = hitTestNode(deps.viewport(), {
		registry: deps.controller.registry,
		subgraphs: view.subgraphs
	}, view.nodes, local);
	if (hit !== void 0) {
		activateNodeAt(deps, hit, local);
		return;
	}
	if (hitTestEdgePath(deps.viewport(), linkWorldOf(deps, view), local) !== void 0) return;
	return {
		screen: local,
		graph: screenToGraph(deps.viewport(), local)
	};
}
/** 命中节点的激活路（票 50 双击/Enter 双入口共用——「Enter=双击面完整等效」的
* 单一实现）：子图占位=进入该子图（票 10）；普通节点=改道钩子优先、缺省回落
* 原位改名（票 32/票 15）；保留代理=忽略。 */
function activateNodeAt(deps, node, local) {
	if (node.typeId === SUBGRAPH_TYPE_ID) enterHitSubgraph(deps, node.id);
	else if (!isReservedNode(node)) routeTitleEdit(deps, node, local);
}
/** 双击普通节点的改道收口（票 32）：onNodeDoubleClick 钩子在位且非显式拒接
* （仅返回 false）=宿主吃双击；缺省/false=回落原位改名（票 15 行为不迁）。
* 参数与 editTitle 同形（命中节点+画布本地屏幕坐标）。 */
function routeTitleEdit(deps, node, local) {
	const hook = deps.controller.onNodeDoubleClick;
	if (hook !== void 0 && hook(node, local) !== false) return;
	deps.editTitle?.(node, local);
}
/** 喂机世界（边路径命中的容器视图投影——dispatch-loop machineWorld 同形，类型
* 标注 LinkWorld 使「同形」由注释约定升为类型契约：漂移即编译红）。 */
function linkWorldOf(deps, view) {
	return {
		graph: view,
		viewport: deps.viewport(),
		registry: deps.controller.registry,
		subgraphs: view.subgraphs
	};
}
/** 双击占位的进入路：容器尺寸可得则交 controller 适配兜底（无 LRU 记忆时）。 */
function enterHitSubgraph(deps, id) {
	const el = deps.root();
	const fitSize = el === void 0 ? void 0 : {
		width: el.clientWidth,
		height: el.clientHeight
	};
	deps.controller.enterSubgraph(id, fitSize);
}
/** 拖放放行判定：dragover 只按 types 判（此阶段 getData 受保护），命中才
* preventDefault（否则浏览器按默认处理拖放，drop 不会来）。 */
function dragOverGuard(e) {
	const dt = e.dataTransfer;
	if (dt !== null && isNodeDragDataTransfer(dt)) {
		e.preventDefault();
		dt.dropEffect = "copy";
	}
}
/** drop 载荷读取：结构化 MIME 优先/词表闸收紧 text/plain 回退（dragdrop.ts 契约）。 */
function draggedTypeId(deps, e) {
	return e.dataTransfer === null ? void 0 : readDraggedTypeId(e.dataTransfer, deps.controller.registry);
}
/** DOM 事件坐标→画布本地屏幕坐标（归一化管线同款换算）。 */
function localPoint(deps, clientX, clientY) {
	const rect = elementRect(deps.root());
	return {
		x: clientX - rect.left,
		y: clientY - rect.top
	};
}
//#endregion
//#region src/svelte/hover-tooltip.svelte.ts
function createHoverTooltip(deps) {
	let hover = $.state(void 0);
	function onPointerOver(e) {
		const el = e.target instanceof Element ? e.target.closest("[data-fl-node]") : null;
		if (el === null) {
			$.set(hover, void 0);
			return;
		}
		const rect = elementRect(deps.root());
		$.set(hover, {
			nodeId: el.getAttribute("data-fl-node") ?? "",
			x: e.clientX - rect.left,
			y: e.clientY - rect.top
		}, true);
	}
	function clearHover() {
		$.set(hover, void 0);
	}
	const tip = $.derived(() => $.get(hover) === void 0 ? void 0 : projectTip(deps, $.get(hover)));
	return {
		get tip() {
			return $.get(tip);
		},
		onPointerOver,
		clearHover
	};
}
/** 可见投影（纯函数面）：编辑/图手势在途让位 + 悬停节点仍活 + 两行内容单源
* displayNodeTitle。 */
function projectTip(deps, h) {
	if (deps.editing()) return void 0;
	if (deps.selection().gesture.kind !== "idle" || deps.link().gesture.kind !== "idle" || deps.reroute().gesture.kind !== "idle") return;
	const graph = deps.graph();
	const node = graph.nodes.find((n) => n.id === h.nodeId);
	if (node === void 0) return void 0;
	return {
		title: displayNodeTitle(deps.controller.registry, graph.subgraphs, node),
		typeId: node.typeId,
		x: h.x,
		y: h.y
	};
}
//#endregion
//#region src/svelte/title-edit.svelte.ts
function createTitleEdit(controller, view) {
	let editing = $.state(void 0);
	function begin(nodeId, screen, width) {
		const graph = view();
		const node = nodeById(graph, nodeId);
		if (node === void 0) return;
		$.set(editing, {
			nodeId,
			initial: displayNodeTitle(controller.registry, graph.subgraphs, node),
			hadCustom: nodeCustomTitle(node) !== void 0,
			screen,
			width
		}, true);
	}
	function commit(value) {
		const current = $.get(editing);
		if (current === void 0) return;
		$.set(editing, void 0);
		const trimmed = value.trim();
		if (trimmed === current.initial) return;
		if (trimmed === "" && !current.hadCustom) return;
		controller.setNodeData(current.nodeId, { [TITLE_DATA_KEY]: trimmed });
	}
	function cancel() {
		$.set(editing, void 0);
	}
	return {
		get open() {
			return $.get(editing);
		},
		begin,
		commit,
		cancel
	};
}
//#endregion
//#region src/svelte/CanvasView.svelte
var root_1$3 = $.from_html(`<div></div>`);
var root_2$2 = $.from_html(`<div class="fl-selection-box svelte-9mipdc" data-fl-selection-box=""></div>`);
var root_3$2 = $.from_html(`<div tabindex="0" role="application"><!> <div class="fl-world svelte-9mipdc" data-fl-world=""><!> <!> <!> <!></div> <!> <!> <!> <!></div>`);
var $$css$3 = {
	hash: "svelte-9mipdc",
	code: ".fl-canvas.svelte-9mipdc {position:relative;width:100%;height:100%;overflow:hidden;background:var(--fl-canvas-bg, #f6f7f9);\n    /* UA 原生控件随主题（票 22）：范围限画布子树（tokens.css --fl-color-scheme 供值\n     * ——不 import 该表=light 降级）；不在 :root 设 color-scheme 扰动宿主文档 */color-scheme:var(--fl-color-scheme, light);touch-action:none;user-select:none;outline:none;}.fl-canvas.fl-pan-mode.svelte-9mipdc {cursor:grab;}.fl-canvas.fl-panning.svelte-9mipdc {cursor:grabbing;}.fl-world.svelte-9mipdc {position:absolute;top:0;left:0;\n    /* 尺寸=画布（变换容器本无需尺寸，但 .fl-edges svg 的 100% 视口由此取值——\n     * 零尺寸 svg 视口不建圆形子件绘制区的引擎坑，票 19 实验实锤；图坐标越界\n     * 内容经 svg overflow:visible 照常绘制） */width:100%;height:100%;transform-origin:0 0;}\n  /* 帧族 border-box（票 18）：kernel 矩形是命中/端口锚定/包围盒的单一几何源，\n   * 装饰（padding/border）必须含在 kernel width/height 内——DOM 盒=kernel 矩形\n   * （.fl-node 同款规则住 CanvasNodes——节点渲染票 21 起内部件化） */.fl-group.svelte-9mipdc,\n  .fl-selection-box.svelte-9mipdc {box-sizing:border-box;}.fl-group.svelte-9mipdc {position:absolute;border:1px solid var(--fl-group-border, #c6d0dd);border-radius:8px;background:var(--fl-group-bg, rgb(100 116 139 / 6%));\n    /* 命中判定在内核坐标面（点组框=选成员走选区机），DOM 面不吞事件——卫星隔离不破 */pointer-events:none;}.fl-group.fl-group-selected.svelte-9mipdc {border-color:var(--fl-selection, #2563eb);}.fl-selection-box.svelte-9mipdc {position:absolute;border:1px solid var(--fl-selection, #2563eb);background:color-mix(in srgb, var(--fl-selection, #2563eb) 8%, transparent);pointer-events:none;}"
};
function CanvasView($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$3);
	/** CanvasView 根渲染组件：DOM 事件→归一化内核事件→controller.dispatchInput 管线
	* （票 01 起）；视口经 world 层 CSS 变换随动；选区高亮/框选矩形随选区机态渲染（票 04）。
	* 增量面：02/03 两路落位+连线；09/10 组框/子图；11 reroute；14 命令键（绑定表可查改
	* 存、量测/系统桥执行体在此覆写）；21 widget；31 右键菜单；33 nodeStates；36 锁单；
	* 50 a11y；51 校验单；52 边形状；53 跨线桥；56 导出环境发布（皆 props 贯入）。 */
	let controller = $.prop($$props, "controller", 7), widgetComponents = $.prop($$props, "widgetComponents", 19, () => ({}));
	/** 自定义 widget 注册位（kind→组件，词表项 kind 指名）——节点体控件覆盖
	* （票 21；PropertiesPanel 同形贯入——两入口同一覆盖面）。 */
	/** 右键菜单 items 注入源（票 31）：getItems 回调为主+静态数组糖，库零预置项；未注入=opt-out 原生菜单。 */
	/** 节点状态袋（票 33）：nodeId→{data,vars} 双轨透传落节点根（零 kernel/undo 污染）。 */
	/** 结构面锁单（票 36）：谓词+编号集两形取并贯入 controller（旁边声明零快照）。 */
	/** 连接校验单（票 51）：谓词+矩阵两形 AND 贯入 controller（旁边声明零快照）。 */
	/** 边形状全局缺省（票 52）：词表 per-type 覆盖优先；缺省 'bezier' 零行为变化。 */
	/** 跨线桥开关（票 53）：边-边交叉处半圆弧跳过；缺省 false 零行为变化
	* （纯图面风格约定——不进词表不进 kernel，箭头面同档）。 */
	/** 库产 aria-label 词表覆写（票 50）：画布根/折叠钮两态——缺省中文零行为变化。 */
	let root = $.state(void 0);
	/** 节点 DOM id 前缀（票 50 aria-activedescendant 引用面）：实例随机前缀保多画布文档级唯一。 */
	const idPrefix = `fl-${Math.random().toString(36).slice(2, 8)}`;
	let graph = $.state($.proxy(controller().getState()));
	let viewport = $.state($.proxy(controller().getViewport()));
	let machine = $.state($.proxy(controller().getViewportMachineState()));
	let selection = $.state($.proxy(controller().getSelectionState()));
	let link = $.state($.proxy(controller().getLinkState()));
	let reroute = $.state($.proxy(controller().getRerouteState()));
	let breadcrumb = $.state($.proxy(controller().getBreadcrumb()));
	const titleEdit = createTitleEdit(controller(), () => $.get(graph));
	const hoverTip = createHoverTooltip({
		controller: controller(),
		graph: () => $.get(graph),
		selection: () => $.get(selection),
		link: () => $.get(link),
		reroute: () => $.get(reroute),
		root: () => $.get(root),
		editing: () => titleEdit.open !== void 0
	});
	const tooltip = $.derived(() => hoverTip.tip);
	const place = createNodePlacement({
		controller: controller(),
		viewport: () => $.get(viewport),
		graph: () => $.get(graph),
		machine: () => $.get(machine),
		root: () => $.get(root),
		selection: () => $.get(selection).selected,
		editTitle: (node) => {
			const topLeft = graphToScreen($.get(viewport), {
				x: node.x,
				y: node.y
			});
			const width = nodeSize({
				registry: controller().registry,
				subgraphs: $.get(graph).subgraphs
			}, node).width;
			titleEdit.begin(node.id, topLeft, width * $.get(viewport).scale);
		}
	});
	const keys = createKeyboardBridge({
		controller: controller(),
		machine: () => $.get(machine)
	});
	const ariaLabels = $.derived(() => resolveCanvasLabels($$props.labels));
	const activeDescendant = $.derived(() => activeDescendantId($.get(graph).nodes, $.get(selection).selected, idPrefix));
	$.user_effect(() => {
		return controller().subscribe(() => {
			$.set(graph, controller().getState(), true);
			$.set(viewport, controller().getViewport(), true);
			$.set(machine, controller().getViewportMachineState(), true);
			$.set(selection, controller().getSelectionState(), true);
			$.set(link, controller().getLinkState(), true);
			$.set(reroute, controller().getRerouteState(), true);
			$.set(breadcrumb, controller().getBreadcrumb(), true);
		});
	});
	$.user_effect(() => {
		controller().onLinkEmptyDrop = place.openLinkSearch;
		return () => {
			if (controller().onLinkEmptyDrop === place.openLinkSearch) controller().onLinkEmptyDrop = void 0;
		};
	});
	$.user_effect(() => attachSidecarDecls(controller(), {
		nodeLocks: $$props.nodeLocks,
		connectionRules: $$props.connectionRules,
		edgeShape: $$props.edgeShape
	}));
	$.user_effect(() => attachExportEnvPublish(controller(), $$props.nodeStates));
	$.user_effect(() => {
		controller().commands.setRunner("fl:fit-view", fitView);
		controller().commands.setRunner("fl:activate-selection", place.activateSelection);
		controller().commands.setRunner("fl:copy", () => copyToSystemClipboard(controller()));
		controller().commands.setRunner("fl:paste", () => void pasteFromSystemClipboard(controller()));
	});
	$.user_effect(() => attachWheelGuard($.get(root), controller()));
	$.user_effect(() => attachViewSizePublish(controller(), $.get(root)));
	const menu = createContextMenuDom({
		controller: controller(),
		items: () => $$props.contextMenuItems,
		root: () => $.get(root)
	});
	function onPointerDown(e) {
		if (e.button === 1) e.preventDefault();
		dispatchPointer(e);
		if (controller().getViewportMachineState().panning || controller().getSelectionState().gesture.kind !== "idle" || controller().getLinkState().gesture.kind !== "idle" || controller().getRerouteState().gesture.kind !== "idle") capturePointer(e);
	}
	/** 指针取消（系统手势接管等）= 交互终止：视同 pointer-up（机内 pointer-up 不读坐标），防平移态卡死。 */
	function onPointerCancel() {
		controller().dispatchInput({
			type: "pointer-up",
			x: 0,
			y: 0,
			modifiers: []
		});
	}
	function dispatchPointer(e) {
		controller().dispatchInput(normalizePointer(e, elementRect($.get(root))));
	}
	/** 平移拖拽期间捕获指针：快速拖出画布仍持续收事件（jsdom 无实现，容错跳过）。 */
	function capturePointer(e) {
		try {
			$.get(root)?.setPointerCapture(e.pointerId);
		} catch {}
	}
	const worldTransform = $.derived(() => `translate(${(-$.get(viewport).offsetX * $.get(viewport).scale).toFixed(2)}px, ${(-$.get(viewport).offsetY * $.get(viewport).scale).toFixed(2)}px) scale(${$.get(viewport).scale})`);
	const canvasClass = $.derived(() => [
		"fl-canvas",
		$.get(machine).panning ? "fl-panning" : "",
		$.get(machine).spaceDown ? "fl-pan-mode" : ""
	].filter(Boolean).join(" "));
	/** 组框选中态（票 09）：组全成员皆在选区=整组被选中（点组框即成员全选的面）。 */
	function isGroupSelected(memberIds) {
		return memberIds.length > 0 && memberIds.every((id) => $.get(selection).selected.has(id));
	}
	/** 面包屑点击：跳到该前缀路径（量自身容器尺寸做适配兜底——无 LRU 记忆时）。 */
	function crumbTarget(index) {
		const path = controller().getNavPath().slice(0, index);
		const el = $.get(root);
		const fitSize = el === void 0 ? void 0 : {
			width: el.clientWidth,
			height: el.clientHeight
		};
		controller().navigateTo(path, fitSize);
	}
	/** 一键全图适配（量自身容器尺寸；空图/零尺寸 no-op）。 */
	function fitView(margin) {
		const el = $.get(root);
		if (el === void 0) return false;
		return controller().fitView(el.clientWidth, el.clientHeight, margin);
	}
	var $$exports = { fitView };
	var div = root_3$2();
	var node_1 = $.child(div);
	var consequent = ($$anchor) => {
		BreadcrumbBar($$anchor, {
			get crumbs() {
				return $.get(breadcrumb);
			},
			onNavigate: crumbTarget
		});
	};
	$.if(node_1, ($$render) => {
		if ($.get(breadcrumb).length > 1) $$render(consequent);
	});
	var div_1 = $.sibling(node_1, 2);
	let styles;
	var node_2 = $.child(div_1);
	$.each(node_2, 17, () => $.get(graph).groups, (group) => group.id, ($$anchor, group) => {
		var div_2 = root_1$3();
		let classes;
		let styles_1;
		$.template_effect(($0) => {
			classes = $.set_class(div_2, 1, "fl-group svelte-9mipdc", null, classes, { "fl-group-selected": $0 });
			$.set_attribute(div_2, "data-fl-group", $.get(group).id);
			styles_1 = $.set_style(div_2, "", styles_1, {
				left: `${$.get(group).x ?? ""}px`,
				top: `${$.get(group).y ?? ""}px`,
				width: `${$.get(group).width ?? ""}px`,
				height: `${$.get(group).height ?? ""}px`
			});
		}, [() => isGroupSelected($.get(group).memberIds)]);
		$.append($$anchor, div_2);
	});
	var node_3 = $.sibling(node_2, 2);
	CanvasLinks(node_3, {
		get registry() {
			return controller().registry;
		},
		get subgraphs() {
			return $.get(graph).subgraphs;
		},
		get graph() {
			return $.get(graph);
		},
		get linkGesture() {
			return $.get(link).gesture;
		},
		get rerouteGesture() {
			return $.get(reroute).gesture;
		},
		get selected() {
			return $.get(selection).selected;
		},
		get scale() {
			return $.get(viewport).scale;
		},
		get edgeShape() {
			return $$props.edgeShape;
		},
		get edgeJump() {
			return $$props.edgeJump;
		}
	});
	var node_4 = $.sibling(node_3, 2);
	{
		let $0 = $.derived(() => $.get(machine).panning || $.get(machine).spaceDown);
		CanvasNodes(node_4, {
			get controller() {
				return controller();
			},
			get graph() {
				return $.get(graph);
			},
			get selected() {
				return $.get(selection).selected;
			},
			get panYield() {
				return $.get($0);
			},
			get widgetComponents() {
				return widgetComponents();
			},
			get nodeStates() {
				return $$props.nodeStates;
			},
			get idPrefix() {
				return idPrefix;
			},
			get collapseLabel() {
				return $.get(ariaLabels).collapseNode;
			},
			get expandLabel() {
				return $.get(ariaLabels).expandNode;
			}
		});
	}
	var node_5 = $.sibling(node_4, 2);
	var consequent_1 = ($$anchor) => {
		const rect = $.derived(() => boxRect($.get(selection).gesture));
		var div_3 = root_2$2();
		let styles_2;
		$.template_effect(() => styles_2 = $.set_style(div_3, "", styles_2, {
			left: `${$.get(rect).x ?? ""}px`,
			top: `${$.get(rect).y ?? ""}px`,
			width: `${$.get(rect).width ?? ""}px`,
			height: `${$.get(rect).height ?? ""}px`
		}));
		$.append($$anchor, div_3);
	};
	$.if(node_5, ($$render) => {
		if ($.get(selection).gesture.kind === "box") $$render(consequent_1);
	});
	$.reset(div_1);
	var node_6 = $.sibling(div_1, 2);
	var consequent_2 = ($$anchor) => {
		NodeSearchBox($$anchor, {
			get controller() {
				return controller();
			},
			get graphPoint() {
				return place.search.graph;
			},
			get screenPoint() {
				return place.search.screen;
			},
			get linkOrigin() {
				return place.search.linkOrigin;
			},
			get onClose() {
				return place.closeSearch;
			}
		});
	};
	$.if(node_6, ($$render) => {
		if (place.search !== void 0) $$render(consequent_2);
	});
	var node_7 = $.sibling(node_6, 2);
	var consequent_3 = ($$anchor) => {
		TitleEditor($$anchor, {
			get controller() {
				return controller();
			},
			get nodeId() {
				return titleEdit.open.nodeId;
			},
			get initial() {
				return titleEdit.open.initial;
			},
			get screen() {
				return titleEdit.open.screen;
			},
			get width() {
				return titleEdit.open.width;
			},
			get onCommit() {
				return titleEdit.commit;
			},
			get onCancel() {
				return titleEdit.cancel;
			}
		});
	};
	$.if(node_7, ($$render) => {
		if (titleEdit.open !== void 0) $$render(consequent_3);
	});
	var node_8 = $.sibling(node_7, 2);
	var consequent_4 = ($$anchor) => {
		ContextMenu($$anchor, {
			get controller() {
				return controller();
			},
			get items() {
				return $$props.contextMenuItems;
			}
		});
	};
	$.if(node_8, ($$render) => {
		if ($$props.contextMenuItems !== void 0) $$render(consequent_4);
	});
	var node_9 = $.sibling(node_8, 2);
	var consequent_5 = ($$anchor) => {
		Tooltip($$anchor, {
			get title() {
				return $.get(tooltip).title;
			},
			get typeId() {
				return $.get(tooltip).typeId;
			},
			get x() {
				return $.get(tooltip).x;
			},
			get y() {
				return $.get(tooltip).y;
			}
		});
	};
	$.if(node_9, ($$render) => {
		if ($.get(tooltip) !== void 0) $$render(consequent_5);
	});
	$.reset(div);
	$.bind_this(div, ($$value) => $.set(root, $$value), () => $.get(root));
	$.template_effect(() => {
		$.set_class(div, 1, $.clsx($.get(canvasClass)), "svelte-9mipdc");
		$.set_attribute(div, "aria-label", $.get(ariaLabels).canvas);
		$.set_attribute(div, "aria-activedescendant", $.get(activeDescendant));
		$.set_attribute(div, "data-fl-node-count", $.get(graph).nodes.length);
		$.set_attribute(div, "data-fl-edge-count", $.get(graph).edges.length);
		styles = $.set_style(div_1, "", styles, { transform: $.get(worldTransform) });
	});
	$.delegated("pointerdown", div, onPointerDown);
	$.delegated("pointermove", div, dispatchPointer);
	$.delegated("pointerup", div, dispatchPointer);
	$.event("pointercancel", div, onPointerCancel);
	$.event("blur", div, function(...$$args) {
		keys.onBlur?.apply(this, $$args);
	});
	$.delegated("keydown", div, function(...$$args) {
		keys.onKeyDown?.apply(this, $$args);
	});
	$.delegated("keyup", div, function(...$$args) {
		keys.onKeyUp?.apply(this, $$args);
	});
	$.delegated("dblclick", div, function(...$$args) {
		place.onDblClick?.apply(this, $$args);
	});
	$.delegated("contextmenu", div, function(...$$args) {
		menu.onContextMenu?.apply(this, $$args);
	});
	$.event("dragover", div, function(...$$args) {
		place.onDragOver?.apply(this, $$args);
	});
	$.event("drop", div, function(...$$args) {
		place.onDrop?.apply(this, $$args);
	});
	$.delegated("pointerover", div, function(...$$args) {
		hoverTip.onPointerOver?.apply(this, $$args);
	});
	$.event("pointerleave", div, function(...$$args) {
		hoverTip.clearHover?.apply(this, $$args);
	});
	$.append($$anchor, div);
	return $.pop($$exports);
}
$.delegate([
	"pointerdown",
	"pointermove",
	"pointerup",
	"keydown",
	"keyup",
	"dblclick",
	"contextmenu",
	"pointerover"
]);
//#endregion
//#region src/svelte/minimap-model.ts
/** 缩略盒内边距（px，投影可用区=盒 − 两侧 margin）——模块内常量。 */
var MINIMAP_MARGIN_PX = 8;
/** 画布侧缺省回退（票 45）：槽未发布（未挂 CanvasView）时的退化读数——视口矩形缩
* 为点、投影域退化为内容包围盒；不炸（0 参与的除法均有 Math.max(1,·) 钳制）。 */
var MINIMAP_FALLBACK_CANVAS = {
	width: 0,
	height: 0
};
/** mini→graph 逆映射（导航：指针缩略坐标→图坐标→定心）。 */
function miniToGraph(projection, mini) {
	return {
		x: (mini.x - projection.offsetX) / projection.scale,
		y: (mini.y - projection.offsetY) / projection.scale
	};
}
/** 视口矩形在给定投影下的落位（Minimap 手势期消费：地图面冻结、矩形随实时相机
* 走冻结投影——拖动跟随可见）。 */
function miniViewportRect(viewport, canvas, p) {
	return miniRectView(viewportBounds(viewport, canvas), p);
}
/** 相机可视域（图坐标世界矩形：offset 起宽高=canvas/scale）。 */
function viewportBounds(viewport, canvas) {
	return {
		minX: viewport.offsetX,
		minY: viewport.offsetY,
		maxX: viewport.offsetX + canvas.width / viewport.scale,
		maxY: viewport.offsetY + canvas.height / viewport.scale
	};
}
/** 投影域=节点包围盒 ∪ 相机可视域（空图=相机域；等比 contain 进可用区）。 */
function miniProjection(source, graph, viewport, sizes) {
	const { canvas, box } = sizes;
	const nodes = graphBounds(source, graph.nodes);
	const camera = viewportBounds(viewport, canvas);
	const bounds = nodes === void 0 ? camera : {
		minX: Math.min(nodes.minX, camera.minX),
		minY: Math.min(nodes.minY, camera.minY),
		maxX: Math.max(nodes.maxX, camera.maxX),
		maxY: Math.max(nodes.maxY, camera.maxY)
	};
	const availW = Math.max(1, box.width - 16);
	const availH = Math.max(1, box.height - 16);
	const bw = Math.max(1, bounds.maxX - bounds.minX);
	const bh = Math.max(1, bounds.maxY - bounds.minY);
	const scale = Math.min(availW / bw, availH / bh);
	return {
		scale,
		offsetX: MINIMAP_MARGIN_PX + (availW - bw * scale) / 2 - bounds.minX * scale,
		offsetY: MINIMAP_MARGIN_PX + (availH - bh * scale) / 2 - bounds.minY * scale
	};
}
/** 单趟备齐 minimap 渲染面：节点矩形+中心连线+视口矩形+投影（尺寸收拢
* {canvas,box} 单参守兼合参数红线——票 21 source 穿线同 fitView）。 */
function minimapModel(source, graph, viewport, sizes) {
	const canvas = sizes.canvas;
	const p = miniProjection(source, graph, viewport, sizes);
	return {
		projection: p,
		nodes: graph.nodes.map((node) => miniNodeView(source, node, p)),
		edges: miniEdgeViews(source, graph.edges, graph.nodes, p),
		viewport: miniViewportRect(viewport, canvas, p)
	};
}
function miniNodeView(source, node, p) {
	const size = nodeSize(source, node);
	return {
		id: node.id,
		x: p.offsetX + node.x * p.scale,
		y: p.offsetY + node.y * p.scale,
		width: Math.max(size.width * p.scale, 2),
		height: Math.max(size.height * p.scale, 2)
	};
}
/** 连线=两端节点中心的直线段（端点缺失跳过——图不变量外防御，不炸不画）。 */
function miniEdgeViews(source, edges, nodes, p) {
	const centers = new Map(nodes.map((node) => {
		const size = nodeSize(source, node);
		return [node.id, {
			x: node.x + size.width / 2,
			y: node.y + size.height / 2
		}];
	}));
	const views = [];
	for (const edge of edges) {
		const a = centers.get(edge.from.nodeId);
		const b = centers.get(edge.to.nodeId);
		if (a === void 0 || b === void 0) continue;
		views.push({
			id: edge.id,
			x1: p.offsetX + a.x * p.scale,
			y1: p.offsetY + a.y * p.scale,
			x2: p.offsetX + b.x * p.scale,
			y2: p.offsetY + b.y * p.scale
		});
	}
	return views;
}
function miniRectView(bounds, p) {
	return {
		x: p.offsetX + bounds.minX * p.scale,
		y: p.offsetY + bounds.minY * p.scale,
		width: (bounds.maxX - bounds.minX) * p.scale,
		height: (bounds.maxY - bounds.minY) * p.scale
	};
}
//#endregion
//#region src/svelte/Minimap.svelte
var root_1$2 = $.from_svg(`<line class="fl-minimap-edge svelte-1sqh8xo"></line>`);
var root_2$1 = $.from_svg(`<rect class="fl-minimap-node svelte-1sqh8xo"></rect>`);
var root_3$1 = $.from_html(`<div><svg class="fl-minimap-svg svelte-1sqh8xo" aria-hidden="true"><!><!><rect class="fl-minimap-viewport svelte-1sqh8xo" data-fl-minimap-viewport=""></rect></svg></div>`);
var $$css$2 = {
	hash: "svelte-1sqh8xo",
	code: "\n  /* 无容器壳：无定位（宿主 overlay 自定）；盒尺寸=props（几何单源）。\n   * token 全部「宿主可定制+缺省」形态（--fl-selection 先例）。 */.fl-minimap.svelte-1sqh8xo {overflow:hidden;border:1px solid var(--fl-minimap-border, #e2e8f0);border-radius:var(--fl-minimap-radius, 6px);background:var(--fl-minimap-bg, rgb(255 255 255 / 88%));cursor:pointer;touch-action:none;user-select:none;\n    /* UA 原生控件随主题（票 22）：宿主挂载位在画布子树外——自设（.fl-canvas 同款） */color-scheme:var(--fl-color-scheme, light);}.fl-minimap-svg.svelte-1sqh8xo {display:block;}.fl-minimap-node.svelte-1sqh8xo {fill:var(--fl-minimap-node, #cbd5e1);}.fl-minimap-edge.svelte-1sqh8xo {stroke:var(--fl-minimap-link, #64748b);stroke-width:1;}.fl-minimap-viewport.svelte-1sqh8xo {fill:color-mix(in srgb, var(--fl-selection, #2563eb) 8%, transparent);stroke:var(--fl-selection, #2563eb);stroke-width:1;}"
};
function Minimap($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$2);
	/** Minimap 缩略导航（票 12）——卫星组件第四件（票 02 模式）：共享同一 controller
	* 的缩略地图，渲染当前容器视图（getState——进子图随动换内容，零特判）：节点矩形
	* +中心连线+当前视口矩形（minimap-model 投影：域=graphBounds ∪ 相机可视域，内容
	* 与镜头恒同框）。点击=把指针图点定心（跳转）、拖动=持续定心（跟随）——命令式
	* 视口写 controller.setViewport（票 01 公共面，镜头不入 undo），定心数学=
	* kernel centerViewportOn；不进内核输入契约（卫星件不合成伪画布事件——无后门
	* 口径）。可开关=宿主控制挂载与否（库不供开关 UI）；无容器壳——定位归宿主
	* overlay；尺寸=width/height props（几何与投影同数值域单源）。 */
	let width = $.prop($$props, "width", 3, 200), height = $.prop($$props, "height", 3, 140);
	/** 画布容器像素尺寸读取器（票 45 起可选——缺省自量：读 CanvasView 挂载发布
	* 的 controller.viewSize 旁挂缓存，**显式传参恒覆盖**[票 12 必填形的向后兼容]；
	* 「传常量=视口矩形恒错」——读取器须真读画布元素）。读取器形态事件时取值恒
	* 新鲜，placement getter 先例同形。 */
	/** 缩略盒尺寸（px）：几何与投影共用的单一数值源（宿主定制经 props，非 CSS）。 */
	const TEXT_MINIMAP_LABEL = "小地图导航";
	let graph = $.state($.proxy($$props.controller.getState()));
	let viewport = $.state($.proxy($$props.controller.getViewport()));
	let viewSize = $.state($.proxy($$props.controller.viewSize.get()));
	$.user_effect(() => {
		return $$props.controller.subscribe(() => {
			$.set(graph, $$props.controller.getState(), true);
			$.set(viewport, $$props.controller.getViewport(), true);
		});
	});
	$.user_effect(() => $$props.controller.viewSize.subscribe(() => $.set(viewSize, $$props.controller.viewSize.get(), true)));
	/** 画布侧尺寸单读点：显式读取器恒覆盖；缺省=槽镜像；未发布=0×0 退化回退。 */
	const canvasSize = $.derived(() => $$props.viewportSize?.() ?? $.get(viewSize) ?? MINIMAP_FALLBACK_CANVAS);
	/** 缩略渲染面（投影+节点/连线/视口矩形——minimap-model 单 derived）。导航手势
	* 期间地图面（投影/节点/连线）冻结在按下时刻：投影域含相机可视域，重定心会移动
	* 域→映射随指针漂移（反馈不收敛）——冻结后拖动零漂移（指针图点恒定）；视口矩形
	* 仍随实时相机走冻结投影（拖动跟随可见），松手整面重投影（域重并集）。 */
	let frozen = $.state(void 0);
	const model = $.derived(() => {
		const source = {
			registry: $$props.controller.registry,
			subgraphs: $.get(graph).subgraphs
		};
		const sizes = {
			canvas: $.get(canvasSize),
			box: {
				width: width(),
				height: height()
			}
		};
		const base = $.get(frozen) ?? minimapModel(source, $.get(graph), $.get(viewport), sizes);
		if ($.get(frozen) === void 0) return base;
		return {
			...base,
			viewport: miniViewportRect($.get(viewport), $.get(canvasSize), $.get(frozen).projection)
		};
	});
	let root = $.state(void 0);
	let dragging = false;
	/** 导航一步：指针缩略坐标→图坐标→定心（setViewport 视口域零快照）。 */
	function navigate(e) {
		const rect = $.get(root)?.getBoundingClientRect();
		const canvas = $.get(canvasSize);
		const point = miniToGraph($.get(model).projection, {
			x: e.clientX - (rect?.left ?? 0),
			y: e.clientY - (rect?.top ?? 0)
		});
		$$props.controller.setViewport(centerViewportOn($$props.controller.getViewport(), point, canvas.width, canvas.height));
	}
	function onPointerDown(e) {
		e.stopPropagation();
		if (e.button !== 0) return;
		$.set(frozen, $.get(model), true);
		dragging = true;
		capturePointer(e);
		navigate(e);
	}
	function onPointerMove(e) {
		e.stopPropagation();
		if (dragging) navigate(e);
	}
	function endDrag(e) {
		e.stopPropagation();
		if (!dragging) return;
		dragging = false;
		$.set(frozen, void 0);
	}
	/** 拖拽期间捕获指针（jsdom 无实现，容错跳过——CanvasView 同法）。 */
	function capturePointer(e) {
		try {
			$.get(root)?.setPointerCapture(e.pointerId);
		} catch {}
	}
	var div = root_3$1();
	$.attribute_effect(div, () => ({
		class: "fl-minimap",
		"data-fl-minimap": true,
		"data-fl-satellite": "",
		role: "img",
		"aria-label": TEXT_MINIMAP_LABEL,
		...satelliteIsolation,
		onpointerdown: onPointerDown,
		onpointermove: onPointerMove,
		onpointerup: endDrag,
		onpointercancel: endDrag,
		[$.STYLE]: {
			width: `${width() ?? ""}px`,
			height: `${height() ?? ""}px`
		}
	}), void 0, void 0, void 0, "svelte-1sqh8xo");
	var svg = $.child(div);
	var node_1 = $.child(svg);
	$.each(node_1, 17, () => $.get(model).edges, (edge) => edge.id, ($$anchor, edge) => {
		var line = root_1$2();
		$.template_effect(() => {
			$.set_attribute(line, "data-fl-minimap-edge", $.get(edge).id);
			$.set_attribute(line, "x1", $.get(edge).x1);
			$.set_attribute(line, "y1", $.get(edge).y1);
			$.set_attribute(line, "x2", $.get(edge).x2);
			$.set_attribute(line, "y2", $.get(edge).y2);
		});
		$.append($$anchor, line);
	});
	var node_2 = $.sibling(node_1);
	$.each(node_2, 17, () => $.get(model).nodes, (node) => node.id, ($$anchor, node) => {
		var rect_1 = root_2$1();
		$.template_effect(() => {
			$.set_attribute(rect_1, "data-fl-minimap-node", $.get(node).id);
			$.set_attribute(rect_1, "x", $.get(node).x);
			$.set_attribute(rect_1, "y", $.get(node).y);
			$.set_attribute(rect_1, "width", $.get(node).width);
			$.set_attribute(rect_1, "height", $.get(node).height);
		});
		$.append($$anchor, rect_1);
	});
	var rect_2 = $.sibling(node_2);
	$.reset(svg);
	$.reset(div);
	$.bind_this(div, ($$value) => $.set(root, $$value), () => $.get(root));
	$.template_effect(() => {
		$.set_attribute(svg, "width", width());
		$.set_attribute(svg, "height", height());
		$.set_attribute(rect_2, "x", $.get(model).viewport.x);
		$.set_attribute(rect_2, "y", $.get(model).viewport.y);
		$.set_attribute(rect_2, "width", $.get(model).viewport.width);
		$.set_attribute(rect_2, "height", $.get(model).viewport.height);
	});
	$.append($$anchor, div);
	$.pop();
}
//#endregion
//#region src/svelte/PropertiesPanel.svelte
var root$1 = $.from_html(`<div class="fl-props-empty svelte-cerfei" data-fl-props-empty=""> </div>`);
var root_1$1 = $.from_html(`<code class="fl-props-json svelte-cerfei" data-fl-props-json=""> </code>`);
var root_2 = $.from_html(`<div class="fl-props-row svelte-cerfei"><span class="fl-props-label svelte-cerfei"> </span> <span class="fl-props-field svelte-cerfei"><!></span></div>`);
var root_3 = $.from_html(`<div><!></div>`);
var $$css$1 = {
	hash: "svelte-cerfei",
	code: "\n  /* 供件=无容器壳（无定位/边框/背景——宿主嵌自有面板槽）；行布局与 token 化视觉\n   * （控件样式住 WidgetControl——分发链单源），token「宿主可定制+缺省」形态。 */.fl-props.svelte-cerfei {display:flex;flex-direction:column;gap:var(--fl-panel-space-sm, 5px);font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);\n    /* UA 原生控件随主题（票 22）：宿主挂载位在画布子树外——面板子树自设\n     * （tokens.css --fl-color-scheme 供值；.fl-canvas 同款） */color-scheme:var(--fl-color-scheme, light);\n    /* 面板侧 textarea 允许竖向拖调（票 07 原行为）——WidgetControl 令牌贯入\n     * （节点体不设此令牌=禁调，盒契约） */--fl-widget-resize: vertical;}.fl-props-empty.svelte-cerfei {color:var(--fl-fg-muted, #94a3b8);}.fl-props-json.svelte-cerfei {overflow-wrap:anywhere;font-family:ui-monospace, monospace;font-size:var(--fl-panel-font-size-muted, 11px);color:var(--fl-fg-muted, #94a3b8);}.fl-props-row.svelte-cerfei {display:flex;align-items:center;justify-content:space-between;gap:var(--fl-panel-space, 8px);}.fl-props-label.svelte-cerfei {flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.fl-props-field.svelte-cerfei {min-width:0;flex:1;min-height:26px; /* 定高会让 textarea 塌成单行——下限高让多行件固有生长 */display:flex;align-items:center;}"
};
function PropertiesPanel($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css$1);
	/** PropertiesPanel 属性面板供件（票 07）——卫星组件（票 02 模式：共享同一
	* controller、事件自吞+data-fl-satellite 标记隔离）。供件=不带容器壳：无定位/
	* 边框/背景，宿主嵌自有面板槽（FR-08 已裁面板容器归宿主壳）。当前编辑对象=
	* 选中集恰一节点（票 04 选中集→编辑对象；多选/空选只出提示），控件按词表项
	* widget 描述渲染——票 21 起分发链抽内部件 WidgetControl（节点体同源消费）：
	* widgetComponents 注册位指名覆盖 > 内建通用五型 > 只读 JSON 回退（不炸）。
	* 提交=命令式（票 07 票内定）：change 一次提交经 controller.setNodeData 恰一张
	* 快照，控件本地键入态不进 undo。 */
	let widgetComponents = $.prop($$props, "widgetComponents", 19, () => ({}));
	/** 自定义 widget 注册位（kind→组件，词表项 kind 指名）——覆盖内建通用件。 */
	const TEXT_NONE = "未选中节点";
	const TEXT_MULTI = "多选不编辑（选中单个节点后编辑参数）";
	let graph = $.state($.proxy($$props.controller.getState()));
	let selection = $.state($.proxy($$props.controller.getSelectionState()));
	$.user_effect(() => {
		return $$props.controller.subscribe(() => {
			$.set(graph, $$props.controller.getState(), true);
			$.set(selection, $$props.controller.getSelectionState(), true);
		});
	});
	/** 当前编辑对象：选中集恰一节点（pruneSelection 保证选区⊆图——undo/删点后不悬空）。 */
	const editing = $.derived(() => {
		if ($.get(selection).selected.size !== 1) return void 0;
		const id = [...$.get(selection).selected][0];
		return $.get(graph).nodes.find((n) => n.id === id);
	});
	const def = $.derived(() => $.get(editing) && $$props.controller.registry.lookup($.get(editing).typeId));
	const widgets = $.derived(() => $.get(def)?.widgets ?? []);
	const noWidgets = $.derived(() => ($.get(def) === void 0 || $.get(widgets).length === 0) && $.get(editing) !== void 0);
	/** 提交单参（通用控件与自定义组件同路）：恰一张快照，可撤销。 */
	function commit(w, value) {
		if ($.get(editing) === void 0) return;
		$$props.controller.setNodeData($.get(editing).id, { [w.name]: value });
	}
	function dataJson(node) {
		return JSON.stringify(node.data);
	}
	var div = root_3();
	$.attribute_effect(div, () => ({
		class: "fl-props",
		"data-fl-props": true,
		"data-fl-satellite": "",
		...satelliteIsolation
	}), void 0, void 0, void 0, "svelte-cerfei");
	var node_1 = $.child(div);
	var consequent = ($$anchor) => {
		var div_1 = root$1();
		var text = $.only_child(div_1, true);
		$.template_effect(() => $.set_text(text, $.get(selection).selected.size > 1 ? TEXT_MULTI : TEXT_NONE));
		$.append($$anchor, div_1);
	};
	var consequent_1 = ($$anchor) => {
		var code = root_1$1();
		var text_1 = $.only_child(code, true);
		$.template_effect(($0) => $.set_text(text_1, $0), [() => dataJson($.get(editing))]);
		$.append($$anchor, code);
	};
	var alternate = ($$anchor) => {
		var fragment = $.comment();
		var node_2 = $.first_child(fragment);
		$.key(node_2, () => $.get(editing).id, ($$anchor) => {
			var fragment_1 = $.comment();
			var node_3 = $.first_child(fragment_1);
			$.each(node_3, 17, () => $.get(widgets), (w) => w.name, ($$anchor, w) => {
				var div_2 = root_2();
				var span = $.child(div_2);
				var text_2 = $.only_child(span, true);
				var span_1 = $.sibling(span, 2);
				WidgetControl($.child(span_1), {
					get value() {
						return $.get(editing).data[$.get(w).name];
					},
					get def() {
						return $.get(w);
					},
					get components() {
						return widgetComponents();
					},
					onCommit: (v) => commit($.get(w), v)
				});
				$.reset(span_1);
				$.reset(div_2);
				$.template_effect(() => {
					$.set_attribute(div_2, "data-fl-widget", $.get(w).name);
					$.set_text(text_2, $.get(w).label ?? $.get(w).name);
				});
				$.append($$anchor, div_2);
			});
			$.append($$anchor, fragment_1);
		});
		$.append($$anchor, fragment);
	};
	$.if(node_1, ($$render) => {
		if ($.get(editing) === void 0) $$render(consequent);
		else if ($.get(noWidgets)) $$render(consequent_1, 1);
		else $$render(alternate, -1);
	});
	$.reset(div);
	$.append($$anchor, div);
	$.pop();
}
//#endregion
//#region src/svelte/SelectionToolbox.svelte
var root = $.from_html(`<button type="button" class="fl-toolbox-btn svelte-19eh5no"> </button>`);
var root_1 = $.from_html(`<div></div>`);
var $$css = {
	hash: "svelte-19eh5no",
	code: "\n  /* 无壳：absolute 定位（宿主 overlay 对齐画布几何——overlay 通常\n   * pointer-events:none 全覆盖、本根显式 auto 复得命中）；token「宿主可定制+\n   * 缺省」形态（--fl-panel-* 系，同 NodeSearchBox）。 */.fl-toolbox.svelte-19eh5no {position:absolute;z-index:var(--fl-panel-z, 10);display:flex;gap:var(--fl-panel-space-xs, 4px);padding:var(--fl-panel-space-xs, 4px);border:1px solid var(--fl-panel-border, #e2e8f0);border-radius:var(--fl-panel-radius, 6px);background:var(--fl-panel-bg, #ffffff);box-shadow:var(--fl-panel-shadow, 0 4px 12px rgb(15 23 42 / 12%));font:var(--fl-panel-font-size, 13px)/1.4 system-ui, sans-serif;color:var(--fl-fg, #334155);transform:translate(-50%, -100%);pointer-events:auto;}.fl-toolbox-btn.svelte-19eh5no {padding:var(--fl-panel-space-xs, 4px) var(--fl-panel-space-sm, 5px);border:none;border-radius:var(--fl-panel-radius, 6px);font:inherit;color:inherit;background:none;cursor:pointer;white-space:nowrap;}.fl-toolbox-btn.svelte-19eh5no:hover {background:color-mix(in srgb, var(--fl-selection, #2563eb) 10%, transparent);}"
};
function SelectionToolbox($$anchor, $$props) {
	$.push($$props, true);
	$.append_styles($$anchor, $$css);
	/** SelectionToolbox 选区浮动工具条（票 15，story 24）——卫星组件第五件（票 02
	* 模式：共享同一 controller、satelliteIsolation 统裁隔离）。宿主挂载（Minimap
	* 先例——库不供开关 UI）；**坐标域=画布容器左上原点**（宿主 overlay 与画布
	* 几何对齐，组件自身 absolute 定位无壳）。
	* 显隐（票内裁定「拖动中不闪现」）：选区非空且选区/连线/reroute 三机手势全
	* idle——图手势（框选/节点拖动/连线/拖点）在途即隐藏、终局随订阅复显；镜头
	* 手势（平移/缩放）不隐藏，锚随镜头实时重算（订阅含视口变化）。票 31 增右键
	* 菜单期让位（右键改选召出工具条与菜单同位叠置——菜单期隐、菜单关照常随选区显）。
	* 锚=选中节点包围盒上沿中点上方间隙（graph 域 nodesBounding → graphToScreen，
	* 居中经 CSS translate——宽度随缺席隐藏自适应）。
	* 操作集表驱动（**缺席操作隐藏**——缺席=对当前选区必然 no-op 的操作不占位）：
	* 对齐六轴（≥2 节点）+分布两轴（≥3——kernel no-op 阈值同源）+成组/解组
	* （groupContainingAll 判定动态文案，镜像 toggle 分岔）+删除；**删除/成组走
	* controller.commands.executeCommand（与键位同源——票 14 原则）**、对齐/分布
	* 无命令（票 13 显式无键位）直连公共面。 */
	/** 包围盒上沿到工具条的垂直间隙（px，测试手算同源）。 */
	const TOOLBOX_GAP_PX = 12;
	const ALIGN_OPS = [
		[
			"left",
			"左齐",
			"左对齐"
		],
		[
			"center-x",
			"横中",
			"水平居中"
		],
		[
			"right",
			"右齐",
			"右对齐"
		],
		[
			"top",
			"顶齐",
			"顶对齐"
		],
		[
			"center-y",
			"竖中",
			"垂直居中"
		],
		[
			"bottom",
			"底齐",
			"底对齐"
		]
	];
	const DISTRIBUTE_OPS = [[
		"horizontal",
		"横布",
		"水平等间隙分布"
	], [
		"vertical",
		"竖布",
		"垂直等间隙分布"
	]];
	const TEXT_GROUP = "成组";
	const TEXT_UNGROUP = "解组";
	const TEXT_DELETE = "删除";
	const TEXT_GROUP_TITLE = "成组（Ctrl+G）";
	const TEXT_UNGROUP_TITLE = "解组（Ctrl+G）";
	const TEXT_DELETE_TITLE = "删除选中（Delete）";
	let graph = $.state($.proxy($$props.controller.getState()));
	let viewport = $.state($.proxy($$props.controller.getViewport()));
	let selection = $.state($.proxy($$props.controller.getSelectionState()));
	let link = $.state($.proxy($$props.controller.getLinkState()));
	let reroute = $.state($.proxy($$props.controller.getRerouteState()));
	let contextMenu = $.state($.proxy($$props.controller.getContextMenuState()));
	$.user_effect(() => {
		return $$props.controller.subscribe(() => {
			$.set(graph, $$props.controller.getState(), true);
			$.set(viewport, $$props.controller.getViewport(), true);
			$.set(selection, $$props.controller.getSelectionState(), true);
			$.set(link, $$props.controller.getLinkState(), true);
			$.set(reroute, $$props.controller.getRerouteState(), true);
			$.set(contextMenu, $$props.controller.getContextMenuState(), true);
		});
	});
	const selectedNodes = $.derived(() => $.get(graph).nodes.filter((n) => $.get(selection).selected.has(n.id)));
	/** 显隐面：非空选区 + 图手势全 idle（见模块头裁定）+ 右键菜单不在场（票 31 让位）。 */
	const visible = $.derived(() => $.get(selectedNodes).length > 0 && $.get(selection).gesture.kind === "idle" && $.get(link).gesture.kind === "idle" && $.get(reroute).gesture.kind === "idle" && $.get(contextMenu) === void 0);
	/** 锚：选中集包围盒上沿中点上方间隙（屏幕域——随镜头订阅重算；包围盒=派生尺寸）。 */
	const anchor = $.derived(() => {
		const bounds = nodesBounding({
			registry: $$props.controller.registry,
			subgraphs: $.get(graph).subgraphs
		}, $.get(selectedNodes));
		const top = graphToScreen($.get(viewport), {
			x: bounds.x + bounds.width / 2,
			y: bounds.y
		});
		return {
			left: top.x,
			top: top.y - TOOLBOX_GAP_PX
		};
	});
	/** 操作集（表驱动）：show=缺席判据（kernel no-op 阈值同源）。 */
	const ops = $.derived(() => {
		const count = $.get(selectedNodes).length;
		const grouped = groupContainingAll($.get(graph), $.get(selection).selected) !== void 0;
		return [
			...ALIGN_OPS.map(([axis, label, title]) => ({
				op: `align-${axis}`,
				label,
				title,
				show: count >= 2,
				run: () => $$props.controller.alignSelection(axis)
			})),
			...DISTRIBUTE_OPS.map(([axis, label, title]) => ({
				op: `distribute-${axis}`,
				label,
				title,
				show: count >= 3,
				run: () => $$props.controller.distributeSelection(axis)
			})),
			{
				op: "group",
				label: grouped ? TEXT_UNGROUP : TEXT_GROUP,
				title: grouped ? TEXT_UNGROUP_TITLE : TEXT_GROUP_TITLE,
				show: true,
				run: () => $$props.controller.commands.executeCommand(BUILTIN_COMMANDS.groupToggle)
			},
			{
				op: "delete",
				label: TEXT_DELETE,
				title: TEXT_DELETE_TITLE,
				show: true,
				run: () => $$props.controller.commands.executeCommand(BUILTIN_COMMANDS.deleteSelection)
			}
		];
	});
	var fragment = $.comment();
	var node = $.first_child(fragment);
	var consequent_1 = ($$anchor) => {
		var div = root_1();
		$.attribute_effect(div, () => ({
			class: "fl-toolbox",
			"data-fl-toolbox": true,
			"data-fl-satellite": "",
			...satelliteIsolation,
			[$.STYLE]: {
				left: `${$.get(anchor).left ?? ""}px`,
				top: `${$.get(anchor).top ?? ""}px`
			}
		}), void 0, void 0, void 0, "svelte-19eh5no");
		$.each(div, 21, () => $.get(ops), (item) => item.op, ($$anchor, item) => {
			var fragment_1 = $.comment();
			var node_1 = $.first_child(fragment_1);
			var consequent = ($$anchor) => {
				var button = root();
				var text = $.only_child(button, true);
				$.template_effect(() => {
					$.set_attribute(button, "data-fl-tb-btn", $.get(item).op);
					$.set_attribute(button, "title", $.get(item).title);
					$.set_attribute(button, "aria-label", $.get(item).title);
					$.set_text(text, $.get(item).label);
				});
				$.delegated("click", button, () => $.get(item).run());
				$.append($$anchor, button);
			};
			$.if(node_1, ($$render) => {
				if ($.get(item).show) $$render(consequent);
			});
			$.append($$anchor, fragment_1);
		});
		$.reset(div);
		$.append($$anchor, div);
	};
	$.if(node, ($$render) => {
		if ($.get(visible)) $$render(consequent_1);
	});
	$.append($$anchor, fragment);
	$.pop();
}
$.delegate(["click"]);
//#endregion
export { BUILTIN_COMMANDS, CanvasView, ContextMenu, FLOWLOOM_NODE_MIME, KEYBOARD_ZOOM_FACTOR, Minimap, NodeSearchBox, PropertiesPanel, SelectionToolbox, TitleEditor, createCanvasController, createSelectionStore, isNodeDragDataTransfer, readDraggedTypeId, satelliteIsolation, setNodeDragData, swallow };
