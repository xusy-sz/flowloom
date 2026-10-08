/** PNG 解码最小实现（票 18/19/20 取证用——票 17 先例形：node zlib inflate+逐行
 * 反滤波；无第三方依赖）。只支持 8bit/灰度·RGB·调色板·灰度A·RGBA（无隔行）。 */
import { inflateSync } from 'node:zlib';

/** PNG 五种行滤波的反滤波器：输入 (原始字节, 左邻, 上邻, 左上邻)。 */
const UNFILTER = [
  (v) => v,
  (v, a) => (v + a) & 0xff,
  (v, _a, b) => (v + b) & 0xff,
  (v, a, b) => (v + ((a + b) >> 1)) & 0xff,
  (v, a, b, c) => (v + paeth(a, b, c)) & 0xff,
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

const CHANNELS_OF_COLOR = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function parseChunks(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const info = { width: 0, height: 0, channels: 0, idat: [] };
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      const channels = CHANNELS_OF_COLOR[data[9]];
      if (data[8] !== 8 || channels === undefined) {
        throw new Error(`unsupported PNG form: depth=${data[8]} color=${data[9]}`);
      }
      info.width = data.readUInt32BE(0);
      info.height = data.readUInt32BE(4);
      info.channels = channels;
    } else if (type === 'IDAT') {
      info.idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  return info;
}

export function decodePng(buf) {
  const { width, height, channels, idat } = parseChunks(buf);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src];
    const fn = UNFILTER[filter];
    if (fn === undefined) throw new Error(`bad PNG filter ${filter}`);
    src += 1;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? cur[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      cur[x] = fn(raw[src + x], left, up, upLeft);
    }
    src += stride;
    prev = cur;
  }
  return { width, height, channels, data: out };
}

export function pixelAt(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
