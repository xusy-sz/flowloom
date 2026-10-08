/** 导出主题 token 字面量表（票 56 自 export-image.ts 分出守 400 行红线——票 53
 * edge-jump 检测/发射自然缝拆同款先例）：tokens.css 两档值的导出侧镜像表+状态呈现
 * 约定档。**与 tokens.css 同步钉死**（export-image.test.ts 逐值对账——改 CSS 值须
 * 连表一起改，tokens.test.ts 先例的导出侧镜像）；色值字面量化（rgb(a)/hex 原样搬运
 * ——SVG fill 契约同域）。 */
export type ExportTheme = 'light' | 'dark';

/** 主题 token 字面量表（与 tokens.css 同步钉死——export-image.test.ts 逐值对账）。 */
export interface ExportTokens {
  canvasBg: string;
  link: string;
  linkValid: string;
  linkInvalid: string;
  selection: string;
  groupBorder: string;
  groupBg: string;
  subgraphBg: string;
  subgraphFg: string;
  nodeBg: string;
  nodeBorder: string;
  nodeFg: string;
  nodeHeaderFg: string;
  shadowColor: string;
  shadowOpacity: number;
  catMix: number;
  fgMuted: string;
  port: string;
  reroute: string;
  rerouteBg: string;
}

const LIGHT_TOKENS: ExportTokens = {
  canvasBg: '#f6f7f9',
  link: '#64748b',
  linkValid: '#16a34a',
  linkInvalid: '#dc2626',
  selection: '#2563eb',
  groupBorder: '#c6d0dd',
  groupBg: 'rgb(100 116 139 / 6%)',
  subgraphBg: 'rgb(37 99 235 / 4%)',
  subgraphFg: '#475569',
  nodeBg: '#ffffff',
  nodeBorder: '#cbd5e1',
  nodeFg: '#334155',
  nodeHeaderFg: '#334155',
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  catMix: 0.4,
  fgMuted: '#64748b',
  port: '#64748b',
  reroute: '#64748b',
  rerouteBg: '#ffffff',
};

const DARK_TOKENS: ExportTokens = {
  canvasBg: '#10131a',
  link: '#94a3b8',
  linkValid: '#4ade80',
  linkInvalid: '#f87171',
  selection: '#60a5fa',
  groupBorder: '#475569',
  groupBg: 'rgb(148 163 184 / 5%)',
  subgraphBg: 'rgb(96 165 250 / 8%)',
  subgraphFg: '#a8b3c4',
  nodeBg: '#1e293b',
  nodeBorder: '#3c4a5f',
  nodeFg: '#e2e8f0',
  nodeHeaderFg: '#e2e8f0',
  shadowColor: '#000000',
  shadowOpacity: 0.4,
  catMix: 0.3,
  fgMuted: '#94a3b8',
  port: '#94a3b8',
  reroute: '#a8b3c4',
  rerouteBg: '#334155',
};

/** 两档 token 表（测试对账面——shadow 族自 CSS 阴影串取值，见测试）。 */
export function exportTokensOf(theme: ExportTheme): ExportTokens {
  return theme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
}

/** 状态呈现约定（票 56 票内裁）：导出面无宿主 CSS 可搬，库侧给 status 约定键一套
 * 固定呈现（色值出 token 表=与 tokens.css 同步钉死）；开放集其余键值零解释——
 * 不认识的值不染（交互面「零缺省解释」姿态的导出面对偶）。todo=雾化透明度。 */
export interface ExportStatusStyle {
  border?: string;
  badge?: string;
  /** 空心圈（todo——真元素才好做的形态，交互面 demo 同款）。 */
  hollow?: boolean;
  fog?: number;
}

const FOG_OPACITY = 0.55;

export function statusStyle(tokens: ExportTokens, status: string | undefined): ExportStatusStyle {
  switch (status) {
    case 'running':
      return { border: tokens.selection, badge: tokens.selection };
    case 'done':
      return { border: tokens.linkValid, badge: tokens.linkValid };
    case 'error':
      return { border: tokens.linkInvalid, badge: tokens.linkInvalid };
    case 'todo':
      return { badge: tokens.fgMuted, hollow: true, fog: FOG_OPACITY };
    default:
      return {};
  }
}
