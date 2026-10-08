/** 落位命令面（票 02 两路落位+票 03 复合落位+票 59 词表 initialData 播种）：placeNode/placeNodeConnected 自
 * controller 抽出（票 13 顺势重构守 400 行红线——dispatch-loop/subgraph-navigation/
 * layout-actions 同款先例）。落位=命令式动作（单事件直接产图效果，不进内核输入
 * 契约）：恰一张快照可撤销、未注册 typeId 放行（回退显示 typeId）。复合落位=
 * 拖线搜索确认路（story 11）：落新节点+自动连兼容端口（kernel firstAllowedPortOn
 * 同名优先域内过滤校验不过[票 51]），对端已有同线不重复建边；无兼容端口/全不过/
 * 任一端锁定只落节点。 */
import type {
  CanvasEdge,
  CanvasGraphState,
  CanvasNode,
  ConnectionRules,
  NodeLocks,
  NodeRegistry,
  PortHit,
} from '../kernel/index';
import {
  addEdge,
  addNode,
  firstAllowedPortOn,
  hasEdgeBetween,
  nodeSize,
  portRefOf,
  type DefSource,
} from '../kernel/index';

export interface PlacementHost {
  readonly registry: NodeRegistry;
  /** 当前容器视图（落位镜头——票 10 导航面，落在当前容器）。 */
  view(): CanvasGraphState;
  /** 结构面锁单（票 36）：自动连边遵守锁单——任一端锁定只落节点不连线。 */
  locks(): NodeLocks | undefined;
  /** 连接校验单（票 51）：自动连边刷卡——候选端口过滤校验不过者，全不过=只落节点。 */
  rules(): ConnectionRules | undefined;
  /** 节点/边 id 取号（对根态活图查重跳号——门面计数器单点，ids.ts）。 */
  nodeId(): string;
  edgeId(graph: CanvasGraphState): string;
  /** 命令式变更收口（容器写回+恰一张快照+通知）。 */
  mutate(next: CanvasGraphState): void;
}

export class Placement {
  constructor(private readonly host: PlacementHost) {}

  /** 落节点到图坐标：id 自动生成、节点中心对准落点。 */
  place(typeId: string, x: number, y: number): CanvasNode {
    const node = this.record(typeId, x, y);
    this.host.mutate(addNode(this.host.view(), node));
    return node;
  }

  /** 复合落位（票 03）：place+自动连兼容端口，恰一张快照（一次 undo 连点带线全消）。
   * 票 36：自动连边遵守锁单——origin 端或新节点（谓词视角）任一锁定只落节点不连线。
   * 票 51：候选端口刷卡（firstAllowedPortOn——锁/矩阵/谓词三面单源），校验不过的
   * 端口域内过滤，全不过=只落节点（与「无兼容端口只落节点」合流）。 */
  placeConnected(
    typeId: string,
    x: number,
    y: number,
    origin: PortHit,
  ): { node: CanvasNode; edge: CanvasEdge | undefined } {
    const node = this.record(typeId, x, y);
    const view = this.host.view();
    const port = firstAllowedPortOn(
      {
        graph: view,
        registry: this.host.registry,
        subgraphs: view.subgraphs,
        locks: this.host.locks(),
        rules: this.host.rules(),
      },
      node,
      origin,
    );
    let next = addNode(view, node);
    let edge: CanvasEdge | undefined;
    if (port !== undefined) {
      const ref = { nodeId: node.id, portId: port.portId };
      const from = origin.side === 'output' ? portRefOf(origin) : ref;
      const to = origin.side === 'output' ? ref : portRefOf(origin);
      if (!hasEdgeBetween(next, from, to)) {
        edge = { id: this.host.edgeId(next), from, to };
        next = addEdge(next, edge);
      }
    }
    this.host.mutate(next);
    return { node, edge };
  }

  /** 落位记录（id 自动生成+中心对准落点——按派生尺寸折半，widget 长高节点照常
   * 居中；place 与 placeConnected 共用）。词表播种（票 59，消费者反馈 F6）：词表项声明
   * initialData 工厂则落位调用播种（工厂非裸值——每次调用产新引用；未声明/未注册
   * 型照旧 data:{}；entry.data ?? {} 外部门同款 nullish 兜底；工厂抛错透传）。 */
  private record(typeId: string, x: number, y: number): CanvasNode {
    const node: CanvasNode = {
      id: this.host.nodeId(),
      typeId,
      x,
      y,
      data: this.host.registry.lookup(typeId)?.initialData?.() ?? {},
    };
    const source: DefSource = {
      registry: this.host.registry,
      subgraphs: this.host.view().subgraphs,
    };
    const size = nodeSize(source, node);
    return { ...node, x: x - size.width / 2, y: y - size.height / 2 };
  }
}
