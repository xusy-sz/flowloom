/** flowloom 内核类型面（M0 形状面；交互状态机 M1 消费）。
 *
 * 三条教义红线落在类型上：
 * - 节点定义=宿主数据：NodeTypeDef 由注册表注入（开放集），内核不枚举任何词表；
 * - 内核 schema 无关：节点语义载荷是泛型自由 data，内核不解释其内容；
 * - 引擎无关：KernelInputEvent 是归一化结构体，零 DOM/渲染器类型。 */
import type { Point } from './viewport';

/** 端口引用：节点 id + 注册表项内声明的端口 id。 */
export interface PortRef {
  nodeId: string;
  portId: string;
}

/** 内部节点记录（语义+布局合并态，便于操作与渲染）。
 *
 * 双泛型（票 55，票 42 裁 7——SF `Node<Data, Type>` 同构）：TTypeId 升字面量型后
 * `node.typeId === 'phase'` 判别即窄 data。两参数默认=既有宽形，存量面零变化；
 * TData 恒不设约束（schema 无关红线——内核不解释 data，任何形状皆合法）。 */
export interface CanvasNode<TData = Record<string, unknown>, TTypeId extends string = string> {
  id: string;
  /** 注册表词表项 id——合法性由注册表面承接，内核不解释；泛型面=词表键字面量。 */
  typeId: TTypeId;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** 折叠态（票 26——多参数节点折叠成标题条形）：纯视图关注点，reroute 先例同构
   * ——内存合并态、序列化投宿布局半边（layout.nodes[id].collapsed）、semanticHash
   * 恒不含、剪贴板不携。展开=无键（toggle 摘键不落 false 噪声）。 */
  collapsed?: true;
  data: TData;
}

/** 类型助手（票 55）：宿主 data 映射表（typeId→该型 data 形状）分布映射成判别
 * 联合节点型——`FlowloomNode<AppData>` 的成员=逐键 `CanvasNode<AppData[K], K>`，
 * `node.typeId === 'phase'` 处 TypeScript 判别收窄 data 到 PhaseData。纯类型零
 * 运行时；映射表形状建议 type alias（interface 无隐式索引签名，在宽收窄点
 * [窄 controller 递给宽类型消费者]会被 Record 边界拦下——使用手册「类型收窄」节）。 */
export type FlowloomNode<TMap extends Record<string, unknown>> = {
  [K in keyof TMap]: CanvasNode<TMap[K], Extract<K, string>>;
}[keyof TMap];

/** 边：两端口之间的连接。reroute 中继点序列（票 11——图坐标有序点列）是连线
 * 视觉路径关注点而非执行语义：内存合并态住边上（删边/删节点级联免费），序列化
 * 投宿布局半边（layout.reroutes）——语义半边投影剥除，semanticHash 恒不含。 */
export interface CanvasEdge {
  id: string;
  from: PortRef;
  to: PortRef;
  reroutes?: Point[];
}

/** 组记录（票 09）：成员集+组框几何。成员籍显式且互斥（一节点至多一组——嵌套归
 * 票 10 子图）；memberIds 恒 ⊆ 节点集（graph.ts 删节点级联修剪、组空即散）。
 * 组是画布组织关注点而非执行语义——序列化全量住 UI 格式布局半边（不入语义 hash）。 */
export interface CanvasGroup {
  id: string;
  memberIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 画布图状态。不可变值语义：所有操作返回新状态（快照按引用共享结构，见 snapshot.ts）。
 *
 * 嵌套容器模型（票 10）：nodes/edges/groups 是**根容器**三集；subgraphs 是全部子图
 * 记录的全深度扁平收纳（记录 id=其占位节点 id——占位是父容器内普通节点，身份同一）。
 * id 空间裁定：节点/边 id **全局唯一**（跨容器同命名空间，ComfyUI 全局 node id 同构）
 * ——序列化布局半边扁平 Record 不冲突、跨容器查改无歧义。
 * 容器视图（门面镜头）= containerViewAt/withContainer（subgraph.ts）读写单点。 */
export interface CanvasGraphState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
  subgraphs: CanvasSubgraph[];
}

