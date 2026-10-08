/** 右键命中解析（票 31，契约 v2 contextmenu 事件的消费面）：复合判别纯函数
 * resolveContextHit——组合既有命中四件（hittest.ts 节点/端口/组 + reroute.ts
 * 中继点/边路径），零新几何（ComfyUI getCanvasContextMenuTarget 直译）。
 * 优先级与左键命中面同构（右键与左键抓同一对象——R3「命中共用」原则）：
 * 端口（锚点热区）→ 节点体 → 中继点 → 边路径 → 组框 → 空白。组框殿后是
 * 票 11 裁定的延续（组框内边路径按压归插点而非组抓取），与 ComfyUI 空白
 * 复合解析器的组优先序有意分歧（本库左键先例一致性优先）。 */
import type { CanvasViewport } from './types';
import type { Point } from './viewport';
import type { PortSide } from './hittest';
import type { LinkWorld } from './link';
import { hitTestGroup, hitTestNode, hitTestPort } from './hittest';
import { hitTestEdgePath, hitTestReroutePoint } from './reroute';

/** 右键命中判别载荷（菜单目标与选区语义解耦——票 31 件 4：菜单目标恒走
 * 本载荷的命中 id，node/port 恒携 nodeId，不吃选区投影）。 */
export type ContextHit =
  | { kind: 'node'; nodeId: string }
  | { kind: 'port'; nodeId: string; portId: string; side: PortSide }
  | { kind: 'reroute'; edgeId: string; index: number }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'group'; groupId: string }
  | { kind: 'empty' };

/** 菜单开面载荷（派发环持有、渲染层观察——票 31）：命中判别+开面时刻的画布
 * 本地屏幕锚（不跟随镜头——NodeSearchBox 双锚先例同款姿态）。 */
export interface ContextMenuOpen {
  hit: ContextHit;
  screen: Point;
}

/** 屏幕点→右键命中判别（纯函数；层叠序与各命中件同规则——数组后者在上）。 */
export function resolveContextHit(
  viewport: CanvasViewport,
  world: LinkWorld,
  screen: Point,
): ContextHit {
  const port = hitTestPort(viewport, portWorldOf(world), screen);
  if (port !== undefined) {
    return { kind: 'port', nodeId: port.nodeId, portId: port.portId, side: port.side };
  }
  const node = hitTestNode(viewport, world, world.graph.nodes, screen);
  if (node !== undefined) return { kind: 'node', nodeId: node.id };
  const dot = hitTestReroutePoint(viewport, world, screen);
  if (dot !== undefined) return { kind: 'reroute', edgeId: dot.edgeId, index: dot.index };
  const path = hitTestEdgePath(viewport, world, screen);
  if (path !== undefined) return { kind: 'edge', edgeId: path.edgeId };
  const group = hitTestGroup(viewport, world.graph.groups, screen);
  if (group !== undefined) return { kind: 'group', groupId: group.id };
  return { kind: 'empty' };
}

/** LinkWorld→PortWorld 投影（端口合成查询面——hitTestPort 消费；reroute.ts
 * 私有同形件的本地副本，两处无共享必要）。 */
function portWorldOf(world: LinkWorld) {
  return { registry: world.registry, nodes: world.graph.nodes, subgraphs: world.subgraphs };
}
