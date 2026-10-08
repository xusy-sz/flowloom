//#region src/kernel/types.ts
/** 抽象输入事件（引擎无关红线：内核状态机只吃归一化事件）。
*
* 契约 v2（INPUT_EVENT_CONTRACT_VERSION）——渲染层归一化职责与语义：
* - x/y：画布元素本地屏幕坐标（原点=画布左上角，CSS px）；
* - wheel.deltaY：像素域（deltaMode=line/page 的换算归渲染层）；
* - key：DOM e.key 语义（空格=' '、'Escape'、'Enter'…）；
* - modifiers：规范键集 'ctrl'|'shift'|'alt'|'meta'，归一化去重排序后传入；
* - button：0=左 1=中 2=右（DOM 语义直传）；
* - contextmenu（票 31 升 v2 纯增量）：右键菜单事件——四交互机不认此事件
*   （右键无既有手势占用），菜单侧经派发环旁挂观察消费（命中解析=context-menu.ts）。
* 契约变更（增删事件或字段）必须升版本号——下游状态机与渲染层成对适配。 */
var INPUT_EVENT_CONTRACT_VERSION = 2;
//#endregion
//#region src/kernel/subgraph-ports.ts
/** 子图占位节点的保留型 typeId（父容器内普通节点；id 与子图记录同一）。 */
var SUBGRAPH_TYPE_ID = "fl:subgraph";
/** 入边界代理（容器内侧一输出端口——数据入口）。 */
var SUBGRAPH_INPUT_TYPE_ID = "fl:subgraph-input";
/** 出边界代理（容器内侧一输入端口——数据出口）。 */
var SUBGRAPH_OUTPUT_TYPE_ID = "fl:subgraph-output";
/** 保留型 typeId 集（剪贴板滤除/转换成员滤除共用单点）。 */
var RESERVED_TYPE_IDS = /* @__PURE__ */ new Set([
	SUBGRAPH_TYPE_ID,
	SUBGRAPH_INPUT_TYPE_ID,
	SUBGRAPH_OUTPUT_TYPE_ID
]);
/** 保留型节点（占位/边界代理）——剪贴板不携子图（票 05 契约面不动，票 09 组同款）。 */
function isReservedNode(node) {
	return RESERVED_TYPE_IDS.has(node.typeId);
}
/** 子图占位端口行距（图坐标 px——占位高度随口数生长：口行高至少此值）。 */
var SUBGRAPH_PORT_ROW = 24;
/** 保留型节点的合成词表项（渲染/命中共用单源——portPositions/compatiblePortOn 消费）：
* 占位=记录口表合成（孤儿占位零口）、代理=typeId 定侧+data.portId 定口（坏 data
* 零口——宿主数据不设信）、普通型委托注册表。 */
function effectiveNodeDef(registry, subgraphs, node) {
	if (node.typeId === "fl:subgraph") {
		const sub = subgraphs.find((s) => s.id === node.id);
		if (sub === void 0) return void 0;
		const port = (p) => ({
			portId: p.portId,
			label: p.portId
		});
		return {
			typeId: SUBGRAPH_TYPE_ID,
			label: sub.name,
			inputs: sub.inputs.map(port),
			outputs: sub.outputs.map(port)
		};
	}
	if (node.typeId === "fl:subgraph-input" || node.typeId === "fl:subgraph-output") {
		const portId = typeof node.data.portId === "string" ? node.data.portId : void 0;
		if (portId === void 0) return void 0;
		const ioPort = {
			portId,
			label: "入口"
		};
		return node.typeId === "fl:subgraph-input" ? {
			typeId: SUBGRAPH_INPUT_TYPE_ID,
			label: "子图入口",
			inputs: [],
			outputs: [ioPort]
		} : {
			typeId: SUBGRAPH_OUTPUT_TYPE_ID,
			label: "子图出口",
			inputs: [ioPort],
			outputs: []
		};
	}
	return registry.lookup(node.typeId);
}
/** 全局节点 id 集（id 空间全局唯一裁定的查重单点——门面取号/粘贴重映射消费）。 */
function globalNodeIds(root) {
	const ids = new Set(root.nodes.map((n) => n.id));
	for (const sub of root.subgraphs) for (const n of sub.nodes) ids.add(n.id);
	return ids;
}
/** 全局边 id 集（同 globalNodeIds）。 */
function globalEdgeIds(root) {
	const ids = new Set(root.edges.map((e) => e.id));
	for (const sub of root.subgraphs) for (const e of sub.edges) ids.add(e.id);
	return ids;
}
//#endregion
//#region src/kernel/graph.ts
function createGraph() {
	return {
		nodes: [],
		edges: [],
		groups: [],
		subgraphs: []
	};
}
function addNode(graph, node) {
	if (nodeById(graph, node.id) !== void 0) throw new Error(`节点 id 重复：${node.id}（换 id 或先 removeNode 摘旧）`);
	return {
		...graph,
		nodes: [...graph.nodes, node]
	};
}
/** 删节点并级联删其相关边（两端口任一命中即删）。无命中返回同引用（removeNodes 单实现）。 */
function removeNode(graph, nodeId) {
	return removeNodes(graph, /* @__PURE__ */ new Set([nodeId]));
}
/** 批量删节点并级联删相关边（任一端命中即删）与组面（memberIds 修剪、组空即散
* ——组随末成员消亡，票 09）——选区删除单趟过滤。
* 无一命中返回同引用（no-op 契约：边只引用节点，节点未删则边集/组集不变）。 */
function removeNodes(graph, ids) {
	if (ids.size === 0) return graph;
	const nodes = graph.nodes.filter((n) => !ids.has(n.id));
	if (nodes.length === graph.nodes.length) return graph;
	const edges = graph.edges.filter((e) => !ids.has(e.from.nodeId) && !ids.has(e.to.nodeId));
	const groups = withoutMembers(graph.groups, ids);
	return {
		...graph,
		nodes,
		edges,
		groups
	};
}
/** 组集成员修剪（删员/偷员共用单实现——group.ts 成组偷员同消费）：memberIds 去
* removed、被清空的组消散（组随末成员消亡）；无变化返回原数组引用。 */
function withoutMembers(groups, removed) {
	let changed = false;
	const next = [];
	for (const group of groups) {
		const memberIds = group.memberIds.filter((id) => !removed.has(id));
		if (memberIds.length === 0) changed = true;
		else if (memberIds.length === group.memberIds.length) next.push(group);
		else {
			changed = true;
			next.push({
				...group,
				memberIds
			});
		}
	}
	return changed ? next : groups;
}
function addEdge(graph, edge) {
	assertPort(graph, edge.from);
	assertPort(graph, edge.to);
	if (graph.edges.some((e) => e.id === edge.id)) throw new Error(`边 id 重复：${edge.id}（换 id 或先摘旧边）`);
	return {
		...graph,
		edges: [...graph.edges, edge]
	};
}
/** 端口引用全等（节点 id+端口 id）。 */
function samePortRef(a, b) {
	return a.nodeId === b.nodeId && a.portId === b.portId;
}
/** 按边 id 查找；不存在返回 undefined。 */
function edgeById(graph, edgeId) {
	return graph.edges.find((e) => e.id === edgeId);
}
/** 重复边判定：同 from→to（两端口全等）即重复——反向或换端口不算（连线机防第二条）。 */
function hasEdgeBetween(graph, from, to) {
	return graph.edges.some((e) => samePortRef(e.from, from) && samePortRef(e.to, to));
}
/** 删单条边；id 不存在返回同引用（no-op 契约——改连落定时被移动边可能已被宿主删）。 */
function removeEdge(graph, edgeId) {
	if (edgeById(graph, edgeId) === void 0) return graph;
	return {
		...graph,
		edges: graph.edges.filter((e) => e.id !== edgeId)
	};
}
function moveNode(graph, nodeId, x, y) {
	const nodes = graph.nodes.map((n) => n.id === nodeId ? {
		...n,
		x,
		y
	} : n);
	return {
		...graph,
		nodes
	};
}
/** 批量平移节点（选区整体拖动）：单趟 map；零位移或零命中返回同引用（no-op 契约）。
* 组面不变量（票 09）：拖动集 ⊇ 某组全成员 → 组框随同位移刚性平移（整组拖动）；
* 部分成员拖动组框不动（显式 FitGroupToContents 才收口）。 */
function moveNodes(graph, ids, dx, dy) {
	if (ids.size === 0 || dx === 0 && dy === 0) return graph;
	let moved = false;
	const nodes = graph.nodes.map((n) => {
		if (!ids.has(n.id)) return n;
		moved = true;
		return {
			...n,
			x: n.x + dx,
			y: n.y + dy
		};
	});
	if (!moved) return graph;
	const groups = translateGroups(graph.groups, ids, dx, dy);
	return {
		...graph,
		nodes,
		groups
	};
}
/** 批量绝对落位（票 13 排布命令共用）：逐节点写目标坐标，单趟 map；无命中或全部
* 已在目标位返回同引用（no-op 契约——门面据此零快照）。组框不随动：非统一平移，
* 刚性平移不变量只在 moveNodes 成立，组框收口归调用方重适配（排布命令恒
* fit-to-contents）。 */
function moveNodesTo(graph, targets) {
	if (targets.size === 0) return graph;
	let moved = false;
	const nodes = graph.nodes.map((n) => {
		const target = targets.get(n.id);
		if (target === void 0 || target.x === n.x && target.y === n.y) return n;
		moved = true;
		return {
			...n,
			x: target.x,
			y: target.y
		};
	});
	return moved ? {
		...graph,
		nodes
	} : graph;
}
/** 整组随动：memberIds ⊆ 拖动集（且非空）的组框平移；无命中返回原数组引用。 */
function translateGroups(groups, ids, dx, dy) {
	let changed = false;
	const next = groups.map((group) => {
		if (group.memberIds.length === 0 || !group.memberIds.every((id) => ids.has(id))) return group;
		changed = true;
		return {
			...group,
			x: group.x + dx,
			y: group.y + dy
		};
	});
	return changed ? next : groups;
}
/** 浅合并写节点 data（widget 编辑回写单实现——票 07）：patch 键覆写 data 同名键、
* 其余键不动（schema 无关：内核只搬运不解释值）。节点不存在或空 patch 返回同引用
* （no-op 契约——门面据此零快照拒绝）。 */
function updateNodeData(graph, nodeId, patch) {
	if (!graph.nodes.some((n) => n.id === nodeId) || Object.keys(patch).length === 0) return graph;
	const nodes = graph.nodes.map((n) => n.id === nodeId ? {
		...n,
		data: {
			...n.data,
			...patch
		}
	} : n);
	return {
		...graph,
		nodes
	};
}
/** 折叠/放开 toggle（票 26）：collapsed 内存合并态翻转——折叠置 true、放开摘键回
* undefined（不落 false 噪声，展开=无键）。纯视图关注点：semanticHash 恒不含（布局
* 半边投宿，serialize 钉死）。节点不存在返回同引用（no-op 契约——门面据此零快照）。 */
function toggleNodeCollapse(graph, nodeId) {
	let hit = false;
	const nodes = graph.nodes.map((n) => {
		if (n.id !== nodeId) return n;
		hit = true;
		const next = { ...n };
		if (next.collapsed === true) delete next.collapsed;
		else next.collapsed = true;
		return next;
	});
	return hit ? {
		...graph,
		nodes
	} : graph;
}
function nodeById(graph, nodeId) {
	return graph.nodes.find((n) => n.id === nodeId);
}
/** 自定义标题的 data 保留键（票 15）：标题住节点 data（写路=既有 updateNodeData/
* setNodeData——恰一张快照），随语义半边进 hash、随剪贴板载荷走。保留前缀 `fl:`
* 与保留型 typeId 同口径——宿主自担不占用。 */
var TITLE_DATA_KEY = "fl:title";
/** 自定义标题读取（显示名单源的取值面，票 15）：trim 后非空字符串才算自定义
* （判定用 trim、取值保原串）；空串=「清除自定义、回退词表名」的持久化形——
* 浅合并不动键集的清除路。非串值（宿主数据不设信）视同无自定义。 */
function nodeCustomTitle(node) {
	const value = node.data[TITLE_DATA_KEY];
	return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
/** 节点显示名单源（票 15）：自定义标题 > 词表/保留型合成 label（effectiveNodeDef
* ——占位=子图名、代理=入口/出口）> typeId（未注册回退，story 9 姿态）。
* 渲染层节点字面/TitleEditor 初值/Tooltip 内容三方共用。 */
function displayNodeTitle(registry, subgraphs, node) {
	return nodeCustomTitle(node) ?? effectiveNodeDef(registry, subgraphs, node)?.label ?? node.typeId;
}
function assertPort(graph, ref) {
	if (nodeById(graph, ref.nodeId) === void 0) throw new Error(`边端点节点不存在：${ref.nodeId}（先加端点节点或改挂实存 id）`);
}
//#endregion
//#region src/kernel/geometry.ts
var NODE_DEFAULT_WIDTH = 160;
var NODE_DEFAULT_HEIGHT = 48;
/** 三段形（标题条+widget 行列）标题条高（图坐标 px）。 */
var NODE_HEADER_HEIGHT = 24;
/** 端口标签行高（票 22 chrome：行心锚定源——ComfyUI NODE_SLOT_HEIGHT=20 同构）。 */
var PORT_ROW_HEIGHT = 20;
/** 单 widget 行步进（含行间间隙——ComfyUI 20+4 同构）。 */
var WIDGET_ROW_HEIGHT = 24;
/** textarea 固定行数（v1 不做内容撑高——EXPANDING 策略悬置）。 */
var WIDGET_TEXTAREA_ROWS = 3;
/** widget 块尾 padding（块末与节点底缘的留白）。 */
var WIDGET_BLOCK_TAIL = 8;
/** 有 widgets 节点最小宽（控件面需要；宽度策略票内原型裁定的默认档）。 */
var WIDGET_MIN_WIDTH = 240;
/** 折叠态节点高（票 26）：标题条 24+底 padding 8——折叠分支的派生高手算单源
* （常量值=标题条+底 padding 几何读数定，票内原型裁定档；宽不变=展开派生宽原样）。 */
var WIDGET_COLLAPSED_HEIGHT = 32;
/** 单 widget 行高：textarea=3 行，其余内建/自定义型=单行。 */
function widgetRowHeight(def) {
	return def.kind === "textarea" ? 72 : 24;
}
/** widget 块高=Σ行高+尾 padding；空表=0（无 widget 不占高）。 */
function widgetBlockHeight(widgets) {
	if (widgets.length === 0) return 0;
	return widgets.reduce((sum, w) => sum + widgetRowHeight(w), 0) + 8;
}
/** 节点的词表 widget 声明（经 effectiveNodeDef 单源解析——保留型合成 def 无
* widgets 即不供件）。 */
function nodeWidgets(source, node) {
	return effectiveNodeDef(source.registry, source.subgraphs ?? [], node)?.widgets ?? [];
}
/** 节点类别色（票 22 词表可选字段透传）：def.color 原样可达渲染层（标题带染色
* 消费）；未声明/未注册/保留型=undefined 走中性 token——内核只搬运不解释。 */
function nodeCategoryColor(source, node) {
	return effectiveNodeDef(source.registry, source.subgraphs ?? [], node)?.color;
}
/** 节点端口两表（effectiveNodeDef 单源：渲染层端口标签行与内核锚定共用——
* 未注册型零端口，回退显示不参与端口交互）。 */
function nodePorts(source, node) {
	const def = effectiveNodeDef(source.registry, source.subgraphs ?? [], node);
	return def === void 0 ? {
		inputs: [],
		outputs: []
	} : {
		inputs: def.inputs,
		outputs: def.outputs
	};
}
/** 端口标签行数（两侧端口数取大——行内左入右出对排，ComfyUI NodeSlots 同构）。 */
function portRowCount(source, node) {
	const { inputs, outputs } = nodePorts(source, node);
	return Math.max(inputs.length, outputs.length);
}
function portRowPairs(source, node) {
	const { inputs, outputs } = nodePorts(source, node);
	return Array.from({ length: portRowCount(source, node) }, (_, i) => ({
		input: inputs[i],
		output: outputs[i]
	}));
}
function nodeSize(source, node) {
	const widgets = nodeWidgets(source, node);
	const rows = portRowCount(source, node);
	const width = node.width ?? 160;
	const height = node.height ?? 48;
	const derivedWidth = widgets.length > 0 ? Math.max(width, 240) : width;
	if (node.collapsed === true) return {
		width: derivedWidth,
		height: 32
	};
	if (widgets.length === 0 && rows === 0) return {
		width,
		height
	};
	return {
		width: derivedWidth,
		height: Math.max(height, 24 + rows * 20 + widgetBlockHeight(widgets))
	};
}
function nodeRect(source, node) {
	const size = nodeSize(source, node);
	return {
		x: node.x,
		y: node.y,
		...size
	};
}
/** 节点集占位包围盒（≥1 节点必有值）——组框（票 09）与子图转换占位（票 10）
* 共用的单一几何源。 */
function nodesBounding(source, nodes) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const rect = nodeRect(source, node);
		minX = Math.min(minX, rect.x);
		minY = Math.min(minY, rect.y);
		maxX = Math.max(maxX, rect.x + rect.width);
		maxY = Math.max(maxY, rect.y + rect.height);
	}
	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY
	};
}
//#endregion
//#region src/kernel/viewport.ts
var DEFAULT_VIEWPORT_LIMITS = {
	minScale: .1,
	maxScale: 4
};
function screenToGraph(viewport, screen) {
	return {
		x: screen.x / viewport.scale + viewport.offsetX,
		y: screen.y / viewport.scale + viewport.offsetY
	};
}
function graphToScreen(viewport, graph) {
	return {
		x: (graph.x - viewport.offsetX) * viewport.scale,
		y: (graph.y - viewport.offsetY) * viewport.scale
	};
}
/** 屏幕位移平移：内容随指针同向移动（dx/dy 为屏幕像素）。 */
function panBy(viewport, dx, dy) {
	return {
		scale: viewport.scale,
		offsetX: viewport.offsetX - dx / viewport.scale,
		offsetY: viewport.offsetY - dy / viewport.scale
	};
}
/** 图点定心（票 12 minimap 导航/宿主聚焦共用；fitView 亦经此单一定心式）：镜头平移
* 使图点位于容器中心，scale 不变。offset = 图点 − 容器半幅/scale（约定见文件头）。 */
function centerViewportOn(viewport, point, width, height) {
	return {
		scale: viewport.scale,
		offsetX: point.x - width / (2 * viewport.scale),
		offsetY: point.y - height / (2 * viewport.scale)
	};
}
/** 指针锚定缩放：anchor（屏幕坐标）下的图点在缩放前后不动。
* factor>1 放大、<1 缩小；scale 夹取在 limits 内。已贴限且 factor 仍越界时为 no-op
* （返回同引用——值语义 no-op 契约，供订阅通知去抖）。 */
function zoomAt(viewport, anchor, factor, limits = DEFAULT_VIEWPORT_LIMITS) {
	const nextScale = Math.min(limits.maxScale, Math.max(limits.minScale, viewport.scale * factor));
	if (nextScale === viewport.scale) return viewport;
	const anchorGraph = screenToGraph(viewport, anchor);
	return {
		scale: nextScale,
		offsetX: anchorGraph.x - anchor.x / nextScale,
		offsetY: anchorGraph.y - anchor.y / nextScale
	};
}
/** 节点占位包围盒（票 21 起按派生尺寸——词表 widgets 长高计入）；空图返回 undefined。 */
function graphBounds(source, nodes) {
	if (nodes.length === 0) return void 0;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		const size = nodeSize(source, node);
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + size.width);
		maxY = Math.max(maxY, node.y + size.height);
	}
	return {
		minX,
		minY,
		maxX,
		maxY
	};
}
var FIT_VIEW_MARGIN = 50;
/** 导出域（票 56，吃票 48 裁 4）：节点∪组框占位∪边中继点的并集再四向扩 margin。
* 与 graphBounds 口径同源（票 12 投影域姿态）但扩展三面——组框可越节点界、中继点
* 可拖出节点界（裁掉边尾是真缺陷，纯 graphBounds 不够的立项理由）。空图=原点零域
* +margin（恒有界——导出对空图恒可用，非报错面）。 */
function exportBounds(source, graph, margin = 50) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const take = (x, y, w, h) => {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x + w);
		maxY = Math.max(maxY, y + h);
	};
	for (const node of graph.nodes) {
		const size = nodeSize(source, node);
		take(node.x, node.y, size.width, size.height);
	}
	for (const group of graph.groups) take(group.x, group.y, group.width, group.height);
	for (const edge of graph.edges) for (const point of edge.reroutes ?? []) take(point.x, point.y, 0, 0);
	if (minX === Infinity) return {
		minX: -margin,
		minY: -margin,
		maxX: margin,
		maxY: margin
	};
	return {
		minX: minX - margin,
		minY: minY - margin,
		maxX: maxX + margin,
		maxY: maxY + margin
	};
}
/** 全图适配：缩放到节点包围盒适配容器可用区（去边距）并居中。
* 放大侧封顶 1（适配不放大）；结果再夹取 limits。空图或零尺寸容器返回 undefined。
* 居中=包围盒中心定心（centerViewportOn 单一定心式）。票 21 起包围盒=派生尺寸
* （widget 长高计入适配域）；容器尺寸收拢 Size 单参（兼合参数红线）。 */
function fitView(source, nodes, canvas, options = {}) {
	const margin = options.margin ?? 50;
	const limits = options.limits ?? DEFAULT_VIEWPORT_LIMITS;
	const { width, height } = canvas;
	const bounds = graphBounds(source, nodes);
	if (bounds === void 0 || width <= 0 || height <= 0) return void 0;
	const boundsWidth = bounds.maxX - bounds.minX;
	const boundsHeight = bounds.maxY - bounds.minY;
	const availWidth = Math.max(1, width - margin * 2);
	const availHeight = Math.max(1, height - margin * 2);
	const fit = Math.min(availWidth / boundsWidth, availHeight / boundsHeight, 1);
	return centerViewportOn({
		scale: Math.min(limits.maxScale, Math.max(limits.minScale, fit)),
		offsetX: 0,
		offsetY: 0
	}, {
		x: (bounds.minX + bounds.maxX) / 2,
		y: (bounds.minY + bounds.maxY) / 2
	}, width, height);
}
//#endregion
//#region src/kernel/hittest.ts
/** 节点矩形命中：数组后者在上（渲染序=层叠序）。半开区间（含左上、不含右下）。 */
function hitTestNode(viewport, source, nodes, screen) {
	const p = screenToGraph(viewport, screen);
	for (const node of topmostFirst(nodes)) {
		const rect = nodeRect(source, node);
		if (p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height) return node;
	}
}
/** 层叠序遍历（数组后者在上→先遍历）——「后者在上」规则单点成文，四类命中共用
* （reroute 点/边路径命中同规则，票 11）。 */
function topmostFirst(items) {
	return [...items].reverse();
}
/** 矩形相交命中（图坐标域，框选用）：节点占位矩形与选区矩形相交即入选（非包含）。
* 零面积矩形（原点单击）不选任何节点——退化区间显式短路，不依赖重叠公式的边界行为。 */
function nodesIntersectingRect(source, nodes, rect) {
	if (rect.width <= 0 || rect.height <= 0) return [];
	return nodes.filter((node) => rectsIntersect(nodeRect(source, node), rect));
}
/** 组框命中（票 09）：屏幕点落组框矩形即命中，数组后者在上（渲染序=层叠序，
* 与 hitTestNode 同规则）；半开区间同节点命中。调用方先测节点（节点画在组框上层）。 */
function hitTestGroup(viewport, groups, screen) {
	const p = screenToGraph(viewport, screen);
	for (const group of topmostFirst(groups)) if (p.x >= group.x && p.x < group.x + group.width && p.y >= group.y && p.y < group.y + group.height) return group;
}
function rectsIntersect(a, b) {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
/** 端口几何（图坐标）：入在左缘、出在右缘，**行心锚定**（票 22 chrome 行化——第 i
* 个端口在标题条下第 i 行中心：HEADER+i×行高+行高/2；端口标签行与锚点同一几何源，
* 标签行恒可见=ComfyUI 常显先例）。端口集=effectiveNodeDef 单源（nodePorts）：注册表
* 词表项（未注册型零端口——回退显示不参与端口交互）或保留型合成（子图占位=记录口
* 表、边界代理=typeId 定侧+data.portId 定口）。行自顶起算与总高无关——存储形下限
* 胜出时余量成底部留白，锚点不漂移。折叠分支（票 26）：端口沿折叠高 (i+1)/(n+1)
* 均分（每侧按自家口数）——行心式在 32px 折叠条内行数>1 会溢出，均分保端口全可达
* （ComfyUI node.collapsed 同构）。 */
function portPositions(source, node) {
	const { inputs, outputs } = nodePorts(source, node);
	const spots = (defs, side, x) => defs.map((p, i) => ({
		portId: p.portId,
		side,
		x,
		y: node.y + 24 + i * 20 + 10,
		typeId: p.typeId
	}));
	if (node.collapsed === true) {
		const { width, height } = nodeSize(source, node);
		const spread = (defs, side, x) => defs.map((p, i) => ({
			portId: p.portId,
			side,
			x,
			y: node.y + (i + 1) / (defs.length + 1) * height,
			typeId: p.typeId
		}));
		return [...spread(inputs, "input", node.x), ...spread(outputs, "output", node.x + width)];
	}
	return [...spots(inputs, "input", node.x), ...spots(outputs, "output", node.x + nodeSize(source, node).width)];
}
/** 端口热区半径（屏幕像素）。 */
var PORT_HIT_RADIUS = 8;
/** 命中面→端口引用（PortHit 携侧别供交互，图边 PortRef 只存两端——换算单点）。 */
function portRefOf(hit) {
	return {
		nodeId: hit.nodeId,
		portId: hit.portId
	};
}
/** 端口热区命中：屏幕坐标距端口屏幕位置 ≤ 半径即命中；节点层叠序同 hitTestNode（后者优先）。 */
function hitTestPort(viewport, world, screen, radius = 8) {
	for (const node of topmostFirst(world.nodes)) for (const port of portPositions(world, node)) {
		const s = graphToScreen(viewport, {
			x: port.x,
			y: port.y
		});
		const dx = screen.x - s.x;
		const dy = screen.y - s.y;
		if (dx * dx + dy * dy <= radius * radius) return {
			nodeId: node.id,
			portId: port.portId,
			side: port.side
		};
	}
}
/** 端口锚点（图坐标）：portPositions 单一几何源；未注册型/词表漂移（端口已不存在）
* 回退节点中心——旧数据遇上新词表不炸（spec story 9 同源姿态）。边端点锚定
* （渲染层连线渲染）与 reroute 边路径命中（票 11）共用本单点。 */
function portAnchor(world, ref, side) {
	const node = world.nodes.find((n) => n.id === ref.nodeId);
	if (node === void 0) return {
		x: 0,
		y: 0
	};
	const port = portPositions(world, node).find((p) => p.portId === ref.portId && p.side === side);
	if (port !== void 0) return {
		x: port.x,
		y: port.y
	};
	const size = nodeSize(world, node);
	return {
		x: node.x + size.width / 2,
		y: node.y + size.height / 2
	};
}
//#endregion
//#region src/kernel/registry.ts
/** 泛型参数=宿主 data 映射表（与 FlowloomNode 同一形状），键联合即锁面；缺省
* Record<string, unknown> 归一回宽形（Extract<keyof …, string> = string）。 */
function createNodeRegistry(initial) {
	const defs = /* @__PURE__ */ new Map();
	const registry = {
		define(def) {
			if (defs.has(def.typeId)) throw new Error(`节点型重复注册：${def.typeId}（词表漂移须注册期暴露——检查重复 define；registry 请建一次复用）`);
			defs.set(def.typeId, def);
		},
		lookup(typeId) {
			return defs.get(typeId);
		},
		all() {
			return [...defs.values()];
		}
	};
	for (const def of initial ?? []) registry.define(def);
	return registry;
}
//#endregion
//#region src/kernel/subgraph-prune.ts
/** 级联组合单点（先记录后边界口——删占位可能连带删掉代理，须先 prune 记录再
* 清死口）：容器写回与档复原共用的收口入口，级联规则一变只改此处。 */
function pruneSubgraphCascades(root) {
	return pruneBoundaryPorts(pruneSubgraphs(root));
}
/** 删占位级联：记录亡（占位节点不在任何活容器）→记录连同容器内容整体消亡；
* 嵌套链随根亡（迭代至不动点——子记录的占位住父记录容器内，父亡则子占位失活）。
* 无死物同引用。 */
function pruneSubgraphs(root) {
	let subgraphs = root.subgraphs;
	while (subgraphs.some((s) => !holderAlive(root.nodes, subgraphs, s.id))) subgraphs = subgraphs.filter((s) => holderAlive(root.nodes, subgraphs, s.id));
	if (subgraphs === root.subgraphs) return root;
	return {
		...root,
		subgraphs
	};
}
/** 占位是否存在于活容器树（根容器或任一活记录容器）。 */
function holderAlive(rootNodes, subgraphs, nodeId) {
	if (rootNodes.some((n) => n.id === nodeId)) return true;
	return subgraphs.some((s) => s.nodes.some((n) => n.id === nodeId));
}
/** 删代理级联：边界口亡（代理节点不在其记录容器）→口消亡+全容器挂该占位死口的
* 边同删（占位口边在父容器——id 全局唯一使扫全容器命中唯一）。无死物同引用。 */
function pruneBoundaryPorts(root) {
	const deadByHolder = /* @__PURE__ */ new Map();
	let subgraphs = root.subgraphs;
	for (const sub of root.subgraphs) {
		const alive = new Set(sub.nodes.map((n) => n.id));
		const keep = (ports) => ports.filter((p) => alive.has(p.proxyNodeId));
		const nextInputs = keep(sub.inputs);
		const nextOutputs = keep(sub.outputs);
		if (nextInputs.length === sub.inputs.length && nextOutputs.length === sub.outputs.length) continue;
		deadByHolder.set(sub.id, new Set([...sub.inputs, ...sub.outputs].filter((p) => !alive.has(p.proxyNodeId)).map((p) => p.portId)));
		subgraphs = subgraphs.map((s) => s.id === sub.id ? {
			...s,
			inputs: nextInputs,
			outputs: nextOutputs
		} : s);
	}
	if (deadByHolder.size === 0) return root;
	const edges = filterDeadPortEdges(root.edges, deadByHolder);
	subgraphs = subgraphs.map((s) => ({
		...s,
		edges: filterDeadPortEdges(s.edges, deadByHolder)
	}));
	return {
		...root,
		edges,
		subgraphs
	};
}
function filterDeadPortEdges(edges, deadByHolder) {
	return edges.filter((e) => {
		for (const [holderId, ports] of deadByHolder) {
			if (e.from.nodeId === holderId && ports.has(e.from.portId)) return false;
			if (e.to.nodeId === holderId && ports.has(e.to.portId)) return false;
		}
		return true;
	});
}
//#endregion
//#region src/kernel/serialize.ts
function toUiFormat(graph, viewport) {
	const layout = {
		nodes: {},
		groups: graph.groups.map(toGroupLayout),
		subgraphs: graph.subgraphs.map((s) => ({
			id: s.id,
			groups: s.groups.map(toGroupLayout)
		})),
		reroutes: edgeReroutesLayout(graph)
	};
	for (const node of allNodes(graph)) layout.nodes[node.id] = pickLayout(node);
	const semantic = {
		nodes: graph.nodes.map((n) => ({
			id: n.id,
			typeId: n.typeId,
			data: n.data
		})),
		edges: graph.edges.map(semanticEdge)
	};
	if (graph.subgraphs.length > 0) semantic.subgraphs = graph.subgraphs.map(toSemanticSubgraph);
	return {
		version: 1,
		semantic,
		layout,
		viewport
	};
}
/** 全容器节点迭代（根+各子图——布局半边扁平投宿，id 全局唯一不冲突）。 */
function* allNodes(graph) {
	for (const node of graph.nodes) yield node;
	for (const sub of graph.subgraphs) for (const node of sub.nodes) yield node;
}
/** 全容器边迭代（根+各子图——中继点布局半边扁平投宿单源）。 */
function* allEdges(graph) {
	for (const edge of graph.edges) yield edge;
	for (const sub of graph.subgraphs) for (const edge of sub.edges) yield edge;
}
/** 语义边投影：剥除 reroutes（视觉路径住布局半边——票 11 双格式分离）。
* 「语义边=id/from/to」投影形单源（serialize 双向投影与 reroute.ts 末点摘除共用）。 */
function semanticEdge(e) {
	return {
		id: e.id,
		from: e.from,
		to: e.to
	};
}
/** 边中继点→布局半边表（非空才入——无空数组噪声；id 全局唯一扁平无歧义）。 */
function edgeReroutesLayout(graph) {
	const out = {};
	for (const edge of allEdges(graph)) if (edge.reroutes !== void 0 && edge.reroutes.length > 0) out[edge.id] = edge.reroutes;
	return out;
}
/** 组记录→布局条目投影（字段直拷——CanvasGroup 与 GroupLayoutEntry 同形）。 */
function toGroupLayout(group) {
	return { ...group };
}
function toSemanticSubgraph(sub) {
	return {
		id: sub.id,
		name: sub.name,
		inputs: sub.inputs.map((p) => ({ ...p })),
		outputs: sub.outputs.map((p) => ({ ...p })),
		nodes: sub.nodes.map((n) => ({
			id: n.id,
			typeId: n.typeId,
			data: n.data
		})),
		edges: sub.edges.map(semanticEdge)
	};
}
function fromUiFormat(ui) {
	if (ui.version !== 1) throw new Error(`不支持的 UI 格式版本：${String(ui.version)}（本库产 version 1——坏档请宿主 catch 后换新图启动）`);
	const nodes = ui.semantic.nodes.map(toStateNode(ui));
	const reroutes = reviveEdgeReroutes(ui.layout.reroutes);
	return pruneSubgraphCascades({
		nodes,
		edges: ui.semantic.edges.map((e) => withRevivedReroutes(e, reroutes)),
		groups: reviveGroups(ui.layout.groups ?? [], nodes),
		subgraphs: reviveSubgraphs(ui, reroutes)
	});
}
/** 档复原的边改写：语义半边私带 reroutes 剥除、布局半边真源点挂回（单点）。 */
function withRevivedReroutes(e, reroutes) {
	const points = reroutes.get(e.id);
	return points === void 0 ? semanticEdge(e) : {
		...semanticEdge(e),
		reroutes: points
	};
}
function toStateNode(ui) {
	return (n) => {
		const entry = ui.layout.nodes[n.id];
		return {
			id: n.id,
			typeId: n.typeId,
			x: entry?.x ?? 0,
			y: entry?.y ?? 0,
			width: entry?.width,
			height: entry?.height,
			collapsed: entry?.collapsed === true ? true : void 0,
			data: n.data
		};
	};
}
/** 组面复原（票 09）：v1 加法可选键——旧档无 groups 读为空组；宿主数据不设信
* （票 05 口径）：memberIds 过滤到实存节点、组空即丢（守「memberIds ⊆ 节点集」不变量）。 */
function reviveGroups(entries, nodes) {
	const alive = new Set(nodes.map((n) => n.id));
	const revived = [];
	for (const entry of entries ?? []) {
		const memberIds = entry.memberIds.filter((id) => alive.has(id));
		if (memberIds.length === 0) continue;
		const { id, x, y, width, height } = entry;
		revived.push({
			id,
			memberIds,
			x,
			y,
			width,
			height
		});
	}
	return revived;
}
/** 子图面复原（票 10）：v1 加法可选键——旧档无 subgraphs 读为空（不升版本）。
* 宿主数据不设信与票 06 口径的分派：形状坏项整条丢弃（isSubgraphEntry 守卫，
* 不炸）、孤儿记录（占位不在父容器）与死口（代理不在记录容器）经 pruneSubgraphs/
* pruneBoundaryPorts 丢弃——未知版本仍 fail-loud 抛错（fromUiFormat 头闸）。
* 容器内边的中继点同经布局半边真源挂回（票 11）。 */
function reviveSubgraphs(ui, reroutes) {
	const revived = [];
	for (const raw of ui.semantic.subgraphs ?? []) {
		if (!isSubgraphEntry(raw)) continue;
		const groupsById = new Map((ui.layout.subgraphs ?? []).map((s) => [s.id, s.groups ?? []]));
		const nodes = raw.nodes.map(toStateNode(ui));
		const alive = new Set(nodes.map((n) => n.id));
		revived.push({
			id: raw.id,
			name: raw.name,
			inputs: raw.inputs.filter(isBoundaryPort),
			outputs: raw.outputs.filter(isBoundaryPort),
			nodes,
			edges: raw.edges.filter((e) => alive.has(e.from.nodeId) && alive.has(e.to.nodeId)).map((e) => withRevivedReroutes(e, reroutes)),
			groups: reviveGroups(groupsById.get(raw.id) ?? [], nodes)
		});
	}
	return revived;
}
/** 边中继点复原（票 11）：布局半边可选键真源——形状守卫（有限数点）逐点过滤、
* 过滤后空表丢弃；孤儿键（边已不存在）不被消费即自然消亡。 */
function reviveEdgeReroutes(raw) {
	const revived = /* @__PURE__ */ new Map();
	for (const [edgeId, points] of Object.entries(raw ?? {})) {
		if (!Array.isArray(points)) continue;
		const valid = points.filter(isReroutePoint);
		if (valid.length > 0) revived.set(edgeId, valid);
	}
	return revived;
}
function isReroutePoint(raw) {
	if (typeof raw !== "object" || raw === null) return false;
	const p = raw;
	return Number.isFinite(p.x) && Number.isFinite(p.y);
}
/** 语义子图项的形状守卫（id/name 串+五数组键）。 */
function isSubgraphEntry(raw) {
	if (typeof raw !== "object" || raw === null) return false;
	const s = raw;
	if (typeof s.id !== "string" || typeof s.name !== "string") return false;
	return Array.isArray(s.nodes) && Array.isArray(s.edges) && Array.isArray(s.inputs) && Array.isArray(s.outputs);
}
function isBoundaryPort(raw) {
	if (typeof raw !== "object" || raw === null) return false;
	const p = raw;
	return typeof p.portId === "string" && typeof p.proxyNodeId === "string";
}
/** 稳定语义 hash：语义子图（不含布局/视口）的规范化序列化 → djb2 十六进制。
* data 为任意 JSON 值，键序规范化后参与 hash（消费者 schema 的语义等价判定归消费者，
* 本 hash 只保证「语义子图变 ⇒ hash 变；仅布局/视口变 ⇒ hash 不变」。 */
function semanticHash(ui) {
	const nodes = [...ui.semantic.nodes].sort((a, b) => a.id < b.id ? -1 : 1).map((n) => [
		n.id,
		n.typeId,
		canonicalize(n.data)
	]);
	const edges = [...ui.semantic.edges].sort((a, b) => a.id < b.id ? -1 : 1).map((e) => [
		e.id,
		e.from.nodeId,
		e.from.portId,
		e.to.nodeId,
		e.to.portId
	]);
	const subgraphs = [...ui.semantic.subgraphs ?? []].sort((a, b) => a.id < b.id ? -1 : 1).map((s) => [
		s.id,
		s.name,
		canonicalize(s.inputs),
		canonicalize(s.outputs),
		...[...s.nodes].sort((a, b) => a.id < b.id ? -1 : 1).map((n) => [
			n.id,
			n.typeId,
			canonicalize(n.data)
		]),
		...[...s.edges].sort((a, b) => a.id < b.id ? -1 : 1).map((e) => [
			e.id,
			e.from.nodeId,
			e.from.portId,
			e.to.nodeId,
			e.to.portId
		])
	]);
	return djb2(JSON.stringify({
		nodes,
		edges,
		subgraphs
	}));
}
function pickLayout(node) {
	const base = {
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height
	};
	return node.collapsed === true ? {
		...base,
		collapsed: true
	} : base;
}
/** 递归规范化 JSON 值：对象键排序（数组保序），使键序不扰动 hash。 */
function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === "object" && value !== null) {
		const record = value;
		const out = {};
		for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
		return out;
	}
	return value;
}
function djb2(text) {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) hash = (hash << 5) + hash + text.charCodeAt(i) >>> 0;
	return hash.toString(16).padStart(8, "0");
}
//#endregion
//#region src/kernel/snapshot.ts
function createSnapshotStore(initial, limit = 100) {
	let current = initial;
	let undoStack = [];
	let redoStack = [];
	return {
		commit(state) {
			if (state === current) return;
			undoStack.push(current);
			if (undoStack.length > limit) undoStack = undoStack.slice(-limit);
			redoStack = [];
			current = state;
		},
		undo() {
			const prev = undoStack.pop();
			if (prev === void 0) return void 0;
			redoStack.push(current);
			current = prev;
			return prev;
		},
		redo() {
			const next = redoStack.pop();
			if (next === void 0) return void 0;
			undoStack.push(current);
			current = next;
			return next;
		},
		rebase(transform) {
			undoStack = undoStack.map(transform);
			redoStack = redoStack.map(transform);
			current = transform(current);
		},
		canUndo() {
			return undoStack.length > 0;
		},
		canRedo() {
			return redoStack.length > 0;
		}
	};
}
//#endregion
//#region src/kernel/interaction.ts
/** 滚轮→缩放因子：factor = exp(−deltaY × rate)。deltaY=−100（一格）→ ×1.105，
* 对齐 ComfyUI 1.1 档步进；连续公式对触控板像素流平滑。 */
var WHEEL_ZOOM_RATE = .001;
/** DOM button 语义：1=中键。 */
var MIDDLE_BUTTON = 1;
/** DOM e.key 语义：空格。 */
var SPACE_KEY = " ";
/** 空格模式态键盘平移步进（票 50，票 47 裁 5）：屏幕域像素/按——与命令域 nudge
*（图域 1px/10px）不同档（镜头步进vs节点微调两语义）。 */
var KEYBOARD_PAN_STEP_PX = 50;
function initialViewportMachineState() {
	return {
		panning: false,
		spaceDown: false,
		lastX: 0,
		lastY: 0
	};
}
function reduceViewportEvent(state, viewport, event, limits = DEFAULT_VIEWPORT_LIMITS) {
	switch (event.type) {
		case "key-down": return keyDown$3(state, viewport, event);
		case "key-up": return withSpace(state, viewport, event.key, false);
		case "pointer-down": return pointerDown$3(state, viewport, event);
		case "pointer-move": return pointerMove$3(state, viewport, event);
		case "pointer-up":
			if (!state.panning) return {
				state,
				viewport
			};
			return {
				state: {
					...state,
					panning: false
				},
				viewport
			};
		case "wheel": return wheelZoom(state, viewport, event, limits);
		case "contextmenu": return {
			state,
			viewport
		};
	}
}
function pointerDown$3(state, viewport, event) {
	if (state.panning || !state.spaceDown && event.button !== MIDDLE_BUTTON) return {
		state,
		viewport
	};
	return {
		state: {
			...state,
			panning: true,
			lastX: event.x,
			lastY: event.y
		},
		viewport
	};
}
function pointerMove$3(state, viewport, event) {
	const dx = event.x - state.lastX;
	const dy = event.y - state.lastY;
	if (!state.panning || dx === 0 && dy === 0) return {
		state,
		viewport
	};
	return {
		state: {
			...state,
			lastX: event.x,
			lastY: event.y
		},
		viewport: panBy(viewport, dx, dy)
	};
}
function wheelZoom(state, viewport, event, limits) {
	return {
		state,
		viewport: zoomAt(viewport, {
			x: event.x,
			y: event.y
		}, Math.exp(-event.deltaY * WHEEL_ZOOM_RATE), limits)
	};
}
function withSpace(state, viewport, key, down) {
	if (key !== SPACE_KEY || state.spaceDown === down) return {
		state,
		viewport
	};
	return {
		state: {
			...state,
			spaceDown: down
		},
		viewport
	};
}
/** key-down 双语义（票 50）：空格模式态下方向键=屏幕域步进平移（机内模式态扩展
* ——模式态归机不归命令表，票 47 裁 5 混合缝位；渲染层在 spaceDown 时方向键不经
* 命令接线直落本机，nudge 不触发）；其余键照旧只认空格。repeat 键到达本机即连续
* 步进（镜头域非命令域——防抖口径辖命令键不辖机内平移，「按住空格拖拽连续平移」
* 同语义）。 */
function keyDown$3(state, viewport, event) {
	if (state.spaceDown) {
		const delta = arrowPanDelta(event.key);
		if (delta !== void 0) return {
			state,
			viewport: panBy(viewport, delta.x, delta.y)
		};
	}
	return withSpace(state, viewport, event.key, true);
}
/** 方向键→屏幕域步进位移（非方向键 undefined）。 */
function arrowPanDelta(key) {
	switch (key) {
		case "ArrowUp": return {
			x: 0,
			y: -50
		};
		case "ArrowDown": return {
			x: 0,
			y: 50
		};
		case "ArrowLeft": return {
			x: -50,
			y: 0
		};
		case "ArrowRight": return {
			x: 50,
			y: 0
		};
		default: return;
	}
}
//#endregion
//#region src/kernel/locks.ts
/** 归一：undefined/空形状（无谓词且空集）归 undefined（无锁=交互零变化基线）。 */
function resolveNodeLocks(input) {
	if (input === void 0) return void 0;
	const ids = new Set(input.ids ?? []);
	if (input.predicate === void 0 && ids.size === 0) return void 0;
	return input.predicate === void 0 ? { ids } : {
		predicate: input.predicate,
		ids
	};
}
/** 锁判定单点（两形并集）：无锁恒 false。 */
function isNodeLocked(locks, node) {
	if (locks === void 0) return false;
	return locks.ids.has(node.id) || locks.predicate?.(node) === true;
}
/** 按编号查锁（连线机端口侧/放置连边端/边连带三消费点单源）；缺位节点不设信。 */
function isNodeLockedById(locks, nodes, id) {
	const node = nodes.find((n) => n.id === id);
	return node !== void 0 && isNodeLocked(locks, node);
}
/** 边连带推导：任一端点节点锁定即整条冻结；端点缺位（孤儿边）不设信视同不冻结。 */
function isEdgeFrozen(locks, graph, edge) {
	if (locks === void 0) return false;
	return isNodeLockedById(locks, graph.nodes, edge.from.nodeId) || isNodeLockedById(locks, graph.nodes, edge.to.nodeId);
}
/** Delete 过滤面（选区机 key-down Delete 消费）：选中集滤出可删者——锁定者滤出，
* 冻结边的可编辑端连带保全（「整条冻结含改可编辑端」的严格读法：删端点=改边）。
* 无锁原引用直通（零行为变化）；两可编辑节点间的边不保全（自由级联沿既有语义）。 */
function deletableIds(locks, graph, ids) {
	if (locks === void 0) return ids;
	const doomed = new Set(ids);
	for (const node of graph.nodes) if (ids.has(node.id) && isNodeLocked(locks, node)) doomed.delete(node.id);
	for (const edge of graph.edges) {
		if (!isEdgeFrozen(locks, graph, edge)) continue;
		doomed.delete(edge.from.nodeId);
		doomed.delete(edge.to.nodeId);
	}
	return doomed;
}
/** 子图转换拦（门面 convertSelectionToSubgraph 消费）：选中含锁定（锁定者不迁
* 容器），或跨界边的外端锁定（跨界存储边禁令 ⇒ 拆占位/代理配对=重构冻结边）皆
* 拦——过滤转换会把冻结边拆掉，无法只转可转的，故整单 no-op。选中集内的边整条
* 随迁不拦（连接不变）。 */
function subgraphConversionLocked(locks, graph, selected) {
	if (locks === void 0) return false;
	if (graph.nodes.some((n) => selected.has(n.id) && isNodeLocked(locks, n))) return true;
	return graph.edges.some((edge) => {
		const fromIn = selected.has(edge.from.nodeId);
		if (fromIn === selected.has(edge.to.nodeId)) return false;
		const outsideId = fromIn ? edge.to.nodeId : edge.from.nodeId;
		return graph.nodes.some((n) => n.id === outsideId && isNodeLocked(locks, n));
	});
}
//#endregion
//#region src/kernel/selection.ts
/** DOM button 语义：0=左键（选区手势专用键）。 */
var LEFT_BUTTON$2 = 0;
var ESCAPE_KEY$2 = "Escape";
var DELETE_KEY = "Delete";
/** 初始态：空选区、无在途手势。 */
function initialSelectionMachineState() {
	return {
		selected: /* @__PURE__ */ new Set(),
		gesture: { kind: "idle" }
	};
}
/** 派发一个抽象输入事件：迁移手势/选区状态，产出图效果与 commit 信号；纯函数。 */
function reduceSelectionEvent(state, world, event) {
	const graph = world.graph;
	switch (event.type) {
		case "pointer-down": return pointerDown$2(state, world, event);
		case "pointer-move": return pointerMove$2(state, world, event);
		case "pointer-up": return pointerUp$2(state, world);
		case "key-down": return keyDown$2(state, world, event.key);
		default: return noOp$2(state, graph);
	}
}
/** 图回退/重做后的选区修剪：剔除已不存在的 id 并终止在途手势（选区恒 ⊆ 图节点集）。 */
function pruneSelection(state, graph) {
	const alive = [...state.selected].filter((id) => graph.nodes.some((n) => n.id === id));
	const selected = alive.length === state.selected.size ? state.selected : new Set(alive);
	if (selected === state.selected && state.gesture.kind === "idle") return state;
	return {
		selected,
		gesture: { kind: "idle" }
	};
}
/** 选区 id 集→节点对象投影（票 44 宿主便捷面单源）：图序保形（与点选次序无关）、
* 节点对象同引用（图不可变值语义——未变节点恒同对象，store 面去抖依据）；空集
* 空数组。controller.getSelectedNodes 与 selection store 两消费方同实现。 */
function selectedNodes(graph, selected) {
	return graph.nodes.filter((node) => selected.has(node.id));
}
/** 图序末位选中锚点（票 50 遍历/aria-activedescendant/Enter 激活面的单源锚）：
* 选中集在 graph.nodes 序中的最后一个（与点选次序无关）；空选区/空图 undefined。
* 多选「只指一个」的已知边界以此锚定（票 47 裁 2）。泛型签名：消费面既喂
* CanvasNode[]（命令/激活）也喂结构面 {id}[]（labels 引用面）。 */
function selectionAnchor(nodes, selected) {
	let anchor;
	for (const node of nodes) if (selected.has(node.id)) anchor = node;
	return anchor;
}
/** 键盘遍历改选区（票 50，Tab/Shift+Tab 命令执行体的 kernel 纯函数）：无选区=
* 图序首（step=1）/末（step=-1）；有选区=自锚点（图序末位选中）步进一位替换单选
* ——多选收窄为步进落点（锚点语义见 selectionAnchor），图序循环 wrap（末位后回
* 首位）。空图 undefined（命令 no-op）；图序=graph.nodes 序（确定稳定，票 47 裁 2）。 */
function traverseSelection(nodes, selected, step) {
	if (nodes.length === 0) return void 0;
	const anchor = selectionAnchor(nodes, selected);
	if (anchor === void 0) return /* @__PURE__ */ new Set([nodes[step === 1 ? 0 : nodes.length - 1].id]);
	const index = (nodes.indexOf(anchor) + step + nodes.length) % nodes.length;
	return /* @__PURE__ */ new Set([nodes[index].id]);
}
/** 两点→规范矩形（左上角+正宽高）；与渲染共用同一几何源（单一几何源先例同 nodeSize）。 */
function boxRect(gesture) {
	return {
		x: Math.min(gesture.anchor.x, gesture.current.x),
		y: Math.min(gesture.anchor.y, gesture.current.y),
		width: Math.abs(gesture.anchor.x - gesture.current.x),
		height: Math.abs(gesture.anchor.y - gesture.current.y)
	};
}
/** 无变化返回：state/graph 原引用 + 不 commit（订阅去抖依据）。 */
function noOp$2(state, graph) {
	return {
		state,
		graph,
		commit: false
	};
}
function pointerDown$2(state, world, event) {
	const { graph, viewport } = world;
	if (event.button !== LEFT_BUTTON$2) return noOp$2(state, graph);
	const spot = {
		point: screenToGraph(viewport, event),
		additive: event.modifiers.includes("ctrl") || event.modifiers.includes("shift"),
		hitId: hitTestNode(viewport, world, graph.nodes, event)?.id
	};
	if (spot.hitId !== void 0) return downOnNode(state, graph, spot, spot.hitId);
	const group = hitTestGroup(viewport, graph.groups, event);
	if (group !== void 0) return downOnGroup(state, graph, spot, group);
	return downOnEmpty(state, graph, spot);
}
/** 点组框（票 09）：普通=成员全选+起整组拖动（复用选区拖动路——moveNodes 的组面
* 不变量使组框随成员刚性平移）；增选键=成员并入现选不起拖（与点节点增选同构）。 */
function downOnGroup(state, graph, spot, group) {
	if (spot.additive) {
		const next = new Set(state.selected);
		for (const id of group.memberIds) next.add(id);
		return {
			state: {
				selected: next,
				gesture: { kind: "idle" }
			},
			graph,
			commit: false
		};
	}
	const selected = new Set(group.memberIds);
	return {
		state: {
			selected,
			gesture: {
				kind: "drag",
				last: spot.point,
				ids: selected
			}
		},
		graph,
		commit: false
	};
}
/** 点节点：增选键=切换成员（不起拖）；普通=未选中先独选、已选中保留整集——均起拖动。 */
function downOnNode(state, graph, spot, nodeId) {
	if (spot.additive) {
		const next = new Set(state.selected);
		if (next.has(nodeId)) next.delete(nodeId);
		else next.add(nodeId);
		return {
			state: {
				selected: next,
				gesture: { kind: "idle" }
			},
			graph,
			commit: false
		};
	}
	const selected = state.selected.has(nodeId) ? state.selected : /* @__PURE__ */ new Set([nodeId]);
	return {
		state: {
			selected,
			gesture: {
				kind: "drag",
				last: spot.point,
				ids: selected
			}
		},
		graph,
		commit: false
	};
}
/** 点空白：普通=即清现选（单击空白=清场），增选键=现选保留为并集基底；均起框选。 */
function downOnEmpty(state, graph, spot) {
	const base = spot.additive ? state.selected : /* @__PURE__ */ new Set();
	return {
		state: {
			selected: base,
			gesture: {
				kind: "box",
				anchor: spot.point,
				current: spot.point,
				base
			}
		},
		graph,
		commit: false
	};
}
function pointerMove$2(state, world, event) {
	const { graph, viewport } = world;
	const gesture = state.gesture;
	if (gesture.kind === "box") {
		const next = {
			...gesture,
			current: screenToGraph(viewport, event)
		};
		return {
			state: {
				...state,
				gesture: next
			},
			graph,
			commit: false
		};
	}
	if (gesture.kind !== "drag") return noOp$2(state, graph);
	const p = screenToGraph(viewport, event);
	const dx = p.x - gesture.last.x;
	const dy = p.y - gesture.last.y;
	if (dx === 0 && dy === 0) return noOp$2(state, graph);
	return {
		state: {
			...state,
			gesture: {
				...gesture,
				last: p
			}
		},
		graph: moveNodes(graph, gesture.ids, dx, dy),
		commit: false
	};
}
/** 松开不读坐标（取消路 pointercancel 视同本事件，同型安全）：拖动=手势完成 commit；
* 框选=基底∪相交者落选（普通模式基底空=替换语义）。 */
function pointerUp$2(state, world) {
	const graph = world.graph;
	const gesture = state.gesture;
	if (gesture.kind === "drag") return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph,
		commit: true
	};
	if (gesture.kind === "box") {
		const selected = new Set(gesture.base);
		for (const node of nodesIntersectingRect(world, graph.nodes, boxRect(gesture))) selected.add(node.id);
		return {
			state: {
				selected,
				gesture: { kind: "idle" }
			},
			graph,
			commit: false
		};
	}
	return noOp$2(state, graph);
}
/** Delete（票 36 起经结构面锁过滤）：可删者=选中集 ∖ 锁定者 ∖ 冻结边可编辑端
* （整条冻结含改可编辑端——删端点=改边）。混合选区=过滤删除、存活者保选；
* 全拦=整单 no-op（状态图零变化零 commit——被拦路径快照根本没有，撤销面自动
* 消解）。无锁=既有全删语义零迁移。 */
function keyDown$2(state, world, key) {
	const graph = world.graph;
	if (key === ESCAPE_KEY$2) return escapeGesture(state, graph);
	if (key === DELETE_KEY && state.selected.size > 0) {
		const doomed = deletableIds(world.locks, graph, state.selected);
		if (doomed.size === 0) return noOp$2(state, graph);
		const selected = new Set(state.selected);
		for (const id of doomed) selected.delete(id);
		return {
			state: {
				selected,
				gesture: { kind: "idle" }
			},
			graph: removeNodes(graph, doomed),
			commit: true
		};
	}
	return noOp$2(state, graph);
}
/** Escape：终止在途手势（拖动半程位移仍 commit——快照队列 current 停在拖前，
* 不 commit 会让下一次 undo 跳档）并清空选区（票面语义，含框选中止）。 */
function escapeGesture(state, graph) {
	if (state.gesture.kind === "idle" && state.selected.size === 0) return noOp$2(state, graph);
	const commit = state.gesture.kind === "drag";
	return {
		state: {
			selected: /* @__PURE__ */ new Set(),
			gesture: { kind: "idle" }
		},
		graph,
		commit
	};
}
//#endregion
//#region src/kernel/link-rules.ts
/** 归一：undefined/空形状（两字段皆缺）归 undefined（无校验=交互零变化基线，
* resolveNodeLocks 同款）。 */
function resolveConnectionRules(input) {
	if (input === void 0) return void 0;
	if (input.isValidConnection === void 0 && input.portTypeCompat === void 0) return;
	return input;
}
/** 合法判单源（票 51 缝 2）：基础面（两侧相对——linkDropCompatible 同式，基础语义
* 保留为内部步；同节点自连放行=环归消费者语义[谓词正是那个消费者面]）∧锁面（两端
* 任一锁定=拒——票 36「不可被连」并入单源）∧矩阵∧谓词。drop 缺位（空白悬停）=
* false——连线机落点判定与预览红档（含锁面红档统一，票 39 裁 4）的同源读数。 */
function linkDropAllowed(world, origin, drop) {
	if (drop === void 0) return false;
	if (origin.side === drop.side) return false;
	if (isNodeLockedById(world.locks, world.graph.nodes, origin.nodeId) || isNodeLockedById(world.locks, world.graph.nodes, drop.nodeId)) return false;
	return rulesAllow(world, origin, drop);
}
/** 校验面（锁面/基础面已过门后）：无校验单=放行；端点不可解析（词表漂移）=不设信
* 拒——校验在场时谓词/矩阵必须可评估两端。 */
function rulesAllow(world, origin, drop) {
	const rules = world.rules;
	if (rules === void 0) return true;
	return pairAllowed(rules, endpointOf(world, origin.side === "output" ? origin : drop), endpointOf(world, origin.side === "output" ? drop : origin));
}
/** 端点对全判（两消费点共用）：两端可解析 ∧ 矩阵 ∧ 谓词。 */
function pairAllowed(rules, from, to) {
	return from !== void 0 && to !== void 0 && matrixAllows(rules, from, to) && predicateAllows(rules, from, to);
}
/** 复合落位的自动连端口判定（票 51 缝 3）：compatiblePortOn 同序候选（同名端口
* 优先/该侧序）域内**过滤掉校验不过的端口**（锁/矩阵/谓词三面同源），返回首个
* 放行者；全不过=undefined（只落节点不连线——与「无兼容端口只落节点」既有语义
* 合流）。target=将落的新节点（未入图——锁判定与端点构造直用对象）。无锁无校验
* 时结果与 compatiblePortOn 恒同（退化零漂移）。 */
function firstAllowedPortOn(world, target, origin) {
	if (isNodeLocked(world.locks, target) || isNodeLockedById(world.locks, world.graph.nodes, origin.nodeId)) return;
	const targetDef = effectiveNodeDef(world.registry, world.subgraphs ?? [], target);
	if (targetDef === void 0) return void 0;
	const rules = world.rules;
	if (rules === void 0) {
		const first = orderedCandidates(world, targetDef, origin)[0];
		return first === void 0 ? void 0 : { portId: first.portId };
	}
	for (const port of orderedCandidates(world, targetDef, origin)) {
		const { from, to } = endpointPair(world, target, port, origin);
		if (pairAllowed(rules, from, to)) return { portId: port.portId };
	}
}
/** 候选端点对（锁已在门口过）：target 端点**直构**（新节点未入图——不走图查询，
* linkDropAllowed 的图查径不适配将落节点），origin 端点经图解析；按 from=output
* 侧→to=input 侧定向。 */
function endpointPair(world, target, port, origin) {
	const candEp = {
		node: target,
		port,
		side: wantedSide(origin)
	};
	const originEp = endpointOf(world, origin);
	return origin.side === "output" ? {
		from: originEp,
		to: candEp
	} : {
		from: candEp,
		to: originEp
	};
}
/** 起拖侧的对侧（自动连候选恒在对侧——基础面由构造保证，linkDropAllowed 内的
* 两侧判恒过）。 */
function wantedSide(origin) {
	return origin.side === "output" ? "input" : "output";
}
/** 候选序（compatiblePortOn 同序）：与起拖端口同 label 的对侧端口在先（语义对位
* 先于位置序——「出」对「出」类词表），其余按该侧声明序殿后；同名候选被校验
* 拦下时回落其余候选（域内过滤=整域过滤，非同名子域）。 */
function orderedCandidates(world, targetDef, origin) {
	const originNode = world.graph.nodes.find((n) => n.id === origin.nodeId);
	const originDef = originNode && effectiveNodeDef(world.registry, world.subgraphs ?? [], originNode);
	const originLabel = originDef === void 0 ? void 0 : sideDefsOf(originDef, origin.side).find((p) => p.portId === origin.portId)?.label;
	const candidates = sideDefsOf(targetDef, wantedSide(origin));
	return [...candidates.filter((p) => p.label === originLabel), ...candidates.filter((p) => p.label !== originLabel)];
}
/** 注册表项某侧的端口声明集（两侧同构存取——link.ts sideDefs 姊妹，独立持有
* 避免与连线机模块互引成环）。 */
function sideDefsOf(def, side) {
	return side === "input" ? def.inputs : def.outputs;
}
/** 端点解析（PortHit→富载荷）：effectiveNodeDef 单源（边界口合成）；词表漂移
* （节点缺位/端口已不存在）=undefined。 */
function endpointOf(world, hit) {
	const node = world.graph.nodes.find((n) => n.id === hit.nodeId);
	if (node === void 0) return void 0;
	const def = effectiveNodeDef(world.registry, world.subgraphs ?? [], node);
	if (def === void 0) return void 0;
	const port = sideDefsOf(def, hit.side).find((p) => p.portId === hit.portId);
	return port === void 0 ? void 0 : {
		node,
		port,
		side: hit.side
	};
}
/** 矩阵判（只拦在册行）：from 型行不在册（含端口未声明 typeId）=放行；行在册=
* to 型须在名单（to 端口未声明 typeId=不在名单=拒——类型名单对未类型化端口无从
* 放行）。 */
function matrixAllows(rules, from, to) {
	if (rules.portTypeCompat === void 0 || from.port.typeId === void 0) return true;
	const allowed = rules.portTypeCompat[from.port.typeId];
	return allowed === void 0 ? true : allowed.includes(to.port.typeId ?? "");
}
/** 谓词判：不设信严格真（isNodeLocked 谓词同款口径）；未设=放行。 */
function predicateAllows(rules, from, to) {
	return rules.isValidConnection === void 0 || rules.isValidConnection(from, to) === true;
}
//#endregion
//#region src/kernel/link.ts
/** DOM button 语义：0=左键（连线手势专用键）。 */
var LEFT_BUTTON$1 = 0;
var ESCAPE_KEY$1 = "Escape";
/** 机内新建边的 id 前缀（顺序号；与既有边 id 撞号则跳号——宿主自定边 id 不受控）。 */
var LINK_EDGE_ID_PREFIX = "fle-";
/** 初始态：无在途手势、边 id 号自 0 起。 */
function initialLinkMachineState() {
	return {
		gesture: { kind: "idle" },
		edgeSeq: 0
	};
}
/** 派发一个抽象输入事件：迁移手势状态，终点事件产图效果与终局；纯函数。 */
function reduceLinkEvent(state, world, event) {
	switch (event.type) {
		case "pointer-down": return pointerDown$1(state, world, event);
		case "pointer-move": return pointerMove$1(state, world, event);
		case "pointer-up": return pointerUp$1(state, world, event);
		case "key-down": return keyDown$1(state, world.graph, event.key);
		default: return noOp$1(state, world.graph);
	}
}
/** 悬停落点合法性·基础面：两侧相对（output↔input）即可连；同侧/起拖端口自身为
* 非法。同节点自连放行（内核 schema 无关——环是消费者语义，不设防）。票 51 起
* 完整判定（基础面∧锁面∧校验单）单源收拢进 linkDropAllowed——本函数保留为
* 基础语义步的公开形（宿主做纯几何判定的便捷件）。 */
function linkDropCompatible(origin, drop) {
	return origin.side !== drop.side;
}
/** 拖线自动连的兼容端口判定（同名端口优先，否则该侧首个端口；无该侧端口 undefined）。
* 同名=与起拖端口同 label 的对侧端口——语义对位（「出」对「出」类词表）先于位置序。
* 端口集经 effectiveNodeDef 单源（起拖端可为保留型代理口——票 10）。票 51 起复合
* 落位改走 firstAllowedPortOn（同序候选+校验过滤）——本函数保留为基础判定的公开形
* （无锁无校验退化与 firstAllowedPortOn 恒同，测试钉死），与 linkDropCompatible
* 的保留姿势对称。 */
function compatiblePortOn(world, target, origin) {
	const originNode = world.nodes.find((n) => n.id === origin.nodeId);
	const originDef = originNode && effectiveNodeDef(world.registry, world.subgraphs ?? [], originNode);
	const originLabel = originDef === void 0 ? void 0 : sideDefs(originDef, origin.side).find((p) => p.portId === origin.portId)?.label;
	const targetDef = world.registry.lookup(target.typeId);
	if (targetDef === void 0) return void 0;
	const candidates = sideDefs(targetDef, origin.side === "output" ? "input" : "output");
	return candidates.find((p) => p.label === originLabel) ?? candidates[0];
}
/** 注册表项某侧的端口声明集（两侧同构存取单点成文）。 */
function sideDefs(def, side) {
	return side === "input" ? def.inputs : def.outputs;
}
/** 预览/连线的贝塞尔控制点（水平切线——节点编辑器连线形制，渲染层据此拼路径串；
* 内核只产纯几何点，不产 SVG 方言——引擎无关红线）。 */
function linkControlPoints(a, b) {
	const dx = (b.x - a.x) / 2;
	return [{
		x: a.x + dx,
		y: a.y
	}, {
		x: b.x - dx,
		y: b.y
	}];
}
/** 无变化返回：state/graph 原引用 + 不 commit + 无终局。 */
function noOp$1(state, graph) {
	return {
		state,
		graph,
		commit: false
	};
}
/** 拖向端口边的语义端点：from 恒为 output 侧、to 恒为 input 侧。 */
function endPoints(origin, drop) {
	return origin.side === "output" ? {
		from: origin,
		to: drop
	} : {
		from: drop,
		to: origin
	};
}
/** 端口热区命中（LinkWorld→PortWorld 投影单点）。 */
function portHit(world, event) {
	return hitTestPort(world.viewport, {
		registry: world.registry,
		nodes: world.graph.nodes,
		subgraphs: world.subgraphs
	}, event);
}
/** 起线判拒（票 36）：命中端口属锁定节点（锁定节点不可被连——起线与落点 settle
* 两侧共读同一判定），或改连目标边（该 input 首条入边）整条冻结——这条边是
* 锁定节点的关系，可编辑端不放行改连（无入边的未锁 input 照常起新连线）。 */
function linkStartBlocked(locks, graph, hit) {
	if (isNodeLockedById(locks, graph.nodes, hit.nodeId)) return true;
	if (hit.side !== "input") return false;
	const moved = graph.edges.find((e) => samePortRef(e.to, hit));
	return moved !== void 0 && isEdgeFrozen(locks, graph, moved);
}
function pointerDown$1(state, world, event) {
	const graph = world.graph;
	if (event.button !== LEFT_BUTTON$1 || state.gesture.kind !== "idle") return noOp$1(state, graph);
	const hit = portHit(world, event);
	if (hit === void 0) return noOp$1(state, graph);
	if (linkStartBlocked(world.locks, graph, hit)) return noOp$1(state, graph);
	const moved = hit.side === "input" ? graph.edges.find((e) => samePortRef(e.to, hit)) : void 0;
	return {
		state: {
			...state,
			gesture: {
				kind: "drag",
				origin: hit,
				current: screenToGraph(world.viewport, event),
				hover: hit,
				valid: false,
				movedEdgeId: moved?.id
			}
		},
		graph,
		commit: false
	};
}
function pointerMove$1(state, world, event) {
	const gesture = state.gesture;
	if (gesture.kind !== "drag") return noOp$1(state, world.graph);
	const current = screenToGraph(world.viewport, event);
	const hover = portHit(world, event);
	if (current.x === gesture.current.x && current.y === gesture.current.y && sameHover(gesture.hover, hover)) return noOp$1(state, world.graph);
	const valid = sameHover(gesture.hover, hover) ? gesture.valid : linkDropAllowed(world, gesture.origin, hover);
	return {
		state: {
			...state,
			gesture: {
				...gesture,
				current,
				hover,
				valid
			}
		},
		graph: world.graph,
		commit: false
	};
}
function sameHover(a, b) {
	if (a === void 0 || b === void 0) return a === b;
	return a.nodeId === b.nodeId && a.portId === b.portId && a.side === b.side;
}
/** 松开读坐标（落点语义）：合法端口=落定建边/改连替换（恰一次 commit）；空白=终局
* 交渲染层开搜索；非法落点（同侧端口/节点体上非端口）=放回原处。
* 票 51：合法判收拢单源 linkDropAllowed（基础面∧锁面[两端，起线拦的补强]∧矩阵∧
* 谓词）——校验不过=静默终止零快照（票 36 同款拦在发生前，undo 自动消解）。 */
function pointerUp$1(state, world, event) {
	const gesture = state.gesture;
	if (gesture.kind !== "drag") return noOp$1(state, world.graph);
	const drop = portHit(world, event);
	if (drop !== void 0 && linkDropAllowed(world, gesture.origin, drop)) return settle(state, world.graph, gesture, drop);
	if (drop === void 0 && hitTestNode(world.viewport, world, world.graph.nodes, event) === void 0) return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph: world.graph,
		commit: false,
		outcome: {
			kind: "empty",
			origin: gesture.origin,
			at: screenToGraph(world.viewport, event)
		}
	};
	return abort(state, world.graph);
}
/** 落定：改连先摘旧边（放回原端口=原状终结防 id 空转）；重复边不产生第二条
* （合并语义——被移动边摘除后对端已有同线即只删不加）；起拖端口已被宿主删则放回。 */
function settle(state, graph, gesture, drop) {
	const moved = gesture.movedEdgeId === void 0 ? void 0 : edgeById(graph, gesture.movedEdgeId);
	const { from, to } = endPoints(gesture.origin, drop);
	if (nodeById(graph, gesture.origin.nodeId) === void 0) return abort(state, graph);
	if (moved !== void 0 && samePortRef(moved.from, from) && samePortRef(moved.to, to)) return abort(state, graph);
	const next = moved === void 0 ? graph : removeEdge(graph, moved.id);
	if (!hasEdgeBetween(next, from, to)) return connect(state, next, from, to);
	if (next !== graph) return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph: next,
		commit: true,
		outcome: {
			kind: "connect",
			edge: void 0
		}
	};
	return abort(state, graph);
}
/** 建边落定收尾：机内取号+addEdge+恰一次 commit。 */
function connect(state, graph, from, to) {
	const seq = nextEdgeSeq(state.edgeSeq, graph);
	const edge = {
		id: edgeIdOf(seq),
		from: portRefOf(from),
		to: portRefOf(to)
	};
	return {
		state: {
			...state,
			edgeSeq: seq,
			gesture: { kind: "idle" }
		},
		graph: addEdge(graph, edge),
		commit: true,
		outcome: {
			kind: "connect",
			edge
		}
	};
}
/** Escape（及终局外的原状终结）：手势归 idle，图零变化不 commit（连线手势中途不改图）。 */
function abort(state, graph) {
	return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph,
		commit: false,
		outcome: { kind: "abort" }
	};
}
function keyDown$1(state, graph, key) {
	if (key !== ESCAPE_KEY$1 || state.gesture.kind !== "drag") return noOp$1(state, graph);
	return abort(state, graph);
}
/** 新边 id 取号：自 startSeq 推进，撞既有边 id 则跳号（宿主自定 id 不受控）。
* 连线机与门面复合落位共用的单实现（同一 id 前缀空间，两处生成皆对活图查重，
* 撞号不炸）。返回取用号，调用方收编进各自计数器。 */
function nextEdgeSeq(startSeq, graph) {
	let seq = startSeq;
	do
		seq += 1;
	while (edgeById(graph, edgeIdOf(seq)) !== void 0);
	return seq;
}
/** 顺序号→边 id（前缀拼串单点）。 */
function edgeIdOf(seq) {
	return `${LINK_EDGE_ID_PREFIX}${seq}`;
}
//#endregion
//#region src/kernel/edge-shape.ts
/** 四型字面量集（对标 SF 同名）。 */
var EDGE_SHAPES = [
	"bezier",
	"straight",
	"step",
	"smoothstep"
];
/** 缺省形（零行为变化基线）。 */
var DEFAULT_EDGE_SHAPE = "bezier";
/** 字面量守卫（词表宿主数据不设信——JS 宿主可写进任意串，坏值回退缺省）。 */
function isEdgeShape(value) {
	return typeof value === "string" && EDGE_SHAPES.includes(value);
}
/** 声明解析（票 40 裁 3）：词表 per-type > 全局缺省 > 'bezier'；未声明/词表漂移
* （坏字面量）回退下一级（color/typeId 可选键同款姿态，旧数据零迁移）。**两级皆守卫**
* ——全局缺省同为宿主可写串（JS 宿主经 props/setEdgeShape 传入），坏值回落 'bezier'
* 防渲染与命中分道（code-review 边界修）。 */
function resolveEdgeShape(def, globalDefault) {
	if (def?.edgeShape !== void 0 && isEdgeShape(def.edgeShape)) return def.edgeShape;
	return isEdgeShape(globalDefault) ? globalDefault : DEFAULT_EDGE_SHAPE;
}
/** 每边生效形状：**from 侧节点型**词表声明优先（「边属性挂源」先例=类型色挂源
* 端口 typeId、ComfyUI link type=源槽型）；from 节点缺位（孤儿边）/未注册型/
* 保留型无声明皆回退全局缺省。 */
function edgeShapeOf(world, edge) {
	const node = world.nodes.find((n) => n.id === edge.from.nodeId);
	return resolveEdgeShape((node && effectiveNodeDef(world.registry, world.subgraphs ?? [], node)) ?? void 0, world.edgeShape);
}
/** step 段拐点对（先横后竖——中点分位 Z/S 形）：a →(midX, a.y)→(midX, b.y)→ b。
* 端口形制下锚点水平出入：末腿恒水平（箭头朝向/入口朝向的构造保证）；y 同值时
* 拐点共线（直线退化）。 */
function stepCorners(a, b) {
	const midX = (a.x + b.x) / 2;
	return [{
		x: midX,
		y: a.y
	}, {
		x: midX,
		y: b.y
	}];
}
/** 三次贝塞尔 t 点（采样命中的纯几何基元）。 */
function bezierPointAt(curve, t) {
	const [p0, c1, c2, p1] = curve;
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return {
		x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
		y: a * p0.y + b * c1.y + c * c2.y + d * p1.y
	};
}
/** 单段形状折线（含端点）——命中测试的几何基元：straight/step=精确折线；
* smoothstep=按 step 折线近似（圆角半径量级内的偏差，8px 容差下可担——票内
* 小裁记 Resolution）；bezier=采样折线（12 段，图域采样经仿射不变性与屏域等价）。 */
function shapePolyline(a, b, shape, samples = 12) {
	if (shape === "straight") return [a, b];
	if (shape === "step" || shape === "smoothstep") {
		const [c1, c2] = stepCorners(a, b);
		return [
			a,
			c1,
			c2,
			b
		];
	}
	const [cp1, cp2] = linkControlPoints(a, b);
	const curve = [
		a,
		cp1,
		cp2,
		b
	];
	const points = [];
	for (let i = 0; i <= samples; i++) points.push(bezierPointAt(curve, i / samples));
	return points;
}
/** to 端切向单位向量（箭头朝向的形状感知泛化——票 40 裁 5 连带）：bezier=控制点
* c2→to 切向（与既有水平特例公式 sign(to.x-prev.x) 恒同值——含 dx=0 退化回落
* 朝右）；straight=段向量（任意角）；step/smoothstep=末腿水平符号（构造保证）。
* 零向量（退化段）回落 (1,0) 朝右（入口在节点左缘的自然朝向，票 35 既有口径）。 */
function edgeArrowDirection(a, b, shape) {
	let dx;
	let dy;
	if (shape === "bezier") {
		const [, c2] = linkControlPoints(a, b);
		dx = b.x - c2.x;
		dy = b.y - c2.y;
	} else if (shape === "straight") {
		dx = b.x - a.x;
		dy = b.y - a.y;
	} else {
		dx = b.x - (a.x + b.x) / 2;
		dy = 0;
	}
	const len = Math.hypot(dx, dy);
	return len === 0 ? {
		x: 1,
		y: 0
	} : {
		x: dx / len,
		y: dy / len
	};
}
//#endregion
//#region src/kernel/clipboard.ts
/** 剪贴板格式版本（对外契约——增删字段必升版；解析只认当前版）。 */
var CLIPBOARD_FORMAT_VERSION = 1;
/** 连续粘贴的逐次偏移步长（图坐标 px；首次粘贴即偏移一档，不压原位叠放）。 */
var PASTE_OFFSET_PX = 20;
/** 选中集→载荷：集内节点+集内边，位置化为相对包围盒左上角的偏移；空选区 undefined。
* 剪贴板不携子图（票 10 票内裁定，票 09 组同款口径——票 05 契约面不动）：保留型
* 节点（子图占位/边界代理）不进载荷，相连边随「集外边不带入」规则自然丢弃。 */
function clipboardFromSelection(graph, selected) {
	const nodes = graph.nodes.filter((n) => selected.has(n.id) && !isReservedNode(n));
	if (nodes.length === 0) return void 0;
	const origin = {
		x: Math.min(...nodes.map((n) => n.x)),
		y: Math.min(...nodes.map((n) => n.y))
	};
	const ids = new Set(nodes.map((n) => n.id));
	return {
		version: 1,
		origin,
		nodes: nodes.map((n) => ({
			id: n.id,
			typeId: n.typeId,
			dx: n.x - origin.x,
			dy: n.y - origin.y,
			width: n.width,
			height: n.height,
			data: n.data
		})),
		edges: graph.edges.filter((e) => ids.has(e.from.nodeId) && ids.has(e.to.nodeId)).map((e) => ({
			from: { ...e.from },
			to: { ...e.to }
		}))
	};
}
/** 载荷→文本（对外契约的线上形：JSON）。 */
function serializeClipboard(payload) {
	return JSON.stringify(payload);
}
/** 文本→载荷：解析失败/形状坏/未知版本一律 undefined（拒绝不炸——环境数据不设信）。 */
function parseClipboard(text) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		return;
	}
	return isPayload(raw) ? raw : void 0;
}
/** 粘贴计算：全量 id 重映射（分配器对累积图取号）+落点平移+集内边重挂；
* 重复边（同 from→to）不产生第二条（与连线机同一图不变量，手工坏载荷含重边时
* 净去重）；边端点指向载荷外节点（坏载荷）丢弃不炸；纯函数——传入图不被改动。 */
function pasteClipboard(payload, graph, at, alloc) {
	const idMap = /* @__PURE__ */ new Map();
	let next = graph;
	const nodes = [];
	for (const cn of payload.nodes) {
		const id = alloc.nodeId(next);
		idMap.set(cn.id, id);
		const node = {
			id,
			typeId: cn.typeId,
			x: at.x + cn.dx,
			y: at.y + cn.dy,
			width: cn.width,
			height: cn.height,
			data: cn.data
		};
		nodes.push(node);
		next = addNode(next, node);
	}
	const edges = [];
	for (const ce of payload.edges) {
		const from = idMap.get(ce.from.nodeId);
		const to = idMap.get(ce.to.nodeId);
		if (from === void 0 || to === void 0) continue;
		const fromRef = {
			nodeId: from,
			portId: ce.from.portId
		};
		const toRef = {
			nodeId: to,
			portId: ce.to.portId
		};
		if (hasEdgeBetween(next, fromRef, toRef)) continue;
		const edge = {
			id: alloc.edgeId(next),
			from: fromRef,
			to: toRef
		};
		edges.push(edge);
		next = addEdge(next, edge);
	}
	return {
		graph: next,
		nodes,
		edges,
		selected: new Set(nodes.map((n) => n.id))
	};
}
/** 第 seq 次连续粘贴（自上次复制起计，0 起）的落点：origin+(seq+1)×步长——
* 首贴即偏移可见（不压原位叠放），连续粘贴逐次再偏一档。 */
function pastedAt(origin, seq) {
	const step = (seq + 1) * 20;
	return {
		x: origin.x + step,
		y: origin.y + step
	};
}
function isPayload(raw) {
	if (!isRecord(raw)) return false;
	const p = raw;
	if (p.version !== 1) return false;
	if (!isPoint(p.origin) || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return false;
	return p.nodes.every(isNode) && p.edges.every(isEdge);
}
/** 守卫序言单点：五处形状守卫共用的「非空普通对象」判定。 */
function isRecord(raw) {
	return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
function isPoint(raw) {
	if (!isRecord(raw)) return false;
	const p = raw;
	return Number.isFinite(p.x) && Number.isFinite(p.y);
}
function isNode(raw) {
	if (!isRecord(raw)) return false;
	const n = raw;
	if (typeof n.id !== "string" || n.id === "" || typeof n.typeId !== "string") return false;
	if (!isOffset(n)) return false;
	return "data" in n;
}
/** 位置/尺寸域：dx/dy 必为有限数；width/height 可选（在则须有限数）。 */
function isOffset(n) {
	return Number.isFinite(n.dx) && Number.isFinite(n.dy) && (n.width === void 0 || Number.isFinite(n.width)) && (n.height === void 0 || Number.isFinite(n.height));
}
function isEdge(raw) {
	if (!isRecord(raw)) return false;
	const e = raw;
	return isRef(e.from) && isRef(e.to);
}
function isRef(raw) {
	if (!isRecord(raw)) return false;
	const r = raw;
	return typeof r.nodeId === "string" && typeof r.portId === "string";
}
//#endregion
//#region src/kernel/group.ts
/** 成组/适配的组框外扩留白（图坐标 px）。 */
var GROUP_PADDING = 20;
/** 机内/门面新建组的 id 前缀（顺序号；与既有组 id 撞号则跳号——宿主自定 id 不受控）。 */
var GROUP_ID_PREFIX = "flg-";
function groupIdOf(seq) {
	return `${GROUP_ID_PREFIX}${seq}`;
}
/** 取下一个不撞号的组 id 顺序号（对活图查重——与 link.ts 边取号同形制）。 */
function nextGroupSeq(startSeq, graph) {
	let seq = startSeq;
	do
		seq += 1;
	while (groupById(graph, groupIdOf(seq)) !== void 0);
	return seq;
}
function groupById(graph, groupId) {
	return graph.groups.find((g) => g.id === groupId);
}
/** 成组：新组框=成员包围盒+padding，成员从旧组偷走（互斥成员籍）、旧组被偷光即散。
* 不存在的成员 id 忽略；有效成员为空返回同引用（no-op）；组 id 撞号 fail-loud。 */
function groupNodes(source, graph, groupId, memberIds) {
	if (groupById(graph, groupId) !== void 0) throw new Error(`组 id 重复：${groupId}（换组 id——组框由成员名单派生不复用 id）`);
	const wanted = new Set(memberIds);
	const members = graph.nodes.filter((n) => wanted.has(n.id));
	if (members.length === 0) return graph;
	const bounding = nodesBounding(source, members);
	const group = {
		id: groupId,
		memberIds: members.map((n) => n.id),
		...padRect(bounding)
	};
	const groups = [...withoutMembers(graph.groups, new Set(group.memberIds)), group];
	return {
		...graph,
		groups
	};
}
/** 解组：组记录消散，成员节点原样保留；未知组 id 返回同引用（no-op）。 */
function ungroup(graph, groupId) {
	if (groupById(graph, groupId) === void 0) return graph;
	return {
		...graph,
		groups: graph.groups.filter((g) => g.id !== groupId)
	};
}
/** 组框适配内容（FitGroupToContents）：重算回成员包围盒+padding；组框已贴合或
* 组不存在返回同引用（no-op——门面零快照）。 */
function fitGroupToContents(source, graph, groupId) {
	const group = groupById(graph, groupId);
	if (group === void 0) return graph;
	const members = graph.nodes.filter((n) => group.memberIds.includes(n.id));
	if (members.length === 0) return graph;
	const fitted = padRect(nodesBounding(source, members));
	if (group.x === fitted.x && group.y === fitted.y && group.width === fitted.width && group.height === fitted.height) return graph;
	return {
		...graph,
		groups: graph.groups.map((g) => g.id === groupId ? {
			...g,
			...fitted
		} : g)
	};
}
/** 解组分岔判定（Ctrl+G toggle）：选中集非空且 ⊆ 某组成员集 → 该组（成员籍互斥
* 至多命中一组）；跨组/选中含未分组节点 → undefined（走成组路）。 */
function groupContainingAll(graph, selected) {
	if (selected.size === 0) return void 0;
	return graph.groups.find((g) => {
		const members = new Set(g.memberIds);
		for (const id of selected) if (!members.has(id)) return false;
		return true;
	});
}
/** Ctrl+G 的图效果（票 09，命令式编辑——门面只持快照/订阅）：选中集 ⊆ 某组=解组
* 该组；否则非空即成组（互斥偷员），新组 id 经 nextGroupId 取（惰性——解组路不烧号；
* 取号回调注入同 pasteClipboard 形制，门面计数器不入 kernel）。空选区 undefined（no-op）。 */
function toggleGroup(source, graph, nextGroupId, selected) {
	const existing = groupContainingAll(graph, selected);
	if (existing !== void 0) return ungroup(graph, existing.id);
	if (selected.size === 0) return void 0;
	return groupNodes(source, graph, nextGroupId(graph), selected);
}
/** FitGroupToContents 的选集版图效果：对选中集涉及的组（任一成员被选中）逐一适配；
* 返回适配后图与实际适配组数（全贴合/无涉及=零改，graph 同引用——门面零快照）。 */
function fitSelectedGroupsToContents(source, graph, selected) {
	let next = graph;
	let changed = 0;
	for (const group of graph.groups) {
		if (!group.memberIds.some((id) => selected.has(id))) continue;
		const fitted = fitGroupToContents(source, next, group.id);
		if (fitted !== next) {
			changed += 1;
			next = fitted;
		}
	}
	return {
		graph: next,
		changed
	};
}
function padRect(rect) {
	return {
		x: rect.x - 20,
		y: rect.y - 20,
		width: rect.width + 40,
		height: rect.height + 40
	};
}
//#endregion
//#region src/kernel/reroute.ts
/** DOM button 语义：0=左键（reroute 手势专用键）。 */
var LEFT_BUTTON = 0;
var ESCAPE_KEY = "Escape";
/** 中继点/边路径命中容差（屏幕 px——端口热区同档）。 */
var REROUTE_HIT_RADIUS = 8;
/** 边 reroutes 数组的非改写读取（缺省空数组语义单点）。 */
function reroutesOf(edge) {
	return edge.reroutes ?? [];
}
/** map 途经表：单边命中改写、其余原引用（结构共享单点——三个数据操作共用）。
* 末点摘除（write 返 undefined）=语义边投影形落回（semanticEdge 单源共用）。 */
function withEdgeReroutes(graph, edgeId, write) {
	let changed = false;
	const edges = graph.edges.map((edge) => {
		if (edge.id !== edgeId) return edge;
		const next = write([...reroutesOf(edge)]);
		changed = true;
		return next === void 0 ? semanticEdge(edge) : {
			...edge,
			reroutes: next
		};
	});
	if (!changed) return graph;
	return {
		...graph,
		edges
	};
}
/** 在 index 处插入中继点（0..length——分段序直入）；边不存在或序越界=同引用。 */
function insertReroute(graph, edgeId, index, point) {
	const current = graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [];
	if (index < 0 || index > current.length) return graph;
	return withEdgeReroutes(graph, edgeId, (points) => {
		points.splice(index, 0, point);
		return points;
	});
}
/** 改写 index 处中继点坐标；同值/边不存在/序越界=同引用。 */
function moveReroute(graph, edgeId, index, point) {
	const hit = (graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [])[index];
	if (hit === void 0) return graph;
	if (hit.x === point.x && hit.y === point.y) return graph;
	return withEdgeReroutes(graph, edgeId, (points) => {
		points[index] = point;
		return points;
	});
}
/** 摘除 index 处中继点（末点摘除即散——reroutes 键落回 undefined）；无命中=同引用。 */
function removeReroute(graph, edgeId, index) {
	if ((graph.edges.find((e) => e.id === edgeId)?.reroutes ?? [])[index] === void 0) return graph;
	return withEdgeReroutes(graph, edgeId, (points) => {
		points.splice(index, 1);
		return points.length > 0 ? points : void 0;
	});
}
/** 边全程 waypoints：[from 锚点, …中继点（序）, to 锚点]——分段曲线的顶点列。
* 渲染层分段渲染与本模块命中测试共用的单一几何源。 */
function edgeWaypoints(world, edge) {
	return [
		portAnchor(world, edge.from, "output"),
		...reroutesOf(edge),
		portAnchor(world, edge.to, "input")
	];
}
function hitTestReroutePoint(viewport, world, screen) {
	for (const edge of topmostFirst(world.graph.edges)) {
		const points = reroutesOf(edge);
		for (let i = 0; i < points.length; i++) {
			const s = graphToScreen(viewport, points[i]);
			const dx = screen.x - s.x;
			const dy = screen.y - s.y;
			if (dx * dx + dy * dy <= 64) return {
				edgeId: edge.id,
				index: i
			};
		}
	}
}
function hitTestEdgePath(viewport, world, screen) {
	const ports = portWorldOf$1(world);
	const shapes = {
		...ports,
		edgeShape: world.edgeShape
	};
	for (const edge of topmostFirst(world.graph.edges)) {
		const shape = edgeShapeOf(shapes, edge);
		const waypoints = edgeWaypoints(ports, edge);
		for (let k = 0; k + 1 < waypoints.length; k++) if (polylineHit(viewport, shapePolyline(waypoints[k], waypoints[k + 1], shape), screen)) return {
			edgeId: edge.id,
			index: k,
			at: screenToGraph(viewport, screen)
		};
	}
}
/** 折线命中：形状折线（图域）逐点变换到屏幕域（仿射不变性），逐折线段测距。 */
function polylineHit(viewport, poly, screen) {
	let prev = graphToScreen(viewport, poly[0]);
	for (let i = 1; i < poly.length; i++) {
		const next = graphToScreen(viewport, poly[i]);
		if (distanceToSegment(screen, prev, next) <= 8) return true;
		prev = next;
	}
	return false;
}
/** 点到线段距离（命中容差判定的几何基元）。 */
function distanceToSegment(p, a, b) {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const lengthSquared = abx * abx + aby * aby;
	if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared));
	return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}
