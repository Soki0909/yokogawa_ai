import fs from 'node:fs/promises';
const source=JSON.parse(await fs.readFile('docs/production/latest-script-2026-10-12.json','utf8'));
const show=JSON.parse(await fs.readFile('shows/production.json','utf8'));
const special={ 'prod-v-hostile-enter': '自暴自棄になった虎谷は端末', 'prod-v-emergency-riddle': '問題が出る。', 'prod-v-recovery': 'そのとき、正面のモニターに表示された横川AIが温かな光' };
const anchors=new Map();
for(const cue of show.cues){const anchor=special[cue.id]??cue.displayText;const matches=source.paragraphs.map((p,i)=>({p,i})).filter(({p})=>p.text.includes(anchor));if(matches.length!==1)throw Error(`ANCHOR ${cue.id}: ${matches.length}`);const at=cue.id==='prod-013'&&source.paragraphs[matches[0].i-1].text.includes('警告音')?matches[0].i-1:matches[0].i;anchors.set(at,cue);}
let out=`# 『7号館からの脱出』上演台本 — 最新Production AI Cue入り\n\n作成日：2026-10-12（日本時間）\n\n原本：[Google Docs（読み取り専用）](https://docs.google.com/document/d/${source.documentId}/edit)\n\n取得modified time：${source.modifiedTime}／revision：\`${source.revisionId}\`\n\nCue基準：subtitle-script-assets-v1.1／本編${show.cues.length} Cue／NEXT guard 1200ms。太字の「ＡＩ：」行だけ今回の追記。原文の誤記・ト書きも全文残す。字下げ・改行はMarkdown用に整えた。GOは1回のNEXTで、俳優・観客・移動を待って手動で出す。Cue内の秒数はGOからの設定値。音声開始時から全字幕typewriter、原則1文1表示。画面上の改行は同じ表示内。録画の終了後2秒ルールは本番操作に適用しない。\n\n照明・外部SEは別部署の手動Cue。電子ロック／扉音／長いHOSTILE警報はPA担当。内部の起動音・HACKノイズ・ERROR警告音は固定asset slotを使用し、未提供時は代替音。Scene 5の集合は人間の呼びかけで、AI Cueはない。謎画像・非常停止コード・ヒントは創作しない。\n\n---\n\n`;
for(const [i,p] of source.paragraphs.entries()){
 const cue=anchors.get(i);if(cue)out+=`**ＡＩ：${cue.cueNumber} GO。${cue.triggerNote}。${cue.operatorNote}**\n\n`;
 const prefix=p.namedStyleType==='TITLE'?'## ':/^HEADING_[1-6]$/.test(p.namedStyleType)?'### ':'';
 out+=prefix+p.text.replace(/\u000b/g,'\n').replace(/\t/g,'　').split('\n').join('  \n')+'\n\n';
}
out+='---\n\n## Cue内自動タイミング／追加NEXT不要\n\n';
for(const cue of show.cues){const details=[];if(cue.timing?.speechDelayMs)details.push(`発話＋${cue.timing.speechDelayMs/1000}秒`);for(const s of cue.sfx??[])details.push(`${s.assetId}＋${s.atMs/1000}秒`);for(const phase of cue.sequence??[])details.push(`＋${phase.atMs/1000}秒：${phase.visual?.title??phase.overlay?.title??phase.transition?.id??phase.presentationPreset}`);if(details.length)out+=`- ${cue.cueNumber}：${details.join('／')}。\n`;}
out+='\nP-004は旧P-V01込み、P-V02は旧P-009込み、P-012は旧P-V03込み、P-V06は旧P-016込み。P-V07は100%→UI消去→NORMAL復旧まで含む。P-020は多数の人間台詞を待つ独立Cueで、P-V07から自動進行しない。P-013は内部警告音の長さだけ待って発話（代替音では0.900秒）。slot音長は起動／素材更新時に検証して反映する。原本のERROR警告SE行は原文のまま収録しているが、担当はAI内部warning slot。PAで二重再生しない。P-014の内部警告は原本の台詞前SE行ではなく、現行WAVの末尾＋3.529秒に配置している。\n\n## NEXT順\n\n'+show.cues.map((c,i)=>`${i+1}. ${c.cueNumber} — ${c.name}`).join('\n')+'\n';
await fs.writeFile('docs/production/上演台本_AI-Cue入り_2026-10-12.md',out);
console.log(`Full script: ${source.paragraphs.length} paragraphs / ${new Set(source.paragraphs.map(p=>p.tabId)).size} tabs / ${anchors.size} cues`);
