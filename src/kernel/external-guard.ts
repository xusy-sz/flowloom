/** 变更单形状守卫（票 34，自 external.ts 分出守 400 行红线）：票 28 同款纪律——
 * 栏名（含未知栏）/字段类型错大声抛错指明字段路径，不静默吞不猜着修（**条目级未知
 * 字段同样拒绝**——nearr/dat 笔误若静默落默认档=猜着修）；同栏 upsert id 重复与
 * upsert∩remove 同 id 属宿主矛盾拒绝。守卫纯检形状（字符串/有限数/对象形），不查
 * 图上引用（缺位/辖域冲突归应用路 fail-loud）。 */
import type { ExternalChangeSet, ExternalCollection } from './external';

export const COLLECTION_KEYS = ['nodes', 'edges', 'groups'] as const;

/** 变更单全量守卫：未知栏/分栏形状/字段类型/同栏 id 重复/upsert∩remove 同 id。
 * 错误可教性（票 58 立策）：每条消息三要素——病因+合法选项+恢复动词（报错文本=
 * 写给 agent 的运行时文档——库不在 AI 训练语料内，猜错必撞上的就是这些字）。 */
export function assertChangeSet(changes: ExternalChangeSet): void {
  if (!isPlainObject(changes)) {
    throw new Error('变更单形状坏：根须为对象（改递 { nodes?: { upsert, remove }, … } 分栏信封）');
  }
  assertKnownColumns(changes);
  assertCollection(changes.nodes, 'nodes', assertNodeChange);
  assertCollection(changes.edges, 'edges', assertEdgeChange);
  assertCollection(changes.groups, 'groups', assertGroupChange);
  assertNoColumnConflict(changes);
}

function assertKnownColumns(changes: Record<string, unknown>): void {
  for (const key of Object.keys(changes)) {
    if (!(COLLECTION_KEYS as readonly string[]).includes(key)) {
      throw new Error(
        `变更单形状坏：未知栏「${key}」（栏名∈nodes/edges/groups；多余栏请剥离——机器面字段不入单）`,
      );
    }
  }
}

/** 同栏 upsert∩remove 同 id=宿主矛盾（先删后加同一对象——拆两张单表达）。 */
function assertNoColumnConflict(changes: ExternalChangeSet): void {
  for (const name of COLLECTION_KEYS) {
    const column = changes[name] as ExternalCollection<{ id: string }> | undefined;
    const removed = new Set(column?.remove ?? []);
    for (const entry of column?.upsert ?? []) {
      if (removed.has(entry.id)) {
        throw new Error(
          `变更单形状坏：${name} 栏 id「${entry.id}」同时在 upsert 与 remove（先删后加请拆两张单或去掉一列）`,
        );
      }
    }
  }
}

function assertCollection(
  raw: unknown,
  name: string,
  assertEntry: (raw: unknown, at: string) => void,
): void {
  if (raw === undefined) return;
  if (!isPlainObject(raw)) {
    throw new Error(`变更单形状坏：${name} 栏须为对象（改递 { upsert: […], remove: […] }）`);
  }
  assertKnownKeys(raw, `${name} 栏`, ['upsert', 'remove']);
  const seen = new Set<string>();
  if (raw.upsert !== undefined) {
    if (!Array.isArray(raw.upsert))
      throw new Error(`变更单形状坏：${name}.upsert 须为数组（改递条目数组）`);
    raw.upsert.forEach((entry: unknown, i: number) => {
      const at = `${name}.upsert[${i}]`;
      assertEntry(entry, at);
      const id = (entry as { id: string }).id;
      if (seen.has(id)) {
        throw new Error(`变更单形状坏：${at} id「${id}」与同栏前项重复（同 id 变更请合并成一项）`);
      }
      seen.add(id);
    });
  }
  if (raw.remove !== undefined) {
    if (!Array.isArray(raw.remove)) {
      throw new Error(`变更单形状坏：${name}.remove 须为数组（改递 id 字符串数组）`);
    }
    for (const id of raw.remove) assertId(id, `${name}.remove 项`);
  }
}

