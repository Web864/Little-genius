import { recordMathCompletion } from './mathProgress';
import { speakGuidance } from './speechHelp';
// A focused, self-contained number-learning world.
const N={number:1,stage:'teach',message:'',modal:false,lines:[] as {x:number;y:number}[][],drawing:false,free:false,language:'en',counted:[] as number[],retry:0};
const words=['','one','two','three','four','five','six','seven','eight','nine','ten'];
const objects=['','⭐','🍎','🐠','🌼','🦋','🌟','🍊','🚀','🐚','💎'];
const phases=['teach','count','recognize','draw'];
function audio(text: string){
 speakGuidance(text,N.language,warning=>{N.message=warning;repaint();});
}
function guide(){
 const k=N.number;
 if(N.language==='ur')return N.stage==='teach'?`یہ نمبر ${k} ہے۔ آؤ مل کر ${k} چیزیں گنیں۔`:N.stage==='count'?'کتنی چیزیں ہیں؟ گن کر صحیح نمبر چنو۔':N.stage==='recognize'?`نمبر ${k} تلاش کرو۔`:`اپنی انگلی سے نمبر ${k} بناؤ۔`;
 return N.stage==='teach'?`This is number ${k}. Let us count ${k} objects together.`:N.stage==='count'?'Count the objects and choose the correct number.':N.stage==='recognize'?`Find number ${k}!`:`Draw number ${k} with your finger.`;
}
function choices(){
 const k=N.number,values=k===10?[8,10,9]:k===1?[2,1,3]:[k+1,k,k-1];
 return values.map((x,i)=>`<button class="lga-math-tile tint-${i} ${N.modal&&x===k?'is-correct':N.retry===x?'is-retry':''}" data-n-choice="${x}" ${N.modal?'disabled':''}>${x}</button>`).join('');
}
function drawnObjects(k: number){return Array.from({length:k},(_,i)=>`<button class="lga-math-object ${N.counted.includes(i+1)?'lga-counted':''}" data-n-count="${i+1}" aria-label="Count object ${i+1}" aria-pressed="${N.counted.includes(i+1)}">${objects[k]}</button>`).join('');}
export function numbersView(){
 const k=N.number;let middle='';
 const hear=`<button class="lga-math-alt" data-n-act="hear">🔊 Listen</button>`;
 if(N.stage==='finish')middle=`<div class="mascot">🎉🚀</div><h2>Great! You learned 1–10!</h2><button class="lga-math-main" data-n-act="restart">Play again</button>`;
 else if(N.stage==='teach')middle=`<button class="lga-math-number" data-n-act="hear" aria-label="Hear number ${k}">${k}</button><h2>Count with me!</h2><div class="lga-math-objects">${drawnObjects(k)}</div><p class="lga-math-word">${words[k]}</p><div class="lga-math-actions">${hear}<button class="lga-math-main" data-n-act="advance">Next →</button></div>`;
 else if(N.stage==='count'||N.stage==='recognize')middle=`<h2>${N.stage==='count'?'How many objects?':`Find the number ${k}!`}</h2>${N.stage==='count'?`<div class="lga-math-objects">${drawnObjects(k)}</div>`:''}${hear}<div class="lga-math-tiles">${choices()}</div><div class="lga-math-feedback" role="status">${N.modal?'⭐ Great counting!':N.message}</div>${N.modal?'<button class="lga-math-main" data-n-act="next">Next →</button>':N.retry?'<button class="lga-math-alt" data-n-act="retry">Try again</button>':''}`;
 else middle=`<h2>Trace the number ${k}</h2><div class="lga-math-canvas"><canvas id="number-canvas" width="600" height="360" aria-label="Draw number ${k}"></canvas></div><div class="lga-math-actions"><button class="lga-math-alt" data-n-act="toggle-guide" aria-pressed="${!N.free}">Show guide</button><button class="lga-math-alt" data-n-act="erase">Erase</button><button class="lga-math-main" data-n-act="done">Done ✓</button></div>`;
 return `<section class="panel game number-world lga-math-world"><h1>Number Galaxy</h1><progress class="lga-lesson-progress" max="40" value="${(k-1)*4+Math.max(phases.indexOf(N.stage),0)}" aria-label="Number lesson progress"></progress>${middle}</section>`;
}
function repaint(){const node=document.querySelector('.number-world');if(node){node.outerHTML=numbersView();board();}}
function advance(){N.stage=phases[phases.indexOf(N.stage)+1]||'teach';N.message='';N.lines=[];N.free=false;N.counted=[];N.retry=0;N.modal=false;repaint();audio(guide());}
function board(){
 const c=document.querySelector<HTMLCanvasElement>('#number-canvas');if(!c)return;const context=c.getContext('2d');if(!context)return;const x=context;
 function paint(){
  x.clearRect(0,0,600,360);x.fillStyle='#fffcf5';x.fillRect(0,0,600,360);x.setLineDash([8,8]);x.strokeStyle='#e8dff4';
  for(const y of [80,190,295]){x.beginPath();x.moveTo(20,y);x.lineTo(580,y);x.stroke();}
  x.setLineDash([]);if(!N.free){x.font='bold 270px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#e2d4ff';x.fillText(String(N.number),300,180);}
  x.strokeStyle='#7655d7';x.lineWidth=13;x.lineCap='round';x.lineJoin='round';
  for(const path of N.lines){if(!path.length)continue;x.beginPath();x.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))x.lineTo(p.x,p.y);x.stroke();}
 }
 const point=(e: PointerEvent)=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*360/r.height};};
 c.onpointerdown=e=>{e.preventDefault();N.drawing=true;N.lines.push([point(e)]);c.setPointerCapture(e.pointerId);paint();};
 c.onpointermove=e=>{if(!N.drawing)return;N.lines[N.lines.length-1].push(point(e));paint();};
 c.onpointerup=()=>{N.drawing=false;};c.onpointercancel=()=>{N.drawing=false;};paint();
}
let active=false;
export function activateNumbers({language}: { language: string }){
 N.language=language;board();if(active)return;active=true;
 document.addEventListener('click',e=>{
  if (!(e.target instanceof Element)) return;
  const b=e.target.closest('button');if(!b||!e.target.closest('.number-world'))return;
  const act=b.dataset.nAct,choice=b.dataset.nChoice;
  if(b.dataset.nCount){const count=Number(b.dataset.nCount);if(!N.counted.includes(count)){N.counted.push(count);b.classList.add('lga-counted');b.setAttribute('aria-pressed','true');}audio(N.language==='ur'?String(count):words[count]);return;}
  if(choice){if(N.modal)return;const ok=Number(choice)===N.number;N.modal=ok;N.retry=ok?0:Number(choice);N.message=ok?'':'Almost! Let’s count again.';repaint();audio(N.language==='ur'?(ok?'شاباش! صحیح جواب!':'دوبارہ گنو۔'):(ok?'Great counting!':'Try counting again.'));return;}
  if(act==='retry'){N.retry=0;N.message='';repaint();return;}
  if(act==='toggle-guide'){N.free=!N.free;repaint();return;}
  if(act==='hear'){audio(guide());return;}
  if(act==='advance'){advance();return;}
  if(act==='next'){N.modal=false;advance();return;}
  if(['guide','free','erase'].includes(act ?? '')){if(act!=='erase')N.free=act==='free';N.lines=[];N.message='';repaint();return;}
  if(act==='done'){recordMathCompletion('numbers',N.number);N.lines=[];N.free=false;N.message='';N.counted=[];N.retry=0;if(N.number===10)N.stage='finish';else{N.number++;N.stage='teach';}repaint();if(N.stage==='finish')audio(N.language==='ur'?'شاباش! تم نے دس نمبر سیکھ لیے۔':'Hooray! All ten numbers completed!');else audio(guide());return;}
  if(act==='restart'){N.number=1;N.stage='teach';N.message='';N.modal=false;N.counted=[];N.retry=0;repaint();audio(guide());}
 });
}
