import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/desktop-cursor.js'],outfile:'dist/desktop-cursor.js',bundle:true,format:'iife',target:['chrome120'],minify:true,legalComments:'eof'});
await copyFile('desktop-cursor.html','dist/desktop-cursor.html');
console.log('Open http://127.0.0.1:4173/desktop-cursor.html and create the cursor files.');
