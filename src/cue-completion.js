import { randomUUID } from 'node:crypto';

// Persistent visual states (puzzles/last frame) have no deadline. Only finite
// motion and scheduled phases block NEXT. Audio ends require renderer receipts.
export function finiteCueDuration(cue) {
  // Existing display-production.css entrances; their settled puzzle/state persists.
  const entrance=visual=>visual?.visible===true?(visual.type==='image'?600:visual.type==='riddle-status'?(visual.mode==='integration'?2200:800):0):0;
  return Math.max(0, entrance(cue.visual),cue.transition?.durationMs || 0, cue.overlay?.durationMs || 0, cue.visual?.durationMs || 0,cue.timing?.autoClearOverlayMs||0,cue.timing?.autoHideVisualMs||0,cue.transition?.id==='unlock-start'?cue.timing?.unlockDurationMs||0:0,
    ...(cue.sequence || []).map(phase => phase.atMs + Math.max(0,entrance(phase.visual),phase.transition?.durationMs || 0,phase.unlock?.durationMs || 0,phase.overlay?.durationMs || 0,phase.visual?.durationMs || 0)));
}

export class CueCompletion {
  constructor(cue, message, now) {
    this.id=randomUUID();this.cueId=cue.cueId;this.messageId=message?.id;
    this.started=now;this.finiteUntil=now+finiteCueDuration(cue);this.subtitleUntil=now;
    this.speech=Boolean(message);this.sfx=new Set((cue.sfx||[]).map((_,index)=>index));this.error=null;
  }
  speechStarted(message, now) {
    this.subtitleUntil=now+Math.max(0,...(message.speech?.subtitleUnits || message.speech?.segments || []).map(s=>s.endMs));
  }
  receipt(kind,key,status,error) {
    if(kind==='speech'&&(key!==this.messageId||!this.speech))return;
    if(kind==='sfx'&&!this.sfx.has(key))return;
    if (status==='error'||status==='stopped') {this.error=error || '音声を中断しました。STOP後に再準備、またはREPLAYしてください。';return;}
    if(status!=='completed')return;
    if(kind==='speech'&&key===this.messageId)this.speech=false;
    if(kind==='sfx')this.sfx.delete(key);
  }
  reason(now) {
    if(this.error)return `異常停止: ${this.error}`;
    if(this.speech)return '音声再生中（開始待ちを含む）';
    if(this.sfx.size)return 'SE再生中（開始待ちを含む）';
    if(now<this.finiteUntil)return '演出中';
    if(now<this.subtitleUntil)return '字幕表示中';
    return '';
  }
  snapshot(now) {const reason=this.reason(now);return {id:this.id,cueId:this.cueId,blocked:Boolean(reason),reason,speechPending:this.speech,sfxPending:[...this.sfx],finiteRemainingMs:Math.max(0,this.finiteUntil-now)};}
}
