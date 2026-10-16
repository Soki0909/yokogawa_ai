// Visual-only curtain. No audio clock, speech scheduling, or timeout callbacks.
export class ShowCurtain {
  constructor(element,{now=()=>Date.now()}={}) {this.element=element;this.now=now;this.signature=null;this.animation=null;this.targetAlpha=1;}
  render(input={}) {
    const {from=1,to=1,durationMs=0,startedAt=null,status='completed'}=input;
    const signature=JSON.stringify([from,to,durationMs,startedAt,status]);if(signature===this.signature)return;
    this.signature=signature;this.animation?.cancel();this.animation=null;this.targetAlpha=1-to;
    this.element.style.opacity=String(this.targetAlpha);
    const elapsed=startedAt?Math.max(0,this.now()-Date.parse(startedAt)):durationMs;
    if(status==='active'&&durationMs>elapsed&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
      this.animation=this.element.animate([{opacity:1-from},{opacity:1-to}],{duration:durationMs,easing:'ease-in-out',fill:'both'});this.animation.currentTime=elapsed;
    }
  }
  stop(){this.animation?.cancel();this.animation=null;this.element.style.opacity=String(this.targetAlpha);this.signature=null;}
  reset(dark){this.stop();this.render({from:dark?0:1,to:dark?0:1});}
}
