import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';

// Build with `npm run build` first. Verified release ZIPs remain versioned
// downloads; do not recursively include this generated website in source ZIPs.
await mkdir('docs/downloads', { recursive: true });
let html = await readFile('dist/demo.html', 'utf8');
const downloads = `<section class="public-downloads" aria-label="다운로드와 공유">
  <div><strong>이 링크 하나로, 누구나 마법을 체험해요.</strong><p>다른 사이트에서도 쓰려면 아래 설치 파일을 받아 주세요.</p></div>
  <div class="public-download-buttons"><a class="primary-download" href="downloads/remi-magic-extension.zip" download>설치 파일 다운로드 ↓</a><a href="downloads/remi-magic-source.zip" download>소스 코드 다운로드 ↓</a></div>
  <p class="public-download-help">ZIP 압축 해제 → Chrome·Edge 확장 프로그램 관리 → 개발자 모드 → 압축해제된 확장 프로그램 로드 → manifest.json이 있는 폴더 선택</p>
  <p class="public-link">공유 주소: <a href="https://hwangyksiriai.github.io/Remi-Magic/">https://hwangyksiriai.github.io/Remi-Magic/</a></p>
</section>`;
html = html.replace('<section class="playground"', downloads + '\n<section class="playground"');
html = html.replace('→ <code>dist</code> 폴더 선택.', '→ <code>manifest.json</code>이 있는 폴더 선택.');
await writeFile('docs/index.html', html);
const css = await readFile('dist/demo.css', 'utf8');
await writeFile('docs/demo.css', css + `
.public-downloads{margin:0 0 28px;padding:25px 29px;border:1px solid #e3cdda;background:#fff7fa;border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
.public-downloads strong{font-size:15px;font-weight:600}.public-downloads p{font-size:11px;color:#8e7387;margin:7px 0 0;line-height:1.8}
.public-download-buttons{display:flex;gap:10px;flex-wrap:wrap}.public-download-buttons a{display:inline-block;padding:13px 17px;font-size:12px;border-radius:9px;background:#eee1eb;color:#71516b}.public-download-buttons .primary-download{background:#a77899;color:white}
.public-downloads .public-download-help{flex-basis:100%;font-size:10px}.public-downloads .public-link{flex-basis:100%;font-size:11px;overflow-wrap:anywhere}.public-link a{text-decoration:underline;text-underline-offset:3px}
@media(max-width:700px){.public-downloads{padding:22px}.public-download-buttons{width:100%}.public-download-buttons a{font-size:11px;padding:12px}.public-downloads strong{font-size:13px}}
`);
await copyFile('dist/demo.js', 'docs/demo.js');
await cp('dist/assets', 'docs/assets', { recursive: true });
for (const file of ['README.md', 'HANDOFF.md', 'LICENSE', 'ASSET_NOTICE.md', 'THIRD_PARTY_LICENSES.txt']) await copyFile(`dist/${file}`, `docs/${file}`);
for (const file of ['remi-magic-extension.zip', 'remi-magic-source.zip', 'SHA256SUMS.txt']) await copyFile(`release/${file}`, `docs/downloads/${file}`);
await writeFile('docs/.nojekyll', '');
console.log('GitHub Pages files ready in docs/, including direct ZIP downloads.');
