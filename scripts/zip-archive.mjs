import { deflateRawSync } from 'node:zlib';

const MAX_UINT32 = 0xffffffff;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let value = byte;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(bytes) {
  let value = MAX_UINT32;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ MAX_UINT32) >>> 0;
}

/** Only relative, slash-separated file paths may enter the downloadable archive. */
export function archivePath(value) {
  if (typeof value !== 'string' || !value || /[\\\u0000-\u001f:<>"|?*]/u.test(value) || value.startsWith('/')) throw new Error(`Unsafe archive path: ${value}`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(part))) throw new Error(`Unsafe archive path: ${value}`);
  if (Buffer.byteLength(value, 'utf8') > 0xffff) throw new Error('Archive filename is too long.');
  return value;
}

/** Standard ZIP/DEFLATE, UTF-8 names, fixed timestamps and no dependency or ZIP64. */
export function createZip(entries) {
  if (!Array.isArray(entries) || entries.length > 0xffff) throw new Error('ZIP supports at most 65,535 files.');
  const locals = [], central = [], names = new Set();
  let offset = 0, centralBytes = 0;
  const ordered = [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of ordered) {
    const name = archivePath(entry.name);
    // A portable package must not overwrite itself on case-insensitive filesystems.
    const identity = name.toLowerCase();
    if (names.has(identity)) throw new Error(`Duplicate archive path: ${name}`);
    names.add(identity);
    if (!Buffer.isBuffer(entry.data) && !(entry.data instanceof Uint8Array)) throw new Error(`Missing file bytes: ${name}`);
    const data = Buffer.from(entry.data), filename = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 }), crc = crc32(data);
    if (data.length > MAX_UINT32 || compressed.length > MAX_UINT32 || offset > MAX_UINT32) throw new Error('Archive requires unsupported ZIP64.');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // ZIP 2.0 decoder
    local.writeUInt16LE(0x0800, 6); // Unicode filename flag
    local.writeUInt16LE(8, 8); // Raw DEFLATE
    local.writeUInt16LE(0x0021, 12); // 1980-01-01, deterministic build timestamp
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x0314, 4); // Created on Unix, ZIP 2.0
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0x0021, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38); // Ordinary file, never a symlink
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += local.length + filename.length + compressed.length;
    centralBytes += directory.length + filename.length;
  }
  if (offset > MAX_UINT32 || centralBytes > MAX_UINT32 || offset + centralBytes + 22 > MAX_UINT32) throw new Error('Archive requires unsupported ZIP64.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
