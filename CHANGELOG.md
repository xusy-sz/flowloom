# Changelog

semver；每里程碑发版。

## 1.32.1 — 票 60：README 卖点页与 usage 手册拆分（对外文档重写）（2026-10-08）

对外文档从单文件 786 行 README 拆为四件：`README.md`（英文主面卖点页）+ `README.zh-CN.md`（中文卖点页镜像，顶部互链）+ `docs/usage.md`（中文手册源面：使用章+API 参考+本地演示节）+ `docs/usage.en.md`（英文手册镜像）。中文为源、英文为镜像，同一票内同步。

- **卖点页骨架**：一句定位 → 卖点三条（交互完备度 / 为外部数据源与 AI agent 设计 / 零依赖轻量）→ 截图 → 安装+quick start → 功能全表 → 文档去向 → 设计原则 → License；正文零票号零版本史；「在线演示」留待部署占位（部署归 owner 待办）。
- **过程叙事纯删**：「教义红线」改写为对外「设计原则」四条（人话）；「发布说明」「贡献」两节砍；spec/tickets 收进「更多文档」一行。
- **截图 3 张**入仓 `docs/assets/`（integration2 浅/深全页+跨线桥特写；puppeteer-core+系统 Edge headless 真拍，公共图床当日全挂改走 emitImage 上传桶→analyze_image 远端视觉核验三张全过）；package.json `files` 收编 assets+usage 两份+中文 README（npm 页面相对路径图/链不裂）。
- **随腿**：src 两处 JSDoc 指针 README→使用手册（types.ts/export-image.ts）；integration2.html 标题与侧栏标题去票号（截图可见面）；vec2-widget.svelte 注释去票号（样例与活例逐字同源纪律两头同步）；usage 新收「本地演示」节（21 页清单+`npm run play`）。
- **de-ai 审校**两份中文面：破折号/机翻腔种子模式归零（样例内注释同步清）；usage 正文全量去票号去过程腔，语义无损。
- **致谢与命名（owner 反馈补）**：对外文档正文不点特定产品名（卖点 1 标题去 ComfyUI 字样改中性表述）；README 两语言面新增「致谢」节列参考过的先行者（ComfyUI/xyflow 家族/GoJS/litegraph.js/Sugiyama 算法）；内部未发布项目名零出现（grep 核零）。

## 1.32.0 — 票 59：词表初始数据播种（消费者反馈 F6）（2026-10-07）

词表单源的节点初始数据通道（semver minor——新公共 API `NodeTypeDef.initialData`）：词表项声明 `initialData?: () => Record<string, unknown>` 工厂，落位时调用产节点初始 data——修掉宿主「placeNode 后 setTimeout 补 setNodeData=两张快照+时序竞态」绕法（消费者 seedPlacedNodes 实录）。

- **工厂函数非裸值**：每次落位调用产新引用（裸对象多节点共享引用、克隆/撤销语义脏——React lazy initial-state 同款理由）。
- **消费单点=Placement.record**：placeNode/placeNodeConnected（含拖线确认）与搜索面板确认、侧栏拖放三路自然统一（已核全走 record 一点，改一处全覆盖）；播种进落位的**恰一快照**（undo 一次连点带线带种全消）。
- **边界（零变化面）**：未声明/未注册型照旧 `data:{}`（未注册 typeId 放行回退显示语义零变化）；`addNode` 仍是全自持通道直带 data 不吃播种（票内小裁：placeNode options 重载第二通道不立——词表已覆盖，真需求再立）；外部门不涉（entry.data 通道既有，`?? {}` nullish 兜底外部门 data 同款）；工厂抛错透传 fail-loud 不吞不包（票内小裁荐采纳——落位中止零快照）。
- **类型面守票 55 红线**：NodeTypeDef 不挂类型参数，返回恒宽 Record（TMap 收窄不级联到返回值——宿主断言自证，README 记档）。
- **README**：使用章新节「词表 initialData 播种」（声明样例+三路统一+边界清单）+类型收窄节边界行更新（「落位 data 恒 {}」锐化为「未声明 initialData 时」）+API 参考表落位行互指；spec 增决策行（票 59 立策）。
- **测试面**：新文件 src/svelte/controller-initialdata.test.ts 五面（播种进恰一快照/工厂每次调用产新引用·两节点不共享/缺省与未注册型零变化/placeNodeConnected 复合落位同吃播种/工厂抛错透传零快照——controller.test.ts 贴 400 行红线拆出，external-teachability 先例）+CanvasViewPlacement.test.ts 搜索面板确认 jsdom 一钉+type-narrowing.test-d 泛型双向钉（返回恒宽 @ts-expect-error+漂移锁在场照锁）。README 样例经仓 tsconfig 同参核过（票 46 先例）。843/843。
- dist 随版本 bump 照票 54 纪律重建提交（dist/svelte.js 单件源变——types.ts 纯类型面 kernel.js 零 diff）。

## 1.31.0 — 票 58：AI 可发现性与错误可教性（消费者反馈 F3/F10 主体+F2/F4/F5/F8/F11 文档腿收编）（2026-10-06）

库不在 AI 训练语料内的 standing 事实应对（semver minor——新公共 API `applyGraph` 别名）：AI 消费者三条学习通道中运行时报错唯一躲不开，**报错文本=写给 agent 的运行时文档**。

- **公开门 throw 三要素纪律成文（spec 增「错误可教性」决策行，票 58 立策）**：每条消息带病因+合法选项+恢复动词——变更单守卫（external-guard 17 处消息面：未知栏/未知字段/类型错/同栏重复/upsert∩remove 各带恢复句）/整图守卫（external-diff：根形/未知键/typeId 缺位）/外部门应用路（external 9 条消息面：保留型销账·涂写·铸造/目标缺位/辖域冲突各带出路）/graph·group·subgraph（重复 id/端点缺位/路径失活）/registry（重复注册）/serialize（版本闸→换新图启动）/commands（未注册→先 register）/export headless（改用 exportSVG 或浏览器环境）全量升格；锁单/校验单/剪贴板拒绝面零 throw 位（宽容 opt-out 纪律）——审计在案；边界例外：input-normalize 归一化守卫（非指针事件类型）是 CanvasView 内部接线面（浏览器枚举 type，非宿主直调公开门），口径外记档不升格。
- **图态键定向识别（行为零变——照 throw 照拒收）**：整图守卫未知键命中图态已知键小名单（subgraphs/selection/version/semantic/layout/viewport——票内小裁：高频小名单非理论全集，覆盖 getState()/toUiFormat() 直喂两条实测失误路[F2]）给定向提示（疑似图态形→投影剥离机器面字段/不镜像的集显式递 []/增量源改走 applyExternal 变更单门）；变更单节点项 width/height/collapsed 呈现派生字段定向指引（词表派生不由外摄）。宽容收键与否归 owner 另裁——「报错更可教」与「直接宽容」是两条路，本票取前者。
- **`controller.applyGraph(graph)` 别名（新公共 API）**：≡ `applyExternalGraph`（同参同效同门、恒零快照/栈再锚/三集契约全随行、JSDoc 互指、**applyExternalGraph 恒主名**）——JS 方法不存在是裸 TypeError，任何报错机制都拦不到库代码运行之前；两处消费者实测的 agent 自然猜 applyGraph 被 catch 吞成静默死腿（布局恢复腿自上线即死代码），别名让合理猜测直接命中、对吞错误的宿主也有效。applyExternal 不连带短名（票内小裁：无撞名实测、与变更单门易混）。
- **README 使用章新节「API 参考」**：controller 全公开方法（属性面 6+方法面 14 组，对码 controller-types 全量盘点非凭记忆）+CanvasView props 九件清单+四段消费指引（执行态着色姿势——nodeStates+`data-fl-state-*` 属性选择器+宿主样式表 keyframes[F5 正解；「live 无通道」前提不实记档——票 33 通道在场且开放集键更宽]/`data-fl-node` 确定性选择器[F4——同页双画布容器作用域隔离；idPrefix 非公开 prop+随机前缀=票 50 a11y 防撞设计记档缘由]/端口热区几何[F8——坐标制命中+`portPositions` 纯函数单源，展开态首行 y+34、热区 8px]/subscribe 退订样例[F11——$effect 内订阅返回退订]）+宿主整合注意（Svelte 模板 `<style>` raw-text 字面量劫持解析器——动态样式走 DOM createElement 注入或宿主样式表）。
- **测试面**：新测 8 面 837/837（kernel 6：变更单三要素三面[新文件 external-teachability.test.ts——external.test.ts 贴 400 行红线拆出]/图态键定向三面[external-diff.test.ts]；门面 2：applyGraph 别名同效+恒零快照/同门守卫[controller-external.test.ts]）+既有消息断言联动强化七处（registry/serialize/graph 三面/group/subgraph/commands/export——病因→恢复句跨 regex）；jsdom 零新增（纯消息+别名+文档面）。README 样例经仓 tsconfig 同参核过（票 46 先例——临时夹具核完即删，0 错；css_unused_selector 警告恰实证「必须全局样式表」指引）。
- dist 随版本 bump 照票 54 纪律重建提交（kernel.js+svelte.js 两件源变）。

## 1.30.2 — 票 57：改连探测侧盲修复（消费者反馈 F1）（2026-10-06）

kernel 连线机改连探测补 side 守卫（**bugfix patch，零公共 API 变化**）——两侧同 portId 词表（出入口都叫 'next' 类命名，三消费者两编辑器在用）下，按**出口**起拖曾被误判为改连：手势误携 `movedEdgeId`、落定后旧入边被摘新边顶替（链式建图 a→b→c 第二拖 b→c 时 a→b 被劫持——第三方消费者 Playwright 实测实证）。

- **根因**：`pointerDown` 改连探测 `graph.edges.find((e) => samePortRef(e.to, hit))` 只比 nodeId+portId 不比 side（`PortRef` 类型不携侧）——与 link.ts 文件头自述「output 拖拽恒为新连线」相悖的直修。
- **修法**：起拖侧守卫——`hit.side === 'input'` 才探测首条入边，output 侧恒新连线（同文件 `linkStartBlocked` 已有同款守卫照搬）；settle 落定面零改（`movedEdgeId` 缺位即既有纯新线路径）。
- **回归钉**：kernel/link 新测三面 829/829——①同 portId 异侧词表出口起拖 `movedEdgeId === undefined`；②有入边节点的出口拖线产新边、旧入边原样保留（劫持不复现）；③入口侧起拖照旧探测入边（守卫只拦出口）+既有改连面全绿不动摇（input 侧移动首条入边/放回原端口原状终结/改连并入既有边净删）。jsdom 零新增（kernel 纯函数面全权覆盖）。
- **边界**：修后消费者的 in/out 异名规避（入口 id='in'/出口 id='next'）可择机回收统一命名——宿主侧动作，非本票。
- dist 随版本 bump 照票 54 纪律重建提交（kernel.js 单件源变）。

## 1.30.1 — 票 49：集成 demo II 收口（本册「下一阶段方向」epic 闭门载体）（2026-10-05）

本册收口载体（票 38 裁定 7，票 37 先例）——**本册六面同场一张画布的对外可链接整体演示**，场面=审批流（正交路由的版式语言；词表/矩阵/谓词皆宿主语义示例非库契约）。**演示载体非库面**（票 20/24/37 先例）——零库码改动零公共 API 新增，semver patch（票 20/37/46 先例）。

- **六面接线全走公共面**：连接校验（51——`connectionRules` 矩阵∧谓词 AND：跨类连矩阵拦+终审只接 level≥3 谓词拦，拖线红档+落点静默终止零快照，归档 🔒 锁面红档统一 1.25.0 行为变化活例）/边形状四型+跨线桥（52/53——词表 per-type 覆盖[初审 step/终审 smoothstep/修订 bezier]+全局缺省四档循环钮；驳回边×重报回边 X 交叉处开 `edgeJump` 出半圆弧，弧数读数=path `A` 命令计数）/PNG·SVG 导出（56——`exportPNG`/`exportSVG` 所见即所导：状态染色/进度条/锁角标跟随，下载钮=宿主 a[download] 一行）/a11y 键盘面（50——Tab 遍历/方向键 nudge/Enter 改名/± 缩放/空格+方向平移，读数面选中·activedescendant·视口逐步有数）/宿主人体工学（44——`createSelectionStore` 侧栏 $selection 跟随+`setNodeData` 回写恰一张快照可撤销，发射计数经验收驱动面 `flDemo.emissions` 取证）/dist 分发面（54——**整页 import 走 `flowloom/dist` 键族=dist 入口的第一个非验证性消费者**，读数面首行=资源表取证）。
- **载体三件**：`playground/integration2.html`（壳+宿主 CSS——状态染色与导出器 chrome 同口径[running 选区色/done 绿/todo 雾化 0.55]、归档琥珀虚线+🔒、端口类型色开放集四色）+`integration2-demo.js`（六面接线+读数面+验收驱动面 `flDemo`）+`integration2-side.svelte`（侧栏样例组件）；hub 增节+README 本册 epic 收口行。
- **验收面（票 24 教训——载体页进真浏览器）**：jsdom 零新增（playground 不入单测面，票 37 先例）；真浏览器（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46/51/52/53/56 口径）功能读数+浅深两主题实拍远端视觉核验全过（详见票 49 Resolution）；`npm run check` 全绿+`play:build` 冒烟过。dist 无源码变更零重建面（版本 bump 照票 54 纪律跑 `dist:build` 复核，产物零 diff）。

## 1.30.0 — 票 56：PNG·SVG 导出落地（C 段执行票——票 48 七裁产物）（2026-10-05）

全图导出为自包含 SVG 串/PNG Blob（报表/归档/文档嵌入的通用输出能力，竞品标配缺口收口），新增公共 API（semver minor）——`controller.exportSVG(options?) → string` + `controller.exportPNG(options?) → Promise<Blob>` + `controller.exportEnv` 导出环境旁挂槽。

- **自建 SVG 生成器=渲染层纯函数族第三例**（link-render/minimap-model 先例同形；模块族三件=export-tokens 主题表/export-node 节点组装/export-image 整图拼装——票 53 edge-jump 自然缝拆同款）：从 controller 状态（当前容器视图——子图内即当前子图内容，toUiFormat 同口径）+token 字面量表全新拼自包含 SVG（零外链/色值字面量化[类别染色带=color-mix 预混 rgba]/字体声明随行不内嵌）。**token 表浅深两张与 tokens.css 同步钉死**（export-image.test.ts 逐值对账——tokens.test.ts 先例的导出侧镜像）；边/箭头复用 link-render 方言（scale=1、票 52 形状解析自动跟随）。
- **kernel `exportBounds`**：graphBounds 口径扩展（节点∪组框占位∪边中继点+margin——中继点可拖出节点界，纯节点包围盒会裁边尾；margin 缺省=FIT_VIEW_MARGIN 50 同源）；空图=原点零域+margin（导出对空图恒可用）。
- **门面语义（票 48 裁 3）**：toUiFormat 数据出口先例非命令表项（零快照零通知）；options=`{ theme?, background?: string|'transparent', pixelRatio?（PNG 独有缺省 1） }` 显式恒覆盖；**主题缺省=exportEnv 旁挂槽**（viewSize 同形第三例）：CanvasView 挂载读 `data-fl-theme`/`prefers-color-scheme` 镜像 tokens.css 级联发布（`nodeStates` 状态袋同路发布——状态染色所见即所导）、槽空回退 light、卸载清空；**交付=返回产物不触发下载**（下载归宿主 a[download] 一行）；headless：exportPNG fail-loud throw（含 jsdom 无 canvas 路同步拒绝）、exportSVG 全可用。
- **PNG 光栅化四步零依赖**：SVG→Blob URL→Image→canvas 原生四步；blob URL 释放时序=绘制完成后 try/finally 即时释放（失败路同泄零通道）。
- **保真口径（所见即所导·chrome 跟随、交互态不带）**：类别色/状态四态（status 约定键 todo/running/done/error——边框+徽章档色、todo 雾化 0.55、vars.progress 底缘进度条；开放集其余键值零解释）/锁角标 🔒/折叠形跟随；选中/框选/hover/预览/中继点编辑态不带；节点=标题+widget 值文本（内建型按型格式化：toggle→是/否、enum→选项名；自定义型=JSON 短文本诚实呈现）。
- **守线与边界记档**：controller.ts 贴线（wc 397/eslint 398）兑现票 55 记档「下票触控必须走模块抽取」——wiringHost 构造抽 controller-wiring.ts（wiringHostOf+ControllerInternals 内部缝，类不出模块公共 API 零变）；类型色族（宿主 CSS 开放集）走中性色、跨线桥弧不进导出（minimap 同判）、文本溢出=节点矩形级裁剪（免测量近似）。
- **文档**：README 使用章新节「PNG·SVG 导出」（类型收窄节后：双方法/options/主题缺省/自包含口径/下载宿主示例/边界照实清单）+能力行 M3 同步+spec 增决策行（票 56 立策）；载体页 `playground/export.html`+hub 增节。
- **验收**：新测 34 面 826/826（kernel 4：exportBounds 四面[节点域+组框+中继点+空图]；生成器 18：token 对账浅深逐值/结构三件/背景两态/空图/XML 转义/标题单源/kernel 盒尺寸/类别色预混+非 hex 不染/widget 五型格式化/enum 离群空串/折叠形/锁角标/状态四态+未识零解释/进度条好环值/边方言四型跟随/主题两档/子图占位；门面 6：headless 可用/主题三级解析/背景透传/旁挂带随动/当前容器口径/零通知零快照+exportPNG 无头拒绝；jsdom 5：主题显式两档+卸载清空/缺省回落 light/挂载后翻属性不随动+显式恒覆盖/nodeStates 发布随动+卸载清空/exportPNG jsdom fail-loud）+真浏览器验收（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46/51/52/53 口径）；`npm run check` 全绿+`play:build` 冒烟过。dist 随版本 bump 照票 54 纪律重建提交。

## 1.29.0 — 票 55：TS 泛型收窄落地（A 段执行票——票 42 裁 7 产物）（2026-10-05）

宿主 TypeScript 消费的类型面公共 API（**纯类型面——泛型参数全擦除，运行时零变**；缺省参=既有宽形，存量面零迁移零破坏，792 测试面零改动全绿），新增公共 API（semver minor）。

- **kernel 双泛型**：`CanvasNode<TData = Record<string, unknown>, TTypeId extends string = string>`（typeId 升字面量型——SF `Node<Data, Type>` 同构）+类型助手 `FlowloomNode<TMap>`（data 映射表分布映射成判别联合节点型——`node.typeId === 'phase'` 判别即窄 data；纯类型零运行时）。
- **泛型槽落位**：`createCanvasController<TNode>`（读面/落位面五方法收窄：`getSelectedNodes`/`placeNode`/`placeNodeConnected`/`addNode`/`setNodeData`——写面本票细化记档：patch=`Partial<TNode['data']>`，词表外键/错型值编译期拒、跨成员混合键放行[联合 freshness 语义]、动态键写者在窄面须断言或持宽引用）+`createSelectionStore`（TNode 自 controller 入参推导）。**槽只挂方法面**（方法双变使窄 controller 可递给宽类型消费者——卫星件 props 等）；回调属性（`onNodeDoubleClick`）恒宽（函数属性严格逆变，挂槽断赋值互通）；`getState`/`toUiFormat` 恒宽（图状态/序列化面不级联泛型）。
- **词表漂移锁**：`createNodeRegistry<TMap>` 可选泛型——define 的 typeId 编译期受 `Extract<keyof TMap, string>` 约束（词表越界即报）；**词表运行时形状零变**（`NodeTypeDef` 不挂类型参数——「节点定义=宿主数据」红线的类型面镜像）。README 样例给 satisfies 反向锁姿势（字面量联合上下文保字面量+锁键——宽 `NodeTypeDef` 上下文会拓宽失锁）。
- **验收面**：类型级测试等价形（`src/svelte/type-narrowing.test-d.ts`——vitest typecheck 不开，断言经 `npm run typecheck` 钉死：Equal 逐形恒同[分布映射产物/读面传导/store 推导/宽缺省恒同]+@ts-expect-error 逆向钉[漂移锁两路/坏 typeId/坏形状/坏 patch——意外放宽时标记自身报红]+真函数体行为证[判别分支内读窄字段]）；README 样例经仓 tsconfig 同参核过（票 46 先例）；`npm run check` 全绿+`play:build` 冒烟过。dist 随版本 bump 照票 54 重建纪律重建提交——**产物 diff 纯注释面**（泛型参数与 as 断言全擦除=「运行时零变」主张的产物面实证）。

## 1.28.0 — 票 54：dist 预构建入口落地（A 段执行票——票 42 裁 2/3/5/6 产物）（2026-10-05）

源码消费唯一真崩点的 dist 侧止血（首消费者反馈 P1-②）：**dist 入仓=私有分发通道本体**（「暂不 npm publish」只锁发布动作不锁产物形态），新增公共 API 面（semver minor）——`exports` dist 四子键 `./dist`/`./dist/kernel`/`./dist/svelte`/`./dist/tokens.css`（**既有源码四键一字不动**——仓内 playground/单测消费零变）。

