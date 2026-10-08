/** CanvasView 旁边声明贯入（票 53 自组件抽出守 400 行文件红线——keyboard.ts 桥
 * 先例同款）：props（锁单/校验单/边形状缺省）→controller 旁边带的单点写入与
 * 卸载复位。全套纪律（票 36/51/52 立策）：不进图数据/undo/semanticHash/UI 格式、
 * 恒不落快照、写入零通知；undefined=opt-out 交互零变化。返回清理函数供 $effect
 * 卸载复位——props 在 effect 内读取，重赋值即重写（Svelte 5 细粒度追踪不因抽出
 * 而丢失：读取发生在 effect 同步调用链里）。 */
import type { CanvasController } from './controller';
import type { ConnectionRules, EdgeShape, NodeLockInput } from '../kernel/index';

/** 三张旁边声明的 props 一包（CanvasView 解构透传——只加不删）。 */
export interface SidecarDecls {
  nodeLocks?: NodeLockInput;
  connectionRules?: ConnectionRules;
  edgeShape?: EdgeShape;
}

/** 置入三张旁边声明并返回复位函数（卸载/重挂时回 undefined——opt-out 语义）。 */
export function attachSidecarDecls(controller: CanvasController, decls: SidecarDecls): () => void {
  controller.setNodeLocks(decls.nodeLocks);
  controller.setConnectionRules(decls.connectionRules);
  controller.setEdgeShape(decls.edgeShape);
  return () => {
    controller.setNodeLocks(undefined);
    controller.setConnectionRules(undefined);
    controller.setEdgeShape(undefined);
  };
}
