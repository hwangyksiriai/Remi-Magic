import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';

// Build matching source/extension archives first; the public page uses the tested UI.
await mkdir('docs/downloads', { recursive: true });
const manifest=JSON.parse(await readFile('dist/downloads/manifest.json','utf8'));
await copyFile('dist/demo.html','docs/index.html');
for(const file of ['demo.css','demo.js','README.md','HANDOFF.md','LICENSE','ASSET_NOTICE.md','IMPLEMENTATION_NOTES.md','INSTALL.md','CHARACTER_GUIDE.md','THIRD_PARTY_LICENSES.txt'])await copyFile(`dist/${file}`,`docs/${file}`);
await cp('dist/assets','docs/assets',{recursive:true});
for(const file of [...manifest.files.map(item=>item.name),'SHA256SUMS.txt','manifest.json'])await copyFile(`dist/downloads/${file}`,`docs/downloads/${file}`);
await writeFile('docs/.nojekyll','');
console.log(`GitHub Pages v${manifest.version} prepared in docs/. Publishing is a separate step.`);
