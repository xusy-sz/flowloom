// 命令注册制数据面（票 14）：命令表/绑定表的纯函数不变量——注册覆写、绑定改写
// （同组合键替换）、精确匹配（修饰集逐位）、组合键归一（Ctrl/Cmd 合并主修饰）、
// 默认键位表、独立键存档往返与坏形状复原不设信。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_BINDINGS,
  KEYBINDINGS_DOC_VERSION,
  createCommandTable,
  keyComboFrom,
  parseKeyBindings,
  serializeKeyBindings,
  type CommandRecord,
  type KeyBinding,
  type KeyCombo,
} from './commands';
import type { ModifierKey } from './types';

function combo(key: string, ctrl = false, alt = false, shift = false): KeyCombo {
  return { key, ctrl, alt, shift };
}

function binding(
  key: string,
  commandId: string,
  mods: [boolean, boolean, boolean] = [false, false, false],
): KeyBinding {
  return { combo: combo(key, ...mods), commandId, scope: 'canvas' };
}

const noop = (): void => {};

function command(id: string, label = id): CommandRecord {
  return { id, label, run: noop };
}

describe('命令表（注册/查询）', () => {
  it('register→lookup/all；同 id 覆写=替换记录', () => {
    const table = createCommandTable();
    const first = command('fl:undo', '撤销');
    table.register(first);
    expect(table.lookup('fl:undo')).toBe(first);
    expect(table.all()).toHaveLength(1);
    const replaced = command('fl:undo', '撤销（宿主覆写）');
    table.register(replaced);
    expect(table.lookup('fl:undo')).toBe(replaced);
    expect(table.all()).toHaveLength(1); // 覆写非追加
    expect(table.lookup('fl:none')).toBeUndefined();
  });

  it('all() 返回拷贝——外部改写（数组与条目字段）不渗入表', () => {
    const table = createCommandTable();
    table.register(command('fl:undo'));
    const leaked = table.all();
    leaked.push(command('fl:redo'));
    leaked[0]!.label = '被改写';
    expect(table.all()).toHaveLength(1);
    expect(table.lookup('fl:undo')!.label).toBe('fl:undo'); // 条目级隔离
  });
});

describe('绑定表（改写/匹配）', () => {
  it('bind→match 精确命中；bindings() 拷贝（数组与条目字段）', () => {
    const table = createCommandTable();
    table.bind(binding('c', 'fl:copy', [true, false, false]));
    expect(table.match(combo('c', true), 'canvas')?.commandId).toBe('fl:copy');
    const leaked = table.bindings();
    leaked.push(binding('v', 'fl:paste'));
    leaked[0]!.commandId = '被改写';
    leaked[0]!.combo.key = '被改写';
    expect(table.bindings()).toHaveLength(1);
    expect(table.match(combo('c', true), 'canvas')?.commandId).toBe('fl:copy'); // 条目级隔离
  });

  it('匹配逐位精确：修饰多一少一皆不命中（ctrl+c 不吞 c / ctrl+shift+c）', () => {
    const table = createCommandTable();
    table.bind(binding('c', 'fl:copy', [true, false, false]));
    expect(table.match(combo('c'), 'canvas')).toBeUndefined();
    expect(table.match(combo('c', true, false, true), 'canvas')).toBeUndefined();
    expect(table.match(combo('c', true, true, false), 'canvas')).toBeUndefined();
    expect(table.match(combo('v', true), 'canvas')).toBeUndefined();
  });

  it('同组合键改写=替换（宿主换键位单点）；unbind 后不命中', () => {
    const table = createCommandTable();
    table.bind(binding('z', 'fl:undo', [true, false, false]));
    table.bind(binding('z', 'fl:redo', [true, false, false]));
    const after = table.bindings();
    expect(after).toHaveLength(1);
    expect(table.match(combo('z', true), 'canvas')?.commandId).toBe('fl:redo');
    table.unbind(combo('z', true), 'canvas');
    expect(table.bindings()).toHaveLength(0);
    expect(table.match(combo('z', true), 'canvas')).toBeUndefined();
  });

  it('同一命令可绑多组合键（ctrl+shift+z 与 ctrl+y 同指重做）', () => {
    const table = createCommandTable();
    table.bind(binding('z', 'fl:redo', [true, false, true]));
    table.bind(binding('y', 'fl:redo', [true, false, false]));
    expect(table.bindings()).toHaveLength(2);
    expect(table.match(combo('z', true, false, true), 'canvas')?.commandId).toBe('fl:redo');
    expect(table.match(combo('y', true), 'canvas')?.commandId).toBe('fl:redo');
  });
});

