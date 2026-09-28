/** Small pointer badges keep the wand while restoring familiar task cues. */
export function cursorIndicator({cursor='auto',disabled=false,editable=false,interactive=false,draggable=false,text=false,resizeCorner=false}={}) {
  const native=String(cursor).split(',').at(-1).trim();
  if(disabled||native==='not-allowed'||native==='no-drop')return {kind:'blocked',symbol:'⊘',label:'사용할 수 없음'};
  const resize=resizeCorner?'nwse-resize':native;
  if(/^(n|s|ns|row)-resize$/.test(resize))return {kind:'resize',symbol:'↕',label:'위아래 크기 조절'};
  if(/^(e|w|ew|col)-resize$/.test(resize))return {kind:'resize',symbol:'↔',label:'좌우 크기 조절'};
  if(/^(ne|sw|nesw)-resize$/.test(resize))return {kind:'resize',symbol:'⤢',label:'대각선 크기 조절'};
  if(/^(nw|se|nwse)-resize$/.test(resize))return {kind:'resize',symbol:'⤡',label:'대각선 크기 조절'};
  if(native==='wait'||native==='progress')return {kind:'wait',symbol:'◷',label:'처리 중'};
  if(native==='grabbing')return {kind:'drag',symbol:'✥',label:'이동 중'};
  if(native==='grab'||native==='move'||native==='all-scroll'||draggable)return {kind:'drag',symbol:'✥',label:'끌어서 이동'};
  if(native==='pointer'||interactive)return {kind:'link',symbol:'↗',label:'클릭할 수 있음'};
  if(native==='text'||native==='vertical-text'||editable||text)return {kind:'text',symbol:'Ⅰ',label:'글자 입력·선택'};
  if(native==='crosshair')return {kind:'precise',symbol:'＋',label:'정밀 선택'};
  if(native==='zoom-in'||native==='zoom-out')return {kind:'zoom',symbol:native==='zoom-in'?'+':'−',label:native==='zoom-in'?'확대':'축소'};
  return {kind:'default',symbol:'',label:'클릭 위치'};
}

export function isMuteShortcut(event={}) {
  return Boolean(event.isTrusted&&!event.repeat&&!event.isComposing&&event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(event.code==='KeyM'||event.key?.toLowerCase()==='m'));
}
