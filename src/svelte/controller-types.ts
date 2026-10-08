/** CanvasController 公共接口面（票 01-10 命令/查询/导航的声明集）——与实现
 * （controller.ts 的 CanvasControllerImpl）分文件：实现守 400 行红线（票 07 起
 * dispatch-guard 抽取先例），类型面独立成模块便于宿主 type-only 引用。 */
import type {
  AlignAxis,
  AutoLayoutOptions,
  CanvasEdge,
  CanvasGraphState,
  CanvasNode,
  CanvasUiFormat,
  CanvasViewport,
  ConnectionRules,
  ContextMenuOpen,
  EdgeShape,
  DistributeAxis,
  ExternalChangeSet,
  ExternalGraph,
  KernelInputEvent,
  LinkMachineState,
  NodeLockInput,
  NodeRegistry,
  Point,
  PortHit,
  RerouteMachineState,
  SelectionMachineState,
  ViewportLimits,
  ViewportMachineState,
} from '../kernel/index';
import type { FitSize } from './subgraph-navigation';
import type { ViewSizeSlot } from './view-size';
import type { ExportEnvSlot } from './export-actions';
import type { ExportImageOptions, ExportPngOptions } from './export-image';
import type { CommandActions } from './command-actions';

export interface CanvasControllerOptions {
  registry: NodeRegistry;
  initialGraph?: CanvasGraphState;
  initialViewport?: CanvasViewport;
  undoLimit?: number;
  /** 视口缩放上下限（滚轮缩放与 fitView 共用）。 */
  viewportLimits?: ViewportLimits;
}

/** 泛型槽（票 55，票 42 裁 7）：TNode=宿主判别联合节点型（FlowloomNode<AppData>
 * 产物），读面/落位面随之收窄——getSelectedNodes/addNode/placeNode(Connected)/
 * setNodeData 五方法面；缺省=宽 CanvasNode 零变化。槽只挂方法（方法双变使窄
 * controller 可递给宽类型消费者[卫星件 props 等]）；回调属性（onNodeDoubleClick
 * 等）恒宽——函数属性严格逆变，挂槽会断赋值互通。getState/toUiFormat 恒宽
 * （图状态/序列化面不级联泛型）。TNode 是宿主断言非运行时校验：registry 驱动
 * 落位 data={} 也是合法值，必填形状的映射表宿主自行保证落位后先行 setNodeData。
 * 界=CanvasNode<unknown, string>（顶型——interface 形 data 也可入）；工厂/store
 * 侧界=CanvasNode 宽形：ReturnType 惯用型按**约束**实例化泛型签名，unknown 界会
 * 使 ReturnType<typeof createCanvasController> 断掉向卫星件宽面的赋值（interface
 * 形 data 宿主改 type alias 入槽）。 */
