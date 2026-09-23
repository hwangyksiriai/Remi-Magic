export class HoldGesture {
  constructor({holdDuration=900,moveTolerance=14,onCharge=()=>{},onTrigger=()=>{},onCancel=()=>{}}={}) {Object.assign(this,{holdDuration,moveTolerance,onCharge,onTrigger,onCancel});this.state='idle';this.pressed=false;}
  updateConfig({holdDuration=this.holdDuration}={}) {if(Number.isFinite(holdDuration))this.holdDuration=Math.max(500,Math.min(1800,holdDuration));}
  pointerDown({x,y,button=0,blocked=false},now) {if(button!==0||blocked||this.pressed)return;this.pressed=true;this.start={x,y,now};this.state='charging';this.onCharge(0);}
  pointerMove({x,y}) {if(this.state==='charging'&&Math.hypot(x-this.start.x,y-this.start.y)>this.moveTolerance)this.cancel('drag');}
  pointerUp() {if(this.state==='charging')this.cancel('release');this.pressed=false;this.state='idle';}
  cancel(reason='cancel') {if(this.state==='charging')this.onCancel(reason);this.state=this.pressed?'cancelled':'idle';this.onCharge(0);}
  tick(now) {if(this.state!=='charging')return;const progress=Math.max(0,Math.min(1,(now-this.start.now)/this.holdDuration));this.onCharge(progress);if(progress>=1){this.state='triggered';this.onTrigger({x:this.start.x,y:this.start.y,heldFor:now-this.start.now});}}
}
