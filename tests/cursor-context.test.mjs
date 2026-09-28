import test from 'node:test';
import assert from 'node:assert/strict';
import {cursorIndicator,isMuteShortcut} from '../src/cursor-context.js';

test('pointer cues distinguish text, links, disabled controls and dragging',()=>{
  assert.equal(cursorIndicator({editable:true}).kind,'text');
  assert.equal(cursorIndicator({text:true,interactive:true}).kind,'link');
  assert.equal(cursorIndicator({disabled:true,interactive:true}).kind,'blocked');
  assert.equal(cursorIndicator({cursor:'url("custom.cur"), grabbing'}).kind,'drag');
  assert.equal(cursorIndicator({cursor:'progress'}).kind,'wait');
  assert.equal(cursorIndicator({}).symbol,'');
});
test('resize directions remain distinguishable, including a textarea corner',()=>{
  for(const cursor of ['e-resize','w-resize','ew-resize','col-resize'])assert.equal(cursorIndicator({cursor}).symbol,'↔');
  for(const cursor of ['n-resize','s-resize','ns-resize','row-resize'])assert.equal(cursorIndicator({cursor}).symbol,'↕');
  assert.notEqual(cursorIndicator({cursor:'nwse-resize'}).symbol,cursorIndicator({cursor:'nesw-resize'}).symbol);
  assert.equal(cursorIndicator({editable:true,resizeCorner:true}).kind,'resize');
});
test('mute shortcut ignores typing, repeat, IME, synthetic events and other modifiers',()=>{
  const valid={isTrusted:true,code:'KeyM',altKey:true,shiftKey:true};
  assert.equal(isMuteShortcut(valid),true);
  for(const patch of [{isTrusted:false},{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:false},{shiftKey:false},{code:'KeyN'}])assert.equal(isMuteShortcut({...valid,...patch}),false);
  assert.equal(isMuteShortcut({isTrusted:true,key:'M',altKey:true,shiftKey:true}),true);
});
