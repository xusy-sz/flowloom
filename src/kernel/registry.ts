/** 节点词表注册表（教义红线 1：节点定义=宿主数据——注册表驱动开放集，非硬编码闭集）。
 * 本库自身不预置任何节点型；三消费者（或任何宿主）经注入自定义词表。 */
import type { NodeTypeDef } from './types';

/** 词表漂移锁（票 55，票 42 裁 7）：TTypeId 缺省 string=既有宽形零变化；显式传
 * 词表键联合后 define 的 typeId 编译期受键约束（越界词表项即报错）。锁只在
 * define 入参——NodeTypeDef 本体不挂类型参数（运行时形状零变，「节点定义=宿主
 * 数据」红线的类型面镜像：不逼宿主给词表对象挂幻影标注）。 */
export interface NodeRegistry<TTypeId extends string = string> {
  /** 声明一个节点型；typeId 重复声明 fail-loud（词表漂移必须在注册期暴露）。 */
  define(def: NodeTypeDef & { typeId: TTypeId }): void;
  lookup(typeId: string): NodeTypeDef | undefined;
  all(): NodeTypeDef[];
}

/** 泛型参数=宿主 data 映射表（与 FlowloomNode 同一形状），键联合即锁面；缺省
 * Record<string, unknown> 归一回宽形（Extract<keyof …, string> = string）。 */
export function createNodeRegistry<TMap extends Record<string, unknown> = Record<string, unknown>>(
  initial?: readonly (NodeTypeDef & { typeId: Extract<keyof TMap, string> })[],
): NodeRegistry<Extract<keyof TMap, string>> {
  type TTypeId = Extract<keyof TMap, string>;
  const defs = new Map<string, NodeTypeDef>();
  const registry: NodeRegistry<TTypeId> = {
    define(def: NodeTypeDef & { typeId: TTypeId }): void {
      if (defs.has(def.typeId)) {
        throw new Error(
          `节点型重复注册：${def.typeId}（词表漂移须注册期暴露——检查重复 define；registry 请建一次复用）`,
        );
      }
      defs.set(def.typeId, def);
    },
    lookup(typeId: string): NodeTypeDef | undefined {
      return defs.get(typeId);
    },
    all(): NodeTypeDef[] {
      return [...defs.values()];
    },
  };
  for (const def of initial ?? []) {
    registry.define(def);
  }
  return registry;
}