describe('keyComboFrom（归一化键序列）', () => {
  it.each([
    { key: 'c', modifiers: ['ctrl'], out: { key: 'c', ctrl: true, alt: false, shift: false } },
    { key: 'C', modifiers: ['ctrl'], out: { key: 'c', ctrl: true, alt: false, shift: false } },
    { key: 'v', modifiers: ['meta'], out: { key: 'v', ctrl: true, alt: false, shift: false } },
    // Cmd 合并主修饰（跨平台同键位）；ctrl+meta 同按=主修饰位
    {
      key: 'e',
      modifiers: ['ctrl', 'shift'],
      out: { key: 'e', ctrl: true, alt: false, shift: true },
    },
    {
      key: 'g',
      modifiers: ['ctrl', 'meta'],
      out: { key: 'g', ctrl: true, alt: false, shift: false },
    },
    { key: 'Delete', modifiers: [], out: { key: 'delete', ctrl: false, alt: false, shift: false } },
    {
      key: 'Escape',
      modifiers: ['alt'],
      out: { key: 'escape', ctrl: false, alt: true, shift: false },
    },
  ] as Array<{ key: string; modifiers: ModifierKey[]; out: KeyCombo }>)(
    'key=$key modifiers=$modifiers → $out',
    ({ key, modifiers, out }) => {
      expect(keyComboFrom(key, modifiers)).toEqual(out);
    },
  );
});

describe('默认键位表（v1）', () => {
  it('M1 直连键位收编+命令式动作+M2 两键——组合键互不冲突', () => {
    const byCombo = new Map(
      DEFAULT_KEY_BINDINGS.map((b) => [
        `${b.combo.key}|${b.combo.ctrl}|${b.combo.alt}|${b.combo.shift}`,
        b.commandId,
      ]),
    );
    expect(byCombo.get('delete|false|false|false')).toBe('fl:delete-selection');
    expect(byCombo.get('escape|false|false|false')).toBe('fl:cancel-gesture');
    expect(byCombo.get('c|true|false|false')).toBe('fl:copy');
    expect(byCombo.get('v|true|false|false')).toBe('fl:paste');
    expect(byCombo.get('z|true|false|false')).toBe('fl:undo');
    expect(byCombo.get('z|true|false|true')).toBe('fl:redo');
    expect(byCombo.get('y|true|false|false')).toBe('fl:redo');
    expect(byCombo.get('f|false|false|false')).toBe('fl:fit-view');
    expect(byCombo.get('l|false|false|false')).toBe('fl:auto-layout'); // 票 23 默认单键 L
    expect(byCombo.get('g|true|false|false')).toBe('fl:group-toggle');
    expect(byCombo.get('e|true|false|true')).toBe('fl:convert-subgraph');
    expect(new Set(byCombo.keys()).size).toBe(DEFAULT_KEY_BINDINGS.length); // 组合键唯一
  });
});

describe('绑定存档（独立键版本化文档）', () => {
  const sample: KeyBinding[] = [
    binding('c', 'fl:copy', [true, false, false]),
    binding('z', 'host:custom.undo', [true, true, false]),
  ];

  it('serialize→parse 往返：绑定与作用域原样复原', () => {
    const doc = JSON.parse(serializeKeyBindings(sample)) as { version: number };
    expect(doc.version).toBe(KEYBINDINGS_DOC_VERSION);
    expect(parseKeyBindings(serializeKeyBindings(sample))).toEqual(sample);
  });

  it('空表往返', () => {
    expect(parseKeyBindings(serializeKeyBindings([]))).toEqual([]);
  });

  it('复原不设信：坏 JSON/未知版本/非数组/形状坏条目丢弃、整档坏返回 undefined', () => {
    expect(parseKeyBindings('{oops')).toBeUndefined();
    expect(parseKeyBindings('null')).toBeUndefined();
    expect(parseKeyBindings(JSON.stringify({ version: 99, bindings: [] }))).toBeUndefined();
    expect(parseKeyBindings(JSON.stringify({ version: 1, bindings: 'x' }))).toBeUndefined();
    const oneGood = JSON.stringify({
      version: 1,
      bindings: [
        { key: 'c', ctrl: true, commandId: 'fl:copy' }, // 修饰位缺省=false 容忍
        { key: '', commandId: 'x' }, // 空 key 丢
        { key: 'z', ctrl: 'yes', commandId: 'y' }, // 修饰位类型坏丢
        { key: 'q', ctrl: true }, // 缺 commandId 丢
        { key: 7, commandId: 'y' }, // key 非串丢
        { key: 'w', commandId: 'y', scope: 'elsewhere' }, // 未知作用域丢
      ],
    });
    expect(parseKeyBindings(oneGood)).toEqual([binding('c', 'fl:copy', [true, false, false])]);
  });

  it('parse 键位归一：大写键复原为小写域', () => {
    const doc = JSON.stringify({
      version: 1,
      bindings: [{ key: 'C', ctrl: true, commandId: 'fl:copy' }],
    });
    expect(parseKeyBindings(doc)).toEqual([binding('c', 'fl:copy', [true, false, false])]);
  });
});
