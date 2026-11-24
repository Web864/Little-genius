// Lost Letters Forest: child-led drag-and-drop missions, no points-for-taps.
import { animalHappy, littleClick, warmSound, soundEnabled, toggleSound } from './forestAudio';
const animals = [
  ['🐰','Bunny'],['🦊','Foxy'],['🐻','Bear'],['🦉','Owl'],
  ['🐼','Panda'],['🦌','Deer'],['🐿️','Squirrel'],['🦋','Butterfly']
];
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const examples = [
  ['Apple','🍎'],['Ball','⚽'],['Cat','🐱'],['Dog','🐶'],['Egg','🥚'],
  ['Fish','🐟'],['Goat','🐐'],['Hat','🎩'],['Igloo','🧊'],['Jam','🍓'],
  ['Kite','🪁'],['Lion','🦁'],['Moon','🌙'],['Nest','🪺'],['Orange','🍊'],
  ['Parrot','🦜'],['Queen','👑'],['Rabbit','🐰'],['Sun','☀️'],['Tree','🌳'],
  ['Umbrella','☂️'],['Van','🚐'],['Water','💧'],['X-ray','🩻'],['Yo-yo','🪀'],['Zebra','🦓']
];
const KEY = 'littleGeniusLostLettersV1';
let saved: {current?: number; completed?: Record<string,boolean>}={};
try { saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}; } catch { saved={}; }
const S={
  current:Number.isInteger(saved.current)?Math.max(0,Math.min(25,saved.current!)):0,
  stage:'intro',second:'path',voice:'en',message:'',dragging:null as {value:string;id:number;clone:HTMLElement;startX:number;startY:number}|null,
  selected:null as string|null,solved:0,round:0,order:[] as string[],startIndex:0,sessionSolved:0,
  animalIndex:0,mode:'course',help:false
};