/** 子图记录（票 10）：容器局部三集+边界口两表。每条边两端点与边同容器（无跨界
 * 存储边）——跨界连接=两条容器局部边经「占位端口↔代理节点」配对表达：
 * 入边界 父侧 outside→{占位.id,in-N} / 子侧 {代理,in-N}→inside（代理=入口型，
 * 容器内侧一输出端口）；出边界对称。子图是执行语义结构（与组相反）——住语义半边。 */
export interface CanvasSubgraph {
  id: string;
  name: string;
  /** 入边界口（占位节点输入端口，portId 形如 'in-N'）。 */
  inputs: SubgraphBoundaryPort[];
  /** 出边界口（占位节点输出端口，portId 形如 'out-N'）。 */
  outputs: SubgraphBoundaryPort[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups: CanvasGroup[];
}

/** 边界口：占位端口 id ↔ 容器内代理节点 id 的配对单点。 */
export interface SubgraphBoundaryPort {
  portId: string;
  proxyNodeId: string;
}

/** 视口（UI 格式持久化形——ComfyUI extra.ds 同构；布局/视口与语义分离）。 */
export interface CanvasViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 语义图（UI 格式的语义半边）：只有 id/词表项/自由载荷——无布局键。 */
export interface SemanticNode<TData = Record<string, unknown>> {
  id: string;
  typeId: string;
  data: TData;
}

export interface SemanticGraph {
  nodes: SemanticNode[];
  edges: CanvasEdge[];
  /** 子图（票 10）：全深度扁平收纳的语义投影（id 全局唯一使扁平无歧义）。
   * v1 内加法可选键——旧档无此键读为空，不升格式版本。 */
  subgraphs?: SemanticSubgraph[];
}

/** 子图的语义半边形（=CanvasSubgraph 去 groups——组恒不入语义/入布局）。 */
export interface SemanticSubgraph {
  id: string;
  name: string;
  inputs: SubgraphBoundaryPort[];
  outputs: SubgraphBoundaryPort[];
  nodes: SemanticNode[];
  edges: CanvasEdge[];
}

/** 布局半边（分键）：节点 id → 布局值；与语义 hash 无关。 */
export interface LayoutEntry {
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** 折叠态投宿（票 26）：v1 加法可选键——旧档无键读为展开（非 true 值不设信同读展开）。 */
  collapsed?: true;
}

export interface CanvasLayout {
  nodes: Record<string, LayoutEntry>;
  /** 组的布局投宿（票 09 裁定：组=成员集+组框几何皆非执行语义，全量住布局半边）。
   * v1 内加法可选键——旧档无此键读为空组，不升格式版本。 */
  groups?: GroupLayoutEntry[];
  /** 子图容器内组的布局投宿（票 10——组恒不入语义使然）。v1 内加法可选键。 */
  subgraphs?: SubgraphLayoutEntry[];
  /** 边中继点序列的布局投宿（票 11 裁定：视觉路径不入语义半边——键=边 id 全局
   * 唯一扁平无歧义）。v1 内加法可选键——旧档无此键读为无中继点。 */
  reroutes?: Record<string, Point[]>;
}

/** 子图容器的布局半边条目（组集投宿；节点布局扁平住 layout.nodes——全局 id）。 */
export interface SubgraphLayoutEntry {
  id: string;
  groups: GroupLayoutEntry[];
}

/** 布局半边的组条目（=CanvasGroup 原样投影；数组保序即组框层叠序）。 */
export interface GroupLayoutEntry {
  id: string;
  memberIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

/** UI 格式（双格式红线的前半）：语义+布局分键+视口；执行格式投影归消费者适配层。 */
export interface CanvasUiFormat {
  version: 1;
  semantic: SemanticGraph;
  layout: CanvasLayout;
  viewport: CanvasViewport;
}

/** widget 描述：词表项声明的节点参数控件（票 07——story 2「节点形状由数据定义」）。
 * 纯声明数据，内核不解释（schema 无关红线）；消费方是渲染层 PropertiesPanel——
 * kind 为通用五型渲染内建控件，其余 kind=自定义型，经渲染层 widget 注册位指名
 * 接组件（未注册回退只读 JSON 展示，不炸）。 */
export interface WidgetDef {
  /** 参数名——编辑回写节点 data 的目标键（浅合并单键覆写）。 */
  name: string;
  /** 控件型：'text'|'number'|'boolean'|'enum'|'textarea' 为内建通用件；
   * 其余值=自定义型（注册位指名覆盖；通用型也可被同名词表项覆盖渲染）。 */
  kind: string;
  /** 控件标签（缺省=参数名）。 */
  label?: string;
  /** 枚举选项（kind='enum' 时消费；值皆字符串域）。 */
  options?: readonly string[];
  /** 数字约束（kind='number' 时消费：钳制范围与步进）。 */
  min?: number;
  max?: number;
  step?: number;
}

/** 边形状字面量集（票 52，票 40 裁 1 术语锐化——「类型」留给票 39 端口 typeId）：
 * bezier=水平切线贝塞尔（既有缺省）/straight=直线段/step=正交最少拐点折线/
 * smoothstep=step 圆角档。对标 SF 同名四型。 */
export type EdgeShape = 'bezier' | 'straight' | 'step' | 'smoothstep';

/** 注册表项：节点型描述（宿主数据红线的类型面——词表开放集）。 */
export interface PortDef {
  portId: string;
  label: string;
  /** 端口数据类型 id（票 22 可选声明面）：渲染层据此取端口类型色 token
   * （`--fl-port-{typeId}`，未声明走中性缺省——词表宿主数据透传，内核只搬运不解释）。 */
  typeId?: string;
}

export interface NodeTypeDef {
  typeId: string;
  label: string;
  inputs: PortDef[];
  outputs: PortDef[];
  /** 参数控件描述（缺省=该型节点无参数控件——属性面板回退只读 data JSON）。 */
  widgets?: WidgetDef[];
  /** 节点类别色（hex，票 22 可选声明面）：渲染层据此染节点标题带（未声明走中性
   * token——ComfyUI 全中性先例）；边框不吃类别色。词表宿主数据透传，内核只搬运。 */
  color?: string;
  /** 出边形状（票 52 可选声明面）：**该型节点作为源时**其出边的形状（「边属性挂源」
   * 先例=类型色挂源端口 typeId）。解析优先级=词表 per-type > 全局缺省 > 'bezier'；
   * 未声明/坏字面量回退（color 同款姿态）。kernel schema 与序列化零变化——纯渲染
   * 层配置，仅 reroute 命中几何消费（跟形状连带）。词表宿主数据透传，内核只搬运。 */
  edgeShape?: EdgeShape;
  /** 落位初始数据工厂（票 59，消费者反馈 F6）：**工厂函数非裸值**——每次落位调用产新
   * 引用（裸对象多节点共享引用、克隆/撤销语义脏；React lazy initial-state 同款理由）。
   * 消费单点=落位路（placeNode/placeNodeConnected/搜索面板确认与拖放三路统一），
   * 播种进落位的恰一快照；未声明/未注册型照旧 data:{}（addNode 仍是全自持通道
   * 直带 data 不吃播种；外部门 entry.data 通道既有不涉）。工厂抛错透传 fail-loud。
   * 返回恒宽 Record（票 55 红线：NodeTypeDef 不挂类型参数，TMap 收窄不级联到
   * 返回值——宿主断言自证）。 */
  initialData?: () => Record<string, unknown>;
}

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
export const INPUT_EVENT_CONTRACT_VERSION = 2;

export type ModifierKey = 'ctrl' | 'shift' | 'alt' | 'meta';

export type KernelInputEvent =
  | { type: 'pointer-down'; x: number; y: number; button: number; modifiers: ModifierKey[] }
  | { type: 'pointer-move'; x: number; y: number; modifiers: ModifierKey[] }
  | { type: 'pointer-up'; x: number; y: number; modifiers: ModifierKey[] }
  | { type: 'wheel'; x: number; y: number; deltaY: number; modifiers: ModifierKey[] }
  | { type: 'key-down'; key: string; modifiers: ModifierKey[] }
  | { type: 'key-up'; key: string; modifiers: ModifierKey[] }
  | { type: 'contextmenu'; x: number; y: number; modifiers: ModifierKey[] };
