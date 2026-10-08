// 错误可教性面（票 58 立策）：报错文本=写给 agent 的运行时文档——库不在 AI 训练语料
// 内，三条学习通道中运行时报错唯一躲不开，每条公开门 throw 三要素=病因+合法选项+
// 恢复动词。本文件钉变更单门（external-guard）的消息面；整图门（图态键定向识别）钉
// 于 external-diff.test.ts；单消息面（registry/graph/group/serialize/commands/export）
// 就地强化在各模块测试（外部行为=消息内容本身，此处只测不重复）。
import { describe, expect, it } from 'vitest';
import { createNodeRegistry } from './registry';
import { createGraph, addNode } from './graph';
import { applyExternalChangeSet, type ExternalChangeSet } from './external';
import type { CanvasGraphState, CanvasNode } from './types';

const registry = createNodeRegistry([{ typeId: 'task', label: '任务', inputs: [], outputs: [] }]);
const source = { registry, subgraphs: [] };

type NodeData = Record<string, unknown>;

function node(id: string, x = 0, y = 0, data: NodeData = {}): CanvasNode {
  return { id, typeId: 'task', x, y, data };
}

function graphWith(...nodes: CanvasNode[]): CanvasGraphState {
  let graph = createGraph();
  for (const n of nodes) graph = addNode(graph, n);
  return graph;
}

describe('错误可教性（票 58：公开门 throw 三要素——病因+合法选项+恢复动词）', () => {
  it('未知栏/未知字段消息带恢复句（合法集枚举+剥离指引）', () => {
    const g = graphWith(node('a'));
    // @ts-expect-error 栏名拼错（宿主笔误面）
    expect(() => applyExternalChangeSet(source, g, { node: {} })).toThrow(
      /栏名∈nodes\/edges\/groups.*请剥离/,
    );
    const typo = { nodes: { upsert: [{ id: 'b', typeId: 'task', foo: 1 }] } };
    expect(() => applyExternalChangeSet(source, g, typo as ExternalChangeSet)).toThrow(
      /字段∈.*请剥离/,
    );
  });

  it('节点项呈现派生字段（width/height/collapsed）定向提示：尺寸由词表派生不由外摄', () => {
    const g = graphWith(node('a'));
    const fedWidth = { nodes: { upsert: [{ id: 'b', typeId: 'task', width: 300 }] } };
    expect(() => applyExternalChangeSet(source, g, fedWidth as ExternalChangeSet)).toThrow(
      /词表派生的呈现字段/,
    );
    const fedCollapsed = { nodes: { upsert: [{ id: 'b', typeId: 'task', collapsed: true }] } };
    expect(() => applyExternalChangeSet(source, g, fedCollapsed as ExternalChangeSet)).toThrow(
      /词表派生的呈现字段/,
    );
  });

  it('upsert∩remove 同 id：恢复句=拆两张单（宿主矛盾面的出路）', () => {
    const g = graphWith(node('a'));
    expect(() =>
      applyExternalChangeSet(source, g, {
        nodes: { upsert: [{ id: 'b', typeId: 'task' }], remove: ['b'] },
      }),
    ).toThrow(/同时在 upsert 与 remove.*拆两张单/);
  });
});
