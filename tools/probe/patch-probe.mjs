/** 票 18/19 取证用：以 (x,y) 为中心的 n×n 补丁逐像素输出（png.mjs 解码单源）。
 * 用法：node tools/probe/patch-probe.mjs <png> <x> <y> <n> */
import { readFileSync } from 'node:fs';
import { decodePng, pixelAt } from './png.mjs';

const [file, x0s, y0s, ns] = process.argv.slice(2);
const x0 = Number(x0s);
const y0 = Number(y0s);
const half = Math.floor(Number(ns) / 2);
const img = decodePng(readFileSync(file));

const head = `      x=${x0 - half}..${x0 + half}`;
const rows = [];
for (let dy = -half; dy <= half; dy++) {
  const cells = [];
  for (let dx = -half; dx <= half; dx++) {
    const [r, g, b] = pixelAt(img, x0 + dx, y0 + dy);
    cells.push(`${r},${g},${b}`.padStart(12));
  }
  rows.push(`${y0 + dy} ` + cells.join(' '));
}
console.log(`${head}\n` + rows.join('\n'));
