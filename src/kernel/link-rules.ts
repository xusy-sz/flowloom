/** 连接校验单（票 51，吃票 39 五裁）：宿主从旁边声明「连接合法性」的校验面——
 * 谓词主形（动态逻辑上界：连接数上限/跨字段/运行时状态——React Flow isValidConnection
 * 组件级同名市场标准形）+词表兼容矩阵糖（端口 typeId 对 typeId 有向映射，数据非代码
 * 可序列化——纯类型图零样板谓词）两形同供 **AND 合流**：基础合法面（两侧相对）∧
 * 矩阵∧谓词全过才放——与锁单并集对偶（锁=任一谓真即拦、验=全过才放）。
 * 校验单是宿主数据非图数据（旁边声明全套纪律，locks 同款）：不进 node.data/undo/
 * semanticHash/UI 格式、恒不落快照、不被 applyExternal 整包替换冲掉。作用域=三路
 * 刷卡（拖线/改连/placeNodeConnected 自动连——用户手势与用户意图复合落位）·四门
 * 恒不刷（applyExternal 两门=真源权威、直连 addEdge=宿主自己的手、undo/redo=回放
 * 既成历史、粘贴=用户自己内容忠实再现不滤边）。内核不解释矩阵行也不枚举任何
 * typeId（generic 机制同锁单先例，schema 无关红线不破）。 */
import type { CanvasGraphState, CanvasNode, CanvasSubgraph, NodeTypeDef, PortDef } from './types';
import type { PortHit, PortSide } from './hittest';
import type { NodeRegistry } from './registry';
import { isNodeLocked, isNodeLockedById, type NodeLocks } from './locks';
import { effectiveNodeDef } from './subgraph-ports';

/** 谓词入参端点（票 39 裁 2 富载荷）：宿主直读两端 node 整只（data/typeId 推导
 * 策略——票 36 res 1 同裁定）与解析后端口声明；方向恒 from=output 侧→to=input 侧
 * （连线机 endPoints 既有规）；端口经 effectiveNodeDef 单源解析（票 10 代理口径
 * ——边界口合成词表项）。 */
export interface ConnectionEndpoint {
  node: CanvasNode;
  port: PortDef;
  side: PortSide;
}

/** 词表兼容矩阵糖：有向映射 from 端口 typeId→可连 to 端口 typeId 名单。
 * **矩阵只拦在册行**：from 型行在册而 to 型不在名单=拒；from 型不在册（含端口未
 * 声明 typeId）=放行；不传矩阵=全放行（免「全枚举词表才能用」门槛）。 */
export type PortTypeCompat = Readonly<Record<string, readonly string[]>>;

/** 校验单（两字段各自可选，AND 合流；空形状归一无校验）。 */
export interface ConnectionRules {
  isValidConnection?: (from: ConnectionEndpoint, to: ConnectionEndpoint) => boolean;
  portTypeCompat?: PortTypeCompat;
}

/** 校验判世界（合法判单源的最小读面）：连线机世界（LinkWorld 扩展之——locks 同款
 * 旁边带）与复合落位（placement）两消费点同形；纯函数只收注入不解释。 */
export interface LinkRuleWorld {
  graph: CanvasGraphState;
  registry: NodeRegistry;
  subgraphs?: readonly CanvasSubgraph[];
  locks?: NodeLocks;
  rules?: ConnectionRules;
}

/** 归一：undefined/空形状（两字段皆缺）归 undefined（无校验=交互零变化基线，
 * resolveNodeLocks 同款）。 */
export function resolveConnectionRules(
  input: ConnectionRules | undefined,
): ConnectionRules | undefined {
  if (input === undefined) return undefined;
  if (input.isValidConnection === undefined && input.portTypeCompat === undefined) {
    return undefined;
  }
  return input;
}

/** 合法判单源（票 51 缝 2）：基础面（两侧相对——linkDropCompatible 同式，基础语义
 * 保留为内部步；同节点自连放行=环归消费者语义[谓词正是那个消费者面]）∧锁面（两端
 * 任一锁定=拒——票 36「不可被连」并入单源）∧矩阵∧谓词。drop 缺位（空白悬停）=
 * false——连线机落点判定与预览红档（含锁面红档统一，票 39 裁 4）的同源读数。 */
export function linkDropAllowed(
  world: LinkRuleWorld,
  origin: PortHit,
  drop: PortHit | undefined,
): boolean {
  if (drop === undefined) return false;
  if (origin.side === drop.side) return false;
  if (
    isNodeLockedById(world.locks, world.graph.nodes, origin.nodeId) ||
    isNodeLockedById(world.locks, world.graph.nodes, drop.nodeId)
  ) {
    return false;
  }
  return rulesAllow(world, origin, drop);
}

/** 校验面（锁面/基础面已过门后）：无校验单=放行；端点不可解析（词表漂移）=不设信
 * 拒——校验在场时谓词/矩阵必须可评估两端。 */
function rulesAllow(world: LinkRuleWorld, origin: PortHit, drop: PortHit): boolean {
  const rules = world.rules;
  if (rules === undefined) return true;
  const fromEp = endpointOf(world, origin.side === 'output' ? origin : drop);
  const toEp = endpointOf(world, origin.side === 'output' ? drop : origin);
  return pairAllowed(rules, fromEp, toEp);
}

/** 端点对全判（两消费点共用）：两端可解析 ∧ 矩阵 ∧ 谓词。 */
function pairAllowed(
  rules: ConnectionRules,
  from: ConnectionEndpoint | undefined,
  to: ConnectionEndpoint | undefined,
): boolean {
  return (
    from !== undefined &&
    to !== undefined &&
    matrixAllows(rules, from, to) &&
    predicateAllows(rules, from, to)
  );
}

