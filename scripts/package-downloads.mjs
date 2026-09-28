import { lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivePath, createZip } from './zip-archive.mjs';

export const SOURCE_FILES = Object.freeze([
  'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'ASSET_NOTICE.md',
  'IMPLEMENTATION_NOTES.md', 'HANDOFF.md', 'INSTALL.md', 'demo.html', 'popup.html',
  'desktop-cursor.html', '바탕화면 마법사 실행.cmd', '.gitignore',
]);
export const SOURCE_TREES = Object.freeze(['src', 'assets', 'extension', 'scripts', 'tests', 'desktop', 'windows-setup', 'desktop-cursors']);
const OPTIONAL_DOCUMENTS = ['CHARACTER_GUIDE.md'];
export const CURSOR_FILES = Object.freeze([
  'Remi-Wand-Large.ani', 'Remi-Wand-Regular.ani',
  'Remi-Wand-Large.cur', 'Remi-Wand-Regular.cur',
  'Remi-Rhythm-Tap-Large.ani', 'Remi-Rhythm-Tap-Regular.ani',
  '사용방법.txt', 'LICENSE', 'ASSET_NOTICE.md',
]);
export const EXTENSION_FILES = Object.freeze([
  'content.js', 'background.js', 'popup.js', 'demo.js', 'popup.html', 'demo.html',
  'popup.css', 'demo.css', 'manifest.json', 'LICENSE', 'README.md', 'HANDOFF.md',
  'ASSET_NOTICE.md', 'IMPLEMENTATION_NOTES.md', 'INSTALL.md', 'THIRD_PARTY_LICENSES.txt',
]);
const EXCLUDED_SEGMENTS = new Set(['node_modules', 'dist', 'downloads', 'artifacts', 'references', 'docs', 'release', 'browserdata', 'user-data', 'userdata']);
const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = data => createHash('sha256').update(data).digest('hex');

function excluded(name) {
  return name.startsWith('.') || EXCLUDED_SEGMENTS.has(name.toLowerCase()) || /\.(?:log|zip|tmp|exe|pdb)$/iu.test(name);
}

async function requireRegular(path, type) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (type === 'directory' ? !info.isDirectory() : !info.isFile())) throw new Error(`Package input is not a regular ${type}: ${path}`);
}

async function entryAt(root, name) {
  archivePath(name);
  const pieces = name.split('/');
  for (let index = 1; index < pieces.length; index++) await requireRegular(join(root, ...pieces.slice(0, index)), 'directory');
  const path = join(root, ...pieces);
  await requireRegular(path, 'file');
  return { name, data: await readFile(path) };
}

async function treeEntries(root, name) {
  archivePath(name);
  const directory = join(root, ...name.split('/'));
  await requireRegular(directory, 'directory');
  const entries = [];
  for (const child of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (excluded(child.name)) continue;
    const relative = `${name}/${child.name}`;
    if (child.isSymbolicLink()) throw new Error(`Package input must not be a symbolic link: ${relative}`);
    if (child.isDirectory()) entries.push(...await treeEntries(root, relative));
    else entries.push(await entryAt(root, relative));
  }
  return entries;
}

export async function collectSourceEntries(root = defaultRoot) {
  const base = await realpath(root), entries = [];
  for (const name of SOURCE_FILES) entries.push(await entryAt(base, name));
  for (const name of OPTIONAL_DOCUMENTS) {
    try { entries.push(await entryAt(base, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of SOURCE_TREES) entries.push(...await treeEntries(base, name));
  return entries;
}

export async function collectExtensionEntries(root = defaultRoot) {
  const base = await realpath(root);
  await requireRegular(join(base, 'dist'), 'directory');
  const built = join(base, 'dist'), entries = [];
  for (const name of EXTENSION_FILES) entries.push(await entryAt(built, name));
  for (const name of OPTIONAL_DOCUMENTS) {
    try { entries.push(await entryAt(built, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  entries.push(...await treeEntries(built, 'assets'));
  return entries;
}

export async function collectCursorEntries(root = defaultRoot) {
  const base = await realpath(root);
  return Promise.all(CURSOR_FILES.map(async name => ({ ...await entryAt(base, `desktop-cursors/${name}`), name })));
}

async function outputDirectory(root) {
  // Check each existing ancestor before creating/writing beneath it.
  for (const name of ['dist', 'dist/downloads']) {
    const path = join(root, ...name.split('/'));
    try { await requireRegular(path, 'directory'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(path);
      await requireRegular(path, 'directory');
    }
  }
  return join(root, 'dist', 'downloads');
}

async function writeOutput(directory, name, data) {
  const target = join(directory, name), temporary = join(directory, `${name}.tmp`);
  for (const path of [target, temporary]) {
    try { await requireRegular(path, 'file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(temporary, data);
  await rename(temporary, target);
}

/** Run after the browser build; never invokes another build or includes existing ZIPs. */
export async function packageDownloads({ root = defaultRoot } = {}) {
  const base = await realpath(root);
  const metadata = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'));
  const [extension, source, cursors] = await Promise.all([collectExtensionEntries(base), collectSourceEntries(base), collectCursorEntries(base)]);
  const sourceBytes = createZip(source);
  const cursorBytes = createZip(cursors);
  let setup;
  try {
    setup = await entryAt(base, 'dist/windows-setup/Remi-Magic-Setup.exe');
    if (setup.data.length < 64 || setup.data.toString('ascii', 0, 2) !== 'MZ') throw new Error('Windows setup is not a Windows executable.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Include only these fresh artifacts in the extension's offline demo. The
  // source archive contains source/assets, never its own output or an EXE.
  extension.push({ name: 'downloads/remi-magic-source.zip', data: sourceBytes });
  extension.push({ name: 'downloads/remi-magic-windows-cursors.zip', data: cursorBytes });
  if (setup) extension.push({ name: 'downloads/Remi-Magic-Setup.exe', data: setup.data });
  const packages = [
    { name: 'remi-magic-windows-cursors.zip', entries: cursors, bytes: cursorBytes },
    { name: 'remi-magic-extension.zip', entries: extension },
    { name: 'remi-magic-source.zip', entries: source, bytes: sourceBytes },
  ].map(({ name, entries, bytes = createZip(entries) }) => {
    return { name, bytes, sha256: sha256(bytes), entryCount: entries.length };
  });
  if (setup) packages.unshift({ name: 'Remi-Magic-Setup.exe', bytes: setup.data, sha256: sha256(setup.data) });
  const directory = await outputDirectory(base);
  if (!setup) {
    const oldSetup = join(directory, 'Remi-Magic-Setup.exe');
    try { await requireRegular(oldSetup, 'file'); await unlink(oldSetup); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const item of packages) await writeOutput(directory, item.name, item.bytes);
  const manifest = {
    version: metadata.version,
    createdAt: new Date().toISOString(),
    files: packages.map(item => ({ name: item.name, bytes: item.bytes.length, sha256: item.sha256, entryCount: item.entryCount })),
  };
  await writeOutput(directory, 'SHA256SUMS.txt', packages.map(item => `${item.sha256}  ${item.name}\n`).join(''));
  await writeOutput(directory, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return { directory, ...manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packageDownloads();
  console.log(`Packaged ${result.files.length} downloads for v${result.version} in dist/downloads/.`);
}
