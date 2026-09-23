import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCur, encodeAni } from '../scripts/cursor-format.mjs';

const read = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const tag = (bytes, start) => String.fromCharCode(...bytes.subarray(start, start + 4));
const geometry = { width: 3, height: 2, hotspotX: 2, hotspotY: 1 };
const pixels = Uint8Array.of(
  10, 20, 30, 255, 40, 50, 60, 128, 99, 98, 97, 0,
  70, 80, 90, 64, 1, 2, 3, 0, 100, 110, 120, 255,
);

test('CUR preserves dimensions and hotspot and encodes a 32-bit DIB', () => {
  const bytes = encodeCur({ ...geometry, rgba: pixels });
  const view = read(bytes);
  assert.equal(view.getUint16(0, true), 0);
  assert.equal(view.getUint16(2, true), 2);
  assert.equal(view.getUint16(4, true), 1);
  assert.deepEqual([...bytes.subarray(6, 10)], [3, 2, 0, 0]);
  assert.equal(view.getUint16(10, true), 2);
  assert.equal(view.getUint16(12, true), 1);
  assert.equal(view.getUint32(14, true), bytes.length - 22);
  assert.equal(view.getUint32(18, true), 22);
  assert.equal(view.getUint32(22, true), 40);
  assert.equal(view.getInt32(26, true), 3);
  assert.equal(view.getInt32(30, true), 4);
  assert.equal(view.getUint16(34, true), 1);
  assert.equal(view.getUint16(36, true), 32);
  assert.equal(view.getUint32(38, true), 0);
  assert.equal(view.getUint32(42, true), 32);
  assert.equal(bytes.length, 94);
});

test('CUR reverses rows, swaps RGBA to BGRA and retains partial alpha', () => {
  const bytes = encodeCur({ ...geometry, rgba: pixels });
  assert.deepEqual([...bytes.subarray(62, 86)], [
    90, 80, 70, 64, 0, 0, 0, 0, 120, 110, 100, 255,
    30, 20, 10, 255, 60, 50, 40, 128, 0, 0, 0, 0,
  ]);
  // A set AND bit preserves the underlying screen only for alpha-zero pixels.
  // Both scanlines occupy a DWORD, even though only three bits are used.
  assert.deepEqual([...bytes.subarray(86)], [0x40, 0, 0, 0, 0x20, 0, 0, 0]);
});

test('CUR mask crosses byte and DWORD boundaries correctly', () => {
  const rgba = new Uint8Array(33 * 4).fill(255);
  for (const x of [0, 7, 8, 31, 32]) rgba[x * 4 + 3] = 0;
  const bytes = encodeCur({ width: 33, height: 1, hotspotX: 0, hotspotY: 0, rgba });
  assert.deepEqual([...bytes.subarray(62 + 33 * 4)], [0x81, 0x80, 0, 1, 0x80, 0, 0, 0]);
});

test('CUR handles 256-pixel dimensions using the directory zero sentinel', () => {
  const bytes = encodeCur({ width: 256, height: 256, hotspotX: 255, hotspotY: 255, rgba: new Uint8Array(256 * 256 * 4) });
  const view = read(bytes);
  assert.equal(bytes[6], 0);
  assert.equal(bytes[7], 0);
  assert.equal(view.getInt32(26, true), 256);
  assert.equal(view.getInt32(30, true), 512);
  assert.equal(view.getUint16(10, true), 255);
  assert.equal(view.getUint16(12, true), 255);
  assert.equal(bytes.length, 22 + 40 + 256 * 256 * 4 + 32 * 256);
});

test('CUR accepts ImageData arrays and typed-array slices without modifying them', () => {
  const backing = new Uint8ClampedArray(32).fill(222);
  backing.set(pixels, 4);
  const before = backing.slice();
  const bytes = encodeCur({ ...geometry, rgba: backing.subarray(4, 28) });
  assert.deepEqual(backing, before);
  assert.deepEqual(bytes, encodeCur({ ...geometry, rgba: pixels }));
});

test('ANI wraps distinct CUR frames in complete, aligned RIFF chunks', () => {
  const second = pixels.slice().reverse();
  const bytes = encodeAni({ ...geometry, frames: [pixels, second], jiffies: 5 });
  const view = read(bytes);
  assert.equal(tag(bytes, 0), 'RIFF');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(tag(bytes, 8), 'ACON');
  assert.equal(tag(bytes, 12), 'anih');
  assert.equal(view.getUint32(16, true), 36);
  assert.deepEqual(Array.from({ length: 9 }, (_, index) => view.getUint32(20 + index * 4, true)),
    [36, 2, 2, 0, 0, 0, 0, 5, 1]);
  assert.equal(tag(bytes, 56), 'LIST');
  const listSize = view.getUint32(60, true);
  assert.equal(listSize, bytes.length - 64);
  assert.equal(tag(bytes, 64), 'fram');
  let offset = 68;
  for (const rgba of [pixels, second]) {
    assert.equal(offset % 2, 0);
    assert.equal(tag(bytes, offset), 'icon');
    const size = view.getUint32(offset + 4, true);
    const payload = bytes.subarray(offset + 8, offset + 8 + size);
    assert.deepEqual(payload, encodeCur({ ...geometry, rgba }));
    assert.equal(read(payload).getUint16(2, true), 2);
    offset += 8 + size + (size & 1);
  }
  assert.equal(offset, bytes.length);
  assert.equal(bytes.length, 272);
});

test('ANI supports the intended 24-frame 128px animation and default 15fps rate', () => {
  const frames = Array.from({ length: 24 }, () => new Uint8Array(128 * 128 * 4));
  const bytes = encodeAni({ width: 128, height: 128, hotspotX: 12, hotspotY: 8, frames });
  const view = read(bytes);
  assert.equal(view.getUint32(24, true), 24);
  assert.equal(view.getUint32(28, true), 24);
  assert.equal(view.getUint32(48, true), 4);
  assert.equal(bytes.length, 68 + 24 * (8 + 22 + 40 + 128 * 128 * 4 + 16 * 128));
});

test('CUR rejects invalid dimensions, hotspots and pixel arrays', () => {
  const valid = { ...geometry, rgba: pixels };
  for (const patch of [
    { width: 0 }, { width: 257 }, { height: -1 }, { height: 1.5 },
    { width: NaN }, { height: Infinity }, { width: '3' },
    { hotspotX: -1 }, { hotspotX: 3 }, { hotspotY: 2 },
    { hotspotX: 0.1 }, { hotspotY: undefined },
    { rgba: new Uint8Array(23) }, { rgba: new Uint8Array(25) },
  ]) assert.throws(() => encodeCur({ ...valid, ...patch }), RangeError);
  for (const rgba of [null, [], new Uint16Array(24), new ArrayBuffer(24)]) {
    assert.throws(() => encodeCur({ ...valid, rgba }), TypeError);
  }
});

test('ANI rejects missing, empty, sparse and invalid frames or rates', () => {
  const valid = { ...geometry, frames: [pixels] };
  for (const frames of [undefined, null, [], new Uint8Array(24), [pixels, null], Array(1)]) {
    assert.throws(() => encodeAni({ ...valid, frames }), TypeError);
  }
  assert.throws(() => encodeAni({ ...valid, frames: [pixels, new Uint8Array(1)] }), RangeError);
  for (const jiffies of [0, -1, 1.5, NaN, Infinity, 0x100000000]) {
    assert.throws(() => encodeAni({ ...valid, jiffies }), RangeError);
  }
  assert.throws(() => encodeAni({ ...valid, hotspotX: 3 }), RangeError);
});
