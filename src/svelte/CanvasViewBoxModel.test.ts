// 渲染盒几何对齐静态钉死（票 18）：kernel 矩形是节点/组框/框选矩形的单一几何源
// （命中测试/端口锚定/包围盒共用），帧族 CSS 装饰（padding/border）必须含在 kernel
// width/height 内——box-sizing: border-box。jsdom 挂载缝测不了此面：Svelte 组件样式
// 不注入测试文档（编译面）、jsdom 亦无布局引擎量不了 rect——本缝为文本级红线
// （module-state.test.ts 静态审计同定位：钉死常见回归向量非全证明）；真值验收=
// 真浏览器 DOM 几何读数+端口点像素采样（票内记档，票 17 方法论）。
// 票 21：节点渲染抽内部件 CanvasNodes（.fl-node 规则随迁——扫描面=两组件并集）；
// 三段形几何（标题条高/行高/块尾 padding）自 kernel 常量内联进 style——CSS 不得
// 另立第二数值源，同缝钉死。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

function componentSource(name: string): string {
  return readFileSync(join(dir, name), 'utf-8');
}

/** 组件 <style> 块内的规则块序列：[选择器列表, 声明体]（嵌套块不在此面——扁平）。 */
function styleRules(source: string): Array<[string, string]> {
  const style = source.match(/<style>([\S\s]*)<\/style>/)?.[1] ?? '';
  return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!, m[2]!]);
}

describe('渲染盒几何对齐（票 18——DOM 盒=kernel 矩形）', () => {
  it('帧族三选择器（node/group/selection-box）border-box 在场——装饰含在 kernel 尺寸内', () => {
    const borderBoxSelectors = [
      ...styleRules(componentSource('CanvasView.svelte')),
      ...styleRules(componentSource('CanvasNodes.svelte')),
    ]
      .filter(([, body]) => body.includes('box-sizing: border-box'))
      .map(([selectors]) => selectors)
      .join(',');
    for (const selector of ['.fl-node', '.fl-group', '.fl-selection-box']) {
      expect(borderBoxSelectors, `${selector} 须在 border-box 规则组内`).toContain(selector);
    }
  });

  it('三段形几何单源（票 21/22）：标题条/端口行/行高/块尾自 kernel 常量内联，CSS 不立第二源', () => {
    const nodes = componentSource('CanvasNodes.svelte');
    expect(nodes).toContain('style:height="{NODE_HEADER_HEIGHT}px"');
    expect(nodes).toContain('style:height="{PORT_ROW_HEIGHT}px"');
    expect(nodes).toContain('style:height="{widgetRowHeight(w)}px"');
    expect(nodes).toContain('style:padding-bottom="{WIDGET_BLOCK_TAIL}px"');
    // 盒契约四规则（header/端口行/widget 行/块容器）不得出现纵向几何的 CSS 数值
    // 声明（填充型 height:100% 除外——填满包裹格不是第二数值源；硬编码纵向值即第
    // 二几何源）
    const geometric = new Set([
      '.fl-node-header',
      '.fl-node-port-row',
      '.fl-node-widget',
      '.fl-node-widgets',
    ]);
    for (const [selectors, body] of styleRules(nodes)) {
      const hit = selectors
        .split(',')
        .map((s) => s.trim())
        .some((s) => geometric.has(s));
      if (!hit) continue;
      expect(body, `${selectors} 不得 CSS 定纵向几何`).not.toMatch(
        /(?<!min-)height:\s*(?!100%)|padding-(top|bottom):|padding:\s*[1-9]/,
      );
    }
    // 覆盖位标记分名在场（隔离机制——值=参数名，布尔判定按属性在场）且不混用
    // 卫星标记（票内裁定：分名）
    expect(nodes).toContain('data-fl-widget={w.name}');
    const script = nodes.match(/<script[\S\s]*<\/script>/)?.[0] ?? '';
    expect(script.match(/data-fl-satellite/g), '节点控件不挂卫星标记').toBeNull();
  });
});