export interface CanvasController<TNode extends CanvasNode<unknown, string> = CanvasNode> {
  readonly registry: NodeRegistry;
  /** 命令注册制面（票 14，story 27/28）：内建九命令已注册（撤销/重做/复制/粘贴/
   * 删除选中/取消手势/适配全图/成组解组/转子图——量测与系统桥类执行体由 CanvasView
   * 挂载时覆写）+默认键位表在册；宿主 register 注册自家命令、bind/unbind 换键位、
   * execute 执行（工具条按钮与键位同源）、bindings+serializeKeyBindings 存档。
   * 键位只在画布聚焦域触发（不劫持宿主全局键——接线在渲染层）。 */
  readonly commands: CommandActions;
  getState(): CanvasGraphState;
  getViewport(): CanvasViewport;
  /** 视口交互机状态快照（panning/spaceDown——渲染层光标等随动依据）。 */
  getViewportMachineState(): ViewportMachineState;
  /** 选区机状态快照（selected 集+在途手势——渲染层高亮/框选矩形随动依据）。 */
  getSelectionState(): SelectionMachineState;
  /** 选中节点对象数组（票 44 便捷 getter，P5）：kernel selectedNodes 投影——图序
   * 保形（与点选次序无关）、空选区空数组。「getSelectionState().selected 是 id
   * 集、找出选中的那个节点宿主要自己遍历」的接缝收口；非响应式场景（事件处理
   * 器/断言）用此面，响应式跟随用 createSelectionStore。 */
  getSelectedNodes(): TNode[];
  /** 连线机状态快照（在途手势——渲染层预览线/改连隐藏随动依据）。 */
  getLinkState(): LinkMachineState;
  /** reroute 机状态快照（票 11，在途手势——渲染层中继点拖拽高亮随动依据）。 */
  getRerouteState(): RerouteMachineState;
  subscribe(listener: () => void): () => void;
  addNode(node: TNode): void;
  /** 落节点到图坐标（两路落位共用）：id 自动生成、中心对准落点、恰一张快照可撤销；
   * 返回创建的节点。落在当前容器（票 10 导航镜头）。泛型面：typeId 受 TNode 词表
   * 键约束、返回 TNode（票 55——返回面是宿主断言，落位 data={} 见接口头注）。 */
  placeNode(typeId: TNode['typeId'], x: number, y: number): TNode;
  /** 拖线搜索确认的复合落位（拖线到空白→选型→落新节点+自动连兼容端口，story 11）：
   * placeNode+connect 恰一张快照（一次 undo 连点带线全消）。兼容端口=同名优先域内
   * 过滤（kernel firstAllowedPortOn——票 51 起候选刷卡：锁单/连接校验单不过者跳过，
   * 同名候选被拦回落其余候选；任一端锁定或全不过=只落节点不连线）；对端已有同线
   * 不重复建边。返回节点与边（未连线时 edge=undefined）。 */
  placeNodeConnected(
    typeId: TNode['typeId'],
    x: number,
    y: number,
    origin: PortHit,
  ): { node: TNode; edge: CanvasEdge | undefined };
  /** 拖线空白落点钩子（渲染层接线——CanvasView 注入开搜索面板；宿主可换自家落位 UI）。
   * 场景：拖线到空白松开（手势已终局、图零变化）——origin=起拖端口、at=落点图坐标。 */
  onLinkEmptyDrop: ((origin: PortHit, at: Point) => void) | undefined;
  /** 双击节点改道钩子（票 32，渲染层读——CanvasView 双击普通节点体时先唤；onLinkEmptyDrop
   * 同款可置属性）。在位且非显式拒接（仅返回 false）=宿主吃双击（不吃内建原位改名）；
   * 缺省/false=回落改名（票 15 既有行为不迁）。参数=命中节点+画布本地屏幕坐标（宿主锚
   * 浮层用）。改道只及节点体：子图占位双击照进子图、空白/边路径/平移态照旧。 */
  onNodeDoubleClick: ((node: CanvasNode, screen: Point) => boolean | void) | undefined;
  removeNode(nodeId: string): void;
  addEdge(edge: CanvasEdge): void;
  moveNode(nodeId: string, x: number, y: number): void;
  /** 外部静默摄入·变更单门（票 34，票 29 七裁——原语主名）：分栏信封（节点/边/组
   * 三集各 upsert+remove 显式删）整单应用。恒零快照——外部变化不占历史格，但进门
   * 前快照栈再锚（undo/redo 两堆+当前值逐张补拍同一变更）：撤销/重做后外部变化恒
   * 存活、撤销严格只回退用户操作；redo 不清。一调用至多一次通知（零变化零通知——
   * 宿主并单递一次=节流定在门上）；无返回值以通知为准。三态保全：镜头不动/选区经
   * prune 收缩（选中票被同步删即剔出）/在途手势终止（票 04 已知边界——拖拽中同步
   * 撞入这一下白拖不炸）。字段政策：data 整包替换（缺省读 {}）、typeId/几何视图字
   * 段既有节点恒不写、边连通可写拐点不写（换端点旧拐点消亡）、组名单可写框自适应；
   * 新节点落位三级阶梯=坐标照用→near 近旁提示→内容包围盒右外缘一步（空图原点，
   * 确定性重放恒同）。辖域=根容器（导航无关）；子图容器居民 id 冲突与保留型铸造/
   * 涂写 fail-loud；形状坏抛错指明字段（抛错零副作用）。 */
  applyExternal(changes: ExternalChangeSet): void;
  /** 外部静默摄入·整图门（糖）：incoming 全量对根容器按编号对账差分成变更单，再走
   * applyExternal 同一条执行路（两门一道语义一份）。「册上没有=删除」——残缺全量按
   * 删除清场（三集列皆必填：不镜像的集显式 []，或按数据源完整度改走变更单门）；保
   * 留型节点（子图占位）与挂其上的边是画布机器面不入账不删除；同值客不入单（幂等
   * 重放零通知零状态变）。undo/快照/三态语义同 applyExternal。短名别名 `applyGraph`
   * 同参同效（票 58——JSDoc 互指，本名恒主名）。 */
  applyExternalGraph(graph: ExternalGraph): void;
  /** applyExternalGraph 的别名（票 58，AI 可发现性）：同参同效同门（恒零快照/栈再
   * 锚/三集契约全随行），**applyExternalGraph 恒主名**。缘由：JS 宿主（尤其 agent）
   * 自然猜 applyGraph——方法不存在是裸 TypeError，任何报错机制都拦不到库代码运行
   * 之前，猜错的 catch 吞错即静默死腿（两处消费者实测）；别名让合理猜测直接命
   * 中，对吞错误的宿主也有效。 */
  applyGraph(graph: ExternalGraph): void;
  /** widget 编辑回写（票 07）：浅合并 patch 进节点 data（kernel updateNodeData），
   * 恰一张快照可撤销。提交粒度=命令式（票 07 票内定）：控件「值已定」的提交
   * （change 语义）一次一张快照，控件本地键入态不进 undo；未知节点/空 patch
   * 拒绝为 no-op 零快照。泛型面（票 55 写面细化记档）：patch 收窄为
   * Partial<TNode['data']>——判别联合下 Partial 分布成「某成员形状」的 patch，
   * 词表外键/错型值拒；跨成员混合键放行（联合 freshness 语义，TS 已知宽松）。
   * 动态键写者（widget 面板类 computed key）在窄面上须断言或持宽引用，宽缺省
   * 面（索引签名形）照收不破。 */
  setNodeData(nodeId: string, patch: Readonly<Partial<TNode['data']>>): void;
  /** 节点折叠/放开 toggle（票 26，标题条 chevron 的命令路）：恰一张快照可撤销
   * （折叠/放开各一张——连折多节点=多张快照，ComfyUI 同款）；折叠态=纯视图关注点
   * （序列化住布局半边、semanticHash 恒不含、剪贴板不携——粘贴默认展开）。
   * 未知节点 no-op 零快照零订阅返回 false。 */
  toggleNodeCollapsed(nodeId: string): boolean;
  /** 复制当前选区（票 05）：序列化为剪贴板格式文本并缓存为本页粘贴源；空选区返回
   * undefined（无操作）。保留型节点（子图占位/边界代理）不进载荷（票 10 票内裁定
   * ——剪贴板不携子图）。返回文本供宿主写系统剪贴板（跨标签页粘贴）。 */
  copySelection(): string | undefined;
  /** 粘贴（票 05）：解析 text（缺省=本页内部复制缓存），id 重映射落新图、落点=
   * 复制原点逐次偏移（连续粘贴每次 +PASTE_OFFSET_PX，复制时归零）、新集即当前
   * 选区、恰一张快照可撤销。解析失败/未知版本/空载荷拒绝不炸（no-op 无快照）；
   * 返回新选区（粘贴节点 id 集），未粘贴 undefined。落在当前容器。 */
  paste(text?: string): ReadonlySet<string> | undefined;
  /** 分组 toggle（票 09）：选中集 ⊆ 某组=解组该组，否则非空成组（成员籍互斥偷员、
   * 组框=成员包围盒+padding）。恰一张快照可撤销；空选区 no-op 零快照返回 false。
   * 命令式编辑（剪贴板同款口径不进内核输入契约），键位接渲染层 Ctrl+G。 */
  toggleGroupSelection(): boolean;
  /** 组框适配内容（票 09）：对选中集涉及的组重算组框回包围盒+padding；恰一张
   * 快照可撤销；全贴合或无涉及组=零快照。返回实际适配组数。 */
  fitGroupsToContents(): number;
  /** 选中集对齐（票 13）：六轴按选区包围盒对齐（kernel alignNodes——Figma 同构）；
   * 恰一张快照可撤销；排布只动 x/y，选区不丢（票内裁定）。无位移 no-op 零快照
   * 返回 false。命令式动作（剪贴板同款口径不进内核输入契约），入口归宿主工具条/
   * 选区工具条（票 15）。 */
  alignSelection(axis: AlignAxis): boolean;
  /** 选中集等间隙分布（水平/垂直——首末不动、相邻边到边间隙相等）；快照/选区
   * 语义同 alignSelection。 */
  distributeSelection(axis: DistributeAxis): boolean;
  /** 整图自动排布（当前容器全部节点）：默认 L→R（层沿 x 推进——票 23 owner 裁定
   * 的语义变更，ComfyUI 流向），{direction:'tb'} 显式回票 13 原纵向语义；恰一张
   * 快照可撤销、选区不丢；结果锚定原域包围盒左上（不甩图到原点）、涉及组框重
   * 适配、层步进吃派生层尺寸（widget 长高/折叠高随动）。所涉边（两端点皆域内）
   * 中继点清空重置——边随新分层直接走新路径，排版后再手动插点照旧（票 23）。
   * 空图 no-op 返回 false。 */
  autoLayout(options?: AutoLayoutOptions): boolean;
  /** 选区自动排布（分组域=点组框选全体成员后走此路——票内裁定不设第三方法）；
   * 域外节点不动、跨界边不参与分层（其中继点也保留）。方向/快照语义同 autoLayout。
   * 空选区 no-op 返回 false。 */
  autoLayoutSelection(options?: AutoLayoutOptions): boolean;
  /** 选中集→子图（票 10，Ctrl+Shift+E 的图效果）：成员+内边迁入新记录、边界边拆
   * 占位口/代理配对、组员 ⊆ 选中集的组随迁；恰一张快照可撤销（undo 即回平图）；
   * 转换后选区=占位（不自动进入）。空选区 no-op 零快照返回 false。 */
  convertSelectionToSubgraph(): boolean;
  /** 进入当前容器内的子图（票 10 导航——视口域不入 undo）：视口 LRU 记忆复原
   * （重进复原该子图镜头）；无记忆且给了容器尺寸（FitSize）则对目标容器适配兜底。
   * 失活占位 false。 */
  enterSubgraph(id: string, fitSize?: FitSize): boolean;
  /** 退到父容器（根上 false）。 */
  exitSubgraph(fitSize?: FitSize): boolean;
  /** 面包屑/宿主跳转：自根子图 id 链（失活段自动钳制到可存活前缀）。 */
  navigateTo(path: readonly string[], fitSize?: FitSize): boolean;
  /** 导航栈回溯一步（无回溯 false）。 */
  navigateBack(): boolean;
  /** 当前导航路径（自根子图 id 链——面包屑/测试消费）。 */
  getNavPath(): readonly string[];
  /** 面包屑数据：[根]+路径各段 {id,name}（根段 id=''/name=''——显示名归宿主渲染层）。 */
  getBreadcrumb(): { id: string; name: string }[];
  setViewport(viewport: CanvasViewport): void;
  /** 全图适配：按容器像素尺寸缩放居中（视口操作，不入 undo）。空图/零尺寸容器 no-op。 */
  fitView(width: number, height: number, margin?: number): boolean;
  /** 归一化输入事件派发进内核交互机（票 01 起「归一化事件→内核」唯一入口）。 */
  dispatchInput(event: KernelInputEvent): void;
  /** 结构面锁单（票 36，票 30 裁 4）：旁边声明「节点存在性+其边连接不可变」——
   * 谓词主形（入参=节点对象，读宿主自家 data 字段照常；applyExternal 新进节点
   * 自动覆盖）+编号集糖（readonly 数组/ReadonlySet 双收）两形同供取并（任一谓
   * 真即锁）；undefined/空形状=无锁 opt-out（交互零变化）。**锁拦用户手势与内建
   * 命令不拦真源**：锁定节点不可删（Delete 过滤删除——冻结边可编辑端连带保全）、
   * 不可被连/拆线（端口不起线/落点静默终止/冻结边改连拒）；**布局半边照旧**（挪
   * 位/框选拖动/分组/折叠/排布/reroute 拐点放行）；子图转换涉锁整单 no-op；
   * placeNodeConnected 自动连边遵守锁单；applyExternal/applyExternalGraph 恒不
   * 查锁（外部门不刷卡），直连 API（removeNode/addEdge 等）同不刷卡=宿主程序面
   * 真源姿态。锁单非图数据：不进 node.data/undo/semanticHash/UI 格式、恒不落
   * 快照、不被外部门整包替换冲掉；写入零通知。全图只读=谓词恒真退化用法。 */
  setNodeLocks(locks: NodeLockInput | undefined): void;
  /** 连接校验单（票 51，票 39 五裁落形）：旁边声明「连接合法性」——谓词主形
   * `isValidConnection(from, to)`（入参=富载荷端点 `{ node, port, side }`：节点
   * 整只+解析后 PortDef；方向恒 from=output 侧→to=input 侧；动态逻辑上界——连接
   * 数上限/跨字段/运行时状态）+词表兼容矩阵糖 `portTypeCompat`（端口 typeId→可连
   * typeId 名单的有向映射，数据非代码——纯类型图零样板谓词）两形同供 **AND 合流**
   * （基础合法面[两侧相对]∧矩阵∧谓词全过才放，与锁单并集对偶）；**矩阵只拦在册
   * 行**：from 型行在册而 to 型不在名单=拒、from 型不在册=放行、不传=全放行。
   * 同节点自连=基础面放行、谓词裁量（环归消费者语义）。**作用域=三路刷卡·四门不
   * 刷**：刷卡=拖线新手势/改连换头（校验不过=静默终止零快照，预览线红档
   * `data-fl-link-valid='false'`——悬停端口跳变时评估[机内去重，非逐帧]）/拖线
   * 搜索确认 placeNodeConnected 自动连（候选端口过滤校验不过者，全不过=只落节点
   * 不连线）；恒不刷=applyExternal/applyExternalGraph（真源权威，票 29/36 口径）
   * /直连 addEdge（宿主自己的手）/undo·redo（回放既成历史）/粘贴（用户内容忠实
   * 再现不滤边）。锁定落点的预览随合法判单源并入红档（票 36 已知观感修正——锁
   * 定端口拖线预览显红、松手静默终止，CHANGELOG 记档行为变化）。undefined/空形状
   * =opt-out 交互零变化；校验单非图数据：不进 node.data/undo/semanticHash/UI 格
   * 式、恒不落快照、不被外部门整包替换冲掉；写入零通知。CanvasView props
   * `connectionRules` 同效（挂载置入+卸载复位——nodeLocks 同款）。 */
  setConnectionRules(rules: ConnectionRules | undefined): void;
  /** 边形状全局缺省（票 52，票 40 裁 3 落形）：纯渲染层配置不进 kernel 图数据/
   * 序列化——仅 reroute 命中几何消费（跟形状连带）。`EdgeShape = 'bezier' |
   * 'straight' | 'step' | 'smoothstep'`（对标 SF 同名四型）；解析优先级=**from 侧
   * 节点型**词表 `NodeTypeDef.edgeShape` > 此全局缺省 > 'bezier'（未声明/坏字面量
   * 回退——color/typeId 可选键同款姿态，旧数据零迁移）。reroute 中继点=固定必经
   * 拐点（折线形下相邻顶点间各自走形状段，拖到哪拐点就在哪）。straight 型在端口
   * 锚定形制下**后退边可能穿越节点=型内固有非缺陷**（SF 同款）。写入零通知零
   * 快照；`undefined`=缺省 'bezier' 零行为变化。CanvasView props `edgeShape` 同效
   * （挂载置入+卸载复位——nodeLocks 同款双入口）。 */
  setEdgeShape(shape: EdgeShape | undefined): void;
  /** 视图尺寸旁挂缓存槽（票 45）：Minimap 缺省自量的库内侧通道——**controller
   * 实例上的被动存储面**（per-controller 缓存，多实例隔离天然成立），恒由视图层
   * 写入（CanvasView 挂载时量自身容器——fitView 同款读数的开放化、resize 经
   * ResizeObserver 随动重发、卸载清空），**controller 恒不主动测**（票 12 无头零
   * DOM 红线不破——「必填」措辞明裁改「缺省（显式传参覆盖）」）。消费方=Minimap
   * `viewportSize` 未传时（显式读取器恒覆盖——票 12 已裁必填形的向后兼容）；宿主
   * 极少直调（无 CanvasView 的非常规装配自管卫星件尺寸时可显式喂）。值语义通知
   * （变更恰一次/同值零）走**槽自带订阅通道**（`subscribe`）——尺寸变化非图变化，
   * 不扰 controller.subscribe 语义；零快照零图数据/undo/semanticHash 污染（锁单
   * 同款旁边声明）。已知边界：一 controller 多 CanvasView 的非常规装配下任一
   * CanvasView 卸载即清空槽（装配常态=一 controller 一 CanvasView，票 16 口径）。 */
  readonly viewSize: ViewSizeSlot;
  /** 右键菜单开面态查询（票 31）：contextmenu 事件经 dispatchInput 进派发环旁挂
   * 观察——非让位（手势在途/空格平移态吞）即解析命中+Windows 改选+开面；返回
   * 开面载荷（命中判别+画布本地屏幕锚），未开 undefined。选区工具条等按「菜单
   * 开着」让位消费；开面/收场通知照发（订阅去抖）。 */
  getContextMenuState(): ContextMenuOpen | undefined;
  /** 关闭右键菜单（票 31——ContextMenu 卫星件外点/Esc/点项终局的汇点）。 */
  closeContextMenu(): void;
  /** 撤销栈状态查询（票 25，纯转发 kernel SnapshotStore）：栈空 false。栈变必伴随
   * subscribe 通知（按钮灰化联动免轮询——票内核实成文）。 */
  canUndo(): boolean;
  /** 重做栈状态查询（票 25，纯转发 kernel SnapshotStore）：无 redo 队列 false。 */
  canRedo(): boolean;
  undo(): boolean;
  redo(): boolean;
  toUiFormat(): CanvasUiFormat;
  /** 导出环境旁挂槽（票 56）：主题缺省+状态袋的视图层发布面——**controller 实例上
   * 的被动存储面**（viewSize 同形第三例），恒由 CanvasView 写入（挂载读
   * documentElement 的 data-fl-theme/prefers-color-scheme 镜像 tokens.css 级联发布
   * 主题+nodeStates props 透传发布状态袋）、卸载清空；controller 恒不主动读 DOM。
   * 导出时读取：theme=显式参数>槽>light、nodeStates=槽（所见即所导的状态染色源）。
   * 旁边声明纪律（锁单同款）：不进图数据/undo/semanticHash/UI 格式、恒不落快照、
   * 写入零通知。已知边界：主题读取在发布时点——宿主后翻属性不保证随动（显式传 theme 恒可用）。 */
  readonly exportEnv: ExportEnvSlot;
  /** 全图导出·SVG（票 56，票 48 裁 1/3/4/5/6 落形）：从 controller 当前图状态（子图
   * 内即当前子图内容——toUiFormat 同口径所见即所导）+token 字面量表全新拼**自包含
   * SVG 串**（零外链/色值字面量化/字体声明随行不内嵌）；headless 全可用（纯字符串
   * 拼装）。域=exportBounds（节点∪组框∪边中继点+margin）；视觉 chrome 跟随（类别
   * 色/状态染色四态+雾化/锁角标/折叠形/边形状方言）、交互态不带（选中/框选/hover/
   * 预览）；类型色族（宿主 CSS 开放集）走中性色。**交付=返回串不触发下载**（下载是
   * 宿主 UX——a[download] 一行）。非命令表项：数据出口门面（toUiFormat 先例），
   * 零快照零通知。 */
  exportSVG(options?: ExportImageOptions): string;
  /** 全图导出·PNG（票 56）：SVG 产物→Blob URL→Image→canvas 原生光栅化四步零依赖，
   * 返回 image/png Blob（不触发下载）；`pixelRatio` 缺省 1（文档嵌入场景传 2）。
   * theme/background 语义同 exportSVG。**headless fail-loud**（返回值 API 不容忍
   * no-op 占位——命令 no-op 容忍因 fire-and-forget，两分法先例）：无 document 或无
   * canvas 实现（jsdom）即拒；exportSVG headless 全可用。 */
  exportPNG(options?: ExportPngOptions): Promise<Blob>;
}
