/**
 * Windows CUR and ANI encoders. No Node APIs: this module also runs in a browser.
 *
 * Input pixels use top-to-bottom, straight-alpha RGBA (as returned by ImageData).
 * CUR stores an uncompressed 32-bit DIB, bottom-to-top BGRA, then a 1-bit AND
 * mask. Completely transparent pixels have a zero XOR pixel and a set AND bit.
 *
 * ANI uses the Microsoft ACON layout: AF_ICON with complete CUR files in the
 * `icon` chunks, not standalone DIBs. Reserved ANIHEADER fields remain zero;
 * frames play in file order at the uniform jiffies rate (one jiffy = 1/60 s).
 * Microsoft Multimedia Standards Update, April 15, 1994, ACON pp. 9–10:
 * https://billposer.org/Linguistics/Computation/riffnew.pdf
 */

const UINT32_MAX = 0xffffffff;
const CUR_HEADER_BYTES = 22;
const DIB_HEADER_BYTES = 40;

function integerInRange(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

function validateGeometry(width, height, hotspotX, hotspotY) {
  integerInRange(width, 1, 256, 'width');
  integerInRange(height, 1, 256, 'height');
  integerInRange(hotspotX, 0, width - 1, 'hotspotX');
  integerInRange(hotspotY, 0, height - 1, 'hotspotY');
}

function validatePixels(rgba, width, height) {
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new TypeError('rgba must be a Uint8Array or Uint8ClampedArray');
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`rgba must contain exactly ${width * height * 4} bytes`);
  }
}

function dimensions(width, height) {
  // DIB rows are DWORD-aligned. 32-bit color rows are already aligned.
  const maskStride = Math.ceil(width / 32) * 4;
  const colorBytes = width * height * 4;
  const imageBytes = DIB_HEADER_BYTES + colorBytes + maskStride * height;
  return { maskStride, colorBytes, imageBytes, cursorBytes: CUR_HEADER_BYTES + imageBytes };
}

/** Encode one static .cur file. The hotspot is measured from the top-left. */
export function encodeCur({ width, height, rgba, hotspotX, hotspotY }) {
  validateGeometry(width, height, hotspotX, hotspotY);
  validatePixels(rgba, width, height);
  const { maskStride, colorBytes, imageBytes, cursorBytes } = dimensions(width, height);
  const bytes = new Uint8Array(cursorBytes);
  const view = new DataView(bytes.buffer);

  // ICONDIR and one CUR directory entry. 0 in an 8-bit dimension means 256.
  view.setUint16(2, 2, true);
  view.setUint16(4, 1, true);
  bytes[6] = width === 256 ? 0 : width;
  bytes[7] = height === 256 ? 0 : height;
  view.setUint16(10, hotspotX, true);
  view.setUint16(12, hotspotY, true);
  view.setUint32(14, imageBytes, true);
  view.setUint32(18, CUR_HEADER_BYTES, true);

  const dib = CUR_HEADER_BYTES;
  view.setUint32(dib, DIB_HEADER_BYTES, true);
  view.setInt32(dib + 4, width, true);
  // DIB height includes both the color image and its monochrome AND mask.
  view.setInt32(dib + 8, height * 2, true);
  view.setUint16(dib + 12, 1, true);
  view.setUint16(dib + 14, 32, true);
  // BI_RGB = 0 (uncompressed). biSizeImage counts color and mask bytes.
  view.setUint32(dib + 20, imageBytes - DIB_HEADER_BYTES, true);

  const colorOffset = dib + DIB_HEADER_BYTES;
  const maskOffset = colorOffset + colorBytes;
  for (let y = 0; y < height; y += 1) {
    const destinationY = height - y - 1;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const destination = colorOffset + (destinationY * width + x) * 4;
      const alpha = rgba[source + 3];
      if (alpha === 0) {
        bytes[maskOffset + destinationY * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      } else {
        bytes[destination] = rgba[source + 2];
        bytes[destination + 1] = rgba[source + 1];
        bytes[destination + 2] = rgba[source];
        bytes[destination + 3] = alpha;
      }
    }
  }
  return bytes;
}

function fourCC(bytes, offset, value) {
  for (let index = 0; index < 4; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

/** Encode a looping .ani file with one step per frame and a uniform rate. */
export function encodeAni({ frames, width, height, hotspotX, hotspotY, jiffies = 4 }) {
  validateGeometry(width, height, hotspotX, hotspotY);
  integerInRange(jiffies, 1, UINT32_MAX, 'jiffies');
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new TypeError('frames must be a nonempty array of RGBA byte arrays');
  }
  for (const rgba of frames) validatePixels(rgba, width, height);

  const { cursorBytes } = dimensions(width, height);
  const paddedCursorBytes = cursorBytes + (cursorBytes & 1);
  const frameListBytes = 4 + frames.length * (8 + paddedCursorBytes);
  const riffBytes = 4 + (8 + 36) + (8 + frameListBytes);
  if (!Number.isSafeInteger(riffBytes) || riffBytes > UINT32_MAX) {
    throw new RangeError('animation exceeds the RIFF 32-bit size limit');
  }
  const bytes = new Uint8Array(8 + riffBytes);
  const view = new DataView(bytes.buffer);
  fourCC(bytes, 0, 'RIFF');
  view.setUint32(4, riffBytes, true);
  fourCC(bytes, 8, 'ACON');
  fourCC(bytes, 12, 'anih');
  view.setUint32(16, 36, true);
  view.setUint32(20, 36, true);
  view.setUint32(24, frames.length, true);
  view.setUint32(28, frames.length, true);
  view.setUint32(48, jiffies, true);
  view.setUint32(52, 1, true); // AF_ICON. No sequence table is needed.
  fourCC(bytes, 56, 'LIST');
  view.setUint32(60, frameListBytes, true);
  fourCC(bytes, 64, 'fram');

  let offset = 68;
  for (const rgba of frames) {
    fourCC(bytes, offset, 'icon');
    view.setUint32(offset + 4, cursorBytes, true);
    bytes.set(encodeCur({ width, height, rgba, hotspotX, hotspotY }), offset + 8);
    // A RIFF chunk's declared size excludes its optional zero padding byte.
    offset += 8 + paddedCursorBytes;
  }
  return bytes;
}
