/** 票 18/19 取证用：PNG 像素采样/计数（png.mjs 解码单源）。
 * 用法：node tools/probe/pixel-probe.mjs <png> --near r,g,b,tol | --at x,y;x,y */
import { readFileSync } from 'node:fs';
import { decodePng, pixelAt } from './png.mjs';

const [file, mode, arg] = process.argv.slice(2);
const img = decodePng(readFileSync(file));

function matches(target, tol, x, y) {
  const [pr, pg, pb] = pixelAt(img, x, y);
  return (
    Math.abs(pr - target[0]) <= tol &&
    Math.abs(pg - target[1]) <= tol &&
    Math.abs(pb - target[2]) <= tol
  );
}

function scanNear(target, tol) {
  let count = 0;
  const samples = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!matches(target, tol, x, y)) continue;
      count += 1;
      if (samples.length < 5) samples.push([x, y, ...pixelAt(img, x, y)]);
    }
  }
  return { count, samples };
}

if (mode === '--near') {
  const [r, g, b, tol] = arg.split(',').map(Number);
  const { count, samples } = scanNear([r, g, b], tol);
  console.log(
    JSON.stringify({
      size: [img.width, img.height],
      target: [r, g, b],
      tol,
      count,
      ratio: +(count / (img.width * img.height)).toFixed(6),
      samples,
    }),
  );
} else if (mode === '--at') {
  const points = arg.split(';').map((s) => s.split(',').map(Number));
  console.log(JSON.stringify(points.map(([x, y]) => [x, y, pixelAt(img, x, y)])));
} else {
  console.log(JSON.stringify({ size: [img.width, img.height], channels: img.channels }));
}
