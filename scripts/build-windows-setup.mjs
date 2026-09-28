import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') {
  console.error('The Windows cursor setup EXE must be built on Windows with .NET Framework.');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frameworkRoot = join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET');
const compiler = ['Framework64', 'Framework'].map(arch => join(frameworkRoot, arch, 'v4.0.30319', 'csc.exe')).find(existsSync);
if (!compiler) throw new Error('Windows .NET Framework C# compiler was not found.');
const output = join(root, 'dist', 'windows-setup', 'Remi-Magic-Setup.exe');
await mkdir(dirname(output), { recursive: true });
const args = [
  '/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output',
  '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
  `/out:${output}`, `/win32manifest:${join(root, 'windows-setup', 'app.manifest')}`,
  `/resource:${join(root, 'desktop-cursors', 'Remi-Wand-Large.ani')},RemiMagic.WandLarge.ani`,
  `/resource:${join(root, 'desktop-cursors', 'Remi-Wand-Regular.ani')},RemiMagic.WandRegular.ani`,
  join(root, 'windows-setup', 'Program.cs'),
];
function run(file, arguments_) {
  const result = spawnSync(file, arguments_, { cwd: root, windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${file} exited with ${result.status ?? result.signal}.`);
}
run(compiler, args);
const report = join(dirname(output), 'self-test-report.txt');
run(output, ['--self-test', '--report', report]);
console.log(await readFile(report, 'utf8'));
console.log(`Compiler: ${compiler}`);
console.log(`Built: ${output}`);
