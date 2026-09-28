import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { archivePath, createZip, crc32 } from '../scripts/zip-archive.mjs';
import { SOURCE_FILES, SOURCE_TREES, EXTENSION_FILES, CURSOR_FILES, collectSourceEntries, packageDownloads } from '../scripts/package-downloads.mjs';

// Read via the central directory, independently of the writer's entry objects.
function extractZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10), files = new Map();
  let offset = bytes.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    assert.equal(bytes.readUInt16LE(offset + 8), 0x0800);
    assert.equal(bytes.readUInt16LE(offset + 10), 8);
    const compressedLength = bytes.readUInt32LE(offset + 20), length = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const local = bytes.readUInt32LE(offset + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = inflateRawSync(bytes.subarray(start, start + compressedLength));
    assert.equal(data.length, length);
    assert.equal(crc32(data), bytes.readUInt32LE(offset + 16));
    files.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(offset, end);
  return files;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'remi-download-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, data = name) => { const target = join(root, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data); };
  for (const name of SOURCE_FILES) await put(name, name === 'package.json' ? '{"version":"1.3.0"}' : name);
  for (const name of SOURCE_TREES) await put(`${name}/included.txt`);
  for (const name of CURSOR_FILES) await put(`desktop-cursors/${name}`, Buffer.from(`original cursor asset: ${name}`));
  for (const name of EXTENSION_FILES) await put(`dist/${name}`);
  await put('dist/assets/character.png', Buffer.from([0, 3, 255, 20]));
  const setup = Buffer.alloc(128); setup.write('MZ');
  await put('dist/windows-setup/Remi-Magic-Setup.exe', setup);
  return { root, put };
}

test('portable ZIP keeps Unicode names and exact binary bytes, with deterministic output', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const entries = [{ name: 'assets/빈 그림.png', data: Buffer.from([0, 255, 128, 4]) }, { name: '바탕화면 마법사 실행.cmd', data: Buffer.from('한글\r\n') }];
  const bytes = createZip(entries), files = extractZip(bytes);
  for (const entry of entries) assert.deepEqual(files.get(entry.name), entry.data);
  assert.deepEqual(createZip([...entries].reverse()), bytes);
});

test('ZIP rejects path traversal, absolute paths and case-insensitive overwrite collisions', () => {
  for (const name of ['../private', '/absolute', 'a/../private', 'a\\private', 'C:/private', 'a//b', 'a/./b', 'a\0b', 'a/con.txt', 'foo.']) assert.throws(() => archivePath(name), /Unsafe/);
  assert.throws(() => createZip([{ name: 'LICENSE', data: Buffer.alloc(0) }, { name: 'license', data: Buffer.alloc(0) }]), /Duplicate/);
});

test('download packages contain allowlisted files, offline source and the native setup executable', async t => {
  const { root, put } = await fixture(t);
  for (const name of ['.git/config', '.codex/settings', 'node_modules/dependency.js', 'references/photo.png', 'docs/old.js', 'release/old.zip', 'artifacts/account.txt', 'desktop/artifacts/profile.txt', 'desktop/dist/stale.js', 'desktop/node_modules/secret.js', 'desktop/.private', 'desktop/browserdata/session', 'scripts/.env', 'dist/downloads/old.zip', 'dist/stray-secret.txt', 'windows-setup/old.exe', 'windows-setup/old.pdb']) await put(name, 'PRIVATE');
  await put('CHARACTER_GUIDE.md', 'Character guide');
  await put('dist/CHARACTER_GUIDE.md', 'Character guide');
  const result = await packageDownloads({ root });
  assert.equal(result.version, '1.3.0');
  const sourceBytes = await readFile(join(root, 'dist/downloads/remi-magic-source.zip'));
  const source = extractZip(sourceBytes), extension = extractZip(await readFile(join(root, 'dist/downloads/remi-magic-extension.zip')));
  assert.ok(source.has('바탕화면 마법사 실행.cmd'));
  assert.ok(source.has('CHARACTER_GUIDE.md'));
  assert.ok(source.has('INSTALL.md'));
  assert.ok(extension.has('manifest.json'));
  assert.ok(extension.has('assets/character.png'));
  assert.ok(extension.has('CHARACTER_GUIDE.md'));
  assert.deepEqual(extension.get('downloads/remi-magic-source.zip'), sourceBytes);
  assert.deepEqual(extension.get('downloads/Remi-Magic-Setup.exe'), await readFile(join(root, 'dist/windows-setup/Remi-Magic-Setup.exe')));
  const cursorBytes = await readFile(join(root, 'dist/downloads/remi-magic-windows-cursors.zip'));
  assert.deepEqual(extension.get('downloads/remi-magic-windows-cursors.zip'), cursorBytes);
  const cursorFiles = extractZip(cursorBytes);
  assert.deepEqual([...cursorFiles.keys()].sort(), [...CURSOR_FILES].sort());
  for (const name of CURSOR_FILES) assert.deepEqual(cursorFiles.get(name), await readFile(join(root, 'desktop-cursors', name)));
  assert.equal([...extension.keys()].filter(name => name.startsWith('downloads/')).length, 3);
  assert.ok(source.has('windows-setup/included.txt'));
  assert.ok(source.has('desktop-cursors/included.txt'));
  assert.equal(source.has('windows-setup/old.exe'), false);
  assert.equal(source.has('windows-setup/old.pdb'), false);
  assert.equal([...source.keys()].some(name => /(^|\/)(?:\.git|\.codex|artifacts|dist|node_modules|references|docs|release|downloads|browserdata)(\/|$)|\.zip$/u.test(name)), false);
  assert.equal(extension.has('stray-secret.txt'), false);
  for (const item of result.files) {
    const bytes = await readFile(join(root, 'dist/downloads', item.name));
    assert.equal(item.bytes, bytes.length);
    assert.equal(item.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.match(await readFile(join(root, 'dist/downloads/SHA256SUMS.txt'), 'utf8'), new RegExp(item.sha256));
  }
  // Repeated packaging must not pick up its own output.
  const repeated = await packageDownloads({ root });
  assert.deepEqual(repeated.files, result.files);
});

test('source-only builds omit the Windows executable rather than package stale downloads', async t => {
  const {root, put} = await fixture(t);
  await rm(join(root, 'dist/windows-setup/Remi-Magic-Setup.exe'));
  await put('dist/downloads/Remi-Magic-Setup.exe', 'stale output');
  const result = await packageDownloads({root});
  assert.equal(result.files.some(item => item.name.endsWith('.exe')), false);
  await assert.rejects(readFile(join(root, 'dist/downloads/Remi-Magic-Setup.exe')), {code:'ENOENT'});
  const extension = extractZip(await readFile(join(root, 'dist/downloads/remi-magic-extension.zip')));
  assert.equal(extension.has('downloads/Remi-Magic-Setup.exe'), false);
});

test('packaging rejects linked input trees instead of copying files outside the project', async t => {
  const { root } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'remi-outside-test-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'private.txt'), 'PRIVATE');
  await symlink(outside, join(root, 'src', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(collectSourceEntries(root), /symbolic link/);
});