- **产物=三入口 bundle ESM 各一文件+tokens.css 原样**（与首消费者 vendor 产物同形——免编译腿最彻底）：`dist/{index,kernel,svelte}.js`——`.svelte`/`.svelte.ts`/TS 全部预编完、组件 css `'injected'` 内嵌（自含 JS 零 CSS 文件面）、`svelte` 恒 external（peerDep 宿主自供单一运行时）；index.js=纯转出口门面、kernel.js 零依赖（引擎无关红线在产物面的镜像）。**v1 不带 .d.ts**（票 42 裁 4：私有唯一消费者是 JS 宿主零需求；TS 宿主走源码键吃类型；触发线=真实 TS dist 消费者出现另票）。
- **管线=vite lib mode 自建脚本 `tools/dist-build.mjs`**（零新增 devDep；`npm run dist:build`）：单次多入口被 rollup 自动代码分割拆 shared chunk（入口变薄 facade+产物超四件）——**三次独立构建**（kernel 先行 → svelte 构建 src/kernel/** 全 external 经 `output.paths` 归指 './kernel.js' → index 构建两 barrel external 同形）；minify 关（与 esbuild bundle 缺省不压同形、入仓产物可 grep 可 diff）。构建后机械断言产物形状，与 `src/dist-shape.test.ts`（入仓产物断言，5 面）**双保险**：文件集恰四件（零 CSS 文件面/无共享 chunk）/tokens.css 逐字节同/kernel 零依赖/bare 说明符只许 svelte external 且 svelte.js 至少一条在场（被卷入即消失的反证）。
- **重建纪律（票 42 裁 6）**：票收口随版本 bump `npm run dist:build` 重建提交（成仓检查单加行）；check 面不挂新鲜度断言（迭代中途必红，裁轻面靠仓内纪律执持）。
- **README 衔接改写**（票 43 注记对偶，归本票验收面）：「源码消费（vendor 路径）」节改「**dist 入口与源码消费（vendor 路径——优先 dist、源码兜底）**」（消费=拷 dist 四件+svelte 说明符 external；首消费者 svelteLoader 整腿可删为活样本注记——宿主侧改吃动作归 owner/消费者侧；三件易漏项重排=①容器尺寸②tokens.css 两路同辖、③compileModule 源码兜底路径专属）+能力行 M3 同步+发布说明改双面 exports+包结构树增 dist 行；spec 增「dist 预构建契约（票 54 立策）」决策行+包面/消费接线/Out of Scope 三行同步。
- **验收**：产物形状双保险断言全过（from 形+副作用 import+动态 import 三路说明符扫描、tokens 逐字节 Buffer.equals——code-review 当日补盲区）；真浏览器（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46/51/52/53 口径）**两路消费形 16 读数全过**——A=vite 载体页（`playground/dist.html`：包说明符 dist 键族经 vite 别名直指入仓产物——资源表四件全上/boot/真实指针拖动恰一快照可撤销/undo·redo/主题翻转）；B=**零构建腿**（importmap+静态服务器：浏览器直载 dist 四件+svelte 运行时按包 exports browser 条件解析——零 bundler/零 transformer，免编译腿最强证形；同一交互面全过）；暗档像素采样 6/6 逐值精确（画布 16,19,26/节点面 30,41,59/面板 26,35,50=token→computed→pixel 链——票 46/50 口径）+深档两路全页远端视觉核验过；`npm run check` 全绿+`play:build` 冒烟过。

## 1.27.0 — 票 53：跨线桥 JumpOver 落地（A 段执行票——票 40 途中山面 owner 裁进）（2026-10-05）

边-边交叉处小半圆弧「跳过」的清晰化件（工程制图惯例，GoJS 内置同款），新增公共 API（semver minor）——CanvasView props `edgeJump?: boolean`（缺省 false 零行为变化）。

- **纯图面风格约定**：全局开关不进词表不进 kernel 不进图数据/序列化/undo（箭头面同档——非交互语义的视觉配置，无 controller 面缝）；四型同享（交叉检测一次覆盖 bezier/straight/step/smoothstep，免两票互改——票 52 前置的消费闭环）。
- **缝=渲染层路径集后处理纯函数双模块**：检测 `edge-jump.ts`（每边折线=shapePolyline 逐段展开；两两包围盒预筛 O(E²) 后仅重叠对做精确线段测试；直线/折线族精确、bezier 12 段采样近似、smoothstep 按 step 折线近似=票 52 命中面同款口径）+发射 `edge-jump-path.ts`（直/折线族腿上切弧钳段端防溢、smoothstep 顶点 Q 切角保留+腿上插弧、bezier de Casteljau 依弧长切窗劈段+切点桥接弧；无 cuts 段/腿与既有 edgePathD 恒同串）。
- **跳边=边 id 字典序大者**（稳定裁定，与位移/输入序无关——拖动时弧随交叉出现/消失而跳边不换侧不闪）；共享锚点邻域 epsilon 排除（世界域 12px——同端口扇出边近锚交叉不画弧）；弧=恰半圆（rx=半腿长）恒凸行进方向左侧、半径屏幕恒定 7px 随镜头 1/scale 补偿（箭头 11px 同族）。
- **连带与边界（记档）**：命中测试沿基础路径（弧偏差半径量级内忽略）；弧段与线段同一条 path——stroke/类型色/选中邻接高亮 CSS 天然继承（挂载缝结构断言）；改连在途隐藏边不入检测集；拖线预览不入检测（单边在途无交叉对）；minimap 无连带。性能护栏：预筛后仅重叠对付费，超量级图随票 41 虚拟化触发线再裁（R6 上界记档）。
- **守线抽出**：CanvasView 旁边声明贯入抽 `sidecar-props.ts`（keyboard.ts 桥先例同款——票 51 记档贴线债的 CanvasView 侧兑现，controller 本票未碰线不动；行为零改既有挂载缝测试为对照面）。
- **文档**：README 使用章新节「跨线桥」（边形状节后——开关+裁定检测+与绕障边界）+spec 增决策行（票 53 立策）；载体页 `playground/edge-jump.html`+hub 增节。
- **验收**：新测 20 面 786/786（检测 7：X 精确路/预筛正确性两档/bezier 近似路/id 裁定稳定性/同锚邻域排除/step 竖腿/多交叉网格；发射+贯入 9：四型弧段/段端钳制与退化/smoothstep 切角保留/bezier 恒同串+桥接弧+多 cuts/渲染模型开关零变化/镜头补偿；jsdom 4：props 置入弧段 d/CSS 继承同元素+高亮共存/拖动随交叉出现消失/卸载零残留）+真浏览器验收（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46/51/52 口径）；`npm run check` 全绿+`play:build` 冒烟过。

## 1.26.0 — 票 52：边形状四型落地（A 段执行票——票 40 裁 1-5 产物）（2026-10-05）

连线几何路由四型（对标 SF 同名；横平竖直=管线/审批流/状态机的版式语言——品类表达力缺口收口），新增公共 API（semver minor）——`EdgeShape` 四型+CanvasView `edgeShape` props+`controller.setEdgeShape`+词表 `NodeTypeDef.edgeShape?` 可选键+kernel `edge-shape.ts` 纯函数族。

- **四型**：bezier（既有缺省，水平切线贝塞尔）/straight（直线段——端口锚定形制下**后退边可能穿越节点=型内固有非缺陷**，SF 同款）/step（正交最少拐点折线——中点分位 Z/S 形，先横后竖）/smoothstep（step 圆角档——拐点 quadratic 切角，半径屏幕恒定 6px 随镜头补偿、钳半腿长防过冲）。
- **声明面双供**：全局缺省 props/`setEdgeShape`（缺省 'bezier' **零行为变化**、卸载复位、写入零通知）+词表 per-type 覆盖（**from 侧节点型生效**——「边属性挂源」先例）；解析优先级=词表>全局>'bezier'，坏字面量守卫回退。纯渲染层配置不进 kernel 图数据/序列化。
- **几何单源不动**：顶点列 `edgeWaypoints` 恒定，变的是顶点间连接方式；**reroute 中继点=固定必经拐点**（拖到哪拐点就在哪，折线形下相邻顶点间各自走形状段，数组与序列化零迁移）。
- **三连带**（验收面）：箭头朝向=末段切向向量泛化（四型通吃——straight 斜向/垂直边箭头跟段方向；bezier 与票 35 水平特例串逐字同形含退化回落朝右）；边路径命中跟形状（straight/step 精确折线、smoothstep 按 step 折线近似——reroute 插点/context-menu 边分区/双击边判自动跟随）；拖线预览跟声明形状（同解析优先级，所见即所连）。minimap 无连带（直线段简化投影记档）。
- **文档**：README 使用章新节「边形状」（连接校验节后——四型对照/双供声明/reroute 固定拐点/穿越固有记档）+spec 增决策行（票 52 立策）；载体页 `playground/edge-shapes.html`+hub 增节。
- **验收**：新测 27 面 766/766（kernel 13：字面量/解析三级+漂移回退/挂源解析孤儿回退/stepCorners 几何/shapePolyline 四型/切向四型含退化/命中跟形状三档+全局贯入；渲染层 9：四型命令流/reroute 必经顶点/箭头四型含垂直斜向/解析优先级投影/预览跟形；jsdom 5：props 置入 d 串/缺省零变化/词表压全局/卸载复位/预览跟形+reroute 插点跟形状判别）+真浏览器验收（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46 口径）；`npm run check` 全绿+`play:build` 冒烟过。

## 1.25.0 — 票 51：连接校验钩子落地（A 段执行票——票 39 五裁产物）（2026-10-05）

宿主旁边声明「连接合法性」（有类型系统的图——AI pipeline/ETL/管线编辑器——选型第一问），新增公共 API（semver minor）——`controller.setConnectionRules` + CanvasView `connectionRules` props + kernel `link-rules.ts` 纯函数面。

- **双形 AND 合流**（与锁单并集对偶）：谓词主形 `isValidConnection(from, to)`（动态逻辑上界：连接数上限/跨字段/运行时状态；入参=富载荷 `ConnectionEndpoint = { node, port, side }`——节点整只+解析后 PortDef、方向恒 from=output 侧→to=input 侧、边界口经词表单源解析）+词表兼容矩阵糖 `portTypeCompat`（端口 typeId→可连 typeId 名单有向映射，数据非代码——纯类型图零样板谓词）；**矩阵只拦在册行**：from 行在册而 to 型不在名单=拒、from 型不在册=放行、不传=全放行。同节点自连=基础面放行、谓词裁量。
- **合法判单源 `linkDropAllowed`**（kernel `link-rules.ts`——locks.ts 姊妹模块）：基础面（两侧相对）∧锁面（两端）∧矩阵∧谓词；连线机落点判与预览渲染两消费点同读；`linkDropCompatible` 保留为基础语义步公开形。
- **作用域=三路刷卡·四门不刷**（锁单「拦用户手势与画布命令」同构）：刷卡=拖线/改连（校验不过=**静默终止零快照**；改连否决旧边照旧复原）/placeNodeConnected 自动连（同名优先序域内过滤校验不过的端口，全不过=只落节点不连线）；恒不刷=applyExternal 两门/直连 addEdge/undo·redo/粘贴。
- **预览红档机内评估**：手势态增 `valid`——悬停端口跳变时重算（sameHover 去重=非逐帧，React Flow 组件级性能口径同款），渲染层 link-render 零重算直读机态；复用既有 `data-fl-link-valid='false'` 红档（零新视觉词汇）。
- **⚠ 行为变化（显著记档）**：**锁定落点的拖线预览从「显绿、松手静默消失」变为「预览显红、松手静默终止」**——锁面并入合法判单源的观感修正（票 36 已知观感收口）。
- **旁边声明全套纪律**（锁单同款）：不进图数据/undo/semanticHash/UI 格式、恒不落快照、不被外部门整包替换冲掉；`undefined`/空形状=opt-out 交互零变化；写入零通知；props 形挂载置入+卸载复位。
- **文档**：README 使用章新节「连接校验」（落位=结构面锁节后——双形选形指引/三路刷卡四门不刷/与锁单视觉合流/行为变化警示）+spec 增决策行（票 51 立策）；载体页 `playground/connection-rules.html`+hub 增节。
- **验收**：新测 34 面 739/739（kernel 19：矩阵在册/不在册/名单内外/空名单/AND 合流/锁面并入/同节点自连谓词裁量/富载荷入参/词表漂移边界/空形状归一/firstAllowedPortOn 同名回落·全拒·锁端·谓词拦/连线机 valid 翻转·跳变恰一次谓词调用·锁面红档·落点静默终止·改连否决复原；controller 门面 12：三路刷卡+四门不刷+opt-out 复原+零通知·不进 toUiFormat·不被整包冲掉；jsdom 挂载 3：红档属性随矩阵/谓词翻转·静默终止零快照·卸载复位·锁面红档）+真浏览器验收（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46 口径）；`npm run check` 全绿+`play:build` 冒烟过。

## 1.24.0 — 票 50：a11y 声明面落地（C 段执行票——票 47 形状裁产物）（2026-10-05）

键盘导航+aria 两者最小声明集（票 47 三轮十二问对裁），新增公共 API（semver minor）——键盘面十三命令+默认键位、`CanvasView` `labels` props、kernel `selectionAnchor`/`traverseSelection`、aria 注入。

- **⚠ 行为变化（显著记档，消费者升级面）**：画布聚焦时 **Tab 从「离开画布」变「遍历节点」**（Tab/Shift+Tab 默认绑定 fl:select-next/prev）——依赖 Tab 跳出画布的宿主 unbind 即复原；输入框内 Tab 不受影响（隔离守卫，见下）。
- **键盘面命令（缝位=命令注册制——票 47 裁 6；输入契约 v2 不动）**：`fl:select-next/prev`（Tab/Shift+Tab 图序遍历改选区：替换单选、无选区=图序首/末、有选区=自锚点步进循环 wrap、多选收窄单选）、`fl:nudge-up/down/left/right`（方向键 1px）与 `*-large` 四件（Shift+方向 10px——两档=固定行为命令，Shift 语义在绑定表非执行体）、`fl:activate-selection`（Enter=双击面完整等效：onNodeDoubleClick 改道[票 32]优先、缺省回落原位改名、子图占位进入、平移态让位；无头占位+CanvasView setRunner 覆写）、`fl:zoom-in/out`（+、=、Shift+= 三形与 -：绕视口中心步进 ×1.2，viewSize 槽[票 45]供锚、无头回退屏幕原点，视口面不入 undo）。
- **键盘隔离守卫（票 47 裁 7 必做前提——双保险收口两面）**：`isIsolatedEventTarget` 并入键盘路——keybindings 命令匹配面+keyboard.ts 派发环双处守卫，控件域（data-fl-satellite/widget）内键事件不进命令接线与派发环；修复残余缝=panYield 让位态包裹层整撤后控件内 Tab 会被吞成遍历（表单不可用）与键盘路无双保险的结构性不对称。空格卡态无门：焦点迁入控件即触发画布根 blur 派发空格 key-up（既有接线）。
- **空格+方向平移（混合缝位——票 47 裁 5）**：机内空格模式态扩展（模式态归机不归命令表）——spaceDown 时方向键=屏幕域 50px 步进平移（`KEYBOARD_PAN_STEP_PX`），渲染层分流绕命令表（nudge 不触发）；repeat 连续步进（镜头域非命令域，防抖口径不辖）。
- **aria 注入（票 47 裁 8 最小集）**：画布根 `role="application"`+`aria-activedescendant` 跟随选区（图序末位锚点——`selectionAnchor` kernel 单源；多选只指一个=已知简化记档）；节点 `role="group"`+`aria-label`=displayNodeTitle 单源（票 15）+DOM id（实例随机前缀+节点 id——aria-activedescendant 引用面，多画布文档级唯一）；边不挂 aria、aria-live 不做、aria-selected 不用（票 47 裁 8 边界）。
- **i18n `labels` props**（SF ariaLabelConfig 极简版）：覆写库产 aria-label 三处（画布根/折叠钮两态），缺省中文=现状零行为变化；节点 label 本就来自词表/自定义标题（宿主单源）不经此覆写。类型 `CanvasLabels` 出 svelte barrel。
- **装配**：键盘面执行体住新模块 `keyboard-actions.ts`（LayoutCommands 同款 deps 注入——遍历零快照/nudge 恰一张快照/缩放视口域零快照）；CanvasView 键盘三处理器抽 `keyboard.ts` 桥（守 400 行红线——三道次序：隔离守卫→空格平移分流→命令键→机内派发）。
- **票内小裁（记 Resolution）**：遍历锚点=图序末位选中（kernel selectionAnchor 单源，activedescendant/Enter 激活同锚）；nudge 让位=拖动面同款全放行（票 36 布局半边）；zoom 步长 ×1.2、'+'/'='/Shift+'+' 三绑定、pan 步长 50px；节点容器角色终值 role="group"（axe 实测中性可命名容器）。
- **文档**：README 使用章新节「无障碍」（命令注册制快捷键节后——键盘能力清单/aria 清单/边界记档/Tab 行为变化警示/i18n 样例；声明口径=交互可达档照实清单，不声明 WCAG/读屏叙事）+命令计数更新（十→廿三）；载体页 `playground/a11y.html`+hub 增节。
- **验收**：新测 28 面 705/705（kernel 遍历 4+视口机空格平移 5+命令面无头 8[roster 廿三/遍历含 wrap·空图·单节点环回/nudge 两档·快照粒度·空选区·锁定放行/zoom 槽锚·回退·贴限/激活占位]+CanvasView 挂载 10[Tab 全链含 repeat/nudge 位移与 undo 粒度/Enter 改名含提交回写/空格平移分流与松开回归/±缩放/aria 根·节点·跟随·引用成立·多选指末位/labels 覆写含折叠两态/控件域 Tab·Ctrl+Z 不被吞含 panYield 态]）；真浏览器（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45/46 口径）功能读数+**axe-core CDN 临时加载 violations 清零**读数+浅深主题实拍远端视觉核验（明细见票 50 Resolution）；`npm run check` 全绿+`play:build` 冒烟过。

## 1.23.1 — 票 46：自定义 widget 示例（B′ 执行票——widgetComponents 成文两处）（2026-10-04）

反馈 P4（票 38 裁定 6）：`widgetComponents` 逃生舱存在但缺成文示例——嵌套结构（如 selection 七形）widgets 扁平五型（text/number/boolean/enum/textarea）表达不了，赶工消费者会绕开注册位在 PropertiesPanel 旁自写表单（首消费者实际行为）。**载体+文档票零库码零公共 API 变**（票 20/24/37 先例——载体非库面）。

- **README 使用章新节「复杂结构挂自定义 widget」**（落位=节点内 widget 供件后·主题前）：注册位用法三步成文——①词表声明自定义 kind（与内建型同一名空间）→②写组件（props 契约 `{ value, def, onCommit }`：只产值不碰图、提交经 `onCommit` 整对象回写恰一张快照可撤销）→③注册位贯入（`widgetComponents: { vec2: Vec2Widget }`，面板/节点体两入口同形 props）。样例=嵌套对象型 data（`pos = { x, y }`）自定义 widget，从注册到渲染到编辑回写全链最小完整形；两自卫纪律随样例成文——值宽松读（首编辑前 data 无此键/异形→空对象兜底不炸）+非法不写控件回显（内建 number 同款纪律）。**样例围栏与 `playground/vec2-widget.svelte` 逐字同源**（机械脚本嵌装+断言非手抄——文档骗人零容忍）。
- **载体页**：`playground/custom-widget.html`+`custom-widget-demo.js`+`vec2-widget.svelte`（kind 'vec2' 注册接管活例）——双入口同一注册位（PropertiesPanel 与 CanvasView 同形 props，节点体控件同款渲染）；读数面=选中节点 data JSON+canUndo/canRedo（恰一张快照取证口径）；对照两件=m2 无 pos 键（宽松读 0/0 不炸）/mark 无 widgets（面板回退只读 JSON 展示）；hub 增节（selection 节后·integration 收口节前）。
- **样例纪律缺口（真浏览器验收抓到后修正）**：number 输入框非法输入 DOM 值即空串，`Number('')===0` 会被当合法 0 写入——样例组件补上内建 `parseWidgetNumber` 同款空串拒绝（`raw.trim() !== ''` 分支），非法不写+控件回显数据现值；组件与 README 围栏同步重嵌。
- **eslint globals glob 缺口顺手修补**：浏览器 globals 的 files 列表漏 `playground/**/*.svelte`（注释本就声明 playground 是浏览器面）——svelte 载体件一引用 DOM 全局（`Event`/`HTMLInputElement`）即 no-undef，本票 vec2-widget.svelte 首个撞上；工具面一行修补，src 零改动。
- **验收**：载体页真浏览器（puppeteer-core+系统 Edge headless，脚本住仓外 temp——票 45 口径）功能读数 17 面全过（boot 未选中+m1 节点体 vec2 件双入口/点选面板渲染 120/40+备注混排行/改 x=200 整对象回写 `{"x":200,"y":40}` canUndo 恰翻 true/撤销 data 回跳+输入框随值回流 120/canRedo/重做复 200/m2 无键宽松读 0/0+提交长出 pos 键 `{"y":66}` 无 x 键不伪造/k1 回退只读 JSON/节点体输入提交同数据 y=88/复位图 canUndo 清零/非法输入不写 data 恒 120/零页面错误）；深色主题像素采样 6/6 逐值精确（画布底 16,19,26/节点面 30,41,59/侧栏与 vec2 输入框底 26,35,50/color-scheme=dark——票 37 同款口径）+浅深实拍远端视觉核验过（深全页 5 项/浅面板特写 4 项：布局/可读性/控件行齐全/无破相）；`npm run check` 全绿（679/679 零新增——载体票不入单测面，票 37 先例）+`play:build` 冒烟过。

## 1.23.0 — 票 45：minimap 缺省自量（B′ 执行票——P3 收口）（2026-10-04）

反馈 P3（票 38 裁定 6）：`viewportSize` 必填读取器形状天然诱导宿主传常量（首消费者实锤）。改形**缺省自量+显式传参恒覆盖**，新增公共 API（semver minor）——`controller.viewSize` 旁挂缓存槽。

- **通道形状（票内落定）**：`controller.viewSize`（`ViewSizeSlot`——commands 字段先例同形的实例字段小面）=controller 实例上的**被动存储面**（per-controller 隔离天然成立，票 16 零共享模块态审计面零新增；模块态 WeakMap 形被票 16 静态审计否决），恒由视图层写入、**controller 恒不主动测**（票 12 无头零 DOM 红线不破——「必填·测量归宿主」措辞明裁改「缺省（显式传参覆盖）」，视图层自读自身 DOM[CanvasView fitView/placement 同款]开放为缺省源）。
- **发布端**：CanvasView 挂载即量自身容器（clientWidth/Height）发布+ResizeObserver 随动重发（jsdom 无实现容错跳过——挂载期一次发布已足）+卸载清空（未挂 CanvasView 时缺省回退不炸）。接线住 view-size.ts（`attachViewSizePublish`）。
- **通知口径**：槽通知走**自带订阅通道**（`viewSize.subscribe`——尺寸变化非图变化，不扰 controller.subscribe 图/视口/选区语义）；值语义通知（变更恰一次/同值零——拷贝入槽防宿主后写）；零快照零图数据/undo/semanticHash 污染（锁单同款旁边声明）。
- **消费端**：Minimap `viewportSize` 改**可选**——缺省读槽（订阅直写 $state 镜像；先发布后挂载初值现读同效）；**显式传参恒覆盖**（票 12 已裁必填形的向后兼容——传读取器时槽发布不参与）；未发布回退 0×0 退化（视口矩形缩为点、内容照渲、导航定心数学 NaN 安全——不炸）。
- **订阅即现值校正（真浏览器实锤的发布/订阅空窗修复）**：宿主常态序 mount(CanvasView)→mount(Minimap) 同批效应冲刷里发布先于 Minimap 订落、实例化初值又读在发布前——首帧恒回退。槽 `subscribe` 改 **readable store 同语义**（订阅即回调一次）——发布/订阅时序无关，通道按构造无空窗。
- **兜底复量**：槽空或 0×0（布局晚到/RO 零投递的嵌入环境——无头工具视口实测存在；首消费者=浏览器扩展面板同类 embedding）时随 controller 通知复量一次（下次交互即对——票 12 已知边界同款降级级）；槽已有实际尺寸则零 DOM 读零成本。
- **resize 随动（票 12 已知边界「宿主 resize 不随动」缺省路连带改善）**：缺省路矩形随 ResizeObserver 重落（真浏览器实测精确）；显式读取器路维持票 12 边界。
- **文档**：README minimap 节（缺省姿势样例+「传常量=视口矩形恒错」反例警示携转）+源码消费指南 ②（Minimap 例外收窄）；spec 增决策行（票 45 立策）；playground minimap 演示改缺省姿势。
- **验收**：新测 15 面（槽无头 6：读写拷贝入槽/值语义槽通知含订阅校正与退订/订阅前发布不丢失/与 controller.subscribe 分流/零快照零污染/多实例隔离；Minimap 挂载缝 7：缺省通道贯通/发布落实例化后冲刷前空窗不丢[宿主常态序回归]/先发布后挂载/显式覆盖优先/未发布回退不炸含 0×0 导航/槽变更随动[非比例 resize 档]/缺省导航定心用槽尺寸；CanvasView 接线 2：挂载即发布卸载清空/兜底复量）。真浏览器（puppeteer-core+系统 Edge headless）读数全过：boot 缺省矩形=容器实测尺寸投影逐值精确/窗口 resize 矩形随动/fitView 后相机+尺寸复合跟手；IAB 工具视口（RO 零投递环境）降级级=票 12 边界（下次交互即对——兜底复量实测）；`npm run check` 全绿（679/679）+`play:build` 冒烟过。

## 1.22.0 — 票 44：宿主人体工学（B′ 执行票——selection 只读 store+便捷 getter）（2026-10-04）

反馈簇 P2+P5 合并票（票 38 裁定 6）：宿主读「当前选中」的接缝两件，新增公共 API（semver minor）——`createSelectionStore`（svelte 层）+`controller.getSelectedNodes()`+kernel `selectedNodes` 投影。

- **selection 只读 store（P2——「tick 咒语」止血）**：`createSelectionStore(controller)` 落普通 `selection-store.ts`——`svelte/store readable()` 形（运行时件非 runes，完全绕开 `.svelte.ts` 源码消费编译坑[票 43 ①同因]；src 首个 svelte/store 依赖为新落点）；值=**选中节点对象数组**（图序保形，非 id 集——侧栏免二次遍历）；订阅源=既有 controller.subscribe **零第二真源**（投影非副本：每通知现读 getter）；**元素级发射去抖**（图不可变值语义——节点未变=同引用：视口/未涉选区通知零发射、选区变/选中节点对象变恰一次；创建后未订阅期变更在首订阅 start 现读校正——readable start 内 set 静默换值首发射恰一次）；只读纪律=Readable 面仅 subscribe。
- **便捷 getter（P5）**：`controller.getSelectedNodes()`——kernel `selectedNodes(graph, selected)` 纯投影单源（图序/空集空数组/节点对象同引用）；非响应式场景（事件处理器/断言）用 getter、响应式跟随用 store 两面分工成文。
- **同源接缝成文**：选中节点 data 变更（PropertiesPanel/侧栏回写共享同一 controller）也发射——编辑回写恰一张快照可撤销+侧栏跟随同一接缝（首消费者实测确认）；删除/undo 经 prune 收缩即发射不悬空；gesture 手势态不入 store 面。
- **载体面**：`playground/selection.html`+`selection-side.svelte`（mounted Svelte 侧栏 `$selection` 直用=宿主消费姿势活样例——零 tick 咒语）+`selection-demo.js`（读数面=发射计数/getter 一致性/「平移镜头零发射」实证钮）；hub 增节。README 使用章新节「**宿主响应式接线**」（落位=属性面板供件后——互引同接缝）；spec 增决策行（票 44 立策）。
- **验收**：新测 9 面（store/getter 8 面+kernel 投影 1 面——四面：订阅随选区变化/只读纪律/值=对象投影·未订阅期变更 start 校正/getter 一致性·图序·prune 双同步/通知去抖恰一次+无关零发射/undo 复活零发射）；真浏览器载体页读数（点选跟随/平移零发射/回写撤销侧栏回跳/一致性 ✓）+浅深两主题实拍远端视觉核验；`npm run check` 全绿（664/664）+`play:build` 冒烟过。

## 1.21.2 — 票 43：源码消费指南（B′ 消费者接缝优先段首票）（2026-10-04）

纯文档票（零库码零载体页零测新增——公共 API 零变，semver patch）：README 使用章新节「**源码消费（vendor 路径）**」——首消费者实测唯一真崩点（反馈 P1）的库侧止血。

- **三件宿主易漏项成文**：①`.svelte.[tj]s` runes 模块须过 Svelte 编译器（TS 剥离先行→`compileModule`；esbuild 默认 TS 直转留裸 `$state` 运行时 `ReferenceError` 组件渲染即崩、库侧零提示）——代码样例=消费者修复现场 `tools/build-flowloom.mjs` svelteLoader 双轨节选，`.svelte` 组件走 `compile`+`css:'injected'`、svelte 说明符恒 external（单一运行时）；②容器尺寸归宿主测量（Minimap `viewportSize` 真读画布元素——喂常量视口矩形恒错、`fitView`/`enterSubgraph` 尺寸参数）；③tokens.css 引入+`data-fl-theme`（无 CSS import 通道宿主自带注入——首消费者拷贝+注入器双产物）。
- **dist 衔接注记**（票 42 若裁 dist 本节改写「优先 dist、源码路径为兜底」——42 body 已挂衔接注记）+README 能力行同步（M3 行）+发布说明交叉引用（「暂不 publish」补票 38 出处）。
- **验收**：指南步骤与首消费者实际修复路径逐条对上（活样本文件逐行核对——「文档骗人」零容忍）；README 渲染过目（章节落位=使用章末·发布说明前/围栏配对脚本核对；`*.md` 不在 prettier 面）；`npm run check` 全绿（655/655 零新增——文档票属正常）。

## 1.21.1 — 票 37：集成 demo 收口（wayfinder epic 终效验收载体）（2026-10-03）

epic 收口票（票 30 第 2 裁裁建）：**六面同场一张画布**——右键菜单（31）/双击改道钩子（32）/节点状态呈现（33）/applyExternal 外部摄入（34）/边箭头（35）/结构面锁（36）同场互不打架，「互相正交」主张的整图联动实证。**演示载体非库面**（票 20/24 先例）——零库码改动零公共 API 新增，semver patch（票 20 纯载体页先例）。

- **载体页**：`playground/integration.html`+`integration-demo.js`+`integration-truth.svelte.js`（假真源 $state 内建模型）——六面接线全走公共面（`contextMenuItems` props/`onNodeDoubleClick` 钩子/`nodeStates` props/`applyExternal`+`applyExternalGraph` 两门/箭头默认面/`nodeLocks` 谓词从 data.state 推导）；hub 增节+README epic 行收口（epic 全闭）。
- **内容达标线（票 30 裁 3）**：离散+连续两通道都演到——离散 `status` 四态词表（todo/active/done/fog——wayfinder 味示例非库契约）走 data 轨、连续 `progress` 约定键走 vars 轨底缘条（走满翻 done 即键退场条拆）；库结构位（徽章/进度条）消费+宿主 CSS 状态染色/雾化。
- **假数据源（零网络零依赖）**：数组+130ms 定时器三面派生——画布初始图（带坐标=阶梯第 1 档）/呈现袋 bags（props 通道零 kernel）/外摄载荷。一轮剧本=完结者翻 done（锁面自动扩——谓词随外部 data 替换即时推导）、下一 todo 接棒、**归档最老 done（锁定也照删=外部门不刷卡活例）**、新票 `near` 尾票落位（阶梯第 2 档）；每 4 轮追一次**整图重镜**（册上没有=删除——手工节点清场/用户删掉的册内票复活于默认档）。暂停/播放/复位真源/整图重镜演示条钮。
- **验收面（票 24 教训——载体页进真浏览器）**：jsdom 零新增（playground 不入单测面）；真浏览器功能读数全过（boot 7 节点 5 箭头/四态属性+进度 fill 像素 26.16px@12%/锁删被拦零快照/冻结边端点同拦[删它=改边]/fog1 自由删+撤销/挪位放行/锁定端口按下空态/轮换后锁面自动扩 t34-t38+进度键退场/重镜清场 fl-1+复活 fog1@默认档/新边照常+可撤销/票窗开+改名不发生/菜单三路 items+Windows 改选+点项关闭/假执行 toast 分类文案「锁定/拴冻结边」）+浅深两主题像素采样（done 绿 22,163,74/active 浅 37,99,235·深 96,165,250/轨道 20% 混合/fog 0.55/箭头随主题 100,116,139↔148,163,184/🔒 角标恰 done·active）+四场景实拍（浅深主画面/右键菜单/票窗）远端视觉核验全过。
- **票内裁定记 Resolution**：版本 bump=patch（公共 API 零新增——票 20 先例）；已知边界=IAB 后台标签 CSS 过渡冻结（fill 宽读数关过渡读静态值——票 33 已记档同类）与 Svelte effect 异步刷新（同步批跑后需让帧再读 DOM——坑位档案同类）。

## 1.21.0 — 票 36：结构面锁（F——锁语义半边放布局半边）（2026-10-03）

wayfinder epic 第六张执行票；通用能力「未来可重排、过去不可触碰」——宿主可声明某些节点的结构面（存在性+边连接）冻结，布局面照旧。新增公共 API：`nodeLocks` props+`setNodeLocks()`+kernel `locks.ts` 导出（semver minor）。

- **锁单双入口旁边声明（票 28 惯例）**：CanvasView 可选 props `nodeLocks`（卸载自动复位）与 `controller.setNodeLocks()` 同效——**谓词主形**（`(node) => boolean` 入参=节点对象整只，读宿主自家 data 推导，库只搬运不解释）+**编号集糖**（`ReadonlySet`/readonly 数组双收内部归一 Set）；两形同供取并集；不进 node.data/undo/semanticHash（断言零污染）、恒不落快照、零通知零订阅（换单即生效）、不被 applyExternal 整包冲掉（锁单非图数据）。
- **kernel `locks.ts` 纯函数面**：`resolveNodeLocks`（空单归一 undefined）/`isNodeLocked`（并集判定）/`isEdgeFrozen`（任一端点锁定即整条冻结）/`deletableIds`（Delete 过滤面）/`subgraphConversionLocked`（子图转换整单判定——含边界外端锁定）；dispatch-loop 公共锁单字段贯入四机世界：连线机起线两端拦（锁定端口 pointerdown=noOp 落空回流选区机——半开区间右缘击穿既有回落延续；冻结边 input 侧拖改连不起）+落点静默终止（settle 前拦，无预览无快照白拖不炸）；选区机 Delete=**过滤删除**（剥锁定+剥冻结边可编辑端[删它=改冻结边]；全拦=干净 no-op 零快照，幸存者保选区）。
- **命令面半边**：剪贴板复制锁定节点放行（复制不改结构）/剪切=宿主复合（复制+Delete 两半各被钉死——库无独立剪切原语）/粘贴产物恒新 id（编号集形不在名单恒不锁、谓词形克隆保 data 随宿主策略自然推导——测试两形各钉一测）；子图转换含锁定者=整单 no-op（过滤会重构冻结边界边——跨容器边禁令逼拆）；拖线落空白 `placeNodeConnected` 遵守锁单（两端任一锁定=只落节点不自动连）。
- **布局半边照旧（断言钉死）**：锁定节点挪位/框选拖动/分组/折叠全放行；冻结边 reroute 拐点**放行**（票面倾向落定——拐点属视觉路径不属连接关系，与票 34「拐点不写」同界；reroute 机共享 LinkWorld 类型不消费锁单）。
- **外部门不刷卡（票 29/30 已裁）**：applyExternal/applyExternalGraph 恒不查锁单——真源照常增删改锁定节点（镜像更新高于锁），测试钉死锁在位时外部门照常+外摄不清锁单；宿主直连命令式 API（removeNode/setNodeData 等）同样不刷卡——锁拦用户手势与画布命令，不拦宿主自己的手。
- **行数红线两顶格件收口**：`wireCommands` 自 controller.ts 迁 controller-wiring.ts（行为零迁移）+滚轮守卫抽 input-normalize.ts `attachWheelGuard`——controller.ts/CanvasView.svelte 各 399 顶格（票 32/33 先例延续）。
- **载体页**：`playground/locks.html` 谓词/编号集/无锁三档切换（remount 换 props）+读数面（被拦路径 canUndo 恒 false——快照根本没有）+琥珀虚线+🔒角标宿主 CSS 样例；hub 增行。
- **验收**：jsdom 新增 36 测（全量 655——kernel locks 纯函数 17+连线机锁接线 4+选区机 Delete 过滤 2+controller 门面 14[命令 no-op/剪贴半边两形各一测/placeNodeConnected 三态/分组折叠放行/转换三态/外部门+外摄后锁单存活/零污染]/挂载缝 3[锁定端口按下=空态+框选回落+体选中拖动照常/落锁定端口静默终止无预览零快照/无锁基线连线]）；真浏览器七项功能全过（删除被拦零快照/挪位放行/起线拒/落点静默终止/两可编辑新边照常/框选 Delete 过滤恰余锁定+冻结边侧/无锁档基线）+浅深两主题实拍（琥珀虚线+🔒恰在锁定节点、邻接高亮蓝边、读数面板正确）；已知边界记档：外摄后零位移点击的同值快照=票 34 既有引用去重边界（非本票引入）；README 使用章（接线+选形+对偶）+epic 进度行（frontier=收口 37）；spec 增「结构面锁契约」决策行（票 36 立策）；包版本 1.20.0→1.21.0。

## 1.20.0 — 票 35：边箭头 marker（E——有向边 to 端实心三角）（2026-10-03）

wayfinder epic（票 27-37）第五张执行票；纯渲染层零 kernel 缝（「谁阻塞谁」可读性——有向边方向呈现）。

- **原型裁定（HITL·owner 按荐落）**：**实心三角 × 屏幕恒定 × 11px**（半高=长×0.55 即全高≈12px，配 3px 不缩线宽 ≈3.7:1）。真浏览器四变体（V/三角×世界/屏幕恒定）×缩放档（0.4/0.64/1/1.6）×尺寸两档×浅深 15 张实拍对比（载体页可实时对照）——**世界恒定出局证据**：0.4× 全景下箭头缩至 4.4px 接近消失（与不缩的 3px 线宽失衡——而全景缩略恰是「看谁阻塞谁」最需要方向的时刻）；屏幕恒定 1.6× 下与端口点直径（12.8px）同量级无失衡；深色色随线族正确；ComfyUI 底稿同为实心三角（canvas2D 随 zoom 缩放=世界恒定族，观感形采纳、缩放行为有意分歧记档）。
- **实现形票内裁定=显式多边形（真 SVG `<marker>` 裁出）**：原型探针（markerUnits=strokeWidth/userSpaceOnUse 两枚，库同构结构：CSS scale 容器+100% 视口 svg+non-scaling-stroke）实证——marker 在票 19 视口坑结构下**能渲染**（顾虑排除）但**尺寸随 CTM 缩放**（strokeWidth 单位不被 vector-effect 补偿——屏幕恒定做不出）+context-stroke 填充视觉核验可疑；显式多边形路线确定性、jsdom 可断言 `d` 串、色随边族零额外机制。
- **link-render 纯函数面**：`arrowPathD(waypoints, scale=1)` 导出——尖在 to 锚、底边朝回；朝向=末段进锚水平切线符号（kernel `linkControlPoints` 把 c2 放 b 正侧向⇒切线恒水平；退化 dx=0 缺省朝右=入口侧自然朝向；后退边自动朝左）；**屏幕恒定=世界长 11/scale 补偿**（非正数回落 1）；常量 `ARROW_LENGTH`=11/`ARROW_HEIGHT_RATIO`=0.55（半高比）。`LinkEdgeView` 增 `arrow` 字段（每边必携）；`LinkRenderExtras` 增 `scale?`（缺省 1）；边循环 waypoints 单源复用（曲线 d+箭头 d 同趟）。
- **CanvasLinks 挂载面**：箭头 each（`data-fl-arrow={edgeId}`+`class="fl-arrow"`）层序=**全部边路径之后、端口点之前**（端口点压箭头尖=箭入端口的成读）；`scale` props（CanvasView 自 viewport.scale 透传）；CSS=`fill: var(--fl-link-own, var(--fl-link, #64748b))`（类型色 inline 间接与边同链）+**`stroke:none` 落箭头基础规则且源序在边高亮行后**（箭头是 fill 件，吃通配边规则的 3px 世界单位描边会随镜头增减破屏幕恒定——code-review 揪出当日修+静态红线钉死）+高亮复合类变选区色。
- **载体页**：`playground/arrows.html` 原型期注入式四变体+marker 探针，落地后撤注入改**真库面**（缩放四档/主题/选中跟随读数面+裁定结论侧栏）；hub 增行。
- **验收**：jsdom 新增 11 测（全量 619——arrowPathD 四测[前进/后退/退化/scale 补偿含非正数回落]+贯通一测[extras.scale 经 linkRenderModel]+挂载缝六测[在场与形状/层序/scale 经 setViewport 重算/类型色 inline 同链/选中邻接类跟随/stroke:none 静态红线]）；真浏览器四档实拍+0.4× 屏幕恒定几何实锤（getBoundingClientRect 11×12px 恒定、世界长 27.5×0.4）+选中跟随 computed fill 吃 `--fl-selection` token（96,165,250）+高亮集恰为邻接边+视觉终验双补丁（蓝灰箭同框/0.4× 恒定协调）；code-review 双轴收口（Spec 两项：3px 世界描边破屏幕恒定当日修+「高=长×0.55」实为半高比措辞勘误；Standards 一项：测试夹具函数体 50>40 红线——词表/图装配上提模块级）；行数红线：CanvasView.svelte 399 顶格（注释压缩一行抵扣 scale 贯入——票 32/33 先例）；README 连线视觉段+epic 进度行（frontier=36+收口 37）；spec 增「边箭头契约」决策行（票 35 立策）；包版本 1.19.0→1.20.0。

## 1.19.0 — 票 34：applyExternal 外部静默摄入（双门一道+快照栈再锚）（2026-10-03）

吃票 29 七裁落形（裁面全齐见该票 Resolution），wayfinder epic（票 27-37）第四张执行票；**新增公共 API——semver minor**。

- **kernel 变更单应用（件 1）**：`applyExternalChangeSet(source, graph, changes, options?)` 纯函数（`kernel/external.ts`）——分栏信封三集 upsert+remove（显式删缺位不隐含删）、应用序=先 remove（节点级联边/组）后 upsert（节点→边→组）。**字段政策**：data 整包替换（缺省读 {}+同值保引用幂等）、typeId/几何视图字段既有节点恒不写、边连通可写拐点不写（**换端点旧拐点随旧边消亡——对齐既有改连「删旧边建新边」语义**，link.ts settle 实核）、组名单可写框几何自动（偷员互斥/被偷光即散沿票 09；**保留型成员随旧籍保留**——真源不识画布机器面）。**落位三级阶梯**：x/y 照用（存储坐标=左上角）→`near` 近旁提示（锚右缘 60px 一步垂直居中锚心、被占沿 +x 步进步幅=新宽+一步；缺锚降级不炸）→确定性默认（内容包围盒右外缘一步垂直居中、空图原点；同态同单重放恒同镜头无关——确定性测试钉死；单内多新客级联楼梯）。**辖域=根容器**：子图容器居民 id 三面（节点/边/组）冲突 fail-loud 指明 id、remove 缺位静默幂等；保留型 typeId 铸造/涂写/涂写挂保留型的机器边 fail-loud（resilient 路皆跳过——栈再锚消费）。
- **整图差分糖（件 1 续）**：`diffExternalGraph(graph, incoming)`（`kernel/external-diff.ts`）——按编号对账三集→最小变更单（数数级；同值客不入单）再走同一条执行路（两门一道语义一份）；**「册上没有=删除」**（三集列皆必填——缺列形状坏 fail-loud 不猜着修）；**画布机器面不入账**：保留型节点/挂其上的边 incoming 缺也不产删除、撞号跳过，组名单对账先剥保留型成员；同 id 异型旧客=既有节点处理（typeId 恒不换）。
- **快照栈再锚（件 2）**：SnapshotStore 增 `rebase(transform)` 改写口（undo/redo 两堆+当前值逐张施加同一纯变换、栈长序不变、redo 不清、同引用返回零扰动——「开改写口」小切口裁定）。外部摄入**恒零快照**但进门前补拍：**核心不变量钉死=撤销/重做后外部变化恒存活+撤销严格只回退用户操作**（端到端剧本：用户挪节点→同步加票→undo 挪回而票在→redo 复现票仍在）；补拍走 resilient 路且**恒走不问活图 no-op**（用户先删+真源随后销账：撤销不复活——门序裁定：严格应用先跑保抛错零副作用）；data 面镜像语义钉死（手编被同步盖掉后 undo 停在真值）。
- **controller 门面（件 3）**：`applyExternal(changes)`+`applyExternalGraph(graph)` 双口（`external-actions.ts` ExternalGate 薄接线+controller `absorbExternal` 静默吸收收口：写根态+级联 prune+视图重取+选区修剪+恰一次通知、恒零快照）；一调用至多一次通知（零变化零通知——节流定在门上）；三态保全（镜头不动/选区经 prune 收缩/在途手势终止沿票 04 已知边界白拖不炸——jsdom 钉死）。**行数红线**：controller 顶格 400 再触顶——六模块构造接线抽 `controller-wiring.ts`（wireController/wireLoop/wireCommandModules——票 10/13/21 分模块先例的装配收口步，行为零迁移）。
- **测试面（件 4）**：新增 47 测（全量 608）——kernel external 23（守卫指明字段+**条目未知字段拒绝**/字段政策逐条含保位/阶梯三档+确定性+级联/拐点消亡/组框数学+偷员+保留成员/级联删除/矛盾单/**remove 拦保留型占位与机器边**/子图冲突三面）+external-place 6（阶梯几何单源面，5 迁自 external+1 新）+diff 9（最小差分/三集对账/机器面跳过/收敛性/整图守卫）+快照店 rebase 2+controller 12（核心不变量剧本×3/不占格/不清 redo/恰一次通知/三态/原子性/near 经门面/整图三合一/幂等/销账不复活）。
- **README 使用章（件 5）**：两门选门指引（按数据源完整度：态源走整图门/流源走变更单门）+变更单信封样例+字段政策/阶梯/辖域成文+**镜子场景两缝分工**（状态单走票 33 props 通道、结构单走本门——两缝正互引不重开）。
- **验收**：code-review 双轴（Standards 无硬违规/Spec 五项收口：**条目未知字段大声报错**[nearr/dat 笔误不静默落默认档——不猜着修]；**remove 列拦保留型**[静默级联毁子图组织不可撤销]；**rebase 变换包级联 prune 与活图收口同管线**[快照 current 与 root 恒同构]；守卫助手与键集/名单比较去重[COLLECTION_KEYS/sameMemberSet 单源]；行数红线三次收口：external-place.ts 阶梯分出+external-place.test 专文件+controller-wiring 六模块装配抽出）；`npm run check` 全绿（typecheck 0 错、lint 0 违规、prettier 过、608/608、code_limits 0）+play:build 冒烟过；spec 增「外部静默摄入契约」决策行（票 34 立策）；包版本 1.18.0→1.19.0。

## 1.18.0 — 票 33：节点状态呈现供件（C——双轨透传+结构位双进）（2026-10-03）

吃票 28 通道裁定落形五件，wayfinder epic（票 27-37）第三张执行票；**零 kernel 面**（呈现契约与存储分离——节点状态=数据非内核解释红线兑现）。

- **类型与 props 面（件 1）**：`NodeState = { data?: Record<string,string>; vars?: Record<string,string|number> }` 显式两子袋开放集键导出（svelte barrel）；`CanvasView` 可选 props `nodeStates: Record<nodeId, NodeState>` 贯入 CanvasNodes（widgetComponents 同形）。**零 kernel 缝零 node.data 写零 undo/semanticHash 污染**——状态活图恒不落快照（真源宿主持有；jsdom 断言翻转链中 canUndo()/canRedo() 恒 false+toUiFormat 逐字不变）。
- **运输缝（件 2）**：节点根逐键透传——data 袋→`data-fl-state-{key}` 属性、vars 袋→inline `--fl-state-{key}` 变量，**只落节点根**（结构位不重复携带——宿主 CSS 后代选择器自根取用）；键形状守卫 `^[A-Za-z0-9_-]+$` 不合规整对跳过不设信（票 22 typeId 先例）。实现形=票内裁定 **Svelte action**（`use:nodeStateTransport`——动态名无声明式语法可表达+逐键 diff 键退场即拆+setAttribute/setProperty 对宿主怪值 CSSOM 惰性拒绝不炸样式串）；活图更新姿势=替换袋对象（`$state` 代理贯入）。
- **结构位两件（件 3）**：徽章位=标题条右端空 `<span class="fl-node-badge">` 纯结构钩**恒渲染**（宿主不写 CSS 即不可见；data-fl-state-\* 在场与否不改变渲染面）+`.fl-node-header` 补 position:relative；进度条位=底缘 `.fl-node-progress` track+fill（fill `width: var(--fl-state-progress, 0)` 消费约定键）**vars.progress 键在场才渲染位**（键退场即拆——机械键在场检查非值解释）。**几何不变**：两位皆既有盒内 overlay 零高度，kernel nodeSize 不知情（断言节点高不随状态/结构位变）。结构 CSS 入库、视觉面零预置（色/动效全宿主 CSS）。
- **宿主使用面成文（件 4）**：README 使用章（nodeStates 接线姿势/开放集键/progress 约定键/**宿主 CSS 覆写特异度姿势**——库 scoped 节点样式与宿主属性选择器同特异度且注入在后赢平局，宿主 id 前缀提权；票 28 demo 实证成文）；spec 增「节点状态呈现契约」决策行（票 33 立策）。
- **演示页升级（件 5）**：`playground/status.html` 三版对照保留、**模拟注记销账**——transport/injectSlots 模拟函数删除改真 props 接线（新增 `status-state.svelte.js` $state 代理贯入、C 版活图 ticker 替换袋对象更新；A 版=宿主 CSS 只消费属性/变量不写结构位样式）；hub 增行。
- **验收**：jsdom 新增 7 测（双轨运输逐键/形状守卫跳过/键退场即拆+值覆写/徽章恒渲染三态/进度位条件/几何不变/undo·semanticHash 零污染——全量 561）+真浏览器载体页 DOM 读数+像素采样**浅深两主题**（badge 绿 #16a34a 实心/todo 空心圈透底/track 底色 20% 混合 54,66,84 精确/fill 宽=track×pct 像素级 19.8px@10%/running 边框蓝族/done 染底 239,249,242）+实拍过目；tokens.test 开放集正则收编 `--fl-state-*`（宿主供值族同 `--fl-port-*` 先例）；行数红线收口：CanvasView.svelte 顶格 399（票 32 controller.ts 先例——历史注释压缩抵扣 props 贯入增量）；IAB 环境注记：webview 失焦致定时器重度钳制+CSS 过渡冻结（fill 宽读数走布局查询非绘制帧无碍判定；键退场拆位由 jsdom 钉死）；code-review 双轴无硬违规（判断项三收口：双轨 transport 成对保留=两轨错误语义不同已记档/夹具更名 StateBagEntry/注释压缩=红线抵扣）；`npm run check` 全绿+play:build 冒烟过。
- README 状态呈现章+epic 进度行（frontier=34-36+收口 37）；spec 决策行；包版本 1.17.0→1.18.0。

## 1.17.0 — 票 32：节点双击改道钩子 onNodeDoubleClick（B）（2026-10-03）

wayfinder epic（票 27-37）第二张执行票；先例 onLinkEmptyDrop 可置钩子（缺省不破现行为）。

- **改道钩子**：`controller.onNodeDoubleClick`（controller-types 声明+placement `dblClickSpot` 渲染层读——onLinkEmptyDrop 同款可置属性；视图不写它故无挂载覆写竞态）。**接管判据=仅显式拒接**：在位且返回值非 `false`（含 void/true——常见形「无返回值回调即接管」免记 return true 脚枪）=宿主吃双击、内建原位改名不发生；缺省/false=回落票 15 原位改名（既有演示页行为不迁）。参数与 editTitle 同形（命中节点+画布本地屏幕坐标——宿主锚浮层用）。
- **改道只及节点体**：子图占位双击照进子图（保留型不进钩子）、边界代理忽略、空白双击照弹搜索面板、边路径/平移态照旧——票 15 双击面统一收口的分支语义零迁移；命令式落点口径延续（不进内核输入契约、零快照零订阅——宿主副作用自理）。
- **验收**：jsdom 新增 6 测（接管携 node+screen/false 拒接回落/缺省回落对照/空白不改道/占位不改道照进子图/平移态照让）+真浏览器载体页 `playground/dblclick.html`（hub 增行：三态切换（接管开宿主对话窗样例锚 screen/拒接回落改名/缺省）+读数面）；`npm run check` 全绿+play:build 冒烟过。
- README 交互段+钩子示例；spec 增节点双击改道契约（票 32 立策）；包版本 1.16.0→1.17.0。

## 1.16.0 — 票 31：右键菜单落地（A——契约 v2 事件+命中解析+ContextMenu 卫星件）（2026-10-02）

吃票 27 裁定（档 1 全入库）落形五件，wayfinder epic（票 27-37）首张执行票。

- **契约 v2（件 1）**：输入契约六事件表加 `contextmenu` 事件型（`INPUT_EVENT_CONTRACT_VERSION` 1→2——纯增量；四交互机不认此事件：派发环旁挂路由在四机之前，机器面只见显式 no-op 臂）。CanvasView DOM `oncontextmenu` 监听→归一化（clientXY→画布本地+preventDefault 压系统菜单，吞路同压）→dispatchInput 进派发环；**down 弹原生直驱**（系统时序，触屏长按免费——ComfyUI 手写 600ms 合成债不背；未来右键拖动手势引入时加 6px 漂移门=票 27 已记边界）。
- **kernel 命中解析（件 2）**：`resolveContextHit` 纯函数（`kernel/context-menu.ts`——组合既有 hitTestPort/Node/ReroutePoint/EdgePath/Group 零新几何，ComfyUI getCanvasContextMenuTarget 直译）：判别载荷 `{kind:'node'|'port'|'reroute'|'edge'|'group'|'empty', …id}`；优先级与左键命中面同构（端口→节点体→中继点→边路径→组框→空白；组框殿后=票 11 让渡序延续，与 ComfyUI 组优先序有意分歧）。
- **ContextMenu 卫星件（件 3，第六件）**：**items 全宿主注入**（`getItems(context)` 回调为主+静态数组退化糖、**库零预置项**——免 ComfyUI 205 行兼容债）经 CanvasView 可选 props `contextMenuItems`（**未注入=特性整体 opt-out 原生菜单保留**——契约 v2 纯增量承诺，未接入宿主升级零行为变化）；渲染面最小集=分隔线（null 项）/禁用（不挂监听）/子菜单（递归内部件 ContextMenuList——Svelte 5 自引用官方形+锚父右缘+悬停开/点击切换）/shortcut 可选 chip；屏幕坐标锚定+视口收边（NodeSearchBox clampExpr 同款+估宽上限钳制两向保不溢出）+不跟随镜头；document 级外点+Esc 关闭（补 ComfyUI 无 Esc 缺口）+右键点菜单自身=关闭+点叶项终局；satelliteIsolation 隔离+无壳供件（挂载点归宿主 overlay；CanvasView 内置接线+barrel 导出两面）。
- **让位两吞（件 4）**：四机手势在途（gesture.kind!=='idle'）与空格平移态（票 21 panYield 同款）吞不弹；节点内控件（data-fl-widget）/卫星件（data-fl-satellite）树内右键=原生菜单（isIsolatedEvent 收编 satellite.ts 公共面——wheel/contextmenu 共用）；context 载荷恒携命中 id（菜单目标与选区语义解耦）。
- **右键改选 Windows 规则（件 5，票 27 追加裁定）**：命中节点/端口且在选区外=replace 改选（喂既有 select 面一次左键点选——同坐标同几何源必中同一节点，ctrl=并入与左键增选同构）、命中在选区内=保选不动、空白/边/reroute/组框不动选区（背景菜单形）；选区=交互态零 undo/semanticHash 污染（无位移 commit 同引用被快照店忽略——挂载缝钉死）；**菜单期 SelectionToolbox 让位**（菜单期隐、菜单关照常随选区显——右键改选召出工具条与菜单同位叠置的接缝在菜单件诞生时接）；**菜单开面期 Escape 归关菜单不清选区**（Windows 习惯；无菜单时语义不变）。
- **门面查询面**：`getContextMenuState()`（开面载荷=命中+画布本地屏幕锚）/`closeContextMenu()`（关闭交互汇点）——订阅通知照发（SelectionToolbox 让位/测试消费）。
- **验收**：jsdom 新增 20 测（kernel 命中五路+优先级+缩放 5+ContextMenu 协议（items 两形/渲染面四件/关闭三路/子菜单递归）5+CanvasView 全链（归一化+压系统菜单/opt-out/控件隔离/让位两吞/Windows 改选两态+ctrl 并入/工具条让位/Esc 不清选区/semanticHash 零扰动/getItems 上下文）10——全量 548 测）+真浏览器载体页（playground/contextmenu.html：命中五路读数面+改选/让位/工具条让位实拍——hub 增行）——几何读数全过（菜单锚=右键点像素级、右下角收边 within、子菜单锚父右缘+下缘自纠、工具条让位/复显、Esc 选区保全、拖动/空格两吞、控件右键不压）；**实拍过目揪出一枚真缺陷并当日修复：子菜单 absolute 左挂被菜单根 overflow 滚动容器裁剪**（overflow-x 陪随 auto——scrollWidth 260 vs clientWidth 169 实证），改 fixed 锚父项右缘（右缘放不下向左翻+下缘码后量高自纠——code-review 双轴收敛落地：子菜单下缘收边补齐+估宽常量 JS 单座）；`npm run check` 全绿+play:build 冒烟过。
- README 右键菜单章+epic 进度行+包结构 v2 行；spec 增右键菜单契约（票 31 立策）+卫星件枚举随迁；包版本 1.15.0→1.16.0。

## 1.15.0 — 票 24：演示枢纽页（playground 导览）（2026-10-02）

「节点编辑器体验升级」epic 收尾票（载体票零库面改动——票 20 先例）：散在五个演示页的能力一页看全+直达。

- **`playground/hub.html` 演示枢纽（owner 2026-10-01 预裁：新建独立页，主演练页 index.html 不动）**：全能力清单逐项列示（M1 八项 01-08+M2 长尾 09-16+质量与新面 17-26——票 16 多开标签标注装配指引在 README 无专页）+各页直达——主演练 index.html（落位/连线/选区/复制/持久化/属性面板/组/子图/reroute/minimap/排布/命令面）、嵌套三镜头深链 `nested.html?scene=root|a|b`、数据驱动布局 layout.html（声明出图+读数面+票 23 方向切换）、节点内 widget widgets.html（宽度 A/B+折叠两态）、主题 chrome theme.html（三档原型+类型色）
- **浅深切换联动（票内裁定：不走 query 参数——localStorage 单源）**：theme.js 增 `applyStoredTheme()` boot 应用导出（mount 前调用免闪白）；nested/layout/widgets 三页补 `flowloom/tokens.css` 引入+boot 接线（此前三页无主题接线——枢纽/主演练页切换后三页现随动）；layout/widgets 两页 demo 条/读数面/侧栏硬编码浅色值 token 化（深色下可读，票 22 demo 姿势同款）
- **返枢纽回链**：五演示页演示条首项「⌂ 枢纽」；nested 页演示条改浮条（`fl-float-bar` 绝对定位——原流式条在画布全幅页溢出视口外不可见）；demo-chrome.css 增回链/浮条样式（token 化随主题）
- **存量缺陷修复（全链验收发现，载体面）**：nested 演示页自票 21（1.10.0）起 kernel 签名漂移未跟进——`convertSelectionToSubgraph`/`toggleGroup` 增 DefSource 首参，旧调用形 boot 即 TypeError 页死（票 21-23 收口均未浏览器复验该页）；按现签名修复（source={registry,subgraphs} 同 controller 装配形）+node 侧复现验证+三镜头浏览器复验（根 8 节点/预处理 6/文本规范化 5+面包屑两级）
- **验收（真浏览器全链+像素取证）**：七路直达（index+nested×3 深链+layout+widgets+theme）逐页可达+返链回枢纽全通；深色联动读数（html data-fl-theme=dark+画布底 rgb(16,19,26) 七页一致）+切换循环（自动→浅→深→自动还原）；六张实拍落盘+pixel-probe 字节读数（深色画布成片 nested 91.6%/layout 93.7%/widgets 58.3%、hub 深色族 86.5%）；视觉过目深色 hub/嵌套页可读性无缺陷
- 测试零新增（载体票零库面——票 20 先例）；README 进度行（epic 票 21-26 全闭）+包结构行；包版本 1.14.0→1.15.0；`npm run check` 全绿（60 文件 528 测）+play:build 冒烟过

## 1.14.0 — 票 23：布局体验（L→R 方向+中继点随排布）（2026-10-02）

owner 观感对账三主因（TB 走向高瘦/长跨层边贝塞尔扫图/中继点不随排布）一次收口。**⚠ 语义变更（owner 窗口预裁）**：`controller.autoLayout()` 无参默认向**由 TB 转 L→R**（票 13 语义变更——ComfyUI 流向）；原纵向语义变显式选项 `{direction:'tb'}`；票 13「autoLayout 无默认键位」裁定一并改——`fl:auto-layout` 入默认命令表+默认单键 **L**（F=fitView 不混，宿主可换绑）。

- **方向缝（kernel 转置）**：`autoLayoutNodes` 增 `AutoLayoutOptions.direction`（'lr' 默认/'tb' 显式）——主/辅两轴随方向对调（lr：层沿 x 推进、层内纵排；tb 原纵向），间隙常量随轴走（横向恒 GAP_X=60、纵向恒 GAP_Y=80）；**层步进吃派生层尺寸**（DefSource 单源——票 21 widget 长高/票 26 折叠高随动，非常数假设，tb/lr 两向同吃实际层宽/层高）；分层/重心定序数学零改（方向是纯几何转置——层数/层内分布/交叉数两方向恒同构）
- **中继点随排布清空重置（票 13 已知边界解销）**：排布时两端点皆域内的边 reroutes 清空（`semanticEdge` 投影形单源共用——边随新分层直接走新路径），跨界边（选区排布域外端点）中继点保留；排版后再手动插点照旧；恰一张快照位移+清点同回（undo 一次全回）；已就位仅清点也成图（no-op 缩面不吞清点）；**semanticHash 红线延续**（排布仍是纯布局关注点，含清点双格式红线测试钉死）
- **命令面**：`fl:auto-layout` 内建第十命令（无头可执行——排布数学零量测，不需 setRunner 覆写）+默认键位表增 `l` 单键（画布聚焦域）；对齐/分布仍只动 x/y 不清点（清空唯排布路）
- **长边观感评估（票 20 读数面方向化复用，裁定=不动数学）**：两样本×两方向读数——ai 图（14 节点 14 边）LR/TB 均「层 11（层内最大 2）·交叉 1」、网格图（20 节点 19 边）均「层 6（层内最大 4）·交叉 3」，层间净距随主轴常量对调（60↔80）——交叉计数与票 20 TB 基线持平（同构转置必然），不达「差」线按判例不动数学（分层紧凑化增强票继续悬置）；**L→R 后高瘦主诉消解**（真浏览器视觉复核：横向铺开取代纵向长条）成文记档
- **演示页**：`playground/layout.html` 增方向切换钮（L→R/TB 对照）+读数面方向化（层数/净距沿主轴）；主 demo 排布工具条对齐新默认（自动排布经 executeCommand 与键位同源+纵向排布 TB 显式钮+提示行）；「一键重排」入全部演示页（nested/theme/widgets 各补——theme 页顺带成中继点清空演示面）
- **验收（jsdom+真浏览器双路）**：真浏览器四组读数+实拍（两样本×两方向）、L 键端到端（画布聚焦 keydown 消费+几何回位）、theme 页中继点 1→0 且列距吃实际层宽（40→340=240+60 派生宽步进）；jsdom 新增 12 测（kernel 方向手算 6+中继点清空 3+红线 2+门面方向/清点 2+命令面 2——全量 528 测）
- **400 行红线处置**：controller.ts（原 398）+2 即撞——「减行不删义」（1.12.0 注释并行先例）：wireCommands 头注并入调用行，落 399 行，全仓豁免继续保持零；layout.ts rowTargets 超函数 40 行线——packLayer 抽出（packRow 先例同构）
- README 排布/命令/键位/进度四面对齐；spec 排布契约行三处语义变更落定；包版本 1.13.0→1.14.0；`npm run check` 全绿+play:build 冒烟过

## 1.13.0 — 票 26：节点折叠两态（2026-10-01）

多参数节点（票 21 三段形）可折叠成标题条形、再点放开——「调参数/看结构」两姿态切换（ComfyUI node.collapsed 同构，票 21 讨论衍生小票）。零新穿线（票 21 DefSource 红利）、零新交互机（命令式口径）：

- **kernel 折叠几何分支（TDD 手算）**：`CanvasNode.collapsed?` 内存合并态（展开=无键不落 false 噪声）+`toggleNodeCollapse` 纯函数（no-op 同引用契约）；`WIDGET_COLLAPSED_HEIGHT`=标题条 24+底 padding 8=32（WIDGET_* 常量族）；`nodeSize` 折叠分支（宽不变、折叠高取代存储形 floor——收缩态不保展开下限；零端口零控件同受辖=机制服状态）；`portPositions` 折叠分支=端口沿折叠高 (i+1)/(n+1) 均分（每侧按自家口数——行心式在 32px 条内行数>1 会溢出）；命中/组框/排布/连线锚定全链经 DefSource 单源自动吃折叠高（零新穿线——排布层步进手算测钉死）
- **序列化布局半边投宿**：`layout.nodes[id].collapsed` v1 加法可选键不升版本（非空才入——reroute 噪声规避同款）；旧档无键读为展开、非 true 值不设信同读展开；子图容器内节点折叠随节点引用迁入记录（扁平投宿无特判）；**semanticHash 恒不含折叠**（折叠/放开 hash 不变——组/reroute 红线模式照抄钉死，kernel+门面两级测试）
- **折叠开关供件**：标题条 chevron（SVG V 形：展开下指/折叠 -90° 旋右指，currentColor 随标题字色零裸色值）；事件自吞（satelliteIsolation 机制复用+平移态让位同款——点开关不改选区不起拖、双击不触发标题改名）；**退化形（无 widgets）默认不供开关**（票内裁定：价值低）；折叠态端口行/widget 块不渲染（DOM 盒=kernel 折叠矩形——`display:none` 禁令静态钉死）；标题字面独立 `.fl-node-title`（标题条复合体后文本锚点单一，既有 4 处锚点随迁——1.11.0 先例）
- **命令路**：`controller.toggleNodeCollapsed(nodeId)` 恰一张快照可撤销（undo 回形态；连折多节点=多张快照，ComfyUI 同款）；未知节点 no-op 零快照零订阅；剪贴板不携折叠（载荷节点结构本就无此字段——粘贴默认展开，组/reroute 同构）
- **验收（jsdom+真浏览器双路）**：真浏览器几何读数逐点吻合 kernel 公式——折叠盒 240×32（getBoundingClientRect 实测、computed display=flex 非 none）、端口点 cy 154→136（24+10 行心→+16 均分）、连线锚随迁（e2 路径 M 660 136）、工具条撤销回展开 244 再折回 32；视觉过目（chevron 两态指向/折叠条观感/连线走线无异常）；jsdom 新增 25 测（kernel 几何 5+graph toggle 3+hittest 2+serialize 5+layout 排布 1+controller 5+挂载缝 6——全量 515 测）
- **400 行红线处置**：controller.ts（原 399）+8 即撞线——「减行不删义」（1.12.0 先例）：头注/私有方法注释压缩+`buildNav` 装配内联进构造器（返回值装配保 readonly 赋值面，票 10 抽出因由已消）落 398 行，全仓豁免继续保持零
- README 折叠使用章+进度行；spec 契约行票内裁定三项落定（折叠高 32/chevron 形态/退化形不供）；包版本 1.12.0→1.13.0；`npm run check` 全绿+play:build 冒烟过

## 1.12.0 — 微票 25：undo/redo 状态查询面（2026-10-01）

owner 窗口裁定补的微缝：undo/redo 本体自 M1 完整，唯一缺口=状态查询面——kernel SnapshotStore 已有 `canUndo()/canRedo()` 但 controller 持 snapshots 为 private 未转发，宿主工具条「栈空灰掉撤销钮」无查询路。新增公共 API（semver minor）：

- **公共面**：`controller.canUndo()/canRedo()`——纯转发 kernel 快照店（零状态计算，undoLimit 默认 100 不动）；类型面 `controller-types.ts` 同步声明（含「栈变必通知」契约注释）
- **订阅联动核实（票内成文，结论=已覆盖零改）**：栈变必通知恒成立——命令路（mutate/convertSelectionToSubgraph）commit 后无条件 notify；手势路三机所有 `commit: true` 分支必换新机态对象（gesture→idle），同帧必过 dispatch-loop 变更检查触发 notify；undo/redo 空栈零通知零栈变自洽；反向不成立（setViewport/导航也通知）对灰钮无害（回调重读 canUndo 值不变）。已知边界：无
- **playground 演示**：主 demo 撤销/重做按钮禁用态随订阅刷新（`disabled = !canUndo()/!canRedo()`，宿主接线样例——灰钮免轮询）+`demo-chrome.css` 补 `:disabled` 态（token 化随主题联动；键位 Ctrl+Z 路不受禁用影响）；css 顺带 prettier 全文件归一（1.11.1 直写产物未过 format 门——纯换行/空白零语义）
- 测试 +1（controller 门面缝：空栈 false/入栈 true/undo 后 redo 态/新快照清 redo/栈变伴随订阅）；README 撤销重做章+进度行（顺带校正 1.11.1 slate 化后进度行残留的「charcoal 阶」）+spec 门面契约行；包版本 1.11.1→1.12.0；`npm run check` 全绿+play:build 冒烟过
- **400 行红线处置**：controller.ts（原 399 行）+11 即撞线——抽分核算行数中性（公共面必须留本体）且豁免零先例不开口子，取「减行不删义」：`getBreadcrumb` 派生下沉 subgraph-navigation（`breadcrumbOf` 纯函数）+头注压缩（决策全保留）+注释并行，落 399 行、全仓豁免继续保持零

## 1.11.1 — 票 22 补丁：owner 过目返工（2026-10-01）

票 22 收口后 owner 过目三件返工（视觉/可读性缺陷级，patch 修）：

- **暗色去「土」**：charcoal 暖灰族（R2 建议值）→ **slate 冷灰族**（与浅色同族一体——「变土」根源=浅深换了色彩家族）：画布底 `#10131a`/节点面 `#1e293b`/节点边框 `#3c4a5f`/面板 `#1a2332`+描边 `#334155`/文字 `#e2e8f0`·次级 `#94a3b8`（slate-400，较旧中灰 `#8a8a8a` 更精神）/连线端口 `#94a3b8`（更亮=顺带缓解连线可见度）/group·subgraph·reroute·minimap 族随迁；**类别色染色带比例 token 化** `--fl-node-cat-mix`（浅 40%/深 30%——深色下降浊去「土」第二刀，CanvasNodes color-mix 消费）
- **demo 品质修复（playground 面）**：主 demo 图坐标按票 21/22 派生尺寸重摆（原 160 宽时代坐标在 step 最小宽 240 下**节点零间距贴死**——端口锚点重合、连线零长度；现水平通道 120/160px）+存储键升 v2（旧档几何不匹配换新图）；demo 壳层样式（工具条/节点库/检查单/侧栏）token 化抽 `demo-chrome.css`——原硬编码浅色值致深色下**黑字贴黑底/淡蓝灰字 `#64748b` 不可读**（owner 点名「黑底淡蓝字」根因），现全走 `--fl-panel-*`/`--fl-fg-*`（宿主壳随主题接入的演示姿势）
- **复验**：深色三面成片（canvas 40%/面板 40%/节点 50.5k px）+连线/文字族 blend 非零+工具条/侧栏逐元素可读（视觉复评过线：不土/字全可读/连线可追踪）；浅色零回归（节点 40% 带与底色 probe 逐色一致）；`npm run check` 全绿 57 文件 490 测+play:build 冒烟过
- 记档悬置：黄色类别带 30% 在深底偏军绿（复评次要建议提亮至 40% 归 owner 点名再调）；评审核到的「网格点」系误读（flowloom 画布无网格面）

## 1.11.0 — 票 22：深色模式与节点视觉 chrome（2026-10-01）

两面：集中 token 表+暗色主题预设（R2 荐机制采纳——ComfyUI design-system L2 同构）；节点 chrome 统一形（标题条+常显端口标签行+类型色——ComfyUI 观感对齐）。

- **主题机制=集中 token 表两段覆写**：新出口 `flowloom/tokens.css`（package exports）一处全表——浅色默认 `:root`+深色两入口同表（显式 `:root[data-fl-theme='dark']`+系统深色 media `:root:not([data-fl-theme='light'])`，两段逐声明相同由 tokens.test.ts 静态钉死）；**缺省跟随系统 prefers-color-scheme**（刻意分歧于 ComfyUI「class 缺省即深」）；挂 `<html data-fl-theme>` 显式锁主题、挂属性+持久化归宿主壳（README 样例+playground 主 demo 切换钮即宿主样例）；组件内 `var(--fl-*, 浅色回退)` 短期保留=不 import 本表的降级通道
- **暗色一套=charcoal 阶**（R2 findings 建议值直译）：画布底 `#141414`/节点面 `#262729`/边框 `#444`/面板 `#202121`+描边 `#3c3d42`/文字 `#e9e9e9`·次级 `#8a8a8a`/连线端口 `#8a8a8a`/minimap 族全翻；**选中族保蓝一族一色贯穿浅深**（owner 预裁：浅 `#2563eb`→深提亮 `#60a5fa`，不跟 ComfyUI 深色白选中）；UA 原生控件随主题=`color-scheme: var(--fl-color-scheme)` 限画布+宿主挂载卫星件（PropertiesPanel/Minimap）子树，不扰宿主文档
- **节点体 token 化**：`--fl-node-{bg,border,fg,header-fg,shadow,radius,font-size}` 族上收（原 CanvasNodes 硬编码 `#ffffff/#cbd5e1` 清零——静态红线：剥 var 链后零裸色值+组件面引用 token 全在集中表有座）
- **节点 chrome 统一形**：全部节点=标题条+常显端口标签行（ComfyUI NodeSlots 同构：行内左入右出对排）+widget 行列三段可选叠加——票 21 退化居中单行形收编、保留型占位/代理同获 chrome；kernel 高度公式扩为 标题条 24+端口行 20×行数+widget 块（`PORT_ROW_HEIGHT` 导出常量；`nodePorts`/`portRowCount` 新纯函数；存储形 wh 仍作下限 floor）；**端口锚定自 (i+1)/(n+1) 均分改行心式**（标签行与锚点同一几何源——命中/连线锚定/框选/组框/排布/minimap 全随迁，行自顶起算与总高无关=存储形下限胜出时锚点不漂移）
- **类型色声明面=词表可选字段**（owner 预裁·内核只搬运不解释——比 ComfyUI 词表不带色多走半步留宿主数据面）：`NodeTypeDef.color?`（类别色 hex，染标题带）+`PortDef.typeId?`（端口数据类型 id）；消费点=渲染层 `--fl-port-{typeId}`/`--fl-link-{typeId}` **开放集**（宿主 CSS 供值，ComfyUI `--color-datatype-{TYPE}` 先例；未声明走中性缺省、非 id 安全形状走缺省——宿主数据不设信）；边类型色=源端口 typeId（link type=源槽型先例）经 `--fl-link-own` inline 间接（不高亮类争 inline 优先级）
- **标题带染色=真浏览器三档原型对比落定 A 染色带 40%**（HITL 项留档改选：playground/theme.html 浅/深×三档六图+视觉评审——B 实色带深色下金黄 #ffd500 实填+浅灰 #e9e9e9 标题字明度差极小接近不可读（一票否决）、浅色下黄带刺眼抢焦点；C 浅染+左色条 12% 淡染类别辨识塌缩（淡紫/粉紫难分）；A=color-mix alpha 混节点底色浅深自适应，唯一在「任意宿主色+浅深两套+固定标题字色」三重约束下无事故档）
- **验收（真浏览器+jsdom 双路）**：浅深两套像素验收（blend 判据——票 19 降采样条款）——theme 页底色成片 85.8%/节点面 84.7k·42.8k px/类型色族 #b39ddb·#ffd500·#64b5f6 计数 300-940px；index 页选中蓝 464/502px·面板族 29.8k/29.5k px；computed 读数（UA colorScheme=dark 限画布/checkbox accent=#60a5fa/染色带 color-mix 解析/类型点 #38bdf8/中继点 #444 心+#a0a0a0 环+密集补丁实拍）；端口标签行与圆点对位整齐（视觉评审确认无错行）；缺省跟随系统路径实锤（无属性+系统深色=深色画布）
- 测试 479→490（+11：kernel geometry chrome 常量·配对·类别色 3+portPositions 行心/typeId 3+link-render 类型色 1+tokens 静态 5 新缝+挂载缝 chrome 统一形重写+端口行/类别色 2——既有锚定期望全量随迁）；README 主题/chrome 使用章+进度行；spec 增「主题与节点 chrome 契约」决策行；包版本 1.10.0→1.11.0；`npm run check` 全绿+playground 构建冒烟过

## 1.10.0 — 票 21：节点内 widget 供件（2026-10-01）

本 epic（节点编辑体验升级）首票——控件长在节点身上（ComfyUI 形）：词表 `widgets` 声明驱动的节点体控件（标题条+行列三段形），编辑不再只靠侧栏属性面板（双入口同数据两视图零冲突，只加不删）。零新词表面（票 07 `WidgetDef` 原样）、零新提交面（`setNodeData` 恰一张快照同款）。

- **kernel 派生单源尺寸**（票内裁定：不写 layout.wh——旧档复原自动长高、序列化面不新增存储）：`nodeSize(node)` → `nodeSize(source, node)` 吃 `DefSource`（registry+subgraphs——与端口合成 effectiveNodeDef 同源）按 widgets 现算——高度=标题条 24+每行 24（textarea 3 行 72）+块尾 8（`WIDGET_*` 常量导出；存储形 wh 作下限 floor）；有 widgets 节点最小宽 `WIDGET_MIN_WIDTH`=240；无 widgets/未注册/保留型退化形零改。**全几何面穿线**：hittest（hitTestNode/nodesIntersectingRect/portPositions）·选区机 world 化（`SelectionWorld`=LinkWorld 同构——兼合参数红线所迫）·group/layout/viewport/subgraph 转换（取号一包化 `ConversionIdSource`）·minimap-model·placement 落位居中——端口沿新高度均分自动适配、组框/包围盒/排布/连线锚定全吃新高度（票 18 盒契约延续）；手算 TDD（geometry.test.ts 新缝）
- **供件单源=内部件 WidgetControl.svelte**（票 07 分发链自 PropertiesPanel 抽出）：五内建型+`widgetComponents` 注册位+只读 JSON 回退——面板与节点体两消费方同实现；`CanvasView` 增可选 props `widgetComponents`（与 PropertiesPanel 同形贯入）；节点渲染抽内部件 CanvasNodes.svelte（守 400 行红线——CanvasLinks 先例）；DOM 三常量（标题条/行高/块尾）自 kernel 内联进 style+盒契约静态红线扩钉（CanvasViewBoxModel 扫描面=两组件并集）
- **命中分区+键位隔离=DOM 自吞**（R1 底稿对齐·票内已裁「机制复用+标记分名」）：widget 行包裹层 `{...satelliteIsolation}` 七事件自吞+`data-fl-widget` 标记（不挂 data-fl-satellite——控件嵌 fl-world 变换层非卫星浮面板；画布侧 wheel 让位判定 `closest('[data-fl-satellite],[data-fl-widget]')` 双保险）；点控件不改选区不起拖、控件内 Delete/ctrl+z 不触发画布命令（监听在画布根——断冒泡即隔离）、textarea 滚轮不缩放画布；**空格/平移态让位**（R1 直接输入·评审返工补）：平移手势期 widget 行隔离让位（pointer 三件转发画布起平移）；控件区覆写 user-select:text
- **宽度策略 A/B 原型（票面 HITL 项）**：playground/widgets.html 两档可切换对照——A 固定最小宽 240（ComfyUI vue 轨同构·kernel 纯可算）/B 随内容放大（字符估宽 240-420，ComfyUI canvas 轨 computeSize 同构·估宽式留档 demo）。自主会话无人应答按 R1 建议档 **A** 落定；owner 过目 widgets.html 改选 B 则另票搬 kernel 估宽式
- **GAP 联动**：kernel autoLayout 层步进本就按层高累计（`cursorY += packed.height + GAP_Y`——净距恒=层步进与层高无关，widget 长高不压缩连线通道，kernel 零改动）；票 20 demo 读数公式 `GAP_Y−层高` 失真（按 kernel 语义实际净距应为 80 非 32——原「32px 基线」系公式 artifact）票内修正为几何实测（相邻层底-顶差）
- **controller 400 行红线抽分**：分组命令并入 layout-actions（LayoutCommands 增 toggleGroup/fitGroups）、子图转换计划抽 subgraph-actions.ts（SubgraphCommands+subgraphAllocOf）、剪贴板状态对抽 clipboard.ts Pasteboard（票 05 状态对搬家）、buildNav/buildLoop/buildPasteboard 装配法
- **验收（真浏览器+jsdom 双路）**：挂载缝 CanvasViewWidgets.test.ts 9 测（三段形渲染/退化形/恰一张快照 undo 链/命中分区/键位隔离/滚轮让位/覆盖位/保留型不供件/平移态让位）；真浏览器 DOM 几何读数（五节点 240×56…160×48 与 kernel 公式逐点吻合·端口锚点 cy=节点纵向中点逐点吻合）+交互链（提交/撤销/分区/隔离）+像素采样（连接件绘制面非零——票 19 零视口坑无回退）；README 使用面+进度行；spec 增「节点内 widget 供件契约」决策行；包版本 1.9.1→1.10.0
- 测试 462→479（+17：kernel geometry 7+挂载缝 9+盒契约静态扩钉 1）；`npm run check` 全绿+playground 构建冒烟过

## 1.9.1 — 票 20：数据驱动布局演示页（2026-10-01）

owner 诉求三落地：声明 nodes/edges 数据（无坐标）一键出图的演示页+Sugiyama 可读性评估——纯 playground 交付，库面零改动。

- **playground/layout.html+layout-demo.js**（nested.html 先例同款独立页）：两套样本以 UI 格式形状声明（表驱动 uiFormat 装配器——semantic.nodes+空 layout.nodes）——A「AI 工作流」（嵌套演示页同款 14 节点平图语义）与 B「网格压力」（20 节点顺扭连+跨层边+回边环，确定性生成）；一键出图链=文档路径演练：`fromUiFormat`（无坐标落 0,0）→ `controller.autoLayout()`（票 13 公共面）→ fitView；按钮=换样本/重新排布/撤销（排布恰一张快照可撤销即证）/适配
- **可读性读数面（Sugiyama 评估，demo 侧计算）**：层数/层内最大数/层间净距/直线交叉数（端口锚点直线段两两严格相交、共端点剔除——曲线近似下界）；实拍读数：AI 工作流 11 层/交叉 1、网格压力 6 层/交叉 3/破环正常、两样本层间净距均 32px
- **评估结论**：不达「差」线，不开布局增强票——层间净距 32px（0.67× 节点高）连线通道充足、交叉个位数（两轮重心扫描 v1 规模足够）；已知形成文：最长路径分层拉深深链（AI 主链 11 层高瘦+旁路短支单节点层）系算法固有形非缺陷，宽扁图需求出现时再裁「分层紧凑化」增强票（kernel layout.ts 纯函数缝）
- demo 侧踩坑记档：kernel `portAnchor` 世界形须含 nodes（{registry,nodes}）；声明先于 boot（TDZ）
- README 进度行；包版本 1.9.0→1.9.1；`npm run check` 全绿（54 文件 462 测）+ playground 构建冒烟过

## 1.9.0 — 票 19：连线与连接件可见性（2026-10-01）

owner 实测「连线不明显」三件套修复：默认对比/线宽（原型三版对比裁定）、端口点/中继点渲染修复（零尺寸 svg 视口引擎坑）、选中邻接边高亮。

- **默认对比/线宽（原型对比裁定）**：真浏览器摆 A(#64748b+2)/B(#64748b+3)/C(#475569+2.5) 三版对比裁定 **B**——边 `--fl-link` 回退 `#94a3b8→#64748b`+`stroke-width 2→3`（与端口点 fill 同色系成套；对比 4.45:1，原 2.39:1 不达 WCAG 图形件 3:1）；中继点描边 `--fl-reroute` 与 minimap 边 `--fl-minimap-link` 回退同步（同「不明显」族）；线宽缩放不敏感（`vector-effect`，票 03 起）
- **端口点/中继点渲染修复**：真根因=**连线层 svg 视口零尺寸**（`.fl-world` 无尺寸 ⇒ `.fl-edges` 的 100% 视口 0×0 ⇒ 引擎不为圆子件建绘制区——路径逃逸绘制、圆全灭；与票 17「边渲染正常」观察吻合）。修复=`.fl-world` 增 `width/height:100%`（一行 CSS）；实验链：svg 显式尺寸后圆即画、视口外圆照画（overflow:visible 正常）。**根因修正对账**：票 18 记档归因「CSS `r: var()` 首绘失效」被本票实验证伪（r 属性化后零视口下仍不画）——两修复并做（r 属性化保留：CSS 几何属性跨引擎不确定+jsdom 可断言；token `--fl-port-r`/`--fl-reroute-r` 退役）
- **选中邻接边高亮**（ComfyUI 同构；悬停版悬置——边 pointer-events:none+无边选中态需内核新缝）：`linkRenderModel` 增 extras 一包（reroute 机态收编+`selected` 集，兼合参数红线）——边任一端点节点在选中集 ⇒ `highlighted`（缺省全 false 兼容）；path `fl-edge-highlighted` 类 ⇒ 选区色+4px；CanvasLinks 增 `selected` prop
- **验收（真浏览器 fresh 挂载）**：端口点=节点缘深色半圆补丁采样实拍、中继点=白心深环、选中 llm ⇒ 恰 e10/e11 高亮（2197 蓝像素 blend 计数）、边 computed `rgb(100,116,139)`/3px；**捕获管线降采样注记**：截图对细线纯色核心混成 blend（纯色计数恒 0）——blend 感知计数+scale1 密集补丁是票 17 方法论的补充条款
- spec 补「连线与连接件可见性契约」决策行；README 连线视觉一句+进度行；包版本 1.8.2→1.9.0
- 测试 +4（模型缝 link-render 1=selected 投影三分支；挂载缝 CanvasViewLinksVisibility 3=端口/中继点 r 属性在场+highlighted 类随选区增删+静态红线 svelte 样式禁 `r: var(`）；`npm run check` 全绿（54 文件 462 测）+ playground 构建冒烟过

## 1.8.2 — 票 18：渲染盒几何对齐（2026-10-01）

bugfix 一件：组框/子图内部节点溢出框——嵌套演示页真浏览器几何读数定位（票 17 方法论），渲染层盒模型一处修复；kernel 缝零改动（几何本自洽）。

- **bug**：`.fl-node` 样式带 `padding: 0 12px`+`border: 1px` 而无 `box-sizing: border-box`——渲染盒=kernel 契约 160×48+装饰 26×2=**186×50**，而 kernel 几何（命中测试/端口锚定 portPositions/包围盒 nodesBounding→组框 fit-to-contents/转换占位/排布）全按 160×48。三处外显：**组框右缘成员凸出 6px**（GROUP_PADDING=20<26，根镜头 flg-gen 的 par/进预处理镜头 flg-rules 的 ra/rb 实拍可见）；**出侧端口点埋体**（锚在 kernel 右缘=视觉盒内 26px 深处被不透明节点体盖住）；**命中死区**（视觉右缘 26px/下缘 2px 条带在 kernel 命中矩形外点击无响应）
- **修复**：帧族三选择器（`.fl-node`/`.fl-group`/`.fl-selection-box`）`box-sizing: border-box`——**DOM 盒=kernel 矩形**自此为钉死不变量；任务书预设三候选（组框公式/占位高度公式/容器内布局）手算复核全部自洽，真因在渲染层盒模型
- **验收（真浏览器几何读数）**：三镜头节点恒 **160×48**（原 186×50）、组框=kernel 矩形精确（flg-gen 760×108/flg-rules 200×268）、成员 containment 全绿（右缘恰 20px padding 含住）；端口锚=节点视觉右缘（t1 出口 graph x=200）
- **测试面裁定**：jsdom 挂载缝测不了此面（Svelte 组件样式不注入测试文档+无布局引擎量 rect 恒零）——文本级静态钉死 `CanvasViewBoxModel.test.ts`（module-state.test.ts 静态审计同定位）+真浏览器读数验收
- **验收中发现的相邻 bug 归票 19**：端口点/中继点整体不渲染——CSS `r: var(--fl-port-r, 4px)` 几何属性**首挂不绘**的引擎缺陷（getBoundingClientRect 有几何 8×8、computed r=4px 均在场但不绘；重挂/克隆同一元素即画——二分实验实锤，运行时注入带 r 属性的对照圆立现）；修法=几何走属性不走 CSS var
- spec 补「渲染盒几何对齐」契约决策行；README 不动（bugfix 无新用法面——票 17 先例）；包版本 1.8.1→1.8.2
- 测试 +1（静态钉死=帧族 border-box 规则在场）；`npm run check` 全绿（53 文件 458 测）+ playground 构建冒烟过

## 1.8.1 — 票 17：转换悬边修复（2026-09-30）

bugfix 一件：子图转换「双内侧边残留父层」悬边——嵌套演示图浏览器实拍发现、kernel 一行修复+回归钉死；附带 playground 嵌套演示页（票 16 后效果实拍的载体）。

- **bug**：`convertSelectionToSubgraph` 父层容器边过滤谓词 `innerIds.has(from) === innerIds.has(to)`（双侧同侧皆留）使**成员间边（双内侧边）同时留在父层与子图记录**——成员迁走后父层残留悬边：渲染退化 `M 0 0` 路径（端口锚定回退原点）、随 toUiFormat 入档、语义半边重复计边。票 10 转换测试的选中集恰无成员间边（无内边图/扇出跨界/单成员链三形），测试面未盖
- **修复**：父层=「双侧皆外」`!has(from) && !has(to)`+重挂边——双内侧边只随成员迁入记录（与 subgraph.ts 模块头「成员+内边迁入记录」注释对齐，原 `===` 谓词系笔误形）；回归测试=chain a→b→c 选 {b,c}：父层恰 1 条跨界重挂边（e-bc 不残留）、子图记录含 e-bc 原样
- **发现与验证手段成文**：jsdom 挂载缝只测 DOM 存在性不测像素——本次以真浏览器渲染+PNG 像素解码采样验证描边真值；教训=缩放后细线（1~2px）+图床 URL 复用会使视觉判读假阴性（连线渲染本身始终正常，期间「边不渲染」疑云为判读乌龙——像素采样一锤定音）
- **playground 嵌套演示页**（`nested.html`+`nested-demo.js`）：kernel 纯函数直构三层容器图（根→预处理[嵌套文本规范化+规则过滤组]→安全审查）+边界代理对+组框×2+长边中继点+自定义标题（GLM-5.3/最终回答）；`?scene=root|a|b` 三镜头经像素自证；装配时序注记=编程式导航须在 mount 前（CanvasView 镜像初值在实例化时刻取值——README 多标签装配形同款注意）
- **已知边界**：已存旧档可能含转换残留悬边（修复不迁移旧档——v1 无已知消费者存档，复原仍可用、不再新增）；fitView 只缩不放（`fit = min(..., 1)`）系既有语义非 bug（大画布小内容需 setViewport 放大）
- 测试 +1（kernel subgraph=成员间内边迁入不残留父层+子图原样迁入）；包版本 1.8.0→1.8.1；`npm run check` 全绿（52 文件 457 测）+ playground 构建冒烟过

## 1.8.0 — M2 票 16：多开标签配套（2026-09-30）

story 29 全量：多实例隔离钉死（组件族天然多实例——一 controller 一实例的保障面测试+静态审计）与宿主多标签集成指引落 README；**M2 长尾全档就此收口（票册 09-16 全闭环）**。

- **多实例隔离挂载缝钉死**：同页双 `CanvasView` 各挂独立 controller（共享词表=真实多标签装配形——registry 跨实例传递是只读数据面非串扰面），图/视口/选区/undo 四面互不串扰测试钉死（视口/选区=真实事件路、图/undo=controller 公共 API 面——只测外部行为口径双轨）——图=A 落位只反映 A 的 DOM 且自动取号各图独立（若 id 计数器住模块级则 B 会拿到 fl-2，钉死门面工厂闭包形）、视口=A 滚轮缩放 B 镜头不动+B 中键平移 A 镜头不动（双向）、选区=A 点选高亮不点亮 B 同名节点+A 的 Delete 不删 B 节点、undo=A 的 undo 不回退 B 的编辑且两栈深度独立
- **标签切换装配形钉死**（README 集成指引的对应面）：卸载视图后 controller 无头存活（图/视口/选区/undo 全保留），同 controller 重挂即还原（DOM 重渲含选区高亮与镜头变换、undo 链照常——订阅重建；量测/剪贴板命令执行体随挂载重新覆写）
- **静态审计机械钉死（零共享可变模块态）**：`module-state.test.ts` 扫 src 全量非测试源（kernel+svelte 两层同守——实例隔离是库级属性）——模块顶层无可变绑定（let/var）、无模块级 runes（$state/$derived/$effect——.svelte.ts 的跨实例共享面）、无类静态字段、模块级容器常量（Map/Set/数组/对象字面量）只作只读数据表无写入点（整体重绑/索引位/属性位/变更方法四类写形全查）；kernel purity 红线同思路从「kernel 零 DOM」维扩到「实例隔离」维；审计结论=存量零命中（五容器常量 DEFAULT_KEY_BINDINGS/DEFAULT_VIEWPORT_LIMITS/RESERVED_TYPE_IDS/BUILTIN_COMMANDS/satelliteIsolation 皆只读数据表，实例态全数住工厂闭包/实例字段）
- **README 多标签集成指引章**：装配形两路成文——切换形（单面板按需挂卸+controller 无头存活切回即还原，含词表共享/按标签持久化各存各键/关标签=丢弃引用）与常驻形（同页多挂宿主显隐切换——键位只在各自画布聚焦域触发）；**边界声明**（spec Out of Scope/FR-08 原裁定重申）：标签壳（标签栏/增删标签/切换生命周期）归宿主主轨——库只供组件族与装配形，不造壳
- **边界对账**：共享同一 controller 的多 CanvasView 仍票 14 已知边界（量测/剪贴板命令执行体后挂者优先）不因本票改变——多标签正解=每标签独立 controller；绑定存档（票 14）与画布持久化（票 06）按标签各存各键归宿主
- spec 补多实例隔离契约决策行+里程碑梯子 M2 收口（09-16 全闭环）；README M2 进度行与多标签装配章；包版本 1.7.0→1.8.0
- 测试 +9（挂载缝 CanvasViewMultiInstance 5=四面互不串扰+取号独立+标签切换形全保留/重挂 undo 照常；静态审计 module-state 4=可变绑定与模块级 runes/.svelte module 块零状态/类静态字段为零/容器常量只读四写形全查）不设后门（挂载缝=真事件路/公共 API 面、module-state=静态扫描面）；`npm run check` 全绿（52 文件 456 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违（红线指标复核 0 违规、挂载缝=jsdom+真 svelte mount 第 3 缝原样、module-state 测源文本有 purity 先例+票面「机械钉死」明文背书）。判读保留三项成文（firePointer 各测试文件内联=仓内测试自含惯例；WheelEvent 派发块两测试 6 行同形=量小容忍；标签切换测试经 mountTwoCanvases 空挂 b 画布=teardown 兜底无害）。
- spec 轴：四项验收独立核实全落地（四面互不串扰/README 章/静态审计过/check 复跑 52 文件 456 测全绿）、零 scope creep（零库源改动合「本票零新库面」、README 边界与 FR-08 一致未造壳、四处文档对账无漂移）。判读必修两处采纳——模块级 runes 正则原只查 `export const`（非导出顶层 `const x = $state()` 逃逸）→放宽 `(?:export )?const` 全查；属性位写正则原抓不到嵌套深写 `NAME.a.b = x`→`(?:\\.\\w+)*` 补嵌套段。判读文案一处修正——「四面经真实事件路」对图/undo 面言过（二者入口是 controller 公共 API，合 spec 只测外部行为口径但非事件路）→CHANGELOG 措辞收窄双轨如实。
- 双轴后全套 456 测复跑全绿（返工为正则收紧+文案修正，零行为变化）。

## 1.7.0 — M2 票 15：选区工具条与标题编辑（2026-09-30）

story 24/26 全量（选区浮动工具条+双击原位改名+悬停 tooltip），双击面统一收口与 swallow 统裁随票闭环；组件族清单与 spec 对账收尾（卫星件五件+内部件四件）。

- **标题存储（票内裁定）**：自定义标题=节点 data 保留键 `fl:title`——标题住 data：写路=既有 `setNodeData` 恰一张快照可撤销、随语义半边参与 semanticHash（widget 编辑同款零新裁定）、随剪贴板载荷免费携带；空串=「清除自定义回退词表名」的持久化形（浅合并不动键集）。kernel 新增 `TITLE_DATA_KEY`/`nodeCustomTitle`（trim 后非空才算——判定用 trim 取值保原串）/`displayNodeTitle`（**显示名单源**：自定义 > 词表/保留型合成 label > typeId——节点字面/TitleEditor 初值/Tooltip 内容三方共用单源）
- **双击面统一收口（票 11 记档移交）**：placement.svelte.ts 单点分流——真空白=搜索面板（story 10 既有）、普通节点=标题编辑（story 26 本票）、占位=进入子图（票 10 既有）、边界代理=忽略、**边路径=不弹面板**（story 10 语义=双击空白——修正票 11 记档的「边路径双击照弹搜索面板」噪声，挂载缝回归钉死）；reroute 边路径双击互抵两张快照维持已知边界（双击时序进不了单事件机）
- **TitleEditor 卫星件**（导出+CanvasView 双击内部接线——NodeSearchBox 先例）：开面时刻锚定节点左上屏幕位+节点宽×缩放（编辑期镜头动不跟随——双锚同款）；Enter/失焦提交 trim 值、Escape 取消；**提交值与开面显示名同串=零写零快照、清空不存在的自定义=零写**（不为不可见变化翻动 hash 与 undo 档）；编辑器键隔离（卫星件吞冒泡——编辑中 Delete 不删节点）；编辑目标节点消亡（undo/别处 Delete）经订阅自动收场；组件只报值不裁定（提交裁定单源住 title-edit.svelte.ts）
- **SelectionToolbox 卫星件第五件**（宿主挂载——Minimap 先例，**坐标域=画布容器左上原点**：宿主 overlay 与画布几何对齐、pointer-events:none 全覆盖+工具条自身 auto 复得命中）：显隐=选区非空+选区/连线/reroute 三机手势全 idle（**「拖动中不闪现」票内裁定**：框选/拖动/连线/拖点在途即隐、终局随订阅复显；镜头手势不隐、锚随镜头实时重算）；锚=选中节点包围盒上沿中点上方 12px 居中；操作集表驱动**缺席操作隐藏**（对齐六轴 ≥2/分布两轴 ≥3——kernel no-op 阈值同源）+成组/解组（groupContainingAll 判定动态文案镜像 toggle 分岔）+删除；**删除/成组走 executeCommand 与键位同源**（票 14 原则）、对齐/分布无命令（票 13 显式无键位）直连公共面
- **Tooltip 跟随件（票内裁定）**：纯展示无事件面（pointer-events:none）——卫星隔离机制无事可做 ⇒ **内部件不出 barrel**（BreadcrumbBar/RerouteDots 先例）；内容两行=显示名（displayNodeTitle 单源）+typeId（等宽淡色）；悬停触发=画布根 pointerover 冒泡+closest 命中节点（jsdom 真事件路同构）；隐藏面=离开节点/整离画布（pointerleave）/标题编辑中/图手势在途
- **story 26「拖动见预览」对账**：M1 票 04 拖动逐帧实时位移（pointermove 每帧改图暂存、松开恰一张快照）**即预览本体——确认无补差**，spec 对账行成文
- **swallow 统裁（票 12 记档阈值兑现）**：新 `satellite.ts`（swallow+`satelliteIsolation` 展开面——七事件全吞）五卫星件共用（NodeSearchBox/PropertiesPanel/Minimap/TitleEditor/SelectionToolbox），Minimap 自有 pointer 处理器后写覆写；「卫星件自包含」立策退守「卫星件自带隔离属性」，隔离双机制契约面不变（既有卫星件隔离测试 28 测零改为对照面）；连带修正=satellite 标记属性改显式空串（spread 合并下裸属性序列化为 'true'）
- **顺势重构守 400 行红线（票 10/12/13/14 先例一脉）**：`CanvasLinks.svelte` 自 CanvasView 抽出（连线渲染内部件——曲线/端口点/中继点/预览单件，行为零改既有挂载缝 29 测为证）；`hover-tooltip.svelte.ts`/`title-edit.svelte.ts` 工具模块（placement.svelte.ts 先例）；playground `minimap-demo.js` 抽出（checklist/keybindings 先例——main.js 378 行守线）
- **子图改名/组标题（票 09/10 记档「归票 15」）票内对账不入 15 面**：占位双击=进入子图已占位无第二无冲突入口、组无 data 面（组标题需动组记录形状+序列化面）——维持已知边界，宿主可经 toUiFormat 自管或后续票再裁（Resolution 成文）
- playground：canvasHost overlay 挂 SelectionToolbox（宿主样例）+提示行（双击节点原位改名·悬停看 tooltip·选中集浮现浮动工具条）
- 测试 +24 三缝（kernel graph 3=title 键读取 trim 语义/三级回退/占位合成名委托；挂载缝 CanvasViewTitle 9=双击开面锚位与初值/改名全链恰一张快照 undo 全回/失焦提交 trim/Escape 零写零快照/未变值零写/清空=清自定义含两张快照对账+无自定义清空零写/键隔离/目标消亡自动收场/边路径双击不弹面板+真空白照弹；CanvasViewTooltip 6=显形两行与锚位/离节点与整离画布隐去/拖动在途隐松手复显/自定义标题随动+编辑期隐藏/未注册回退 typeId/悬停节点消亡不炸；SelectionToolbox 6=显隐与缺席隐藏三档/锚位手算+镜头随动/拖动在途隐松手复显/对齐操作链恰一张快照/删除操作链命令同源收隐/成组解组动态文案+偷员路）经真实事件路不设后门；spec 补选区工具条与标题编辑契约决策行+组件族清单对账（卫星件五件+内部件四件）+里程碑梯子 M2 进度；README M2 进度行与三件用法；包版本 1.6.0→1.7.0；`npm run check` 全绿（50 文件 447 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违。判读采纳两处——SelectionToolbox 成组/删除按钮 title 字面量内联 ops derived 体内→提模块常量与操作表同区（§3.3 文案集中口径统一）；`placement.linkWorldOf` 与 `dispatch-loop.machineWorld` 同形手搓（注释自认「同形」）→两处补 `LinkWorld` 类型标注（「同形」由注释约定升为类型契约，漂移即编译红）。判读保留三项成文（nodeLabel 单行命名转发=模板语义名可读性优于三参直调、minimap-demo 跨文件按钮契约=注释已声明的 demo 内聚、测试三缝各建 Mounted/step=仓内 15 处缝自足惯例）。
- spec 轴：五项验收独立核实全落地（缺席隐藏三档/恰一张快照对账/手势相交语义/组件族清单对账/挂载缝 24 测+check 独立复跑 50 文件 447 测全绿）；「拖动见预览」对账成文、票 11 边路径收口与票 12 swallow 统裁兑现。两笔记档——标题编辑器与选区工具条同屏票内裁定**同屏不互斥**（几何不叠+blur 序无碍，已知边界成文）；词表 label 空串不回退 typeId（注册期声明是宿主显式意图，与标题 trim 判定不对称是有意的）。子图改名/组标题（票 09/10 移交项）拒收成文悬置。
- 双轴后全套 447 测全绿（返工为常量提取+类型标注+文档记档，零行为变化）。

## 1.6.0 — M2 票 14：命令注册制快捷键（2026-09-30）

story 27/28 全量（命令与绑定分离+画布聚焦作用域），命令注册制契约立起（kernel 命令表/绑定表数据面+门面命令面+渲染层聚焦匹配接线；M1 直连键位收编迁移行为零改）。

- **kernel 命令表+绑定表**：新模块 `commands.ts`（纯数据面+查询改写纯函数，纯度随 purity 目录扫描自动覆盖）——`CommandRecord`（id+label+可执行闭包，**内核只存不调**——执行归门面面）/`KeyCombo`（单键 e.key 小写域+三修饰位，ctrl 位=Ctrl/Cmd 合并主修饰——跨平台同键位，ComfyUI KeyCombo 同构）/`KeyBinding`（组合键→命令 id+作用域）；`createCommandTable`（同 id 覆写/同组合键覆写=换键单点/精确匹配修饰位逐位比对/查询返回条目级拷贝防渗入）；`keyComboFrom`（内核事件域→组合键域单点——渲染层归一后经此入域）；`DEFAULT_KEY_BINDINGS` 十键（Delete/Escape/Ctrl+C·V/Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y/F/Ctrl+G/Ctrl+Shift+E）
- **绑定存档形（票内裁定）**：**独立键版本化文档不入 UI 格式**——绑定是应用级用户偏好非画布文档（混入会绑死文档与偏好且多画布实例互相污染）；`serializeKeyBindings`/`parseKeyBindings`（version 1）介质/时机归宿主（票 06 同款口径）；复原不设信（坏形状条目丢弃——含修饰位类型坏整条丢防静默错绑、整档坏 undefined 回退默认表）
- **门面命令面**：`controller.commands`（新 `command-actions.ts`——LayoutCommands host 注入先例同款）——内建九命令注册在册（undo/redo/copy/paste/delete-selection/cancel-gesture/fit-view/group-toggle/convert-subgraph；`BUILTIN_COMMANDS` 常量面）；`registerCommand`（同 id 覆写=宿主覆写内建不碰库码）/`setRunner`（只换执行体，未知 id fail-loud）/`executeCommand`（工具条按钮与键位同源）/`bind`·`unbind`·`match`·`bindings`；**Delete/Escape=机内别名重派发**（执行体重派发同一内核 key-down 事件——交互机仍是语义单源，解绑后回落机内原语义而非禁用）；量测/系统桥类执行体（fit-view/copy·paste）无头缺省 no-op 占位、CanvasView 挂载时 setRunner 覆写（fit-view 量根尺寸、copy/paste 桥系统剪贴板——票 05 回退语义原样）；绑定可先于命令注册（恢复存档次序自由）
- **渲染层接线**：新 `keybindings.ts`——DOM 键事件→`normalizeModifiers`+kernel `keyComboFrom` 单点入组合键域→`controller.commands.match`（**绑定表事件时取值恒新鲜**——宿主改键即时生效无需订阅重渲，placement getter 先例）；**作用域=画布容器聚焦**：处理器只挂画布根，事件起自画布域内才匹配（画布失焦/宿主别处键到不了=不触发、不劫持宿主全局键——未命中组合键不 preventDefault 不拦宿主监听）；命中即消费（preventDefault+executeCommand）、**key repeat 只消费不执行**（票 09/10 防抖口径统一收编）；未命中照常落归一化派发管线（交互机语义原样）
- **M1/M2 直连键位收编（行为零改——既有挂载缝 31 测即对照面全绿）**：`group-key.ts`/`subgraph-key.ts` 删除（票 09/10 接线记档移交本票）、`clipboard.ts` 的 `handleClipboardKey` 退役（`copyToSystemClipboard`/`pasteFromSystemClipboard` 转为命令执行体导出）；CanvasView.onKeyDown 三路直连检查收编为单一 `handleCommandKey`
- **新增默认键位（票内裁定：story 27「自定义」前提是有默认可换）**：Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y 撤销重做、F 适配全图——此前这些键无键位（M1 无、票 13 显式无）；Ctrl+0 复位视口为 playground 宿主自定义命令样例（非库内建）
- playground：工具条撤销/重做/适配/复位按钮经 `executeCommand` 同源化；新 `keybindings-demo.js` 演示行（宿主自定义命令注册+绑定/撤销键 Ctrl+Z⇄Ctrl+Alt+Z 换绑/绑定实查显示）+提示行更新
- 测试 +35 三缝（kernel `commands.test.ts` 19=注册覆写/绑定改写精确匹配/多键同令/组合键归一 it.each/默认表/存档往返与不设信含修饰位类型坏丢条目/条目级防渗入；controller `controller-commands.test.ts` 10=内建九命令/Delete·Escape 机内别名真事件路/无头剪贴板内存路/fit-view 占位/宿主注册换键存档/setRunner fail-loud/绑定先于注册；挂载缝 `CanvasViewCommands.test.ts` 7=Ctrl+Z·Ctrl+Shift+Z 端到端含 Cmd 主修饰与大写 shift 形/**聚焦作用域（画布外键不触发+未命中键不拦宿主全局监听）**/换键即时生效/自定义命令绑定/repeat 只消费/未绑定 Delete 变体回落机内/F 适配量根尺寸）经真实事件路不设后门；spec 补命令注册制契约决策行+里程碑梯子 M2 进度；README M2 进度行与命令注册制用法；包版本 1.5.0→1.6.0；`npm run check` 全绿（46 文件 423 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；判读必修三处采纳——`unbind`/`match` 内联模板串与 `comboKey` 重复→复用单点；渲染层 `comboFromKeyboardEvent` 自写小写化+主修饰合并与 kernel `keyComboFrom` 两处成文→渲染层归一后经 kernel 单点入域（兑现「单点」注释）；查询拷贝注释承诺条目级防渗入→`all()`/`bindings()` 返回条目拷贝+测试补钉。判读保留三项成文（`{key,ctrl,alt,shift}` 字面全拼=显式数据表与测试自含惯例；playground 提示漏 Ctrl+Y→已补；controller.ts 393 行逼近 400——下票扩面先抽模块记档）。
- spec 轴：四项验收逐条核对①②③落、④裁定成文（独立键存档+票 Resolution）；一枚必修=首轮 code_limits 漏检 `reviveBinding` 圈复杂度 11>10→抽 `validFlags` 判据归零后全绿；「默认键位超 M1 收编字面」裁定非 scope creep（票 09/10 键位接线显式记档归票 14 统一+story 27 自定义前提是有默认可换——Resolution 成文）；聚焦作用域测试口径成文（jsdom 无真实焦点语义——钉「事件起自画布域外不触发+未命中不拦宿主监听」，真实浏览器中键事件目标=聚焦元素，画布外聚焦即天然到不了画布根处理器）。

## 1.5.0 — M2 票 13：对齐分布与自动排布（2026-09-30）

story 25 全量（六轴对齐/等间隙分布/分层自动排布整图·选区·分组域），排布契约立起（kernel 排布数学纯函数+命令式两路公共面+组框重适配收口）。

- **kernel 排布数学**：新模块 `layout.ts`（零 DOM/零词表依赖——只吃节点几何与边结构，纯度随 purity 目录扫描自动覆盖）——`alignNodes` 六轴（目标坐标计算表 `ALIGN_TARGET` 单实现数据面）/`distributeNodes` 两轴/`autoLayoutNodes` 分层；批量位移助手=`graph.ts` 新 `moveNodesTo`（绝对坐标批量落位单趟 map、no-op 同引用——排布命令共用的「moveNodes 批量助手」面）
- **对齐语义（票内裁定）**：选区包围盒基准六轴（left/center-x/right/top/center-y/bottom——Figma 同构），另一轴原样；<2 节点数学恒等同引用；子集包围盒只含选中节点（测试钉死）
- **分布语义（票内裁定）**：等间隙=相邻节点**边到边**间隙相等（内部宽和不含末节点宽——等间隙闭合公式手算钉死），按当前边排序、首末两端不动、次序保持；<3 节点 no-op；重叠（负间隙）仍按等间隙重排不设特判
- **自动排布选型（票内裁定）**：分层（Sugiyama 简化版，自上而下）——DFS 破环（迭代实现不烧调用栈；回边不约束分层，环图/自环不炸）+最长路径分层（Kahn 迭代）+层内重心两轮扫描减交叉（平局稳定保原序）+层内左起打包（GAP_X=60）窄行居中（层步进 GAP_Y=80）+**整结果锚定原域包围盒左上**（不甩图到原点）；词表无关（typeId 不看）
- **排布域三路=公共面两方法（票内裁定）**：`autoLayout()`（整图=当前容器全量）/`autoLayoutSelection()`（选区——**分组域=点组框选全体成员后走选区路**，票 09 组框点击即成员全选语义已通，不设第三方法）；选区排布跨界边不参与（域外端点不抬升域内层）
- **快照/选区语义（票内裁定）**：命令式动作（剪贴板同款口径不进内核输入契约）恰一张快照（no-op 同引用零快照零订阅）；排布只动 x/y ⇒ **选区不丢**（undo 后仍在——id 恒活）；semanticHash 恒不变（双格式红线——排布是纯布局关注点）；组框收口=涉及组重适配（有成员实际位移的组 fit-to-contents——复用票 09 公共面，排布后组框恒贴合内容）
- **门面重构（顺势守 400 行红线）**：排布命令面抽 `layout-actions.ts`（LayoutCommands 宿主回调注入——dispatch-loop/subgraph-navigation 先例）；controller 顺势抽 `placement.ts`（票 02/03 落位两路搬出，行为零改全量回归绿为证）
- playground：排布工具条第二行（对齐六轴+分布两轴+自动排布/排布选区，表驱动挂按钮——宿主直连样例）+提示行；SelectionToolbox 归票 15 不互为阻塞、无键位（命令注册制归票 14）
- 测试 +32 三缝（kernel `layout.test.ts` 22=六轴手算 it.each/变宽折算/子集包围盒/等间隙手算含重叠负间隙/链·菱形·环·自环分层手算/选区排布跨界边/组框重适配/hash 红线/边与中继点结构面原样；controller 6=真事件路选区/恰一张快照一次 undo 全回/选区不丢含 undo 后/no-op 零订阅/整图·选区排布/组框重适配经门面；挂载缝 CanvasViewLayout 4=对齐 DOM 随动+选中态保持+undo 反映 DOM/分布随动/自动排布分层随动+组框 DOM 重适配/选区排布域外不动）经真实事件路不设后门；spec 补排布契约决策行+里程碑梯子 M2 进度；README M2 进度行与排布用法；包版本 1.4.0→1.5.0；`npm run check` 全绿（44 文件 388 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；判读必修一处采纳——`applyMoves` 不可达防御分支（三调用方 targets 只收实动节点）→删。判读保留三项成文（测试工厂三缝各建=缝自足既有惯例；host 注入 view+mutate 结伴=dispatch-loop 先例；controller 委托无注释=文档单源 controller-types.ts）。
- spec 轴：四项验收逐条核对①②③落、④**一枚必修**——首轮自查漏跑 lint：`alignNodes` 六轴 switch 圈复杂度 11>10（eslint 红线）→折 `ALIGN_TARGET` 表驱动后全绿；scope creep 无（placement 抽取有票内裁定背书、逐行等价搬家）。

## 1.4.0 — M2 票 12：minimap 缩略导航（2026-09-30）

story 23 全量（缩略渲染+视口矩形随动+点击/拖动导航），卫星组件第四件照票 02 模式落地，minimap 契约立起（投影域并集+命令式视口导航不入 undo+手势期投影冻结）。

- **投影与渲染**：渲染层纯函数 `minimap-model.ts`（link-render 先例同形）——投影域=graphBounds(容器节点) ∪ 相机可视域（内容与镜头恒同框，点远角跳转后矩形仍可见）等比 contain 适配；密度票内定=节点占位矩形（映射后 ≥2px 远距不隐身）+连线中心直线段（无贝塞尔/端口/中继点）+视口矩形（选区色描边+淡填充）；数据面=当前容器视图（getState——进子图随动换内容零特判）
- **导航（镜头不入 undo）**：命令式视口写 `controller.setViewport`（票 01 公共面，playground 复位按钮同款）——按下即定心（点击=跳转）、拖动持续定心（跟随）、松开/取消终局、右键不导航；定心数学=kernel 新纯函数 `centerViewportOn`（fitView 亦经此复用单一定心式）；**不进内核输入契约**（卫星件不合成伪画布事件——无后门口径）；导航零快照（挂载缝测试钉死 undo/redo 均无处可回）
- **手势期投影冻结（票内裁定）**：投影域含相机可视域，重定心会移动域→映射随指针发散漂移（测试首轮实测钉死）——手势期间地图面（投影/节点/连线）冻结在按下时刻（拖动零漂移），视口矩形仍随实时相机走冻结投影（拖动跟随可见），松手整面重投影（域重并集，测试钉「矩形回框」）
- **卫星件四件套**：属性式 stopPropagation 全套+`data-fl-satellite` 根标记（画布 wheel 守卫按标记跳过）、token 化 `--fl-minimap*`（颜色/边框/圆角）、无壳（无定位——宿主 overlay 自定）、共享同一 controller；尺寸=`width/height` props（缺省 200×140，几何与投影同数值域单源）；画布尺寸经必填 `viewportSize` 读取器 prop 注入（controller 无头零 DOM——测量归宿主，事件时取值恒新鲜）；可开关=宿主挂载/卸载（库不供开关 UI）
- playground：工具条「小地图：开/关」按钮（宿主可开关样例）+画布右下 overlay 挂载+提示行；顺势重构=M1 演练清单抽出 `checklist-demo.js` 守 400 行红线（行为零改）
- 测试 +18 三缝（kernel viewport +3=定心不变量/手算样例/纯函数；minimap-model 7=投影域并集/等比 contain 手算/空图/最小尺寸钳制/逆映射往返/缺端点防御/自定义尺寸；挂载缝 Minimap 8=缩略渲染/矩形随动/点击跳转/拖动跟随含冻结投影与松手重投影/不入 undo 对账/右键不导航/空图不炸/事件自吞隔离）经真实事件路不设后门；spec 补 minimap 契约决策行+里程碑梯子 M2 进度；README M2 进度行与 minimap 用法；包版本 1.3.0→1.4.0；`npm run check` 全绿（41 文件 356 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；判读必修三处采纳——fitView 定心式与 centerViewportOn 两处成文→fitView 复用单一定心式；`MiniSize` 一名两域（画布/缩略盒）→归 kernel `Size` 单型；playground 按钮引用防护不一致→hoist 单引用。判读保留三项成文（`swallow` 三卫星件重复=票 02「卫星件自包含」立策覆盖基线，第三份阈值已到、票 15 加卫星件时统裁提取；测试 `wiredGraph` 票内两份=测试自含惯例；`MINIMAP_MARGIN_PX` 降模块私有）。
- spec 轴：四项验收全落地零缺失；checklist 抽出=规约驱动（400 行红线）非 scope creep；票面「缩略渲染全图」裁定为「当前容器视图全量」（story 23 原文「导航大图」+fitView 同口径，Resolution 记档）；已知边界两笔成文（宿主 resize 不随动——下次交互即对；冻结期矩形可越盒被裁剪——松手回框）。

## 1.3.0 — M2 票 11：reroute 链（2026-09-30）

story 22 全量（拖出中继点/拖点整理长连线/链上增删点），reroute 契约立起（中继点=视觉路径关注点住布局半边+第四交互机+采样贝塞尔命中）。

- **kernel 数据面**：`CanvasEdge.reroutes?` 图坐标有序点列（内存合并态住边上——删边/删端点节点随边级联免费，无独立存储面即无孤儿面）；`reroute.ts` 数据操作族 insertReroute/moveReroute/removeReroute（序越界/边缺失/同值=同引用 no-op；末点摘除即散——reroutes 键落回 undefined）
- **第四交互机**：`reduceRerouteEvent`（视口/连线/选区姊妹机）——边路径按压（非节点/端口）=原位插点并抓起（点击留点）、中继点按压=抓起（无位移松开=点击删点）、移动逐帧改点；终局恰一张快照（松开/Escape 有变才 commit——手势级快照粒度照票 04）；派发链 reroute→link→selection（reroute 先喂自持消费、按压自查让位节点/端口——连线语义零改；组框内边带让渡给插点=票内裁定，框内非边带组抓取仍可达，既有测试全绿为证）
- **几何与命中**：分段曲线=waypoints（from 锚点+中继点+to 锚点）逐段端口锚定贝塞尔（水平切线——中继点两侧同切线链上平滑）；`hitTestEdgePath` 采样贝塞尔（屏幕域折线近似，每段 12 采样）跟曲线不跟弦线（t=0.25 处弦点距曲线 12px>8px 容差=落空、曲线点命中，测试钉死）；`hitTestReroutePoint` 点热区 8px 同端口档；`portAnchor` 自渲染层收编 kernel hittest 单源（连线渲染与命中测试共用）
- **双格式红线对账（票内裁定）**：中继点全量住 UI 格式**布局半边**（`layout.reroutes` 可选键 v1 加法不升版本、旧档无键读空；键=边 id 全局唯一扁平含子图容器内边）；语义半边投影剥除（宿主私带 reroutes 复原即剥）；**semanticHash 恒不含 reroute**（插点/拖点/删点不扰动 revision，边投影五字段+红线测试双钉）；档复原不设信（坏形状点/空表丢弃、孤儿键自然消亡）；**剪贴板不携**（载荷边结构本就只有 from/to）；子图交叠=无跨界存储边 ⇒ 中继点恒与边同容器、转换随边迁（票 10 对账）
- **controller**：`getRerouteState()` 机态镜像（渲染层拖点高亮随动）；dispatch-loop 织入第四机（通知去抖含 reroute 态）
- **渲染层**：既有边分段渲染 `edgePathD`（waypoints 逐段拼串，无中继点形与旧串逐字节同——既有渲染测试零改全绿）；中继点 dots（`data-fl-reroute=边id:序` 标识、token 化样式 `--fl-reroute*`、拖拽高亮 `.fl-reroute-active` 随机态；命中判定在内核坐标面 dots 不吞事件）；指针捕获条件增 reroute 手势
- playground：演示图 e2 预置中继点直见分段形+提示行「点连线加中继点·拖点整理长连线·点中继点删点」
- 测试 +34 三缝（kernel reroute 15=数据操作不变量/级联随边/waypoints 几何含未注册回退/点热区缩放折算/路径命中跟曲线不跟弦线/插入序/手势全迁移表含 Escape 分岔·组框带裁定·中途删边不炸 + reroute-serialize 7=往返与布局半边投宿/子图内边随迁/旧档兼容/复原不设信/hash 红线双钉/剪贴板；controller-reroute 6=拖出恰一张快照/点击删点复原/Escape 有变才 commit/分流隔离（边路径不落框选·节点端口不落 reroute）/订阅去抖/端到端 hash 红线；挂载缝 CanvasViewReroute 6=分段路径与 dots 渲染/拖出拖动删点全链真事件路/点击留点不落框选/端口按压零扰动）经真实事件路不设后门；spec 补 reroute 契约决策行+里程碑梯子 M2 进度；README M2 进度行与 reroute 用法；包版本 1.2.0→1.3.0；`npm run check` 全绿（39 文件 338 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；判读必修三处——dispatch-loop 连线机/reroute 机喂机 world 字面量重复 → `machineWorld(view)` 单点；reroute.ts 末点摘除投影形与 serialize.semanticEdge 同形 → 升公共导出单源共用；types.ts Point 导入错位 → 移文件头。判读保留四项（PortWorld 三处拼装=测试自含惯例+render 侧形不可共用/常量各模块重声明=既有惯例/hittest 显式视口首参=模块族签名约定/link-render portAnchor 薄委托=测试 API 兼容注明）。
- spec 轴：四项验收全落地零 scope creep；**一枚必修判读——组框带窄缝**（Resolution「选区语义零改」与实现不符）：票内裁定保 reroute 优先（内边是主战场）而非补组框让位——spec/票 Resolution/本文件三处文案修正+kernel 组框带双边测试钉死（+1 至 338）；边路径双击互抵噪声记已知边界（票 15 双击面收口）。

## 1.2.0 — M2 票 10：子图（2026-09-30）

M2 最大结构票：story 21 全量（Ctrl+Shift+E 转换/进入退出/面包屑+导航栈回溯/子图视口 LRU），图模型嵌套化=语义图结构变更——serialize/semanticHash/clipboard/hittest/交互机全链对账，子图契约立起（嵌套容器+全局 id+边界口代理配对+导航=视口域不入 undo）。

- **kernel 数据模型**：`CanvasGraphState.subgraphs` 第四键=嵌套容器全深度扁平收纳（记录 id=其占位节点 id——占位=父容器内保留型 `fl:subgraph` 普通节点）；记录=容器局部三集+边界口两表；**id 空间全局唯一**（节点/边跨容器同命名空间，ComfyUI 同构）；**无跨界存储边**——跨界连接=两条容器局部边经「占位端口↔代理节点」配对表达（代理=`fl:subgraph-input/output` 自描述：typeId 定侧、data.portId 定口）。模块三拆守文件行数红线：`subgraph.ts`（转换 weaveBoundary 单实现+容器读写 containerViewAt/withContainer+导航钳定）、`subgraph-ports.ts`（保留型判定+effectiveNodeDef 端口合成+全局 id 集）、`subgraph-prune.ts`（删占位/删代理级联——命令路/手势帧/档复原三路同走，宿主数据不设信）
- **转换**：边界边按外侧口（入）/内侧口（出）去重合并扇出（同源多目标=一口，ComfyUI 同构）、重挂边全取新号；组员 ⊆ 选中集的组随迁入子图（跨选中集留父修剪——票 09 转换路对账裁定：组转子图不设合并入口）；占位落成员包围盒左上、高度随口数生长；恰一张快照可撤销、转换后选区=占位、取号惰性（拒绝路不烧号）
- **双格式红线对账**：子图=执行语义——序列化住语义半边（`semantic.subgraphs` 可选键 v1 内加法不升版本、旧档无键读空；内节点布局扁平住 layout.nodes、内组住 `layout.subgraphs`）；**semanticHash 含子图**（转换/内容变→变；子图内布局/组操作/导航→恒不变，红线测试钉死）；孤儿记录/死口复原丢弃不设信、未知版本仍 fail-loud（票 06 口径）；**剪贴板不携子图**（保留型滤除——票 09 组同款）
- **controller 导航（视口域不入 undo）**：根态+容器视图双面（三交互机吃视图零改、快照/序列化持根态；容器写回收口单点=withContainer→双 prune→路径钳制→视图重取）；公共面 `convertSelectionToSubgraph/enterSubgraph/exitSubgraph/navigateTo/navigateBack/getNavPath/getBreadcrumb`；**子图视口 LRU 记忆**（kernel viewport-memory：离开 remember、进入 recall（LRU touch）、无记忆且给容器尺寸 fit 兜底）；undo 后路径钳制回最长可存活前缀。门面重构守 400 行红线（票 07/09 顺势抽取先例）：`controller-types.ts`（公共接口声明面）、`dispatch-loop.ts`（三机派发织入搬家）、`subgraph-navigation.ts`（导航状态面）
- **渲染层**：`BreadcrumbBar.svelte` 内部件（面包屑点击 navigateTo 前缀、pointerdown 自吞防误起画布手势）；保留型节点 token 化样式+显示名单源 effectiveNodeDef（占位=子图名、代理=子图入口/出口）；双击占位进入（placement 织入，普通节点双击仍留票 15）；`subgraph-key.ts` 接 Ctrl/Cmd+Shift+E（group-key 镜像、repeat 只消费不执行）；端口几何单源 portPositions 增保留型合成（hittest/连线机/link-render 同源）
- playground：工具条「转为子图 (Ctrl+Shift+E)」「退出子图」按钮（宿主接线样例）+提示行
- 测试 +48 三缝（kernel 28=subgraph 17 转换不变量/边界配对/组随迁/嵌套/级联+subgraph-serialize 8 序列化往返/旧档/hash 红线/剪贴板+viewport-memory 3；controller-subgraph 14=恰一张快照/级联/导航零快照/面包屑回溯/回溯栈死项弃置/LRU/undo 钳制/id 全局/占位口真事件路连线；挂载缝 CanvasViewSubgraph 6=Ctrl+Shift+E 端到端/双击进入/面包屑回根/滚轮 LRU 复原/子图内 Delete）；spec 补子图契约决策行+双格式条目扩+组件族补内部件+里程碑梯子 M2 进度；README M2 进度行与子图用法；包版本 1.1.0→1.2.0；`npm run check` 全绿（35 文件 304 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；判读收口四处——级联组合三处手写重复 → kernel `pruneSubgraphCascades` 单收口；binPortIdOf/binProxyOf 同形对 → `binOf` 单查找；nodesBounding 与 group.ts 同形 → 升 geometry.ts 公共单一几何源；CanvasView 死防御 `?? []` → controller 构造 subgraphs 缺省归一。判读保留：测试夹具自含（仓惯例）。
- spec 轴：五项验收全落地零缺失零 scope creep；**一枚实测复现必修**——`navigateBack()` 对 undo 消灭子图的死栈项直接 apply 抛错 → back() 弹出目标先钳制、与现路径重合即丢弃续弹（回溯永不抛），回归测试钉死（+1 至 304）。

## 1.1.0 — M2 票 09：分组 group（2026-09-30）

M2 长尾全档第一票：story 20 全量（选中集 Ctrl+G 成组/解组/组框适配内容），分组契约立起（组=图状态第三键+组语义全量住 kernel+双格式红线对账）。

- **kernel**：`CanvasGraphState.groups` 第三键（组记录=成员集+组框几何，成员籍互斥、memberIds 恒 ⊆ 节点集）；`group.ts` 纯函数族（成组/解组/适配/toggle 分岔判定/命令图效果 toggleGroup+fitSelectedGroupsToContents/取号 nextGroupSeq——组框=成员包围盒+GROUP_PADDING，ComfyUI resizeTo(children,padding) 同构）；graph.ts 组面不变量（moveNodes 拖动集 ⊇ 组全成员→组框刚性平移；removeNodes 级联修剪、组随末成员消亡——`withoutMembers` 删员/偷员单实现）；hittest 增 `hitTestGroup`（节点优先、数组后者在上）；选区机增 `downOnGroup`（点组框=成员全选+起拖复用票 04 拖动路；Ctrl 点组框=并集）
- **双格式分离红线对账（票内裁定）**：组全量住 UI 格式**布局半边**（`layout.groups` 可选键——v1 内加法不升版本，旧档无键读空组；memberIds 过滤实存节点、组空即丢=宿主数据不设信）；**semanticHash 恒不含组**（成组/解组/组框几何变/整组拖动 hash 不变——测试机械钉死），revision 判定不被分组组织污染
- **controller**：`toggleGroupSelection()`（Ctrl+G 图效果公共面——选中集 ⊆ 某组=解组整组，否则非空成组偷员；空选区 no-op 零快照）+`fitGroupsToContents()`（选中集涉及的组重算组框；全贴合/无涉及=零快照）；各恰一张快照可撤销；票内顺势重构=id 三源（节点 fl-/边 fle-/组 flg-）收编 `ids.ts` 单模块（controller 393 行守 400 红线）
- **渲染层**：组框 token 化（`--fl-group-bg/--fl-group-border`+缺省，选中态复用 `--fl-selection`；层级在边/节点之下；`pointer-events:none` 命中判定在内核坐标面——卫星隔离不破）；`group-key.ts` 接 Ctrl/Cmd+G 进 CanvasView 键管线（镜像 clipboard.ts；key repeat 只消费不执行防 toggle 抖动；键位注册制归票 14）
- **剪贴板不携组**（票 05 契约面不动）：成组选集粘贴落无组新节点，组载荷留后续票裁定
- playground：工具条增「成组/解组 (Ctrl+G)」「组框适配」按钮（宿主接线样例）+提示行
- 测试 +32（kernel group 19=组操作不变量/级联/重叠命中/序列化往返与旧档兼容/红线 hash 不变/命令图效果/机组交互真事件路；controller-group 7；挂载缝 CanvasViewGroup 6=组框渲染几何层级选中态/Ctrl+G 端到端含 repeat 防抖/整组拖动 undo 一次全回/Delete 级联）；spec 补分组契约决策行+双格式条目补组+里程碑梯子 M2 进度；README M2 进度行与分组用法；包版本 1.0.0→1.1.0；`npm run check` 全绿（30 文件 256 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；两枚判读必修——graph.ts `pruneGroups` 与 group.ts `stealMembers` 16 行同形（Duplicated Code）→ `withoutMembers` 单实现住 graph.ts 两处消费；解组路先烧一个组号 → `toggleGroup` 取号改惰性回调（pasteClipboard 先例同形）。判读成文：README 公共面补记/spec 双格式条目补组行（随本票文档面收口）
- spec 轴：五项验收全落地零缺失零 scope creep（ids.ts 收编=顺势重构判读保留，Resolution 记一笔）；两枚票面授权裁定 Resolution 明示（选中集 ⊆ 某组即解组**整组**；Ctrl 点组框=纯并集，不对称于点节点的逐员 toggle——组框是整组手柄）

## 成仓落地（2026-09-30，库面零改动不发版）

自孵化母仓迁出独立成仓：`git subtree split` 保完整提交历史（M0 随票 01 入库的八票全史）；工具链自带化——自带 package.json scripts（typecheck/lint/format/test/check:rules/check/play/play:build）+devDeps、tsconfig/eslint（含 max-lines-marked 文件级闸门移植）/prettier/vitest 配置、tools/check/code_limits.mjs 规约红线检查随迁（扫描面改本仓 src/tools/playground/fixtures）；孵化期宿主接线（宿主根 tsconfig include/eslint globals 块/code_limits 扫描面/code_doc_reconcile 豁免/flowloom:play 脚本）随迁出清除。遗留归 owner：GitHub 远端建仓推送、npm publish（`private: true` 现挡意外发布）。

## 1.0.0 — M1 收口与成仓演练（2026-09-30）

M1 必备面里程碑版：八项能力（搜索落点/拖拽连线/框选多选拖动/复制粘贴/快照 undo-redo/缩放平移+FitView/视口持久化/属性面板）全量落地，七策略立起（事件归一化管线/手势级快照粒度/卫星件模式/连线交互机/版本化剪贴板契约/持久化宿主介质契约/widget 供件契约）。库面零代码改动——本版全部收口面在 demo/文档/票册/夹具。

- **playground 单场景贯通八项必备能力**：「M1 演练清单」面板逐项自动点亮（落位/端口连线/框选拖动/复制粘贴/撤销重做/缩放平移/存取恢复/属性编辑——宿主侧探测：命令路包装 controller 方法（确产效果才点亮）+观察路 subscribe（边集增长=连线、既有节点位移=拖动、视口引用变更=镜头）+启动复原即点亮存取；库面零改动）；工具条增「撤销/重做」按钮——undo/redo 键位归宿主（M1 无默认键位，M2 命令注册制统一），playground 即宿主接线样例；README 增 undo/redo 用法行
- **README/spec 与实现核对无漂移**：里程碑梯子 M1 收口态+M2 票册 09-16（spec/README 双面）；README 能力清单逐票对账、卫星组件注释去未落地面（Minimap 标注 M2 增补/Toolbar 删）、发布说明从「M0 现状」更新至 1.0.0、包结构树补 fixtures/；用法示例全部导出符号逐一核对在册
- **M2 票细拆落票册**（docs/tickets/ 09-16）：09 分组 group、10 子图（bb 09）、11 reroute 链、12 minimap、13 对齐分布与自动排布、14 命令注册制快捷键、15 选区工具条与标题编辑、16 多开标签配套——对齐 spec Out of Scope（多标签壳归宿主等边界逐票重申）与里程碑梯子，阻塞边成图（08→全体、09→10）
- **成仓检查单过**：目录自包含（包元数据/exports 三入口/peerDeps 仅 svelte）/无母仓依赖残留三面核查（import 面无逃逸无宿主标识+kernel 纯度测试钉死；globals 面零宿主全局、覆写块随迁路线成文；脚本面仓根命令等价映射表——成仓落 flowloom 自带 scripts）/许可与文档齐（LICENSE MIT+README+CHANGELOG+spec+票册随迁）；建仓执行归 owner，发布管线与工具链自带化留成仓执行（spec Out of Scope 已裁）
- **WidgetFixture 测试夹具出 src**（票 07 预留本票收口）：src/svelte→fixtures/（npm files 面净——files=src+文档不含夹具），测试 import/tsconfig include 同步
- 包版本 0.8.0→1.0.0；`npm run check` 全绿（56 文件 442 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：一处必修——演练清单探测 id 失配（CHECKLIST 项 id 与 spy 以**方法名**入账两套字符串契约无单一事实源：落位/复制粘贴/撤销重做三项永不点亮、进度读数把孤儿条目计入虚高）→ `COMMAND_PROBES` 表驱动收口（[清单 id, 方法名] 同表单源，六处同形 spy 调用收敛一循环，谓词参数同步内联——Speculative Generality/Duplicated Code 同刀）；门面实例方法包装=宿主侧探测已注释声明，demo 面判读保留（先于 mount 装配，CanvasView/PropertiesPanel 实例方法查找经包装生效——spec 轴复核确认无序问题）
- spec 轴：六项验收全落地零缺失；两枚收口——票 15 补 story 26「拖动见预览」对账行（M1 票 04 逐帧实时位移即预览形，对账确认或补差票内定——M2 票册对 story 26 补齐全覆盖）；演练清单两条演示面探测边界披露进票 08 已知边界（含边选区粘贴点亮连线项/undo 复位拖动前布局点亮框选拖动项）。判读保留：WidgetFixture 迁移=票 07 预留的合理延伸非 scope creep（服务「npm files 面净」验收项）；票 10 Blocked by 单列直连阻塞 09=沿票 07 先例（08 经 09 传递可达，DAG 语义等价）

## 0.8.0 — M1 票 07：属性面板供件（2026-09-30）

- **kernel**：`WidgetDef` 词表项 widget 描述（`NodeTypeDef.widgets?`——参数名/控件型/标签/枚举选项/数字约束，纯声明数据；kernel 不解释只搬运，schema 无关红线不破）；graph.ts 增 `updateNodeData`（浅合并写 data 单实现——未知节点/空 patch 同引用 no-op，不可变值语义）
- **controller**：`setNodeData(nodeId, patch)` widget 编辑回写门面路——恰一张快照可撤销；拒绝面 no-op 零快照（未知节点/空 patch 同引用短路）
- **PropertiesPanel 无壳供件卫星组件（票 02 模式第三件）**：不带容器壳（无定位/边框/背景——面板容器归宿主壳 FR-08 已裁，宿主嵌自有面板槽）；当前编辑对象=选中集恰一节点（票 04，空选/多选出提示不炸）；控件按词表 widget 描述渲染——覆盖顺序单点：`widgetComponents` 注册位（词表项 kind 指名，可同 kind 覆盖内建件；自定义组件 props 契约 `WidgetComponentProps`=value/def/onCommit）>内建通用五型（text/number/boolean/enum/textarea，模板分发链即词表单点）>未注册 kind 回退只读 JSON（未注册 typeId/词表项无 widgets 回退只读 data JSON——均不炸）
- **提交粒度=命令式**（票内定，spec 决策行补记）：控件「值已定」的 change 一次提交恰一张快照——文本/数字失焦或 Enter、布尔/枚举即点即提交、长文本失焦提交（Enter 是插行非提交）；控件本地键入态不进 undo（面板 {#key 节点 id} 重建控件防串对象）；卫星隔离双机制照票 02（事件自吞+data-fl-satellite——输入框内 Delete 不删节点）
- **拒绝面=环境数据不设信**：number 空串/非有限数不写不炸且回显现值、按 min/max 钳制；enum 提交面=options 值域（离群现值 select 空显不炸、值域外变更不写零快照）；样式 token 全「var+缺省」宿主可定制（复用 --fl-panel-*/--fl-fg 系）
- playground：右侧属性面板（宿主壳样例内嵌供件）——选中节点编辑参数，step 词表携五型 widget+未注册 'color' kind 现场演示只读 JSON 回退；提示补「选中节点右侧编辑参数」
- 测试 +17（kernel 1/controller 5/挂载缝 11——回写全链 undo DOM 随动 redo 复原/number 钳制与拒绝/切换对象键入态不串/注册位覆盖含覆盖内建/只读回退双路/无壳机械信号/enum 值域/事件自吞）；`npm run check` 全绿（56 文件 442 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；三枚判读收口——`BUILTIN_WIDGET_KINDS` 第二份词表罗列删除（模板分发链即内建词表单点，加型只动一处）；`customFor(w)` 双调用+`!` 非空断言收敛 {#each} 内单点 `{@const}`；组件头注释「长文本失焦或 Enter」失实纠正（textarea Enter 是插行不触发 change）。controller.ts 412 行超 §1 红线→`dispatch-guard.ts` 抽取收口（panOccupied/isPointerEvent 纯函数零类耦合平移，393/400）；WidgetFixture.svelte 测试夹具落 src 生产树判读保留（注释声明，npm files 面成仓时随发布管线收口——票 08）
- spec 轴：六项验收全落地零票面缺陷；两枚收口——「无壳」补机械信号测试（根元素内联定位样式为空，jsdom 口径）；enum 离群现值边缘语义钉死（commitSelected 值域闸+空显不炸+零快照测试）；spec 补 widget 供件契约决策行+组件族清单增 PropertiesPanel+里程碑梯子七策略更新

## 0.7.0 — M1 票 06：视口持久化与恢复（2026-09-30）

- **playground 端到端持久化（宿主存储路样例）**：UI 格式（语义+布局+视口一体）经 localStorage 单键存取——subscribe 每次变更 `JSON.stringify(controller.toUiFormat())` 整体投影落盘；启动读档 `fromUiFormat`（语义图）+`ui.viewport`（视口）装配新 controller，重开画布三者复原；工具条增「清空存档重启」，提示补「编辑自动存档重开复原」
- **存储介质归宿主（库不绑定存储）**：库面零改动——toUiFormat/fromUiFormat 往返与 controller 装配（M0 已有）即全部库保证；读写时机与介质全归宿主。坏存档 fail-loud 不炸两半成立：fromUiFormat 未知版本抛错（fail-loud 半）+宿主 catch 记日志换演示图启动（不炸半）；视口形状宿主自设防（三键 Number.isFinite——version 闸只管格式版本）；写失败记日志不中断（§6）；subscribe 无首触，启动装配不覆写存档
- **红线回归三缝钉死**：序列化往返不丢节点尺寸键（kernel serialize 缝——JSON 存储形+显式 toBe/toBeUndefined 断言，toEqual 对 undefined 键不敏感处补判别力）；恢复后仅视口/布局再变语义 hash 不变+语义一动必变对照面（controller 缝——存取装配全链）；存档装配直挂 CanvasView 渲染三者+恢复后再变渲染随动（挂载缝，hash 不在此重复钉）
- 测试 +5（kernel 1/controller 2/挂载缝 2）；`npm run check` 全绿（54 文件 425 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：零硬违；三枚判读收口——controller 缝「未知版本 fail-loud」独立测与 kernel 既有测同调用同断言近乎空转→并入「存取装配」测尾部（同存储文本路一句钉住，注释指认闸本体在 kernel）；挂载缝 hash 断言系 kernel 逻辑非挂载行为→改钉挂载面真实增量（恢复后视口/布局再变渲染随动）；playground `#fl-reset` 内联视口字面量复用 `DEFAULT_VIEWPORT`。判读保留：两测试文件 fixture 各设（每文件私设惯例）；宿主 loadSavedUi/测试 store-restore 助手形似=介质与库缝跨面，设计使然
- spec 轴：四项验收全落地零票面缺陷；两枚票外添置裁定成文（「清空存档重启」按钮=demo 验证重开恢复之必需、视口形状 Number.isFinite 防御=宿主数据不设信票 05 同款口径——均经票面「存储介质归宿主」授权）；已知边界成文（playground 读路人肉验收+构建冒烟不进库测试面；形状坏由宿主 catch 兜底，库不做形状自愈）

## 0.6.0 — M1 票 05：复制粘贴（2026-09-30）

- **kernel 剪贴板纯函数（clipboard.ts）**：选中集复制/粘贴的计算核——`clipboardFromSelection`（选中集→载荷：集内节点+集内边，位置化为相对包围盒左上角 origin 的偏移，空选区 undefined）、`serializeClipboard`/`parseClipboard`（版本化对外契约的 JSON 往返，解析失败/形状坏/未知版本一律 undefined 拒绝不炸）、`pasteClipboard`（粘贴计算与 id 全量重映射：`ClipboardIdAllocator` 对累积图取号注入、集内边重挂、集外边/坏端点丢弃、重复边（同 from→to）净去重——与连线机同一图不变量）、`pastedAt`（连续粘贴逐次偏移：origin+(seq+1)×`PASTE_OFFSET_PX`=20，首贴即偏移一档不压原位叠放）
- **剪贴板格式=对外契约**（票面红线）：`CLIPBOARD_FORMAT_VERSION=1`，载荷={version, origin, nodes[id/typeId/dx/dy/width?/height?/data], edges[from/to]}——语义+布局子集（相对偏移形，粘贴一个平移量保集内相对布局）；线上形=JSON 文本（跨标签页/跨应用粘贴的基底）；未知版本拒绝不炸（过低/过高/坏形状/坏数值均 undefined）
- **controller**：`copySelection()`（选区→契约文本，缓存为本页粘贴源，返回宿主写系统剪贴板）、`paste(text?)`（解析 text 缺省用内部缓存；id 重映射落新图、落点=复制原点逐次偏移（seq 复制时归零，undo 不回退——按物理粘贴计）、新集即当前选区、恰一张快照可撤销；拒绝面 no-op 零快照）
- **渲染层键接线（svelte/clipboard.ts）**：Ctrl/Cmd+C/V 命令式消费（`handleClipboardKey` 在归一化派发前拦截——不进内核输入契约，v1 不动）；系统剪贴板经 navigator.clipboard 读写（渲染层 DOM 之责，kernel 零 DOM）；回退语义单点成文——「读不到」（全局不可得/权限拒绝/读失败）才回退门面内部缓存（本页复制→粘贴不因环境缺权限失效），「读得到内容」（含空串/非本库文本）按内容办经拒绝面收束 no-op；写/读失败记日志不中断；NodeSearchBox 输入框内 Ctrl+C/V 走浏览器默认（卫星件自吞），搜索框内复制文本不被画布劫持
- playground 提示补 Ctrl+C/V 复制粘贴；测试 +23（kernel 15=载荷构造 3/契约解析 4/粘贴重映射 6 含撞号·坏端点·重边去重/偏移 2；controller 7=重映射无冲突·选区替换·undo 粒度/逐次偏移·复制归零/跨控制器文本往返（跨标签形）/undo 不回退偏移序/拒绝面·缓存存活/原图改动不影响粘贴源；挂载缝 3=Ctrl+C→V 全链含选区高亮与 undo/系统剪贴板桩路（写=契约文本·读他页文本粘贴）/拒绝面（空选区·环境文本·空串不回退·无 ctrl·ctrl+shift+v））；`npm run check` 全绿（52 文件 420 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：`PasteResult` 导出接口文档注释补齐（§4.3）；空 catch 吞错改 console.warn+文案常量（§6——写/读失败记日志不中断，回退语义不变）；kernel `copySelection`→`clipboardFromSelection` 改名收敛跨层同名异形（门面别名 import 消失）；形状守卫序言五处重复收敛 `isRecord()` 单点；头注 `CLIPBOARD_FORMAT` 误名改 `CLIPBOARD_FORMAT_VERSION`；`SystemClipboardLike` 注释改为如实描述（navigator.clipboard 结构子集+测试全局桩，去 DataTransferLike 参数注入的失实类比）；barrel 私有定位注明（宿主自定义键位走 controller 公共面）。判读保留：playground 提示文案续写 innerHTML 模板串=沿前三票 demo 既有模式（demo 文件非库面，§3.3 不追溯）
- spec 轴：零票面缺陷（六项验收全落地）；三枚边缘语义裁定补齐——①空文本回退不对称统一（「读得到内容按内容办」，补空串不回退内部缓存测试）②undo 不回退偏移序钉为明确语义（补测试）③手工坏载荷平行重边净去重（与连线机图不变量对齐，补 kernel 测试）

## 0.5.0 — M1 票 03：拖拽连线（2026-09-30）

- **kernel 连线交互机（link.ts）**：交互机族第三件（视口机/选区机的姊妹机，`reduceLinkEvent(state, {graph,viewport,registry}, event)` 纯 reducer，LinkWorld 一包传递合参数红线）；端口热区拖起、悬停合法/非法判定（`linkDropCompatible` 两侧相对即可连）、落定建边、Escape/非法落点放回、拖线到空白=终局 outcome（connect/empty/abort 三态）
- **连线语义裁定**（票面无细则处，票 Resolution 成文）：改连=input 侧（拖已连 input 端口=移动其首条入边——input 单连语义；output 拖拽恒为新连线，扇出常态，ComfyUI 同构）；重复边（同 from→to）不产生第二条（改连落向对端已有同线=净删被移动边）；放回原端口=原状终结防 id 空转；同节点自连放行（环是消费者语义不设防）；起拖端口手势中被删=落定放回不炸
- **手势中途不改图**：预览线由机态（origin/current/hover）供渲染层绘制、被改连旧边按 movedEdgeId 在途隐藏，图效果只在终点一次产生——落定/改连 commit 恰一张快照（undo 一次回拖前）、放弃/空白零快照（手势级粒度策略的连线形）
- **controller**：`getLinkState()`；`dispatchInput` 三机接线——连线机先于选区机且消费式路由（端口热区按下起手势即消费：点端口不落节点拖动；手势存续期指针流与 Escape 归连线机）；镜头占用守卫抽 `panOccupied` 单点（选区机/连线机共用）；`onLinkEmptyDrop` 可置钩子（空白落点→宿主/渲染层开落位 UI）；`placeNodeConnected(typeId,x,y,origin)` 复合落位=落新节点+自动连兼容端口（`compatiblePortOn` 同名 label 优先/该侧首个）恰一张快照（一次 undo 点线全消）
- **渲染层**：连线 `<line>` 中心锚定→`<path>` 端口锚定贝塞尔（`linkControlPoints` 水平切线，内核只产纯几何点不产 SVG 方言）；拖动实时预览跟随指针（`data-fl-link-valid` 合法绿/非法红）；端口点注册表驱动渲染；`link-render.ts` 纯模型单趟备齐（portAnchor 词表漂移回退节点中心——旧数据不炸）；连线/端口/预览色全 token 化（`--fl-link`/`--fl-port`/`--fl-port-r`/`--fl-link-valid`/`--fl-link-invalid`）；NodeSearchBox 增 `linkOrigin`（拖线路确认走 placeNodeConnected，双击路照旧）；placement `openLinkSearch` 接线 onLinkEmptyDrop
- kernel 底座：graph.ts 增 `removeEdge`/`edgeById`/`hasEdgeBetween`/`samePortRef`；hittest 增 `portRefOf`；link.ts `nextEdgeSeq`/`edgeIdOf`（`fle-` 边 id 取号，连线机与门面共用单实现，撞宿主自定 id 跳号）
- playground 提示补端口拖线；测试 +51（kernel 34=迁移表 26+边底座 5+助手 3；controller 10；挂载缝 7）；`npm run check` 全绿（49 文件 397 测）+ playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴：导出面文档注释补齐（§4.3——edgeById/LinkMachineState/link-render 三接口）；边 id 跳号双实现收敛 kernel `nextEdgeSeq` 单实现；PortHit→PortRef 换算收敛 `hittest.portRefOf`；端口点死常量 `r="4"` 删除（CSS `r` token 单源）；预览合法性双编码归一（data 属性单源，CSS 属性选择器）；`sideDefs` 改收 `NodeTypeDef`
- spec 轴：零实现缺陷；五枚语义裁定升格票 Resolution 成文（改连侧别/自连放行/放回原端口/并入合并/落点重复）；spec「落位统一走 placeNode」句随复合入口修订+连线决策行增补；「删线」口径（本票无独立删边手势，删边=改连替换/并入+级联，独立删边留 M2）与 input 单连假设、pointercancel 合成点结算成文已知边界

## 0.4.0 — M1 票 02：节点落位两路（2026-09-30）

- **NodeSearchBox 首个卫星组件，立「共享同一 controller 的卫星件」模式**（后续 Minimap/PropertiesPanel 照此）：双击空白弹出（CanvasView 持双锚——图坐标定落位/屏幕坐标定面板位，面板存续期间视口再变不跟随）；键入按词表 typeId/label 大小写不敏感过滤（空查询=全量，无匹配出提示）；键盘上下环绕导航+回车确认+点击条目同路+Escape/外点关闭（外点=document 级 pointerdown，焦点已移出输入框的 Escape 同兜底）；确认即 `controller.placeNode` 落节点到双击图坐标（中心对准）
- **卫星件事件隔离双机制**（jsdom 钉死：面板内键入空格不进平移模式、滚轮不缩放）：委托事件（pointer/key/dblclick）属性式 stopPropagation 经 svelte 委托根走查拦住画布根委托处理器；wheel 非委托事件（DELEGATED_EVENTS 不含）属性式即面板根原生监听可直接拦；卫星件根另携带 `data-fl-satellite` 标记，画布侧原生监听按标记跳过——通用防御契约（不依赖卫星件自吞，后续 Minimap 等照此）
- **拖放落位契约**（dragdrop.ts，对齐 ComfyUI application/x-comfy-node 先例形制）：`application/x-flowloom-node-type` 结构化 MIME 为主（明确意图，未注册型放行回退显示）+ text/plain 外部源回退须词表命中（环境文本不产垃圾节点）；`setNodeDragData`/`readDraggedTypeId`/`isNodeDragDataTransfer` 成对（dragover 只按 types 判——此阶段 getData 受保护）；dragover 命中才 preventDefault 放行
- controller 增 `placeNode(typeId, x, y)`：两路落位统一入口——id 自动生成（`fl-<seq>` 撞宿主自定 id 则跳号）、节点中心对准落点（默认尺寸折半）、恰一张快照可撤销（undo 即消失）、返回创建的节点记录（票 03 拖线落位连边需要其 id）
- CanvasView：`ondblclick`（命中节点不弹留 M2 标题编辑、平移模式不弹）+ `ondragover`/`ondrop` 接线（drop 图坐标经 screenToGraph 折算、面板开着时 drop 落位即关面板——拖放无 pointerdown 外点监听不触发）；接线抽 `placement.svelte.ts` 工具模块（$state 状态+处理器，规约 §7 组件 script 拆分）；落位两路均为命令式落点非多事件手势机——不进内核输入契约（v1 不动），内核零改动
- svelte 层新增 search.ts（词表过滤/环绕导航纯函数，node 环境直测）；面板样式 token 化（颜色/圆角/宽高/间距三档/字号/z-index 全 var+缺省，宿主可定制）；面板定位 max/min 表达式钳制画布内不溢出；面板键盘处理带 IME 合成期守卫（isComposing——中文输入法回车上屏不误触确认）
- playground：宿主侧栏节点库演示拖放（draggable 项 dragstart 走 setNodeDragData 契约助手）+提示补「双击空白添加节点」
- 测试 +27（svelte 层：search 6/dragdrop 3/controller placeNode 3；挂载缝 15——NodeSearchBox 9=过滤/导航/确认两路/过滤复位与空结果 no-op/Escape·外点·内点不误关/自吞三式/IME 合成期 Enter/undo；CanvasViewPlacement 6=弹面板定位与聚焦/视口变换全链/点击·Escape·外点/卫星隔离/dragover 放行与 drop 落点 undo/text-plain 词表闸与 drop 关面板+结构化 MIME 未知型显示）；`npm run check` 全绿 + playground 构建冒烟过

### code-review 双轴返工（同票内闭环）

- standards 轴硬违三条修：CanvasView script 超 80 行红线（§7）→ 落位/拖放接线抽 `placement.svelte.ts` 工具模块（$state+处理器，回票 01 存量水位）；NodeSearchBox 样式间距/字号/z-index 硬编码（§7 token 纪律）→ 三档间距+字号+z-index 全 var+缺省；`localPoint`/`dispatchPointer` rect 回退重复 → `elementRect` 单源（input-normalize.ts）。判读项：`nextNodeId` 撞号表达式 do/while 收敛。
- spec 轴三真缺陷修：text/plain 全量回退过宽（拖普通文本进画布产垃圾节点）→ 回退须词表命中（结构化 MIME=明确意图不受闸），补测试；IME 合成期 Enter 误触确认（中文输入法回车上屏）→ `isComposing` 守卫，补测试；面板开着时拖放后面板滞留 → drop 落位即关面板，补测试。
- spec 轴叙述失实一处修正：wheel 并不在 svelte 委托表（DELEGATED_EVENTS 实读）——属性式即面板根原生监听可直接拦，`data-fl-satellite` 标记实为通用防御而非必要路径；module 注释/spec/本文件因果同步修正（行为本有测试钉死无错，错在把错误因果立成模式成文）。

## 0.3.0 — M1 票 04：选区与节点拖动（2026-09-30）

- kernel 选区交互机（selection.ts）：空白框选（普通=替换旧选、Ctrl/Shift=并集基底）/Ctrl·Shift 点选增减（切换成员）/点未选中节点先独选再单拖、点已选中节点整集拖动/Delete 删除选中集（级联边）/Escape 清空并中止在途手势——纯 reducer over 抽象输入事件（视口机的姊妹机，交互机族住 kernel）；no-op 同引用契约；`pruneSelection` 供 undo/redo 后剔除死 id；`boxRect` 两点规范矩形（渲染共用单一几何源）
- **手势级快照粒度策略立策**（本票定策，后续一切拖拽类交互照此）：拖动中每次 pointer-move 产出图效果但 `commit=false`（门面暂存渲染、不入快照队列），手势完成事件（松开/Delete/Escape 中止拖动）`commit=true`——一次完整拖动恰入一张 undo 快照（拖动中 undo 队列不膨胀）
- kernel 图操作批量助手：`moveNodes`（选区整体平移，单趟 map）/`removeNodes`（批量级联删边，单趟过滤）；hittest 增 `nodesIntersectingRect`（图坐标域相交命中，非包含；零面积矩形显式短路不选任何）
- controller：`getSelectionState()`（selected 集+在途手势，渲染随动依据）；`dispatchInput` 双机接线——平移手势占用指针（空格按住/平移中）时指针事件不喂选区机（镜头手势优先，键盘照喂）；图编辑路径按 commit 信号分流（暂存/入队）；undo/redo 与宿主删点经 `pruneSelection` 修剪选区
- CanvasView：选中节点 `.fl-selected` 高亮；框选矩形 `data-fl-selection-box` 随手势渲染（图坐标，world 层变换内）；选区手势起拖同样 setPointerCapture
- playground：演示提示补选区操作四式（框选/拖动/Ctrl 增减/Delete）
- 测试：+31（kernel 19：选区机 15=迁移表含 commit 信号序与 no-op 引用契约+矩形命中 2+批量助手 2；controller 7：手势级粒度钉死（拖动后一次 undo 回拖前、再两步恰回空图）/平移占用指针/Delete 可撤销+undo 修剪/Escape/框选全链订阅/多键交错/空格中途按下不滞留；挂载缝 5：点选高亮增减/拖动位置随动/框选矩形几何/Escape·空白清空/Delete+undo）

### code-review 双轴返工（同票内闭环）

- standards 轴：选区样式改 `--fl-selection` token+`color-mix`（规约 §7 token 纪律，宿主可定制）；selection.ts 导出面补文档注释（§4.3）；`noOp` 助手收敛十处字面量、类型断言复述改窄化传参、`isPointerEvent` 显式守卫替前缀嗅探
- spec 轴多键交错两缺陷：结束平移的 pointer-up 串给选区机误结算框选（松开分流按 prev/next panning 判定归镜头）；空格中途按下后松开被拦致框选手势滞留（松开仅按平移态拦）——各补测试钉死

## 0.2.0 — M1 票 01：视口与命中基座（2026-09-30）

- kernel 视口几何（viewport.ts）：坐标变换约定单点成文（screen=(graph−offset)×scale）/指针锚定缩放 `zoomAt`（上下限夹取、锚点下图坐标不漂移、贴限 no-op 同引用）/`panBy`/`graphBounds`/`fitView`（全图适配含边距、放大侧封顶 1、空图 no-op）
- kernel 命中测试（hittest.ts）：节点矩形命中 `hitTestNode`（层叠序=数组后者在上）/端口几何 `portPositions`（入左缘/出右缘、沿高度均布，端口集来自注册表）/端口热区 `hitTestPort`（屏幕半径）；默认节点尺寸收敛 geometry.ts 单一几何源（渲染共用）
- 内核输入事件契约 v1（`INPUT_EVENT_CONTRACT_VERSION=1`，kernel/types.ts）：pointer-down/move/up（携 modifiers）/wheel（像素域）/key-down/key-up；坐标/键名/修饰键归一化语义成文，变更必须升版本
- kernel 视口交互机（interaction.ts）：空格按住/中键拖拽平移+滚轮指针锚定缩放——纯 reducer over 抽象输入事件（后续交互票在此续机器）；no-op 同引用契约供订阅去抖
- controller：`dispatchInput`（归一化事件→内核唯一入口）/`fitView(width, height, margin?)`/`getViewportMachineState`/`viewportLimits` 选项；视口操作不入 undo 队列且 undo 不动镜头（红线钉死于测试）
- CanvasView：DOM→归一化→内核派发管线立起（wheel 手动挂 passive:false、中键防自动滚动、空格平移模式、平移中指针捕获）；world 层 CSS 变换渲染视口（节点保持图坐标）；`fitView` 实例导出（自量容器尺寸）；卡态恢复——失焦视同空格松开、pointercancel 视同 pointer-up
- playground：缩放读数+「适配全图/复位视口」工具条（宿主组件联动 controller 的最简样例），三操作（滚轮缩放/空格·中键平移/FitView）可演示
- 测试：+46 项（kernel 33：viewport 12/hittest 10/interaction 9/纯度钉死 2；controller 5；挂载缝 8——含 jsdom PointerEvent 降级派发、clientWidth 桩、卡态恢复与 wheel 行模式换算）

### code-review 双轴返工（同票内闭环）

- wheel 事件补 modifiers（契约对称：指针/键事件全携——ctrl+滚轮捏合缩放等后续手势零 v2 升版）；normalizeWheel 补 page 模式换算（按容器高近似，兑现契约注释承诺）
- kernel 零 DOM/零 Svelte 红线机械钉死（purity.test.ts 扫源文件——spec 测试教义「教义红线用测试钉死而非注释约定」补课；eslint 注释同步指认）
- 层叠序「后者在上」规则收敛 topmostFirst 单点；CanvasView 默认尺寸改用 kernel nodeSize（单一几何源名实相符）；controller/playground import 合并、demo 图构建改顺序语句

## 0.1.0 — M0 骨架（2026-09-30）

- 内核类型面：图模型（节点=泛型记录，语义/布局分键）/注册表项/UI 格式/抽象输入事件（引擎无关形状面）
- kernel：图操作（不可变值语义）/NodeRegistry（注册表驱动开放集）/UI 格式序列化+semanticHash（布局不入语义 hash）/快照 undo 双队列（ComfyUI changeTracker 教训吸收——值快照+结构共享）
- svelte 层：createCanvasController（无头门面：状态订阅/命令派发/undo-redo）+ CanvasView 根组件（节点+连线渲染，订阅重渲）
- 测试：kernel 纯单测 + svelte 层 jsdom+真 svelte client 单测，全进 npm run check（e2e 暂缓至 playground/消费者挂载）
- playground：独立 vite demo（`npm run flowloom:play`）
- 项目窗自决项 10/10 裁定落定（票册裁定总表）：独立 Svelte 生态库姿态/仓根孵化/flowloom/L2/组件族/M3 接线/私有+semver/MIT/M1 后成仓
