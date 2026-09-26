import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, 'desktop', 'dist');
await mkdir(destination, { recursive: true });
await build({ entryPoints: [join(root, 'desktop', 'overlay.js'), join(root, 'desktop', 'controls.js')], outdir: destination, bundle: true, platform: 'browser', format: 'iife', target: ['chrome120'], minify: true, legalComments: 'eof' });
for (const file of ['overlay.html', 'overlay.css', 'controls.html', 'controls.css']) await copyFile(join(root, 'desktop', file), join(destination, file));
await cp(join(root, 'assets'), join(destination, 'assets'), { recursive: true });

// A tiny local tray icon. No runtime image downloads or extra build dependencies.
function crc32(buffer) {
  let result = 0xffffffff;
  for (const byte of buffer) { result ^= byte; for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ (0xedb88320 & -(result & 1)); }
  return (result ^ 0xffffffff) >>> 0;
}
function chunk(type, content) {
  const data = Buffer.concat([Buffer.from(type), content]);
  const size = Buffer.alloc(4); size.writeUInt32BE(content.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(data));
  return Buffer.concat([size, data, crc]);
}
const dimension = 32;
const rows = Buffer.alloc(dimension * (dimension * 4 + 1));
for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
  const offset = y * (dimension * 4 + 1) + 1 + x * 4;
  const distance = Math.hypot(x - 15.5, y - 15.5);
  let color = [203, 84, 149, distance < 15 ? 255 : 0];
  const star = Math.abs(x - 15.5) + Math.abs(y - 13) < 8 || (Math.abs(x - 15.5) < 1.8 && y >= 13 && y < 27);
  if (star && distance < 14) color = [255, 239, 159, 255];
  rows.set(color, offset);
}
const header = Buffer.alloc(13); header.writeUInt32BE(dimension, 0); header.writeUInt32BE(dimension, 4); header[8] = 8; header[9] = 6;
await writeFile(join(destination, 'tray.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
console.log('Built desktop/dist/ — run electron desktop/main.mjs for the Windows companion.');