function initialRerouteMachineState() {
	return { gesture: { kind: "idle" } };
}
/** 派发一个抽象输入事件：迁移手势状态，产出图效果与 commit 信号；纯函数。 */
function reduceRerouteEvent(state, world, event) {
	switch (event.type) {
		case "pointer-down": return pointerDown(state, world, event);
		case "pointer-move": return pointerMove(state, world, event);
		case "pointer-up": return pointerUp(state, world.graph);
		case "key-down": return keyDown(state, world.graph, event.key);
		default: return noOp(state, world.graph);
	}
}
/** 无变化返回：state/graph 原引用 + 不 commit。 */
function noOp(state, graph) {
	return {
		state,
		graph,
		commit: false
	};
}
/** LinkWorld→PortWorld 投影（端口合成查询面——hitTestPort 消费）。 */
function portWorldOf$1(world) {
	return {
		registry: world.registry,
		nodes: world.graph.nodes,
		subgraphs: world.subgraphs
	};
}
function pointerDown(state, world, event) {
	if (event.button !== LEFT_BUTTON || state.gesture.kind !== "idle") return noOp(state, world.graph);
	if (hitTestNode(world.viewport, world, world.graph.nodes, event) !== void 0) return noOp(state, world.graph);
	if (hitTestPort(world.viewport, portWorldOf$1(world), event) !== void 0) return noOp(state, world.graph);
	return grabOrInsert(state, world, event);
}
/** 让位后的起拖分岔：中继点热区=抓起既有（点击删点候态）；边路径=原位插点并抓起
* （点击留点候态）；空白=放手（选区机落框选）。 */
function grabOrInsert(state, world, event) {
	const grab = hitTestReroutePoint(world.viewport, world, event);
	if (grab !== void 0) return {
		state: dragGesture(state, grab.edgeId, grab.index, false),
		graph: world.graph,
		commit: false
	};
	const onPath = hitTestEdgePath(world.viewport, world, event);
	if (onPath === void 0) return noOp(state, world.graph);
	return {
		state: dragGesture(state, onPath.edgeId, onPath.index, true),
		graph: insertReroute(world.graph, onPath.edgeId, onPath.index, onPath.at),
		commit: false
	};
}
/** 抓起手势态组装单点（两条起拖路同形收口）。 */
function dragGesture(state, edgeId, index, fresh) {
	return {
		...state,
		gesture: {
			kind: "drag",
			edgeId,
			index,
			fresh,
			moved: false
		}
	};
}
function pointerMove(state, world, event) {
	const gesture = state.gesture;
	if (gesture.kind !== "drag") return noOp(state, world.graph);
	const graph = moveReroute(world.graph, gesture.edgeId, gesture.index, screenToGraph(world.viewport, event));
	if (graph === world.graph) return noOp(state, world.graph);
	return {
		state: {
			...state,
			gesture: {
				...gesture,
				moved: true
			}
		},
		graph,
		commit: false
	};
}
/** 松开（不读坐标，取消路 pointercancel 视同）：新插（fresh）=点击留点；抓既有
* 无位移=点击删点；拖动过=手势完成——均恰一次 commit（门面快照 store 同引用去重
* 兜底零变化退化）。 */
function pointerUp(state, graph) {
	const gesture = state.gesture;
	if (gesture.kind !== "drag") return noOp(state, graph);
	if (!gesture.fresh && !gesture.moved) return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph: removeReroute(graph, gesture.edgeId, gesture.index),
		commit: true
	};
	return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph,
		commit: true
	};
}
/** Escape：手势归 idle；有图变化（新插或拖动过）commit 留在当前位——快照队列
* current 停在手势前，不 commit 会跳档（选区机同由）；抓起未动=零变化不 commit。 */
function keyDown(state, graph, key) {
	const gesture = state.gesture;
	if (key !== ESCAPE_KEY || gesture.kind !== "drag") return noOp(state, graph);
	return {
		state: {
			...state,
			gesture: { kind: "idle" }
		},
		graph,
		commit: gesture.fresh || gesture.moved
	};
}
//#endregion
//#region src/kernel/subgraph.ts
/** 机内/门面新建子图的 id 前缀（顺序号；与既有记录/节点 id 撞号则跳号）。 */
var SUBGRAPH_ID_PREFIX = "fls-";
/** 转换时代理列与成员包围盒的横向间距（入列在左/出列在右——数据流向对齐）。 */
var PROXY_GAP = 80;
function subgraphIdOf(seq) {
	return `${SUBGRAPH_ID_PREFIX}${seq}`;
}
/** 新建子图默认名（面包屑/占位显示；改名归票 15 标题编辑）。 */
function subgraphDefaultName(seq) {
	return `子图 ${seq}`;
}
function subgraphById(root, id) {
	return root.subgraphs.find((s) => s.id === id);
}
/** 容器视图（门面镜头读）：path=自根的子图 id 链。视图的 nodes/edges/groups=该容器
* 三集、subgraphs 键=根记录集共享参照（占位名/面包屑/端口合成消费——记录无此键，
* 取视图时补）。根路径返回根态原引用。失活段 fail-loud（信任钳制方——clampNavPath
* 单点守，门面在 undo/restore 后必经）。 */
function containerViewAt(root, path) {
	let container = root;
	for (const id of path) {
		const sub = subgraphById(root, id);
		if (sub === void 0 || !container.nodes.some((n) => n.id === id)) throw new Error(`导航路径失活：${id}（经 getNavPath() 重取活路径——undo/外部变更后旧路径失活）`);
		container = {
			...sub,
			subgraphs: root.subgraphs
		};
	}
	return container;
}
/** 容器写回（门面镜头写）：替换 path 末段所指记录（扁平收纳——直达，中间段仅为
* 祖先链、合法性已由 clampNavPath 守）或根容器的三集（视图的 subgraphs 键忽略——
* 记录集经 root.subgraphs 专路改）。纯函数——root 不被改动。 */
function withContainer(root, path, container) {
	if (path.length === 0) return {
		...root,
		nodes: container.nodes,
		edges: container.edges,
		groups: container.groups
	};
	const target = path[path.length - 1];
	return {
		...root,
		subgraphs: root.subgraphs.map((s) => s.id === target ? {
			...s,
			nodes: container.nodes,
			edges: container.edges,
			groups: container.groups
		} : s)
	};
}
/** 导航路径钳制：逐段验活（记录存在且占位在容器内），截断到最长可存活前缀。 */
function clampNavPath(root, path) {
	let container = root;
	const alive = [];
	for (const id of path) {
		const sub = subgraphById(root, id);
		if (sub === void 0 || !container.nodes.some((n) => n.id === id)) break;
		alive.push(id);
		container = sub;
	}
	return alive;
}
function boundaryBins(edges, side, ids, bbox) {
	const seen = /* @__PURE__ */ new Set();
	const bins = [];
	for (const edge of edges) {
		const key = edge.from;
		const dedupe = `${key.nodeId}\u0000${key.portId}`;
		if (seen.has(dedupe)) continue;
		seen.add(dedupe);
		const portId = `${side}-${bins.length}`;
		const x = side === "in" ? bbox.x - PROXY_GAP - 160 : bbox.x + bbox.width + PROXY_GAP;
		const proxy = {
			id: ids.node(),
			typeId: side === "in" ? SUBGRAPH_INPUT_TYPE_ID : SUBGRAPH_OUTPUT_TYPE_ID,
			x,
			y: bbox.y + bins.length * 72,
			data: { portId }
		};
		bins.push({
			key,
			portId,
			proxy
		});
	}
	return bins;
}
function weaveBoundary(req) {
	const { edges, innerIds, ids, bbox, holderId } = req;
	const entering = edges.filter((e) => !innerIds.has(e.from.nodeId) && innerIds.has(e.to.nodeId));
	const exiting = edges.filter((e) => innerIds.has(e.from.nodeId) && !innerIds.has(e.to.nodeId));
	const inputs = boundaryBins(entering, "in", ids, bbox);
	const outputs = boundaryBins(exiting, "out", ids, bbox);
	return {
		inputs: binsToPorts(inputs),
		outputs: binsToPorts(outputs),
		proxies: [...inputs.map((b) => b.proxy), ...outputs.map((b) => b.proxy)],
		parentEdges: [...inputs.map(({ key, portId }) => parentEnteringEdge(ids, key, holderId, portId)), ...exiting.map((edge) => parentExitingEdge(ids, edge, outputs, holderId))],
		innerEdges: [...entering.map((edge) => innerEnteringEdge(ids, edge, inputs)), ...outputs.map(({ key, portId, proxy }) => ({
			id: ids.edge(),
			from: key,
			to: {
				nodeId: proxy.id,
				portId
			}
		}))]
	};
}
function binsToPorts(bins) {
	return bins.map(({ portId, proxy }) => ({
		portId,
		proxyNodeId: proxy.id
	}));
}
/** 归并键→分箱项（分箱单源查——重挂展开用；未命中=调用方键必在箱内）。 */
function binOf(bins, key) {
	return bins.find((b) => b.key.nodeId === key.nodeId && b.key.portId === key.portId);
}
function parentEnteringEdge(ids, key, holderId, portId) {
	return {
		id: ids.edge(),
		from: key,
		to: {
			nodeId: holderId,
			portId
		}
	};
}
function parentExitingEdge(ids, edge, outputs, holderId) {
	return {
		id: ids.edge(),
		from: {
			nodeId: holderId,
			portId: binOf(outputs, edge.from).portId
		},
		to: edge.to
	};
}
function innerEnteringEdge(ids, edge, inputs) {
	const bin = binOf(inputs, edge.from);
	return {
		id: ids.edge(),
		from: {
			nodeId: bin.proxy.id,
			portId: bin.portId
		},
		to: edge.to
	};
}
function conversionPartition(source, container, selected) {
	const members = container.nodes.filter((n) => selected.has(n.id) && !isReservedNode(n));
	if (members.length === 0) return void 0;
	const innerIds = new Set(members.map((n) => n.id));
	const innerGroups = container.groups.filter((g) => g.memberIds.every((id) => innerIds.has(id)));
	const parentGroups = withoutMembers(container.groups.filter((g) => !innerGroups.includes(g)), innerIds);
	return {
		members,
		innerIds,
		bbox: nodesBounding(source, members),
		innerGroups,
		parentGroups
	};
}
/** 选中集→子图（Ctrl+Shift+E 的图效果，票 10）：成员+内边迁入记录（id 原样）、
* 边界边按外侧口（入）/内侧口（出）去重合并拆为两条容器局部边（重挂边全部取新号
* ——原边界边 id 消亡；快照整体回退使 id churn 无外部影响）、组员 ⊆ 选中集的组
* 随迁入子图（跨选中集的组留父容器并修剪成员——票 09 转换路对账裁定：合并入口
* 不设，组随选中集走）、占位落成员包围盒左上（高度随口数生长）。有效成员为空
* 返回 undefined（no-op——门面零快照）；取号惰性（拒绝路不烧号，票 09 组同款）。 */
function convertSelectionToSubgraph(source, container, selected, ids) {
	const part = conversionPartition(source, container, selected);
	if (part === void 0) return void 0;
	const { id: holderId, name } = ids.subgraph();
	const { members, innerIds, bbox, innerGroups, parentGroups } = part;
	const weave = weaveBoundary({
		edges: container.edges,
		innerIds,
		ids,
		bbox,
		holderId
	});
	const holder = holderNode(bbox, holderId, Math.max(weave.inputs.length, weave.outputs.length));
	return {
		container: {
			...container,
			nodes: [...container.nodes.filter((n) => !innerIds.has(n.id)), holder],
			edges: [...container.edges.filter((e) => !innerIds.has(e.from.nodeId) && !innerIds.has(e.to.nodeId)), ...weave.parentEdges],
			groups: parentGroups
		},
		subgraph: {
			id: holderId,
			name,
			inputs: weave.inputs,
			outputs: weave.outputs,
			nodes: [...members, ...weave.proxies],
			edges: [...container.edges.filter((e) => innerIds.has(e.from.nodeId) && innerIds.has(e.to.nodeId)), ...weave.innerEdges],
			groups: innerGroups
		}
	};
}
/** 占位节点：落成员包围盒左上，高度随口数生长（口行高至少 SUBGRAPH_PORT_ROW）。 */
function holderNode(bbox, holderId, maxPorts) {
	return {
		id: holderId,
		typeId: SUBGRAPH_TYPE_ID,
		x: bbox.x,
		y: bbox.y,
		width: 160,
		height: Math.max(48, (maxPorts + 1) * 24),
		data: {}
	};
}
//#endregion
//#region src/kernel/viewport-memory.ts
/** LRU 容量缺省（容纳根+常见导航深度的容器镜头）。 */
var VIEWPORT_MEMORY_CAPACITY = 8;
function createViewportMemory(capacity = 8) {
	const cache = /* @__PURE__ */ new Map();
	const touch = (key, viewport) => {
		cache.delete(key);
		cache.set(key, viewport);
		if (cache.size > capacity) {
			const coldest = cache.keys().next().value;
			if (coldest !== void 0) cache.delete(coldest);
		}
	};
	return {
		remember: touch,
		recall(key) {
			const hit = cache.get(key);
			if (hit === void 0) return void 0;
			touch(key, hit);
			return hit;
		}
	};
}
//#endregion
//#region src/kernel/layout.ts
/** 间隙常量随轴走（方向对调的轴义）：GAP_X=横向相邻间隙、GAP_Y=纵向相邻间隙
* （图坐标 px）。tb：层步进（纵向）吃 GAP_Y、层内打包（横向）吃 GAP_X；lr 对调。 */
var AUTO_LAYOUT_GAP_X = 60;
var AUTO_LAYOUT_GAP_Y = 80;
/** 六轴目标坐标计算表（轴向单实现数据面——水平三轴回 x、垂直三轴回 y，缺轴键
* 表示该轴原样）。 */
var ALIGN_TARGET = {
	left: (b) => ({ x: b.x }),
	right: (b, s) => ({ x: b.x + b.width - s.width }),
	"center-x": (b, s) => ({ x: b.x + (b.width - s.width) / 2 }),
	top: (b) => ({ y: b.y }),
	bottom: (b, s) => ({ y: b.y + b.height - s.height }),
	"center-y": (b, s) => ({ y: b.y + (b.height - s.height) / 2 })
};
/** 对齐：选中集按包围盒的对应边/中线对齐；无位移返回同引用。 */
function alignNodes(source, graph, ids, axis) {
	const members = graph.nodes.filter((n) => ids.has(n.id));
	if (members.length < 2) return graph;
	const bounds = nodesBounding(source, members);
	const target = ALIGN_TARGET[axis];
	const targets = /* @__PURE__ */ new Map();
	for (const node of members) {
		const { x = node.x, y = node.y } = target(bounds, nodeSize(source, node));
		if (x !== node.x || y !== node.y) targets.set(node.id, {
			x,
			y
		});
	}
	return applyMoves(source, graph, targets);
}
/** 分布：按当前边排序，首末不动，中间重排使相邻节点边到边间隙相等。 */
function distributeNodes(source, graph, ids, axis) {
	const members = graph.nodes.filter((n) => ids.has(n.id));
	if (members.length < 3) return graph;
	const vertical = axis === "vertical";
	const sorted = [...members].sort((a, b) => vertical ? a.y - b.y : a.x - b.x);
	const sizes = sorted.map((n) => vertical ? nodeSize(source, n).height : nodeSize(source, n).width);
	const lead = vertical ? sorted[0].y : sorted[0].x;
	const gap = ((vertical ? sorted[sorted.length - 1].y : sorted[sorted.length - 1].x) - lead - sizes.slice(0, -1).reduce((sum, s) => sum + s, 0)) / (sorted.length - 1);
	const targets = /* @__PURE__ */ new Map();
	let cursor = lead;
	for (let i = 0; i < sorted.length; i++) {
		const node = sorted[i];
		const x = vertical ? node.x : cursor;
		const y = vertical ? cursor : node.y;
		if (x !== node.x || y !== node.y) targets.set(node.id, {
			x,
			y
		});
		cursor += sizes[i] + gap;
	}
	return applyMoves(source, graph, targets);
}
/** 自动排布：scope 缺省=图内全部节点（整图），给集=选区排布（跨界边不参与——
* 域外端点不抬升域内层）；有效节点不足两枚返回同引用。方向缺省 L→R（票 23），
* {direction:'tb'} 显式回票 13 原纵向语义。落位外另清所涉边中继点（见头注）。 */
function autoLayoutNodes(source, graph, scope, options) {
	const nodes = scope === void 0 ? graph.nodes : graph.nodes.filter((n) => scope.has(n.id));
	if (nodes.length < 2) return graph;
	const ids = new Set(nodes.map((n) => n.id));
	const involved = graph.edges.filter((e) => ids.has(e.from.nodeId) && ids.has(e.to.nodeId));
	return clearReroutes(applyMoves(source, graph, rowTargets(source, nodes, layeredRows(nodes, involved), options?.direction ?? "lr")), new Set(involved));
}
/** 所涉边（两端点皆在排布域内——autoLayoutNodes 单点已滤，边身份集传入免二次
* 谓词）中继点清空（票 23 owner 裁定）：排布后边随新分层直接走新路径，排版后再
* 手动插点照旧。清空=语义边投影形落回（reroute.ts 末点摘除单源共用）；无点可清
* =同引用（与位移 no-op 缩面合流，门面恰一张快照）。 */
function clearReroutes(graph, involved) {
	let changed = false;
	const edges = graph.edges.map((edge) => {
		if (!involved.has(edge) || edge.reroutes === void 0) return edge;
		changed = true;
		return semanticEdge(edge);
	});
	return changed ? {
		...graph,
		edges
	} : graph;
}
/** 批量落位收口（三命令共用）：绝对落位+涉及组重适配；targets 只收实动节点
* （三调用方同判 x/y 已变），空集=同引用 no-op。 */
function applyMoves(source, graph, targets) {
	if (targets.size === 0) return graph;
	return fitSelectedGroupsToContents(source, moveNodesTo(graph, targets), new Set(targets.keys())).graph;
}
/** 分层+层内定序：DFS 破环 → 最长路径分层 → 重心两轮扫描；返回层列表（层内为
* 节点索引序，初始序=节点数组序）。 */
function layeredRows(nodes, edges) {
	const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
	const flow = edges.map((edge) => ({
		from: indexOf.get(edge.from.nodeId),
		to: indexOf.get(edge.to.nodeId)
	}));
	const out = nodes.map(() => []);
	const into = nodes.map(() => []);
	flow.forEach((f, i) => {
		out[f.from].push(i);
		into[f.to].push(i);
	});
	const back = findBackEdges(out, flow);
	const rows = [];
	layerDepths(flow, out, into, back).forEach((layer, v) => {
		(rows[layer] ??= []).push(v);
	});
	const sources = neighborsOf(nodes.length, flow, "in");
	const sinks = neighborsOf(nodes.length, flow, "out");
	for (let round = 0; round < 2; round++) {
		sweepRows(rows, sources, "down");
		sweepRows(rows, sinks, "up");
	}
	return rows;
}
/** DFS 破环（迭代实现——深图不烧调用栈）：途中命中灰点即回边；分层与定序剔除。
* 回边剔除后余边必无环（有向图 DFS 标准结论）——Kahn 分层因此可收敛。 */
function findBackEdges(out, flow) {
	const color = new Uint8Array(out.length);
	const back = /* @__PURE__ */ new Set();
	for (let start = 0; start < out.length; start++) {
		if (color[start] !== 0) continue;
		color[start] = 1;
		const stack = [[start, 0]];
		while (stack.length > 0) {
			const frame = stack[stack.length - 1];
			const frameOut = out[frame[0]];
			if (frame[1] < frameOut.length) {
				const fi = frameOut[frame[1]];
				frame[1] += 1;
				const next = flow[fi].to;
				if (color[next] === 1) back.add(fi);
				else if (color[next] === 0) {
					color[next] = 1;
					stack.push([next, 0]);
				}
			} else {
				color[frame[0]] = 2;
				stack.pop();
			}
		}
	}
	return back;
}
/** 最长路径分层（Kahn 迭代）：层(v)=非回边入边的 max(层(u)+1)，源层 0。 */
function layerDepths(flow, out, into, back) {
	const depths = new Array(into.length).fill(0);
	const pending = into.map((list) => list.filter((fi) => !back.has(fi)).length);
	const queue = pending.map((count, v) => count === 0 ? v : -1).filter((v) => v >= 0);
	for (let qi = 0; qi < queue.length; qi++) {
		const v = queue[qi];
		for (const fi of out[v]) {
			if (back.has(fi)) continue;
			const next = flow[fi].to;
			depths[next] = Math.max(depths[next], depths[v] + 1);
			pending[next] -= 1;
			if (pending[next] === 0) queue.push(next);
		}
	}
	return depths;
}
/** 节点级邻居表（去重保首见序——同节点对多边不重复计权）。 */
function neighborsOf(count, flow, kind) {
	const table = Array.from({ length: count }, () => []);
	for (const f of flow) {
		const owner = kind === "in" ? f.to : f.from;
		const other = kind === "in" ? f.from : f.to;
		if (!table[owner].includes(other)) table[owner].push(other);
	}
	return table;
}
/** 重心扫描一轮：down=自上而下按入邻居序均值排层、up=自下而上按出邻居；无邻居
* 者保原相对位（平局稳定——baryKey 落回原序号）。 */
function sweepRows(rows, neighbors, direction) {
	const layerIds = rows.map((_, l) => l);
	const seq = direction === "down" ? layerIds.slice(1) : layerIds.slice(0, -1).reverse();
	for (const l of seq) {
		const ref = rows[direction === "down" ? l - 1 : l + 1];
		const pos = new Map(ref.map((v, i) => [v, i]));
		rows[l] = rows[l].map((v, i) => ({
			v,
			i,
			key: baryKey(i, pos, neighbors[v])
		})).sort((a, b) => a.key - b.key || a.i - b.i).map((k) => k.v);
	}
}
/** 邻层邻居的序均值；无邻层邻居（孤点/跨层边）落回原序号。 */
function baryKey(i, pos, adjacent) {
	let sum = 0;
	let count = 0;
	for (const u of adjacent) {
		const p = pos.get(u);
		if (p !== void 0) {
			sum += p;
			count += 1;
		}
	}
	return count > 0 ? sum / count : i;
}
/** 层列坐标→目标集（方向缝）：主轴=层推进（步进=层内最大主尺寸+主间隙）、辅轴=
* 层内打包（辅间隙）+窄层居中；主/辅随方向映射 x/y（lr：主=x/辅=y，tb 对调——
* 间隙常量随轴走）。已在目标位的节点不进目标集（no-op 缩面）。 */
function rowTargets(source, nodes, rows, direction) {
	const bounds = nodesBounding(source, nodes);
	const lr = direction === "lr";
	const laid = rows.map((row) => packLayer(source, nodes, row, lr));
	let cursorMain = 0;
	let maxCross = 0;
	const mains = [];
	for (const layer of laid) {
		maxCross = Math.max(maxCross, layer.crossExtent);
		mains.push(cursorMain);
		cursorMain += layer.mainExtent + (lr ? 60 : 80);
	}
	const targets = /* @__PURE__ */ new Map();
	laid.forEach(({ slots, crossExtent }, l) => {
		const centering = (maxCross - crossExtent) / 2;
		for (const slot of slots) {
			const x = bounds.x + (lr ? mains[l] : slot.cross + centering);
			const y = bounds.y + (lr ? slot.cross + centering : mains[l]);
			if (x !== slot.node.x || y !== slot.node.y) targets.set(slot.node.id, {
				x,
				y
			});
		}
	});
	return targets;
}
/** 单层打包：辅轴从 0 依次排（间隙随辅轴），层主尺寸=层内最大主尺寸；尺寸经
* DefSource 派生（票 21 widget 长高/票 26 折叠高联动——层步进吃实际层尺寸）。 */
function packLayer(source, nodes, row, lr) {
	const gap = lr ? 80 : 60;
	let cross = 0;
	let mainExtent = 0;
	return {
		slots: row.map((v) => {
			const node = nodes[v];
			const size = nodeSize(source, node);
			const slot = {
				node,
				cross
			};
			cross += (lr ? size.height : size.width) + gap;
			mainExtent = Math.max(mainExtent, lr ? size.width : size.height);
			return slot;
		}),
		crossExtent: cross - gap,
		mainExtent
	};
}
//#endregion
//#region src/kernel/commands.ts
function createCommandTable(initialCommands = [], initialBindings = []) {
	const commands = /* @__PURE__ */ new Map();
	const byCombo = /* @__PURE__ */ new Map();
	for (const command of initialCommands) commands.set(command.id, command);
	for (const binding of initialBindings) byCombo.set(comboKey(binding), binding);
	return {
		register(command) {
			commands.set(command.id, command);
		},
		lookup(id) {
			return commands.get(id);
		},
		all() {
			return [...commands.values()].map((command) => ({ ...command }));
		},
		bind(binding) {
			byCombo.set(comboKey(binding), binding);
		},
		unbind(combo, scope) {
			byCombo.delete(comboKey({
				combo,
				scope
			}));
		},
		match(combo, scope) {
			return byCombo.get(comboKey({
				combo,
				scope
			}));
		},
		bindings() {
			return [...byCombo.values()].map((binding) => ({
				...binding,
				combo: { ...binding.combo }
			}));
		}
	};
}
function comboKey({ combo, scope }) {
	return `${scope}|${combo.key}|${combo.ctrl}|${combo.alt}|${combo.shift}`;
}
/** 归一化键序列：内核事件域（key+规范修饰集）→组合键域（ctrl|meta 合并主修饰、
* 键名小写化——渲染层从 DOM 事件归一后经此单点入组合键域）。 */
function keyComboFrom(key, modifiers) {
	return {
		key: key.toLowerCase(),
		ctrl: modifiers.includes("ctrl") || modifiers.includes("meta"),
		alt: modifiers.includes("alt"),
		shift: modifiers.includes("shift")
	};
}
/** 默认键位表（v1）：M1 直连键位收编（票 05 剪贴板、票 04 Delete/Escape——后者语义
* 住交互机，命令是其绑定面别名）+命令式动作（undo/redo/fitView/autoLayout——宿主
* 键位自定义的公共面收口；L=自动排布票 23 入表，票 13「无默认键位」裁定随向转
* L→R 一并改）+M2 两键（票 09 分组/票 10 子图——两票接线记档归本票统一）+键盘
* 面十命令（票 50：Tab/方向/Enter/±——遍历/nudge/激活/缩放；Shift+方向=10px 档、
* '+'/'='/Shift+'+' 三形都指放大=US 布局 Shift+= 与非 US/小键盘直接+双覆盖）。 */
var DEFAULT_KEY_BINDINGS = [
	{
		combo: {
			key: "delete",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:delete-selection",
		scope: "canvas"
	},
	{
		combo: {
			key: "escape",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:cancel-gesture",
		scope: "canvas"
	},
	{
		combo: {
			key: "c",
			ctrl: true,
			alt: false,
			shift: false
		},
		commandId: "fl:copy",
		scope: "canvas"
	},
	{
		combo: {
			key: "v",
			ctrl: true,
			alt: false,
			shift: false
		},
		commandId: "fl:paste",
		scope: "canvas"
	},
	{
		combo: {
			key: "z",
			ctrl: true,
			alt: false,
			shift: false
		},
		commandId: "fl:undo",
		scope: "canvas"
	},
	{
		combo: {
			key: "z",
			ctrl: true,
			alt: false,
			shift: true
		},
		commandId: "fl:redo",
		scope: "canvas"
	},
	{
		combo: {
			key: "y",
			ctrl: true,
			alt: false,
			shift: false
		},
		commandId: "fl:redo",
		scope: "canvas"
	},
	{
		combo: {
			key: "f",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:fit-view",
		scope: "canvas"
	},
	{
		combo: {
			key: "l",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:auto-layout",
		scope: "canvas"
	},
	{
		combo: {
			key: "g",
			ctrl: true,
			alt: false,
			shift: false
		},
		commandId: "fl:group-toggle",
		scope: "canvas"
	},
	{
		combo: {
			key: "e",
			ctrl: true,
			alt: false,
			shift: true
		},
		commandId: "fl:convert-subgraph",
		scope: "canvas"
	},
	{
		combo: {
			key: "tab",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:select-next",
		scope: "canvas"
	},
	{
		combo: {
			key: "tab",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:select-prev",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowup",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:nudge-up",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowdown",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:nudge-down",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowleft",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:nudge-left",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowright",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:nudge-right",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowup",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:nudge-up-large",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowdown",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:nudge-down-large",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowleft",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:nudge-left-large",
		scope: "canvas"
	},
	{
		combo: {
			key: "arrowright",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:nudge-right-large",
		scope: "canvas"
	},
	{
		combo: {
			key: "enter",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:activate-selection",
		scope: "canvas"
	},
	{
		combo: {
			key: "+",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:zoom-in",
		scope: "canvas"
	},
	{
		combo: {
			key: "+",
			ctrl: false,
			alt: false,
			shift: true
		},
		commandId: "fl:zoom-in",
		scope: "canvas"
	},
	{
		combo: {
			key: "=",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:zoom-in",
		scope: "canvas"
	},
	{
		combo: {
			key: "-",
			ctrl: false,
			alt: false,
			shift: false
		},
		commandId: "fl:zoom-out",
		scope: "canvas"
	}
];
/** 绑定存档的版本化文档形（独立键——裁定见模块头）。 */
var KEYBINDINGS_DOC_VERSION = 1;
function serializeKeyBindings(bindings) {
	const doc = {
		version: 1,
		bindings: bindings.map((b) => ({
			key: b.combo.key,
			ctrl: b.combo.ctrl,
			alt: b.combo.alt,
			shift: b.combo.shift,
			commandId: b.commandId,
			scope: b.scope
		}))
	};
	return JSON.stringify(doc);
}
/** 复原不设信：坏 JSON/非对象/未知版本/非数组 → undefined（宿主回退默认表）；
* 条目级坏形状丢弃（空 key/非串键/修饰位类型坏/缺命令 id/未知作用域），修饰位
* 缺省容忍为 false；键名小写化入规范域。 */
function parseKeyBindings(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return;
	}
	if (typeof parsed !== "object" || parsed === null) return void 0;
	const doc = parsed;
	if (doc.version !== 1 || !Array.isArray(doc.bindings)) return void 0;
	const out = [];
	for (const raw of doc.bindings) {
		const binding = reviveBinding(raw);
		if (binding !== void 0) out.push(binding);
	}
	return out;
}
function reviveBinding(raw) {
	if (typeof raw !== "object" || raw === null) return void 0;
	const entry = raw;
	if (typeof entry.key !== "string" || entry.key === "") return void 0;
	if (typeof entry.commandId !== "string" || entry.commandId === "") return void 0;
	if (entry.scope !== void 0 && entry.scope !== "canvas") return void 0;
	if (!validFlags(entry)) return void 0;
	return {
		combo: {
			key: entry.key.toLowerCase(),
			ctrl: flag(entry.ctrl),
			alt: flag(entry.alt),
			shift: flag(entry.shift)
		},
		commandId: entry.commandId,
		scope: "canvas"
	};
}
/** 修饰位三 Flag：缺省容忍（折 false），在场必须布尔——类型坏整条丢弃。 */
function validFlags(entry) {
	return [
		entry.ctrl,
		entry.alt,
		entry.shift
	].every((value) => value === void 0 || typeof value === "boolean");
}
function flag(value) {
	return typeof value === "boolean" ? value : false;
}
//#endregion
//#region src/kernel/context-menu.ts
/** 屏幕点→右键命中判别（纯函数；层叠序与各命中件同规则——数组后者在上）。 */
function resolveContextHit(viewport, world, screen) {
	const port = hitTestPort(viewport, portWorldOf(world), screen);
	if (port !== void 0) return {
		kind: "port",
		nodeId: port.nodeId,
		portId: port.portId,
		side: port.side
	};
	const node = hitTestNode(viewport, world, world.graph.nodes, screen);
	if (node !== void 0) return {
		kind: "node",
		nodeId: node.id
	};
	const dot = hitTestReroutePoint(viewport, world, screen);
	if (dot !== void 0) return {
		kind: "reroute",
		edgeId: dot.edgeId,
		index: dot.index
	};
	const path = hitTestEdgePath(viewport, world, screen);
	if (path !== void 0) return {
		kind: "edge",
		edgeId: path.edgeId
	};
	const group = hitTestGroup(viewport, world.graph.groups, screen);
	if (group !== void 0) return {
		kind: "group",
		groupId: group.id
	};
	return { kind: "empty" };
}
/** LinkWorld→PortWorld 投影（端口合成查询面——hitTestPort 消费；reroute.ts
* 私有同形件的本地副本，两处无共享必要）。 */
function portWorldOf(world) {
	return {
		registry: world.registry,
		nodes: world.graph.nodes,
		subgraphs: world.subgraphs
	};
}
//#endregion
//#region src/kernel/external-guard.ts
var COLLECTION_KEYS = [
	"nodes",
	"edges",
	"groups"
];
/** 变更单全量守卫：未知栏/分栏形状/字段类型/同栏 id 重复/upsert∩remove 同 id。
* 错误可教性（票 58 立策）：每条消息三要素——病因+合法选项+恢复动词（报错文本=
* 写给 agent 的运行时文档——库不在 AI 训练语料内，猜错必撞上的就是这些字）。 */
function assertChangeSet(changes) {
	if (!isPlainObject(changes)) throw new Error("变更单形状坏：根须为对象（改递 { nodes?: { upsert, remove }, … } 分栏信封）");
	assertKnownColumns(changes);
	assertCollection(changes.nodes, "nodes", assertNodeChange);
	assertCollection(changes.edges, "edges", assertEdgeChange);
	assertCollection(changes.groups, "groups", assertGroupChange);
	assertNoColumnConflict(changes);
}
function assertKnownColumns(changes) {
	for (const key of Object.keys(changes)) if (!COLLECTION_KEYS.includes(key)) throw new Error(`变更单形状坏：未知栏「${key}」（栏名∈nodes/edges/groups；多余栏请剥离——机器面字段不入单）`);
}
/** 同栏 upsert∩remove 同 id=宿主矛盾（先删后加同一对象——拆两张单表达）。 */
function assertNoColumnConflict(changes) {
	for (const name of COLLECTION_KEYS) {
		const column = changes[name];
		const removed = new Set(column?.remove ?? []);
		for (const entry of column?.upsert ?? []) if (removed.has(entry.id)) throw new Error(`变更单形状坏：${name} 栏 id「${entry.id}」同时在 upsert 与 remove（先删后加请拆两张单或去掉一列）`);
	}
}
function assertCollection(raw, name, assertEntry) {
	if (raw === void 0) return;
	if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${name} 栏须为对象（改递 { upsert: […], remove: […] }）`);
	assertKnownKeys(raw, `${name} 栏`, ["upsert", "remove"]);
	const seen = /* @__PURE__ */ new Set();
	if (raw.upsert !== void 0) {
		if (!Array.isArray(raw.upsert)) throw new Error(`变更单形状坏：${name}.upsert 须为数组（改递条目数组）`);
		raw.upsert.forEach((entry, i) => {
			const at = `${name}.upsert[${i}]`;
			assertEntry(entry, at);
			const id = entry.id;
			if (seen.has(id)) throw new Error(`变更单形状坏：${at} id「${id}」与同栏前项重复（同 id 变更请合并成一项）`);
			seen.add(id);
		});
	}
	if (raw.remove !== void 0) {
		if (!Array.isArray(raw.remove)) throw new Error(`变更单形状坏：${name}.remove 须为数组（改递 id 字符串数组）`);
		for (const id of raw.remove) assertId(id, `${name}.remove 项`);
	}
}
/** 节点项呈现派生字段（票 58 定向提示）：宽高/折叠由词表+几何单源派生，不由外部门写入。 */
var NODE_DERIVED_FIELDS = /* @__PURE__ */ new Set([
	"width",
	"height",
	"collapsed"
]);
function assertNodeChange(raw, at) {
	if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
	assertKnownKeys(raw, at, [
		"id",
		"typeId",
		"data",
		"x",
		"y",
		"near"
	], NODE_DERIVED_FIELDS);
	assertId(raw.id, `${at}.id`);
	if (raw.typeId !== void 0) assertString(raw.typeId, `${at}.typeId`);
	if (raw.data !== void 0 && !isPlainObject(raw.data)) throw new Error(`变更单形状坏：${at}.data 须为对象（改递键值对象——data 是整包替换语义）`);
	if (raw.x !== void 0) assertFinite(raw.x, `${at}.x`);
	if (raw.y !== void 0) assertFinite(raw.y, `${at}.y`);
	if (raw.near !== void 0) assertString(raw.near, `${at}.near`);
}
function assertEdgeChange(raw, at) {
	if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
	assertKnownKeys(raw, at, [
		"id",
		"from",
		"to"
	]);
	assertId(raw.id, `${at}.id`);
	assertPortRef(raw.from, `${at}.from`);
	assertPortRef(raw.to, `${at}.to`);
}
function assertGroupChange(raw, at) {
	if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
	assertKnownKeys(raw, at, ["id", "memberIds"]);
	assertId(raw.id, `${at}.id`);
	if (!Array.isArray(raw.memberIds)) throw new Error(`变更单形状坏：${at}.memberIds 须为数组（改递成员 id 数组）`);
	raw.memberIds.forEach((id, i) => assertId(id, `${at}.memberIds[${i}]`));
}
function assertPortRef(raw, at) {
	if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
	assertKnownKeys(raw, at, ["nodeId", "portId"]);
	assertId(raw.nodeId, `${at}.nodeId`);
	assertString(raw.portId, `${at}.portId`);
}
/** 未知字段拒绝（笔误面）：已知键集外的字段大声报错——静默吞=猜着修。命中呈现
* 派生字段名单（width/height/collapsed）时给定向指引（票 58——尺寸由词表派生不外摄）。 */
function assertKnownKeys(raw, at, allowed, derivedFields) {
	for (const key of Object.keys(raw)) {
		if (allowed.includes(key)) continue;
		if (derivedFields?.has(key)) throw new Error(`变更单形状坏：${at} 未知字段「${key}」（宽高/折叠是词表派生的呈现字段不由外摄——字段∈${allowed.join("/")}）`);
		throw new Error(`变更单形状坏：${at} 未知字段「${key}」（字段∈${allowed.join("/")}；多余字段请剥离）`);
	}
}
function assertId(raw, at) {
	if (typeof raw !== "string" || raw === "") throw new Error(`变更单形状坏：${at} 须为非空字符串（改递非空 id 字符串）`);
}
function assertString(raw, at) {
	if (typeof raw !== "string") throw new Error(`变更单形状坏：${at} 须为字符串（改递字符串值）`);
}
function assertFinite(raw, at) {
	if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error(`变更单形状坏：${at} 须为有限数（改递有限数值）`);
}
function isPlainObject(raw) {
	return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
//#endregion
//#region src/kernel/external-place.ts
/** 近旁/默认档的「一步」间距（图坐标 px——与 AUTO_LAYOUT_GAP_X 同值的横向呼吸位）。 */
var EXTERNAL_PLACE_GAP = 60;
/** 三级阶梯造节点：坐标照用（存储坐标=左上角）→近旁→确定性默认。 */
function externalNode(source, graph, entry, typeId) {
	if (entry.x !== void 0 && entry.y !== void 0) return {
		id: entry.id,
		typeId,
		x: entry.x,
		y: entry.y,
		data: { ...entry.data ?? {} }
	};
	const anchor = entry.near === void 0 ? void 0 : nodeById(graph, entry.near);
	const spot = anchor === void 0 ? defaultSpot(source, graph, typeId) : nearSpot(source, graph, anchor, typeId);
	return {
		id: entry.id,
		typeId,
		x: spot.x,
		y: spot.y,
		data: { ...entry.data ?? {} }
	};
}
/** 候选新客的派生尺寸（注册表驱动——未注册型走缺省尺寸同放置路）。 */
function candidateSize(source, typeId) {
	return nodeSize(source, {
		id: "",
		typeId,
		x: 0,
		y: 0,
		data: {}
	});
}
/** 阶梯第 2 档：锚右缘一步、垂直居中锚心；落点被占沿 +x 步进（步幅=新宽+一步）。 */
function nearSpot(source, graph, anchor, typeId) {
	const size = candidateSize(source, typeId);
	const rect = nodeRect(source, anchor);
	let x = rect.x + rect.width + 60;
	const y = rect.y + rect.height / 2 - size.height / 2;
	const stride = size.width + 60;
	while (graph.nodes.some((n) => rectsOverlap(nodeRect(source, n), {
		x,
		y,
		...size
	}))) x += stride;
	return {
		x,
		y
	};
}
/** 阶梯第 3 档：内容包围盒右外缘一步、垂直居中（右缘之外无客必空免占检查）；空图
* 落原点。确定性：只吃图内容不吃镜头/时间——同态同单重放恒同。 */
function defaultSpot(source, graph, typeId) {
	if (graph.nodes.length === 0) return {
		x: 0,
		y: 0
	};
	const bounds = nodesBounding(source, graph.nodes);
	const size = candidateSize(source, typeId);
	return {
		x: bounds.x + bounds.width + 60,
		y: bounds.y + bounds.height / 2 - size.height / 2
	};
}
function rectsOverlap(a, b) {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
//#endregion
//#region src/kernel/external.ts
/** 应用变更单（纯函数）：先 remove 后 upsert（节点→边→组）；no-op 同引用。 */
function applyExternalChangeSet(source, graph, changes, options) {
	assertChangeSet(changes);
	const resilient = options?.resilient === true;
	let next = removeExternal(graph, changes, resilient);
	next = upsertNodes(source, next, changes.nodes?.upsert ?? [], resilient);
	next = upsertEdges(next, changes.edges?.upsert ?? [], resilient);
	return upsertGroups(source, next, changes.groups?.upsert ?? [], resilient);
}
/** 删除列先行（节点级联边/组面——graph.ts 单实现；边/组删除列叠在级联结果上）；
* 缺位=静默 no-op（真源销账幂等）；保留型占位与挂其上的机器边不得经外部门销账
* （真源不识画布机器面——静默级联毁子图组织不可撤销）：严格路 fail-loud、
* resilient 路剔出该 id 余照删。 */
function removeExternal(graph, changes, resilient) {
	const nodeIds = filterRemovable(changes.nodes?.remove ?? [], (id) => isReservedMember(graph, id), "nodes.remove", resilient);
	const base = nodeIds.size > 0 ? removeNodes(graph, nodeIds) : graph;
	const edgeIds = filterRemovable(changes.edges?.remove ?? [], machineEdgeOf(graph), "edges.remove", resilient);
	const edges = withoutIds(base.edges, edgeIds, (e) => e.id);
	const groups = withoutIds(base.groups, new Set(changes.groups?.remove ?? []), (g) => g.id);
	if (edges === base.edges && groups === base.groups) return base;
	return {
		...base,
		edges,
		groups
	};
}
/** 删除列保留型守卫（单实现：节点面=占位销账级联毁子图记录、边面=机器边销账拆
* 边界配对）——严格路 fail-loud 指明 id、resilient 路剔出保留型余照删。 */
function filterRemovable(ids, offending, column, resilient) {
	const hit = ids.filter(offending);
	if (hit.length === 0) return new Set(ids);
	if (!resilient) throw new Error(`变更单 ${column}：保留型不得经外部门销账（${hit.join("、")}）——子图占位/代理是画布机器面，名单请自剥离（删子图走画布内删占位）`);
	return new Set(ids.filter((id) => !hit.includes(id)));
}
/** 机器边判定（任一端挂保留型节点——子图边界配对的内侧/外侧两条腿）。 */
function machineEdgeOf(graph) {
	return (id) => {
		const edge = edgeById(graph, id);
		return edge !== void 0 && (isReservedMember(graph, edge.from.nodeId) || isReservedMember(graph, edge.to.nodeId));
	};
}
/** 按 id 集过滤（无命中保原数组引用——no-op 契约）。 */
function withoutIds(items, ids, idOf) {
	if (!items.some((item) => ids.has(idOf(item)))) return items;
	return items.filter((item) => !ids.has(idOf(item)));
}
/** 节点 upsert：既有=纯 data 整包替换（同值保引用），保留型拒绝涂写；新客=阶梯落位。 */
function upsertNodes(source, graph, entries, resilient) {
	let next = graph;
	for (const entry of entries) {
		const existing = nodeById(next, entry.id);
		if (existing === void 0) {
			next = addExternalNode(source, next, entry, resilient);
			continue;
		}
		if (isReservedNode(existing)) {
			if (resilient) continue;
			throw new Error(`变更单 nodes.upsert「${entry.id}」：保留型节点不得经外部门涂写（${existing.typeId}）——真源请勿混入画布生成的占位/代理 id`);
		}
		const data = { ...entry.data ?? {} };
		if (dataEquals(existing.data, data)) continue;
		next = {
			...next,
			nodes: next.nodes.map((n) => n.id === entry.id ? {
				...n,
				data
			} : n)
		};
	}
	return next;
}
/** 新客落位（三重 fail-loud 守卫：typeId 缺位/子图辖域冲突/保留型铸造）+阶梯几何
* （external-place.ts——坐标照用→近旁→确定性默认）。 */
function addExternalNode(source, graph, entry, resilient) {
	if (entry.typeId === void 0) {
		if (resilient) return graph;
		throw new Error(`变更单 nodes.upsert「${entry.id}」：节点不存在且未给 typeId（外部更新目标缺位）——新建请携 typeId、更新请核对 id 拼写`);
	}
	if (globalNodeIds(graph).has(entry.id)) {
		if (resilient) return graph;
		throw new Error(`变更单 nodes.upsert「${entry.id}」：id 与子图容器内节点冲突（外部门辖域=根容器）——节点/边 id 全局唯一，请换 id`);
	}
	if (isReservedNode({ typeId: entry.typeId })) {
		if (resilient) return graph;
		throw new Error(`变更单 nodes.upsert「${entry.id}」：保留型 typeId 不得经外部门铸造（${entry.typeId}）——fl: 前缀归画布，请用宿主词表 typeId`);
	}
	return addNode(graph, externalNode(source, graph, entry, entry.typeId));
}
/** 边 upsert：既有同端点=同引用；换端点=替换且旧拐点消亡；新边端点须在根容器。
* 平行边（同 from→to 异 id）放行——真源权威（重复边防第二条是手势护栏非不变量）。 */
function upsertEdges(graph, entries, resilient) {
	let next = graph;
	for (const entry of entries) {
		const existing = edgeById(next, entry.id);
		if (existing !== void 0 && samePortRef(existing.from, entry.from) && samePortRef(existing.to, entry.to)) continue;
		if (!edgeApplicable(next, entry, existing, resilient)) continue;
		const edge = {
			id: entry.id,
			from: { ...entry.from },
			to: { ...entry.to }
		};
		if (existing === void 0) next = addEdge(next, edge);
		else next = {
			...next,
			edges: next.edges.map((e) => e.id === entry.id ? edge : e)
		};
	}
	return next;
}
/** 边单可应用性（三重：端点缺位/涂写挂保留型的机器边/子图辖域冲突）；resilient
* 跳过返回 false，严格路抛错指明 id。 */
function edgeApplicable(graph, entry, existing, resilient) {
	const fail = (message) => {
		if (resilient) return false;
		throw new Error(message);
	};
	if (!rootNodeExists(graph, entry.from.nodeId) || !rootNodeExists(graph, entry.to.nodeId)) return fail(`变更单 edges.upsert「${entry.id}」：端点节点不在根容器——子图容器内节点请换根容器 id（外部门辖域=根容器）`);
	if (existing !== void 0 && (isReservedMember(graph, existing.from.nodeId) || isReservedMember(graph, existing.to.nodeId))) return fail(`变更单 edges.upsert「${entry.id}」：既有边挂保留型节点（画布机器面不得涂写）——子图边界配对边归画布，请改连普通节点`);
	if (existing === void 0 && globalEdgeIds(graph).has(entry.id)) return fail(`变更单 edges.upsert「${entry.id}」：id 与子图容器内边冲突（外部门辖域=根容器）——请换 id`);
	return true;
}
function rootNodeExists(graph, nodeId) {
	return graph.nodes.some((n) => n.id === nodeId);
}
function isReservedMember(graph, nodeId) {
	const node = nodeById(graph, nodeId);
	return node !== void 0 && isReservedNode(node);
}
/** 组 upsert：名单过滤（死 id 剔除+保留型随旧籍保留）→真源名单空=组空即散（新组
* 不立、既有组拆散——机器面成员不撑组）→名单集合同值=同引用→偷员写入+框自适应。 */
function upsertGroups(source, graph, entries, resilient) {
	let next = graph;
	for (const entry of entries) {
		const existing = groupById(next, entry.id);
		if (existing === void 0 && hasSubgraphGroup(next, entry.id)) {
			if (resilient) continue;
			throw new Error(`变更单 groups.upsert「${entry.id}」：id 与子图容器内组冲突（外部门辖域=根容器）——请换组 id`);
		}
		const alive = aliveMembers(next, entry.memberIds);
		if (alive.length === 0) {
			next = withoutGroup(next, entry.id);
			continue;
		}
		const members = existing === void 0 ? alive : [...alive, ...carryReserved(next, existing, alive)];
		if (existing !== void 0 && sameMemberSet(existing.memberIds, members)) continue;
		next = writeGroup(source, next, entry.id, members);
	}
	return next;
}
/** 名单过滤：死 id 剔除（宿主数据不设信——serialize reviveGroups 同口径）+去重保序。 */
function aliveMembers(graph, memberIds) {
	const out = [];
	for (const id of memberIds) if (rootNodeExists(graph, id) && !out.includes(id)) out.push(id);
	return out;
}
/** 既有组的保留型成员（占位等画布机器面）随旧籍保留——真源不识保留型。 */
function carryReserved(graph, existing, alive) {
	return existing.memberIds.filter((id) => isReservedMember(graph, id) && !alive.includes(id));
}
/** 名单集合比较（序不敏感——external-diff 对账共用单源）。 */
function sameMemberSet(a, b) {
	if (a.length !== b.length) return false;
	return a.every((id) => b.includes(id));
}
function hasSubgraphGroup(graph, groupId) {
	return graph.subgraphs.some((sub) => sub.groups.some((g) => g.id === groupId));
}
/** 组写入收口：新成员自他组偷走（成员籍互斥、被偷光即散——withoutMembers 单实
* 现）、框=成员包围盒+GROUP_PADDING；既有组原位替换保层叠序、新组尾插。 */
function writeGroup(source, graph, groupId, memberIds) {
	const steal = new Set(memberIds);
	const members = graph.nodes.filter((n) => steal.has(n.id));
	const bounds = nodesBounding(source, members);
	const record = {
		id: groupId,
		memberIds: members.map((n) => n.id),
		x: bounds.x - 20,
		y: bounds.y - 20,
		width: bounds.width + 40,
		height: bounds.height + 40
	};
	const stripped = withoutMembers(graph.groups, steal);
	const groups = stripped.some((g) => g.id === groupId) ? stripped.map((g) => g.id === groupId ? record : g) : [...stripped, record];
	return {
		...graph,
		groups
	};
}
function withoutGroup(graph, groupId) {
	if (!graph.groups.some((g) => g.id === groupId)) return graph;
	return {
		...graph,
		groups: graph.groups.filter((g) => g.id !== groupId)
	};
}
/** 深比较（data 幂等判定）：对象键序无关递归、数组保序。 */
function dataEquals(a, b) {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) return arrayEquals(a, b);
	return recordEquals(a, b);
}
function arrayEquals(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
	return a.every((item, i) => dataEquals(item, b[i]));
}
function recordEquals(a, b) {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => key in b && dataEquals(a[key], b[key]));
}
//#endregion
//#region src/kernel/external-diff.ts
function diffExternalGraph(graph, incoming) {
	assertExternalGraph(incoming);
	const reserved = reservedIds(graph);
	const changes = {};
	const nodes = diffNodes(graph, incoming.nodes, reserved);
	const edges = diffEdges(graph, incoming.edges, reserved);
	const groups = diffGroups(graph, incoming.groups, reserved);
	if (nodes !== void 0) changes.nodes = nodes;
	if (edges !== void 0) changes.edges = edges;
	if (groups !== void 0) changes.groups = groups;
	return changes;
}
function reservedIds(graph) {
	return new Set(graph.nodes.filter(isReservedNode).map((n) => n.id));
}
function diffNodes(graph, incoming, reserved) {
	const upsert = [];
	const current = new Map(graph.nodes.filter((n) => !isReservedNode(n)).map((n) => [n.id, n]));
	const ids = /* @__PURE__ */ new Set();
	for (const node of incoming) {
		if (reserved.has(node.id)) continue;
		ids.add(node.id);
		const cur = current.get(node.id);
		if (cur === void 0) upsert.push(newNodeChange(node));
		else if (!dataEquals(cur.data, node.data ?? {})) upsert.push({
			id: node.id,
			data: { ...node.data ?? {} }
		});
	}
	return pack(upsert, removesOf(current.keys(), ids));
}
function newNodeChange(node) {
	const entry = {
		id: node.id,
		typeId: node.typeId,
		data: { ...node.data ?? {} }
	};
	if (node.x !== void 0 && node.y !== void 0) {
		entry.x = node.x;
		entry.y = node.y;
	}
	return entry;
}
function diffEdges(graph, incoming, reserved) {
	const upsert = [];
	const machine = new Set(graph.edges.filter((e) => reserved.has(e.from.nodeId) || reserved.has(e.to.nodeId)).map((e) => e.id));
	const current = new Map(graph.edges.filter((e) => !machine.has(e.id)).map((e) => [e.id, e]));
	const ids = /* @__PURE__ */ new Set();
	for (const edge of incoming) {
		if (machine.has(edge.id)) continue;
		if (reserved.has(edge.from.nodeId) || reserved.has(edge.to.nodeId)) continue;
		ids.add(edge.id);
		const cur = current.get(edge.id);
		if (cur !== void 0 && samePortRef(cur.from, edge.from) && samePortRef(cur.to, edge.to)) continue;
		upsert.push({
			id: edge.id,
			from: { ...edge.from },
			to: { ...edge.to }
		});
	}
	return pack(upsert, removesOf(current.keys(), ids));
}
function diffGroups(graph, incoming, reserved) {
	const upsert = [];
	const ids = /* @__PURE__ */ new Set();
	for (const group of incoming) {
		ids.add(group.id);
		const cur = groupById(graph, group.id);
		const members = dedupe(group.memberIds.filter((id) => !reserved.has(id)));
		if (cur === void 0) {
			if (members.length > 0) upsert.push({
				id: group.id,
				memberIds: members
			});
			continue;
		}
		if (!sameMemberSet(dedupe(cur.memberIds.filter((id) => !reserved.has(id))), members)) upsert.push({
			id: group.id,
			memberIds: members
		});
	}
	return pack(upsert, graph.groups.filter((g) => !ids.has(g.id)).map((g) => g.id));
}
function removesOf(current, incoming) {
	const remove = [];
	for (const id of current) if (!incoming.has(id)) remove.push(id);
	return remove;
}
function pack(upsert, remove) {
	if (upsert.length === 0 && remove.length === 0) return void 0;
	const column = {};
	if (upsert.length > 0) column.upsert = upsert;
	if (remove.length > 0) column.remove = remove;
	return column;
}
function dedupe(ids) {
	return [...new Set(ids)];
}
/** 图态已知键（票 58 定向识别）：getState()/toUiFormat() 直喂的真实失误路面
* （消费者反馈 F2——subgraphs 拒收+catch 吞错=图装载无声失败）。高频小名单非
* CanvasGraphState 理论全集（票内小裁：全名单提示准但随图态演进而漂移、维护面
* 大；小名单覆盖两条实测失误路即止）。命中给定向提示，未命中走通用消息。 */
var GRAPH_STATE_KEYS = /* @__PURE__ */ new Set([
	"subgraphs",
	"selection",
	"version",
	"semantic",
	"layout",
	"viewport"
]);
function assertExternalGraph(graph) {
	if (!isPlainObject(graph)) throw new Error("整图形状坏：根须为对象（改递 { nodes, edges, groups } 三集全量）");
	for (const key of Object.keys(graph)) {
		if (COLLECTION_KEYS.includes(key)) continue;
		if (GRAPH_STATE_KEYS.has(key)) throw new Error(`整图形状坏：未知键「${key}」（键∈nodes/edges/groups）——疑似喂了 getState()/toUiFormat() 图态形：机器面字段请投影剥离、不镜像的集显式递 []（增量源改走 applyExternal 变更单门）`);
		throw new Error(`整图形状坏：未知键「${key}」（键∈${COLLECTION_KEYS.join("/")}；多余键请剥离）`);
	}
	for (const key of COLLECTION_KEYS) if (!Array.isArray(graph[key])) throw new Error(`整图形状坏：${key} 列缺失（三集皆全量——不镜像的集请显式 [] 或改走变更单门）`);
	graph.nodes.forEach((node, i) => {
		assertNodeChange(node, `nodes[${i}]`);
		const typeId = isPlainObject(node) ? node.typeId : void 0;
		if (typeof typeId !== "string" || typeId === "") throw new Error(`整图形状坏：nodes[${i}].typeId 须为非空字符串（新客面必填——更新既有节点请走变更单门）`);
	});
	graph.edges.forEach((edge, i) => assertEdgeChange(edge, `edges[${i}]`));
	graph.groups.forEach((group, i) => assertGroupChange(group, `groups[${i}]`));
}
//#endregion
export { AUTO_LAYOUT_GAP_X, AUTO_LAYOUT_GAP_Y, CLIPBOARD_FORMAT_VERSION, COLLECTION_KEYS, DEFAULT_EDGE_SHAPE, DEFAULT_KEY_BINDINGS, DEFAULT_VIEWPORT_LIMITS, EDGE_SHAPES, EXTERNAL_PLACE_GAP, FIT_VIEW_MARGIN, GROUP_ID_PREFIX, GROUP_PADDING, INPUT_EVENT_CONTRACT_VERSION, KEYBINDINGS_DOC_VERSION, KEYBOARD_PAN_STEP_PX, LINK_EDGE_ID_PREFIX, NODE_DEFAULT_HEIGHT, NODE_DEFAULT_WIDTH, NODE_HEADER_HEIGHT, PASTE_OFFSET_PX, PORT_HIT_RADIUS, PORT_ROW_HEIGHT, REROUTE_HIT_RADIUS, SUBGRAPH_ID_PREFIX, SUBGRAPH_INPUT_TYPE_ID, SUBGRAPH_OUTPUT_TYPE_ID, SUBGRAPH_PORT_ROW, SUBGRAPH_TYPE_ID, TITLE_DATA_KEY, VIEWPORT_MEMORY_CAPACITY, WHEEL_ZOOM_RATE, WIDGET_BLOCK_TAIL, WIDGET_COLLAPSED_HEIGHT, WIDGET_MIN_WIDTH, WIDGET_ROW_HEIGHT, WIDGET_TEXTAREA_ROWS, addEdge, addNode, alignNodes, applyExternalChangeSet, assertChangeSet, assertEdgeChange, assertGroupChange, assertNodeChange, autoLayoutNodes, bezierPointAt, boxRect, centerViewportOn, clampNavPath, clipboardFromSelection, compatiblePortOn, containerViewAt, convertSelectionToSubgraph, createCommandTable, createGraph, createNodeRegistry, createSnapshotStore, createViewportMemory, dataEquals, deletableIds, diffExternalGraph, displayNodeTitle, distributeNodes, edgeArrowDirection, edgeById, edgeIdOf, edgeShapeOf, edgeWaypoints, effectiveNodeDef, exportBounds, externalNode, firstAllowedPortOn, fitGroupToContents, fitSelectedGroupsToContents, fitView, fromUiFormat, globalEdgeIds, globalNodeIds, graphBounds, graphToScreen, groupById, groupContainingAll, groupIdOf, groupNodes, hasEdgeBetween, hitTestEdgePath, hitTestGroup, hitTestNode, hitTestPort, hitTestReroutePoint, initialLinkMachineState, initialRerouteMachineState, initialSelectionMachineState, initialViewportMachineState, insertReroute, isEdgeFrozen, isEdgeShape, isNodeLocked, isNodeLockedById, isPlainObject, isReservedNode, keyComboFrom, linkControlPoints, linkDropAllowed, linkDropCompatible, moveNode, moveNodes, moveNodesTo, moveReroute, nextEdgeSeq, nextGroupSeq, nodeById, nodeCategoryColor, nodeCustomTitle, nodePorts, nodeRect, nodeSize, nodeWidgets, nodesBounding, nodesIntersectingRect, panBy, parseClipboard, parseKeyBindings, pasteClipboard, pastedAt, portAnchor, portPositions, portRefOf, portRowCount, portRowPairs, pruneBoundaryPorts, pruneSelection, pruneSubgraphCascades, pruneSubgraphs, reduceLinkEvent, reduceRerouteEvent, reduceSelectionEvent, reduceViewportEvent, removeEdge, removeNode, removeNodes, removeReroute, resolveConnectionRules, resolveContextHit, resolveEdgeShape, resolveNodeLocks, sameMemberSet, samePortRef, screenToGraph, selectedNodes, selectionAnchor, semanticEdge, semanticHash, serializeClipboard, serializeKeyBindings, shapePolyline, stepCorners, subgraphById, subgraphConversionLocked, subgraphDefaultName, subgraphIdOf, toUiFormat, toggleGroup, toggleNodeCollapse, topmostFirst, traverseSelection, ungroup, updateNodeData, widgetBlockHeight, widgetRowHeight, withContainer, withoutMembers, zoomAt };