const letter=()=>alphabet[S.current];
const nextLetter=()=>alphabet[(S.current+1)%26];
const word=()=>examples[S.current][0];
const example=()=>examples[S.current][1];
const friend=()=>animals[S.animalIndex%animals.length];
const save=()=>localStorage.setItem(KEY,JSON.stringify({current:S.current,completed:saved.completed||{}}));
function shuffle<T>(a: readonly T[]){
 const values=[...a];
 for(let i=values.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
 return values;
}
function options(correct: string){
 const others=shuffle(alphabet.filter(v=>v!==correct)).slice(0,3);
 return shuffle([correct,...others]);
}
function textFor(kind: string){
 const L=letter(),name=friend()[1],w=word(),ur=S.voice==='ur';
 const en: Record<string,string>={
 intro:`Oh no! ${name} has lost the letter ${L}. This is big ${L}, and small ${L.toLowerCase()}. ${L} for ${w}. Can you help find ${L}?`,
 hunt:`Look carefully in the forest. Find big letter ${L}. Drag it into ${name}'s backpack!`,
 match:`Now find the small letter ${L.toLowerCase()} that matches big ${L}. Drag it home!`,
 path:`The alphabet path has a missing stepping stone. What letter comes after ${L}? Drag ${nextLetter()} onto the empty stone.`,
 picture:`Which picture starts with ${L}? Drag the picture of ${w} into the basket.`,
 happy:`Yay! You helped ${name}! ${L} is safe again. Great looking and thinking!`
 };
 const urdu: Record<string,string>={
 intro:`اوہ نہیں! ${name} کا حرف گم گیا ہے۔ یہ بڑا ${L} ہے اور یہ چھوٹا ${L.toLowerCase()} ہے۔ ${L} فار ${w}۔ کیا تم اسے ڈھونڈنے میں مدد کرو گے؟`,
 hunt:`جنگل میں غور سے دیکھو۔ بڑا حرف ${L} ڈھونڈ کر دوست کے تھیلے میں رکھو۔`,
 match:`اب بڑے حرف ${L} سے ملتا ہوا چھوٹا حرف تلاش کرو اور تھیلے میں رکھو۔`,
 path:`حروف کے راستے میں ایک حرف گم ہے۔ ${L} کے بعد کون سا حرف آتا ہے؟ اسے خالی جگہ پر رکھو۔`,
 picture:`کون سی تصویر کا انگریزی نام ${L} سے شروع ہوتا ہے؟ صحیح تصویر تھیلے میں رکھو۔`,
 happy:`واہ! تم نے دوست کی مدد کر دی۔ بہت اچھی کوشش!`
 };
 return (ur?urdu:en)[kind];
}
function talk(kind: string){
 if(!window.speechSynthesis)return;
 speechSynthesis.cancel();
 const voices=speechSynthesis.getVoices();
 const voice=voices.find(v=>v.lang.toLowerCase().startsWith(S.voice==='ur'?'ur':'en'));
 if(S.voice==='ur'&&!voice){
   S.message='Urdu speaking voice is not installed on this device. A parent can read the message aloud.';
   renderPanel();
   return;
 }
 const utterance=new SpeechSynthesisUtterance(textFor(kind));
 utterance.lang=S.voice==='ur'?'ur-PK':'en-US';
 if(voice)utterance.voice=voice;
 utterance.rate=.79; utterance.pitch=1.05;
 speechSynthesis.speak(utterance);
}
function newMission(letterIndex: number,mode='course'){
 S.current=letterIndex; S.mode=mode;S.stage='intro';S.round=0;
 S.message='';S.selected=null;S.dragging=null;S.help=false;
 S.animalIndex=Math.floor(Math.random()*animals.length);
 S.second=shuffle(['path','match','picture'])[0];
 S.order=options(letter());S.startIndex=letterIndex;
 save();
}
const tile=(value: string,label: string)=>`<button class="lost-tile" data-lost-value="${value}" aria-label="${label||'Drag '+value}" type="button"><span>${value}</span><span class="tile-grip" aria-hidden="true">⠿</span></button>`;
const drops=(label: string)=>`<div class="lost-drop" data-lost-drop="yes" role="group" aria-label="${label}"><span class="lost-drop-icon">🎒</span><strong>${label}</strong><span class="lost-drop-help">Drop here ↓</span></div>`;
function scene(){
 return `<div class="lost-landscape" aria-hidden="true"><div class="lost-cloud">☁️ ☀️ ☁️</div><div class="lost-trees">🌲 🌳 🌿 🌳 🌲</div><div class="lost-animal">${friend()[0]}</div><div class="lost-ground">🌸 🍄 🌷 🍀 🌼</div></div>`;
}
function body(){
 const L=letter(),stage=S.stage;
 if(stage==='pause')return `<div class="lost-end"><div class="lost-win">🌻 🦊 🌈</div><h2>Forest friends are happy!</h2><p>You've helped three friends. Great time for a movement break, then you can play again.</p><button class="btn" data-lost-act="resume">Help another friend</button><button class="ghost" data-lost-act="exit">🏡 Choose a different activity</button></div>`;
 if(stage==='intro'){
  return `<div class="lost-dialogue"><div class="lost-speechbubble"><strong>Oh no! My letter ${L} is missing!</strong><p>Can you help me find it? 🥺</p></div><div class="lost-teach"><div><span>Big letter</span><strong>${L}</strong></div><div><span>Small letter</span><strong>${L.toLowerCase()}</strong></div><div><span>${L} for ${word()}</span><strong>${example()}</strong></div></div><div class="lost-actions"><button class="ghost" data-lost-act="hear">🔊 Hear the letter</button><button class="btn" data-lost-act="find">🔎 Let's find ${L}!</button></div></div>`;
 }
 if(stage==='happy'){
  return `<div class="lost-end"><div class="lost-win">🎉 ${friend()[0]} 💛</div><div class="lost-sound-effect">🎵 Happy animal sounds!</div><h2>You rescued letter ${L}!</h2><p>${friend()[1]} is happy! You found ${L} and helped finish the challenge.</p><div class="lost-actions"><button class="ghost" data-lost-act="replay-sound">🔊 Hear the happy sound again</button><button class="btn" data-lost-act="next">🐾 Help the next friend</button><button class="ghost" data-lost-act="retry">🎲 New surprise with ${L}</button><button class="ghost" data-lost-act="exit">Take a break</button></div></div>`;
 }
 let label, target, vals,exampleIcon='';
 if(stage==='hunt'){
  label=`${friend()[1]}'s backpack — letter ${L}`;target=L;vals=S.order;
 }else if(S.second==='match'){
  label=`Small letter for ${L}`;target=L.toLowerCase();vals=shuffle([target,...options(L).filter(v=>v!==L).slice(0,3).map(v=>v.toLowerCase())]);exampleIcon=`<p class="lost-clue">Match this big letter: <b>${L}</b></p>`;
 }else if(S.second==='path'){
  const next=S.current===25?'A':nextLetter();
  target=next;label='Missing stepping stone';
  vals=shuffle([next,...options(next).filter(v=>v!==next).slice(0,3)]);
  exampleIcon=`<div class="lost-path"><span>${L}</span><span class="lost-question">?</span><span>${alphabet[(S.current+2)%26]}</span></div><p class="lost-clue">Which letter comes just after ${L}?</p>`;
 }else{
  target=example();label=`Picture for ${L}`;
  const distractors=shuffle(examples.filter((_,i)=>i!==S.current).map(x=>x[1])).slice(0,3);
  vals=shuffle([target,...distractors]);exampleIcon=`<p class="lost-clue">Which picture shows <b>${word()}</b>?</p>`;
 }
 const title=stage==='hunt'?`Find the hidden ${L}!`:S.second==='match'?`Match big ${L} with little ${L.toLowerCase()}`:S.second==='path'?'Fix the alphabet bridge!':`Find ${word()}!`;
 return `<div class="lost-play"><h2>${title}</h2>${exampleIcon}<p>Drag the correct tile into the backpack. On keyboard, select a tile and then select the backpack.</p><div class="lost-tiles">${vals.map(v=>tile(v,'Drag '+v+' to '+label)).join('')}</div><div class="lost-drop-row">${drops(label)}</div><div class="lost-feedback" role="status">${S.message||'Look carefully. Your friend needs your help! 💚'}</div><div class="lost-actions"><button class="ghost" data-lost-act="hear">🔊 Hear Foxy again</button><button class="ghost" data-lost-act="hint">💡 Show me a clue</button></div></div>`;
}
export function lostForestView(){
 return `<section class="panel lost-forest"><div class="lost-kicker">🌳 LOST LETTERS FOREST</div><div class="lost-heading"><div class="step">${S.mode==='course'?'Alphabet trail':'Surprise replay'} · Letter ${letter()} · Friend ${S.sessionSolved+1}</div><button class="ghost" data-lost-act="sound-toggle" aria-pressed="${soundEnabled()?'true':'false'}">${soundEnabled()?'🔊 Sound on':'🔇 Sound off'}</button><button class="ghost" data-lost-act="restart">🔄 New forest mission</button></div>${scene()}${body()}<div class="lost-bottom">🎓 Learn the shape → Find it → Drag it → Help your friend. No timer or forced streak.</div></section>`;
}
function renderPanel(){
 const el=document.querySelector('.lost-forest');
 if(el){el.outerHTML=lostForestView();attachDrag();}
}
function correct(){
 if(S.stage==='hunt'){
  S.stage='challenge';S.message='You found the right letter! Now help with one more clue. 🦋';
  renderPanel();talk(S.second);return;
 }
 if(S.stage==='challenge'){
  S.stage='happy';S.message='';S.sessionSolved++;
  if(S.mode==='course'){
    saved.completed=saved.completed||{};saved.completed[letter()]=true;save();
  }
  renderPanel();
  animalHappy(friend()[1]);
  talk('happy');
 }
}
function attempt(value: string){
 if(S.stage!=='hunt'&&S.stage!=='challenge')return;
 const target=S.stage==='hunt'?letter():S.second==='match'?letter().toLowerCase():S.second==='path'?nextLetter():example();
 if(value===target){correct();return;}
 S.message=`That wasn't the one. Look for ${target} and try again. Your friend can help!`;
 renderPanel();
}
function nextMission(){
 if(S.sessionSolved>=3){S.stage='pause';renderPanel();return;}
 const next=(S.current+1)%26;
 newMission(next,S.mode);renderPanel();talk('intro');
}
function attachDrag(){
 const root=document.querySelector('.lost-forest');if(!root)return;
 const tiles=root.querySelectorAll<HTMLElement>('.lost-tile');
 for(const tile of tiles){
  tile.addEventListener('pointerdown',e=>{
   if(e.button!==undefined&&e.button!==0)return;
   e.preventDefault();
   const value=tile.dataset.lostValue;if(!value)return;
   const clone=document.createElement('div');clone.className='lost-ghost';clone.textContent=value;
   document.body.appendChild(clone);
   clone.style.left=e.clientX+'px';clone.style.top=e.clientY+'px';
   S.dragging={value,id:e.pointerId,clone,startX:e.clientX,startY:e.clientY};
   tile.setPointerCapture(e.pointerId);
   tile.classList.add('is-dragging');
  });
  tile.addEventListener('pointermove',e=>{
   if(!S.dragging||S.dragging.id!==e.pointerId)return;
   S.dragging.clone.style.left=e.clientX+'px';S.dragging.clone.style.top=e.clientY+'px';
   const drop=document.elementFromPoint(e.clientX,e.clientY)?.closest('.lost-drop');
   const rootDrop=root.querySelector<HTMLElement>('.lost-drop');
   rootDrop?.classList.toggle('ready',!!drop);
  });
  const end=(e: PointerEvent)=>{
   if(!S.dragging||S.dragging.id!==e.pointerId)return;
   const drag=S.dragging;
   const isDrop=!!document.elementFromPoint(e.clientX,e.clientY)?.closest('.lost-drop');
   drag.clone.remove(); S.dragging=null;
   tile.classList.remove('is-dragging');root.querySelector<HTMLElement>('.lost-drop')?.classList.remove('ready');
   const moved=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>12;
   if(isDrop&&moved){S.selected=null;attempt(drag.value);}
   else if(!moved){S.selected=drag.value;S.message='Selected '+drag.value+'. Now tap the backpack, or drag it there.';const old=root.querySelector('.lost-feedback');if(old)old.textContent=S.message;root.querySelectorAll<HTMLElement>('.lost-tile').forEach(t=>t.classList.toggle('selected',t.dataset.lostValue===drag.value));}
  };
  tile.addEventListener('pointerup',end);tile.addEventListener('pointercancel',end);
  tile.addEventListener('click',()=>{
   S.selected=tile.dataset.lostValue ?? null;S.message='Selected '+S.selected+'. Now choose the backpack.';
   root.querySelectorAll<HTMLElement>('.lost-tile').forEach(t=>t.classList.toggle('selected',t.dataset.lostValue===S.selected));
   const status=root.querySelector('.lost-feedback');if(status)status.textContent=S.message;
  });
 }
 const drop=root.querySelector<HTMLElement>('.lost-drop');
 if(drop){
  drop.tabIndex=0;
  drop.setAttribute('role','button');
  drop.addEventListener('click',()=>{if(S.selected){const v=S.selected;S.selected=null;attempt(v);}});
  drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(S.selected){const v=S.selected;S.selected=null;attempt(v);}}});
 }
}
let wired=false;
export function activateLostForest({language}: {language:string}){
 S.voice=language;attachDrag();
 if(wired)return;wired=true;
 document.addEventListener('click',e=>{
  if (!(e.target instanceof Element)) return;
  const b=e.target.closest('button');if(!b||!e.target.closest('.lost-forest'))return;
  const action=b.dataset.lostAct;if(!action)return;
  if(action==='sound-toggle'){toggleSound();renderPanel();return;}
  if(action==='replay-sound'){warmSound();animalHappy(friend()[1]);return;}
  if(action==='hear'){warmSound();talk(S.stage==='intro'?'intro':S.stage==='hunt'?'hunt':S.stage==='happy'?'happy':S.second);return;}
  if(action==='find'){warmSound();littleClick();S.stage='hunt';S.order=options(letter());S.message='';renderPanel();talk('hunt');return;}
  if(action==='hint'){const target=S.stage==='hunt'?letter():S.second==='match'?letter().toLowerCase():S.second==='path'?nextLetter():example();S.message='Hint: Look for '+target+'.';renderPanel();return;}
  if(action==='next'){nextMission();return;}
  if(action==='retry'){newMission(S.current,'replay');renderPanel();talk('intro');return;}
  if(action==='resume'){S.sessionSolved=0;nextMission();return;}
  if(action==='restart'){S.sessionSolved=0;newMission(0,'course');renderPanel();talk('intro');return;}
  if(action==='exit'){document.querySelector<HTMLElement>('[data-tab="home"]')?.click();return;}
 });
}
export function lostForestSummary(){
 const completed=saved.completed||{};
 return `<p class="note"><strong>Lost Letters Forest:</strong> ${Object.keys(completed).filter(k=>completed[k]).length} letter-rescue missions completed. Each rescue includes a letter hunt and another matching or alphabet puzzle.</p>`;
}