/** 节点项呈现派生字段（票 58 定向提示）：宽高/折叠由词表+几何单源派生，不由外部门写入。 */
const NODE_DERIVED_FIELDS: ReadonlySet<string> = new Set(['width', 'height', 'collapsed']);

export function assertNodeChange(raw: unknown, at: string): void {
  if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
  assertKnownKeys(raw, at, ['id', 'typeId', 'data', 'x', 'y', 'near'], NODE_DERIVED_FIELDS);
  assertId(raw.id, `${at}.id`);
  if (raw.typeId !== undefined) assertString(raw.typeId, `${at}.typeId`);
  if (raw.data !== undefined && !isPlainObject(raw.data)) {
    throw new Error(`变更单形状坏：${at}.data 须为对象（改递键值对象——data 是整包替换语义）`);
  }
  if (raw.x !== undefined) assertFinite(raw.x, `${at}.x`);
  if (raw.y !== undefined) assertFinite(raw.y, `${at}.y`);
  if (raw.near !== undefined) assertString(raw.near, `${at}.near`);
}

export function assertEdgeChange(raw: unknown, at: string): void {
  if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
  assertKnownKeys(raw, at, ['id', 'from', 'to']);
  assertId(raw.id, `${at}.id`);
  assertPortRef(raw.from, `${at}.from`);
  assertPortRef(raw.to, `${at}.to`);
}

export function assertGroupChange(raw: unknown, at: string): void {
  if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
  assertKnownKeys(raw, at, ['id', 'memberIds']);
  assertId(raw.id, `${at}.id`);
  if (!Array.isArray(raw.memberIds)) {
    throw new Error(`变更单形状坏：${at}.memberIds 须为数组（改递成员 id 数组）`);
  }
  raw.memberIds.forEach((id: unknown, i: number) => assertId(id, `${at}.memberIds[${i}]`));
}

function assertPortRef(raw: unknown, at: string): void {
  if (!isPlainObject(raw)) throw new Error(`变更单形状坏：${at} 须为对象（改递条目对象）`);
  assertKnownKeys(raw, at, ['nodeId', 'portId']);
  assertId(raw.nodeId, `${at}.nodeId`);
  assertString(raw.portId, `${at}.portId`);
}

/** 未知字段拒绝（笔误面）：已知键集外的字段大声报错——静默吞=猜着修。命中呈现
 * 派生字段名单（width/height/collapsed）时给定向指引（票 58——尺寸由词表派生不外摄）。 */
function assertKnownKeys(
  raw: Record<string, unknown>,
  at: string,
  allowed: readonly string[],
  derivedFields?: ReadonlySet<string>,
): void {
  for (const key of Object.keys(raw)) {
    if (allowed.includes(key)) continue;
    if (derivedFields?.has(key)) {
      throw new Error(
        `变更单形状坏：${at} 未知字段「${key}」（宽高/折叠是词表派生的呈现字段不由外摄——字段∈${allowed.join('/')}）`,
      );
    }
    throw new Error(
      `变更单形状坏：${at} 未知字段「${key}」（字段∈${allowed.join('/')}；多余字段请剥离）`,
    );
  }
}

function assertId(raw: unknown, at: string): void {
  if (typeof raw !== 'string' || raw === '') {
    throw new Error(`变更单形状坏：${at} 须为非空字符串（改递非空 id 字符串）`);
  }
}

function assertString(raw: unknown, at: string): void {
  if (typeof raw !== 'string') throw new Error(`变更单形状坏：${at} 须为字符串（改递字符串值）`);
}

function assertFinite(raw: unknown, at: string): void {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`变更单形状坏：${at} 须为有限数（改递有限数值）`);
  }
}

export function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}
