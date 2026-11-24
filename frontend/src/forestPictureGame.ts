import { fullAnimal } from './animalArt';
import { speakGuidance } from './speechHelp';
import { animalHappy, littleClick, warmSound, soundEnabled, toggleSound } from './forestAudio';
import { rateForSpeech } from './voicePace';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const familiar = ['A','B','C','D','F','L','M','P','S','T'];
const images = {
  A:[['Apple','🍎'],['Ant','🐜']],B:[['Ball','⚽'],['Bird','🐦']],
  C:[['Cat','🐱'],['Car','🚗']],D:[['Dog','🐶'],['Duck','🦆']],
  E:[['Egg','🥚'],['Elephant','🐘']],F:[['Fish','🐟'],['Flower','🌼']],
  G:[['Goat','🐐'],['Grapes','🍇']],H:[['Hat','🎩'],['Horse','🐴']],
  I:[['Igloo','🧊'],['Insect','🐛']],J:[['Jam','🍓'],['Jug','🫗']],
  K:[['Kite','🪁'],['Key','🔑']],L:[['Lion','🦁'],['Lemon','🍋']],
  M:[['Moon','🌙'],['Mango','🥭']],N:[['Nest','🪺'],['Nose','👃']],
  O:[['Orange','🍊'],['Owl','🦉']],P:[['Parrot','🦜'],['Pig','🐷']],
  Q:[['Queen','👑'],['Quilt','🛏️']],R:[['Rabbit','🐇'],['Rainbow','🌈']],
  S:[['Sun','☀️'],['Star','⭐']],T:[['Tree','🌳'],['Tiger','🐯']],
  U:[['Umbrella','☂️'],['Unicorn','🦄']],V:[['Van','🚐'],['Vase','🏺']],
  W:[['Water','💧'],['Whale','🐋']],X:[['X-ray','🩻'],['Xylophone','🎹']],
  Y:[['Yo-yo','🪀'],['Yak','🐂']],Z:[['Zebra','🦓'],['Zoo','🦒']]
};
const animals=[['🐰','Bunny'],['🦊','Foxy'],['🐻','Bear'],['🦉','Owl'],['🐼','Panda'],['🦌','Deer'],['🐿️','Squirrel'],['🦋','Butterfly']];
const key='littleGeniusPictureRescue';
let saved={};
try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
const S={letter:null,animal:0,step:'intro',language:'en',opts:[],remaining:[],chosen:null,drag:null,rescued:0,message:''};
function shuffle(values){
 const a=[...values];
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
}
function save(){localStorage.setItem(key,JSON.stringify(saved));}
function pickLetter(){
 const learned=alphabet.filter(l=>saved[l]?.success);
 const pool=learned.length>=5?alphabet:familiar;
 const unseen=pool.filter(l=>l!==saved.last&&!saved[l]?.success);
 const choices=unseen.length?unseen:pool.filter(l=>l!==saved.last);
 return shuffle(choices)[0]||'L';
}
function nextMission(force){
 const previous=S.animal;
 S.letter=force||pickLetter(); S.animal=shuffle(animals.map((_,i)=>i).filter(i=>i!==previous))[0];
 S.step='intro';S.message='';S.chosen=null;S.remaining=[];S.opts=[];
 saved.last=S.letter;save();
}
function animal(){return animals[S.animal];}
function allObjects(){
 return Object.entries(images).flatMap(([letter,items])=>items.map(([word,emoji])=>({id:letter+':'+word,letter,word,emoji})));
}
function options(correct){
 const wanted=correct.map(([word,emoji])=>({id:S.letter+':'+word,letter:S.letter,word,emoji}));
 const other=shuffle(allObjects().filter(x=>x.letter!==S.letter));
 const unique=[];const used=new Set();
 for(const x of other){if(!used.has(x.letter)){used.add(x.letter);unique.push(x);}if(unique.length===3)break;}
 return shuffle([...wanted,...unique]);
}
function say(message,lang){
 speakGuidance(message,lang,warning=>{
  const n=document.querySelector('.picture-audio-note');if(n)n.textContent=warning;
 });
}
function narration(){
 const L=S.letter,friend=animal()[1],word=images[L][0][0];
 if(S.language==='ur'){
  const lines={
   intro:'اوہ نہیں! '+friend+' کا حرف '+L+' گم گیا ہے۔ یہ بڑا '+L+' اور یہ چھوٹا '+L.toLowerCase()+' ہے۔ '+L+' فار '+word+'۔',
   hunt:'جنگل میں ایسی تصویر ڈھونڈو جس کا انگریزی نام '+L+' سے شروع ہو۔ لفظ سنو اور تصویر تھیلے میں رکھو۔',
   pair:'شاباش! اب دو الگ تصویریں تلاش کرو جن کے نام '+L+' سے شروع ہوتے ہیں۔',
   happy:'واہ! تم نے صحیح لفظ اور حرف تلاش کرکے دوست کی مدد کی!'
  };say(lines[S.step]||lines.hunt,'ur');
 }else{
  const lines={
   intro:'Oh no! '+friend+' lost the letter '+L+'. This is big '+L+' and small '+L.toLowerCase()+'. '+L+' for '+word+'. Can you help?',
   hunt:'Find a picture whose English name starts with '+L+'. Listen to the words, then tap the right picture.',
   pair:'Well done! Now find TWO different pictures that start with '+L+'. Rescue both one by one.',
   happy:'Hooray! '+friend+' is happy. You found the picture words that start with '+L+'!'
  };say(lines[S.step]||lines.hunt,'en');
 }
}
function tile(x){
 const selected=S.chosen===x.id?' selected':'';
 return '<div class="picture-card'+selected+'" data-card-id="'+x.id+'">'+
  '<button class="picture-pick" type="button" data-picture-pick="'+x.id+'" aria-label="Choose '+x.word+'">'+
  '<span class="picture-emoji">'+x.emoji+'</span><strong>'+x.word+'</strong></button>'+
  '<button class="picture-hear" data-picture-hear="'+x.id+'">🔊 Hear</button></div>';
}
function scene(){
 return '<div class="lost-landscape"><div class="lost-cloud">☁️ ☀️ ☁️</div>'+
  '<div class="lost-trees">🌲 🌳 🌿 🌳 🌲</div><div class="lost-animal">'+fullAnimal(animal()[1])+'</div>'+
  '<div class="lost-ground">🌸 🍄 🌷 🍀 🌼</div></div>';
}
function content(){
 const L=S.letter;
 if(S.step==='intro')return '<div class="lost-speechbubble"><strong>🥺 My letter '+L+' is missing!</strong>'+
  '<p>Can you help me find something that starts with '+L+'?</p></div>'+
  '<div class="picture-teach"><div><small>Big letter</small><b>'+L+'</b></div>'+
  '<div><small>Small letter</small><b>'+L.toLowerCase()+'</b></div>'+
  '<div><small>'+L+' for '+images[L][0][0]+'</small><b>'+images[L][0][1]+'</b></div></div>'+
  '<div class="lost-actions"><button class="ghost" data-picture-action="hear">🔊 Hear the guide</button>'+
  '<button class="btn" data-picture-action="start">🔎 Find the clue!</button></div>';
 if(S.step==='happy')return '<div class="lost-end"><div class="lost-win lg-celebration-stage" role="img" aria-label="Full-body '+animal()[1]+' dancing and celebrating"><span class="lg-confetti" aria-hidden="true">✦ ✧ ✦</span>'+fullAnimal(animal()[1],true)+'<span class="lg-celebration-hearts" aria-hidden="true">❤ ✦ ❤</span></div>'+
  '<h2>You helped '+animal()[1]+'!</h2><p>You rescued words beginning with '+L+'. Your animal friend is happy!</p>'+
  '<div class="lost-actions"><button class="ghost" data-picture-action="sound">🔁 Watch dance & hear happy sound</button>'+
  '<button class="ghost" data-picture-action="hear">🔊 Hear praise</button>'+
  '<button class="btn" data-picture-action="next">🐾 Help another animal</button>'+
  '<button class="ghost" data-picture-action="retry">🎲 New clues for '+L+'</button>'+
  '<button class="ghost" data-picture-action="exit">Take a break</button></div></div>';
 if(S.step==='break')return '<div class="lost-end"><div class="lost-win lg-break-animals">'+fullAnimal('Foxy')+fullAnimal('Bunny')+'</div>'+
  '<h2>Three animals rescued!</h2><p>Great work! Time for a little movement or paper-drawing break.</p>'+
  '<div class="lost-actions"><button class="btn" data-picture-action="continue">Play another short adventure</button>'+
  '<button class="ghost" data-picture-action="exit">Finish for now</button></div></div>';
 const isPair=S.step==='pair';
 return '<div class="picture-mission"><h2>'+(isPair?'Find two picture clues for '+L:'Find something that begins with '+L)+'</h2>'+
  '<p>Listen and tap a picture.</p>'+
  (isPair?'<div class="picture-count">Still to find: '+S.remaining.length+' of 2</div>':'')+
  '<div class="picture-grid">'+S.opts.map(tile).join('')+'</div>'+
  '<div class="lost-drop-row"><div class="picture-backpack" data-picture-drop="yes" role="button" tabindex="0" aria-label="Drop picture here">'+
  '<span>🎒</span><b>Help '+animal()[1]+'</b><small>Rescue bag</small></div></div>'+
  '<div class="lost-feedback" role="status">'+(S.message||'Listen to the word, then choose. 🌱')+'</div>'+
  '<div class="lost-actions"><button class="ghost" data-picture-action="hear">🔊 Hear the animal</button>'+
  '<button class="ghost" data-picture-action="hint">💡 Hint</button></div></div>';
}
export function lostForestView(){
 if(!S.letter)nextMission();
 return '<section class="panel lost-forest picture-forest"><div class="lost-kicker">🌳 LOST LETTERS · PICTURE RESCUE</div>'+
  '<div class="lost-heading"><span class="step">Surprise letter: '+S.letter+'</span>'+
  '<button class="ghost" data-picture-action="toggle">'+(soundEnabled()?'🔊 Sound on':'🔇 Sound off')+'</button>'+
  '<button class="ghost" data-picture-action="new">🎲 New surprise</button></div>'+
  scene()+content()+'<p class="picture-audio-note"></p>'+
  '</section>';
}
function update(){
 const root=document.querySelector('.picture-forest');
 if(root){root.outerHTML=lostForestView();bindDrag();}
}
function win(){ S.step='happy';S.rescued++;
 const score=saved[S.letter]||{success:0,wrong:0};score.success++;saved[S.letter]=score;save();
 update();animalHappy(animal()[1]);
}
function attempt(id){
 const obj=S.opts.find(x=>x.id===id);if(!obj||!['hunt','pair'].includes(S.step))return;
 const allowed=S.step==='hunt'?[S.letter+':'+images[S.letter][0][0]]:S.remaining;
 if(allowed.includes(id)){
  littleClick();S.chosen=null;
  if(S.step==='hunt'){
   S.step='pair';S.remaining=images[S.letter].map(([word])=>S.letter+':'+word);
   S.opts=options(images[S.letter]);S.message='Great! Find two words starting with '+S.letter+'.';
   update();narration();
  }else{
   S.remaining=S.remaining.filter(x=>x!==id);S.opts=S.opts.filter(x=>x.id!==id);
   if(!S.remaining.length)win();
   else{S.message='One word rescued. Find another!';update();}
  }
 }else{
  const score=saved[S.letter]||{success:0,wrong:0};score.wrong++;saved[S.letter]=score;save();
  S.message='Try again! '+obj.word+' begins with '+obj.letter+'. Listen for '+S.letter+'.';
  update();
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-picture-pick]')).find(b=>b.dataset.picturePick===id)?.classList.add('lga-retry');
 }
}
function mission(force){
 S.letter=null;nextMission(force);update();narration();
}
function bindDrag(){
 const root=document.querySelector('.picture-forest');if(!root)return;
 for(const card of root.querySelectorAll('.picture-card')){
  const button=card.querySelector('.picture-pick');
  button.addEventListener('pointerdown',e=>{
   if(e.button!==undefined&&e.button!==0)return;
   e.preventDefault();warmSound();
   const obj=S.opts.find(x=>x.id===button.dataset.picturePick);if(!obj)return;
   const ghost=document.createElement('div');ghost.className='picture-ghost';ghost.textContent=obj.emoji+' '+obj.word;
   document.body.appendChild(ghost);ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';   S.drag={id:obj.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,ghost};
   button.setPointerCapture(e.pointerId);
  });
  button.addEventListener('pointermove',e=>{
   if(!S.drag||S.drag.pointer!==e.pointerId)return;
   S.drag.ghost.style.left=e.clientX+'px';S.drag.ghost.style.top=e.clientY+'px';
   root.querySelector('.picture-backpack')?.classList.toggle('ready',!!document.elementFromPoint(e.clientX,e.clientY)?.closest('.picture-backpack'));
  });
  const finish=e=>{
   if(!S.drag||S.drag.pointer!==e.pointerId)return;
   const drag=S.drag;S.drag=null;drag.ghost.remove();
   root.querySelector('.picture-backpack')?.classList.remove('ready');
   if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>12&&document.elementFromPoint(e.clientX,e.clientY)?.closest('.picture-backpack')){
    S.chosen=null;attempt(drag.id);return;
   }
   if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<=12){attempt(drag.id);return;}
   S.chosen=null;
  };
  button.addEventListener('pointerup',finish);
  button.addEventListener('pointercancel',e=>{
   if(!S.drag||S.drag.pointer!==e.pointerId)return;
   S.drag.ghost.remove();S.drag=null;
   root.querySelector('.picture-backpack')?.classList.remove('ready');
  });
  button.addEventListener('click',()=>{
   if(!button.isConnected||!['hunt','pair'].includes(S.step))return;
   if(button.dataset.picturePick)attempt(button.dataset.picturePick);
  });
 }
 const drop=root.querySelector('.picture-backpack');if(drop){
  const act=()=>{if(S.chosen){const id=S.chosen;S.chosen=null;attempt(id);}};
  drop.addEventListener('click',act);drop.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}
  });
 }
}
let wired=false;
export function activateLostForest({language}){
 S.language=language;bindDrag();if(wired)return;wired=true;
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!e.target.closest('.picture-forest'))return;
  const word=b.dataset.pictureHear,act=b.dataset.pictureAction;
  if(word){const obj=S.opts.find(x=>x.id===word);if(obj)say(obj.word,'en');return;}
  if(act==='hear'){warmSound();narration();}
  if(act==='toggle'){toggleSound();update();}
  if(act==='start'){
   warmSound();S.step='hunt';S.opts=options([images[S.letter][0]]);S.message='';
   update();narration();
  }
  if(act==='hint'){
   const target=S.step==='hunt'?images[S.letter][0][0]:images[S.letter].find(([w])=>S.remaining.includes(S.letter+':'+w))?.[0];
   S.message='Listen for '+S.letter+'.';update();const wrong=S.opts.find(x=>x.letter!==S.letter);if(wrong){const b=Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]')).find(x=>x.dataset.cardId===wrong.id);if(b)b.style.visibility='hidden';}
  }
  if(act==='new'||act==='next'){
   if(act==='next'&&S.rescued>=3){S.step='break';update();return;}
   mission();
  }
  if(act==='retry')mission(S.letter);
  if(act==='continue'){S.rescued=0;mission();}
  if(act==='exit')document.querySelector('[data-tab="home"]')?.click();
  if(act==='sound'){
  warmSound();animalHappy(animal()[1]);
  const figure=document.querySelector('.lg-celebration-stage .lg-animal');
  if(figure){figure.classList.remove('lg-animal--celebrate');void figure.offsetWidth;figure.classList.add('lg-animal--celebrate');}
 }
 });
}
export function lostForestCount(){return Object.keys(saved).filter(k=>saved[k]?.success).length;}
export function lostForestSummary(){
 return '<p class="note"><strong>Lost Letters Forest:</strong> '+Object.keys(saved).filter(k=>saved[k]?.success).length+
  ' different letters rescued. Success means practice, not confirmed letter mastery.</p>';
}
