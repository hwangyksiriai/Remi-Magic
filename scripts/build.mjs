import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, cp } from 'node:fs/promises';
import { packageDownloads } from './package-downloads.mjs';
import { spawnSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/content.js', 'src/background.js', 'src/popup.js', 'src/demo.js'], outdir: 'dist', bundle: true, format: 'iife', target: ['chrome120'], minify: true, legalComments: 'eof', sourcemap: false });
for (const [from, to] of [['extension/manifest.json','manifest.json'],['popup.html','popup.html'],['demo.html','demo.html'],['src/demo.css','demo.css'],['src/popup.css','popup.css']]) await copyFile(from, `dist/${to}`);
const license = await readFile('node_modules/three/LICENSE', 'utf8');
await cp('assets','dist/assets',{recursive:true});
await writeFile('dist/THIRD_PARTY_LICENSES.txt', `Three.js\n${license}`);
for (const file of ['README.md', 'HANDOFF.md', 'LICENSE', 'ASSET_NOTICE.md', 'IMPLEMENTATION_NOTES.md', 'INSTALL.md', 'CHARACTER_GUIDE.md']) await copyFile(file, `dist/${file}`);
if (process.platform === 'win32') {
  const native = spawnSync(process.execPath, ['scripts/build-windows-setup.mjs'], { stdio: 'inherit', windowsHide: true });
  if (native.error) throw native.error;
  if (native.status !== 0) throw new Error('Windows cursor setup build failed.');
}
const downloads=await packageDownloads();
console.log('Built dist/ — load this directory as an unpacked Chrome/Edge extension.');
console.log(`Downloads v${downloads.version}: ${downloads.files.map(file=>file.name).join(', ')}`);
