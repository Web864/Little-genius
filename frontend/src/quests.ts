import { speakGuidance } from './speechHelp';
// Choice-led, short, meaningful adventures. No timers, streaks or loot boxes.
import { rateForSpeech } from './voicePace';
const quests={
 forest:{name:'Help Foxy Find Lunch',emoji:'🦊',scene:'🌳 🌷 🦋',friend:'🦊',
  story:'Foxy is hungry! Help find an apple, collect three apples, and find a round plate.',
  letter:'A',word:'Apple',item:'🍎',quantity:3,shape:'Circle',finish:'You helped Foxy prepare a lovely lunch! 🦊🍎'},
 space:{name:'Help Luna Reach the Moon',emoji:'🚀',scene:'🌌 🪐 ✨',friend:'👩‍🚀',
  story:'Luna needs to find the Moon, collect two shining stars, and choose the right shape for the rocket.',
  letter:'M',word:'Moon',item:'⭐',quantity:2,shape:'Triangle',finish:'The rocket is ready! Luna reaches the moon. 👩‍🚀🚀🌙'},
 ocean:{name:'Help Dory Find the Treasure',emoji:'🐬',scene:'🌊 🪸 🐠',friend:'🐬',
  story:'A little dolphin lost its treasure. Find the Sun clue, collect four shells, and choose the treasure shape.',
  letter:'S',word:'Sun',item:'🐚',quantity:4,shape:'Star',finish:'The dolphin found its treasure! Thank you for helping. 🐬⭐'}
};
const shapeIcons={Circle:'●',Square:'■',Triangle:'▲',Star:'★'};
const progressKey='littleGeniusAdventureQuests';
let completed={};try{completed=JSON.parse(localStorage.getItem(progressKey)||'{}');}catch{}
const st={quest:null,stage:0,amount:0,message:'',voice:'en',hint:false,feedback:false};
function save(){localStorage.setItem(progressKey,JSON.stringify(completed));}
function speak(text){
 speakGuidance(text,st.voice,warning=>{st.message=warning;renderArea();});
}
function narrate(){
 const q=quests[st.quest];if(!q)return;
 if(st.voice==='ur'){
   const lines=[
    'آؤ اپنے دوست کی مدد کریں۔ پہلے صحیح انگریزی کا حرف ڈھونڈو۔',
    'بہت اچھے! اب ایک ایک چیز کو دبا کر تھیلے میں رکھو۔ گن کر پوری تعداد جمع کرو۔',
    'شاباش! اب صحیح شکل ڈھونڈو۔',
    'واہ! تم نے اپنے دوست کی مدد کی۔'
   ];return speak(lines[st.stage]);
 }
 const lines=[
   q.story+' First, find the letter '+q.letter+'.',
   'Great! Tap each '+q.item+' and put '+q.quantity+' in the basket. Count each one!',
   'Now pick the '+q.shape.toLowerCase()+' shape to finish the adventure.',
   'You helped your friend! Now tell a grown-up what happened.'
 ];speak(lines[st.stage]);
}
function choose(items,target,type){
 return items.map((v,i)=>'<button class="quest-choice" data-quest-answer="'+v+'" aria-label="'+v+'">'+(type==='shape'?'<span class="quest-symbol">'+(shapeIcons[v]||'◆')+'</span><span>'+v+'</span>':'<span>'+v+'</span>')+'</button>').join('');
}
export function questView(){
 if(!st.quest){
  return '<section class="panel game quest-world quest-picker"><div class="section-kicker">🎒 CHOOSE YOUR OWN ADVENTURE</div><h2>Who would you like to help?</h2><div class="quest-cards">'+Object.entries(quests).map(([id,q])=>'<button class="quest-select" data-quest-start="'+id+'"><span class="quest-landscape">'+q.scene+'</span><span class="quest-character">'+q.friend+'</span><strong>'+q.name+'</strong><span>Join adventure →</span>'+(completed[id]?'<small>Already helped once ✓</small>':'')+'</button>').join('')+'</div></section>';
 }
 const q=quests[st.quest];
 let content='';
 if(st.stage===0)content='<div class="quest-intro"><div class="quest-big">'+q.friend+' '+q.item+'</div><h2>Help your friend find '+q.word+'!</h2><p>Which letter starts the word <strong>'+q.word+'</strong>?</p><div class="quest-choices">'+choose([q.letter,q.letter==='M'?'B':'P',q.letter==='S'?'T':'C'],q.letter)+'</div></div>';
 if(st.stage===1){
  const left=q.quantity-st.amount;
  content='<div class="quest-collect"><h2>Collect '+q.quantity+' '+q.item+' for your friend!</h2><p>Tap the objects below one at a time.</p><div class="quest-basket"><span class="quest-counter">In basket: '+st.amount+' / '+q.quantity+'</span><div class="quest-basket-items">'+Array.from({length:st.amount},()=>q.item).join(' ')+'</div></div><div class="quest-objects">'+Array.from({length:left},(_,i)=>'<button class="quest-object" data-quest-act="collect" aria-label="Put '+q.item+' in basket">'+q.item+'</button>').join('')+'</div></div>';
 }
 if(st.stage===2)content='<div class="quest-intro"><h2>One last clue: find the '+q.shape+'!</h2><p>Look at each shape, then choose the matching one.</p><div class="quest-choices shape-choices">'+choose([q.shape,q.shape==='Circle'?'Triangle':'Circle',q.shape==='Square'?'Star':'Square'],q.shape,'shape')+'</div></div>';
 if(st.stage===3)content='<div class="quest-end"><div class="quest-big">🎊 '+q.friend+' ✨</div><h2>Adventure complete!</h2><p>'+q.finish+'</p><div class="quest-end-actions"><button class="btn" data-quest-act="home">Choose another story</button><button class="ghost" data-quest-act="break">🌿 Take a break</button></div></div>';
 return '<section class="panel game quest-world"><div class="quest-scene"><span class="quest-scenes">'+q.scene+'</span><span class="quest-friend">'+q.friend+'</span></div><div class="quest-header"><span class="step">🗺️ '+q.name+' · '+(Math.min(st.stage+1,3))+' / 3</span><button class="ghost quest-exit" data-quest-act="home">Exit adventure</button></div><div class="progress"><div class="bar" style="width:'+(st.stage/3*100)+'%"></div></div>'+content+'<p class="quest-feedback" aria-live="polite">'+(st.message||'Your friend is counting on you! 🌟')+'</p>'+(st.stage<3?'<div class="quest-tools"><button class="ghost" data-quest-act="hear">🔊 Hear Foxy</button><button class="ghost" data-quest-act="hint">💡 A little hint</button></div>':'')+'</section>';
}
function renderArea(){const x=document.querySelector('.quest-world');if(x)x.outerHTML=questView();}
function success(){
 st.message='Wonderful! You helped your friend. 💛';
 st.stage++;st.hint=false;
 if(st.stage===3){completed[st.quest]=true;save();}
 renderArea();narrate();
}
let wired=false;
export function activateQuest({language}){
 st.voice=language;
 if(wired)return;wired=true;
 document.addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn||!e.target.closest('.quest-world'))return;
  const start=btn.dataset.questStart,act=btn.dataset.questAct,answer=btn.dataset.questAnswer;
  if(start){st.quest=start;st.stage=0;st.amount=0;st.message='';renderArea();narrate();return;}
  if(answer!==undefined){
   if(answer=== (st.stage===0?quests[st.quest].letter:quests[st.quest].shape)){success();}
   else{st.message='Almost! Let’s listen again.';renderArea();Array.from(document.querySelectorAll<HTMLButtonElement>('[data-quest-answer]')).find(x=>x.dataset.questAnswer===answer)?.classList.add('lga-retry');}
   return;
  }
  if(act==='collect'){
   if(st.stage!==1)return;
   st.amount++;st.message='Nice counting! '+st.amount+' collected.';
   if(st.amount>=quests[st.quest].quantity)success();else renderArea();
   return;
  }
  if(act==='hear'){narrate();return;}
  if(act==='hint'){const q=quests[st.quest];st.message=st.stage===0?'Hint: '+q.word+' begins with '+q.letter+'.':st.stage===1?'Hint: Tap each '+q.item+' exactly once.':'Hint: The name of the shape is '+q.shape+'.';renderArea();return;}
  if(act==='home'||act==='break'){st.quest=null;st.stage=0;st.amount=0;st.message='';renderArea();return;}
 });
}
export function questCount(){return Object.keys(completed).filter(k=>completed[k]).length;}
export function questSummary(){
 return '<p class="note"><strong>Little Story Quests:</strong> '+Object.keys(completed).filter(k=>completed[k]).length+' of 3 stories tried. These are short activity completions, not a mastery score.</p>';
}
