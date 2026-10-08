/** 子图转换命令面（票 21 自 controller 抽出守 400 行红线——placement/layout-actions
 * 先例）：选中集→转换 plan 的 kernel 接线（取号一包+派生尺寸 source 穿线）。
 * plan 的落图（容器写回+级联 prune+选区=占位+恰一张快照+通知）归门面收口——
 * root/nav/快照是门面私有面。命令口径同剪贴板（命令式动作不进内核输入契约）：
 * 空选区 undefined（零快照零订阅）；取号惰性（拒绝路不烧号）。 */
import type {
  CanvasGraphState,
  ConvertToSubgraphPlan,
  DefSource,
  NodeLocks,
} from '../kernel/index';
import {
  convertSelectionToSubgraph as convertKernel,
  subgraphConversionLocked,
  subgraphDefaultName,
} from '../kernel/index';

/** 取号分配→记录名分器（subgraph-N 命名——kernel subgraphDefaultName 单源；
 * 门面装配行瘦身助手）。 */
export function subgraphAllocOf(alloc: { id: string; seq: number }): {
  id: string;
  name: string;
} {
  return { id: alloc.id, name: subgraphDefaultName(alloc.seq) };
}

export interface SubgraphHost {
  /** 当前容器视图（转换域镜头——票 10 导航面）。 */
  view(): CanvasGraphState;
  /** 派生尺寸查询源（票 21：成员包围盒按词表 widgets 长高计）。 */
  source(): DefSource;
  /** 当前选区（转换域）。 */
  selected(): ReadonlySet<string>;
  /** 结构面锁单（票 36）：涉锁转换整单 no-op（选中含锁定/边界边外端锁定）。 */
  locks(): NodeLocks | undefined;
  /** 记录 id 与名的取号（惰性——拒绝路不烧号；门面计数器单点）。 */
  allocSubgraph(): { id: string; name: string };
  /** 节点/边 id 取号（对根态活图查重跳号）。 */
  allocNode(): string;
  allocEdge(): string;
}

export class SubgraphCommands {
  constructor(private readonly host: SubgraphHost) {}

  /** 选中集→转换 plan（kernel 纯函数；空选区/全保留型 undefined；票 36 涉锁
   * undefined——过滤转换会重构冻结边界边[跨界存储边必拆配对]，无法只转可转的）。 */
  plan(): ConvertToSubgraphPlan | undefined {
    const view = this.host.view();
    if (subgraphConversionLocked(this.host.locks(), view, this.host.selected())) return undefined;
    return convertKernel(this.host.source(), view, this.host.selected(), {
      subgraph: () => this.host.allocSubgraph(),
      node: () => this.host.allocNode(),
      edge: () => this.host.allocEdge(),
    });
  }
}
