import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('all ten named artwork files preserve the supplied source bytes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../assets/character-sources.json',import.meta.url),'utf8'));
  assert.equal(manifest.length,10);assert.equal(new Set(manifest.map(x=>`${x.id}:${x.outfit}`)).size,10);
  for(const entry of manifest){const bytes=await readFile(new URL('../assets/'+entry.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.file);assert.equal(bytes.readUInt32BE(16),entry.width);assert.equal(bytes.readUInt32BE(20),entry.height);}
});