/** 复合落位的自动连端口判定（票 51 缝 3）：compatiblePortOn 同序候选（同名端口
 * 优先/该侧序）域内**过滤掉校验不过的端口**（锁/矩阵/谓词三面同源），返回首个
 * 放行者；全不过=undefined（只落节点不连线——与「无兼容端口只落节点」既有语义
 * 合流）。target=将落的新节点（未入图——锁判定与端点构造直用对象）。无锁无校验
 * 时结果与 compatiblePortOn 恒同（退化零漂移）。 */
export function firstAllowedPortOn(
  world: LinkRuleWorld,
  target: CanvasNode,
  origin: PortHit,
): { portId: string } | undefined {
  if (
    isNodeLocked(world.locks, target) ||
    isNodeLockedById(world.locks, world.graph.nodes, origin.nodeId)
  ) {
    return undefined; // 任一端锁定=只落节点（票 36 语义保留）
  }
  const targetDef = effectiveNodeDef(world.registry, world.subgraphs ?? [], target);
  if (targetDef === undefined) return undefined;
  const rules = world.rules;
  if (rules === undefined) {
    const first = orderedCandidates(world, targetDef, origin)[0];
    return first === undefined ? undefined : { portId: first.portId };
  }
  for (const port of orderedCandidates(world, targetDef, origin)) {
    const { from, to } = endpointPair(world, target, port, origin);
    if (pairAllowed(rules, from, to)) return { portId: port.portId };
  }
  return undefined;
}

/** 候选端点对（锁已在门口过）：target 端点**直构**（新节点未入图——不走图查询，
 * linkDropAllowed 的图查径不适配将落节点），origin 端点经图解析；按 from=output
 * 侧→to=input 侧定向。 */
function endpointPair(
  world: LinkRuleWorld,
  target: CanvasNode,
  port: PortDef,
  origin: PortHit,
): { from: ConnectionEndpoint | undefined; to: ConnectionEndpoint | undefined } {
  const candEp: ConnectionEndpoint = { node: target, port, side: wantedSide(origin) };
  const originEp = endpointOf(world, origin);
  return origin.side === 'output' ? { from: originEp, to: candEp } : { from: candEp, to: originEp };
}

/** 起拖侧的对侧（自动连候选恒在对侧——基础面由构造保证，linkDropAllowed 内的
 * 两侧判恒过）。 */
function wantedSide(origin: PortHit): PortSide {
  return origin.side === 'output' ? 'input' : 'output';
}

/** 候选序（compatiblePortOn 同序）：与起拖端口同 label 的对侧端口在先（语义对位
 * 先于位置序——「出」对「出」类词表），其余按该侧声明序殿后；同名候选被校验
 * 拦下时回落其余候选（域内过滤=整域过滤，非同名子域）。 */
function orderedCandidates(
  world: LinkRuleWorld,
  targetDef: NodeTypeDef,
  origin: PortHit,
): PortDef[] {
  const originNode = world.graph.nodes.find((n) => n.id === origin.nodeId);
  const originDef =
    originNode && effectiveNodeDef(world.registry, world.subgraphs ?? [], originNode);
  const originLabel =
    originDef === undefined
      ? undefined
      : sideDefsOf(originDef, origin.side).find((p) => p.portId === origin.portId)?.label;
  const candidates = sideDefsOf(targetDef, wantedSide(origin));
  return [
    ...candidates.filter((p) => p.label === originLabel),
    ...candidates.filter((p) => p.label !== originLabel),
  ];
}

/** 注册表项某侧的端口声明集（两侧同构存取——link.ts sideDefs 姊妹，独立持有
 * 避免与连线机模块互引成环）。 */
function sideDefsOf(def: NodeTypeDef, side: PortSide): PortDef[] {
  return side === 'input' ? def.inputs : def.outputs;
}

/** 端点解析（PortHit→富载荷）：effectiveNodeDef 单源（边界口合成）；词表漂移
 * （节点缺位/端口已不存在）=undefined。 */
function endpointOf(world: LinkRuleWorld, hit: PortHit): ConnectionEndpoint | undefined {
  const node = world.graph.nodes.find((n) => n.id === hit.nodeId);
  if (node === undefined) return undefined;
  const def = effectiveNodeDef(world.registry, world.subgraphs ?? [], node);
  if (def === undefined) return undefined;
  const port = sideDefsOf(def, hit.side).find((p) => p.portId === hit.portId);
  return port === undefined ? undefined : { node, port, side: hit.side };
}

/** 矩阵判（只拦在册行）：from 型行不在册（含端口未声明 typeId）=放行；行在册=
 * to 型须在名单（to 端口未声明 typeId=不在名单=拒——类型名单对未类型化端口无从
 * 放行）。 */
function matrixAllows(
  rules: ConnectionRules,
  from: ConnectionEndpoint,
  to: ConnectionEndpoint,
): boolean {
  if (rules.portTypeCompat === undefined || from.port.typeId === undefined) return true;
  const allowed = rules.portTypeCompat[from.port.typeId];
  return allowed === undefined ? true : allowed.includes(to.port.typeId ?? '');
}

/** 谓词判：不设信严格真（isNodeLocked 谓词同款口径）；未设=放行。 */
function predicateAllows(
  rules: ConnectionRules,
  from: ConnectionEndpoint,
  to: ConnectionEndpoint,
): boolean {
  return rules.isValidConnection === undefined || rules.isValidConnection(from, to) === true;
}
