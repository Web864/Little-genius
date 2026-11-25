import { recordMathCompletion } from './mathProgress';
import { speakGuidance } from './speechHelp';
// Concrete-object addition for early learners. All activities stay on this device.
const questions=[
  {a:1,b:1,emoji:'🍎'}, {a:2,b:1,emoji:'🍎'}, {a:1,b:2,emoji:'⭐'},
  {a:2,b:2,emoji:'🐠'}, {a:3,b:1,emoji:'🌼'}, {a:1,b:3,emoji:'🍓'},
  {a:2,b:3,emoji:'🦋'}, {a:4,b:1,emoji:'🍊'}
];
const state={index:0,stage:'teach',popup:false,message:'',language:'en',success:0};
const question=()=>questions[state.index];
const group=(n: number,emoji: string)=>Array.from({length:n},(_,i)=>'<button class="addition-object lga-count-object" data-add-count="'+(i+1)+'" aria-label="Count object '+(i+1)+'">'+emoji+'</button>').join('');
function say(text: string){
 speakGuidance(text,state.language,warning=>{state.message=warning;drawArea();});
}
function guide(kind: 'intro' | 'guided' | 'test' | 'correct' | 'wrong'){
 const {a,b}=question();
 if(state.language==='ur'){
   const ur={
    intro:`دیکھو، یہاں ${a} چیزیں ہیں، اور یہاں ${b} چیزیں ہیں۔ ان سب کو ملا کر گنتے ہیں۔`,
    guided:`اب میرے ساتھ گنو۔ ${a} اور ${b} مل کر کتنے ہوتے ہیں؟`,
    test:`اب خود گنو، دونوں گروپ ملا کر کل کتنی چیزیں ہیں؟`,
    correct:'شاباش! تم نے صحیح گنتی کی!',wrong:'کوئی بات نہیں۔ ایک ایک چیز گن کر دوبارہ کوشش کرو۔'
   };return ur[kind]||ur.intro;
 }
 const en={
  intro:`Look! Here are ${a} things, and here are ${b} more things. Let's put them together and count!`,
  guided:`Let's count together. How many altogether when we add ${a} and ${b}?`,
  test:`Now your turn. Count both groups together. How many altogether?`,
  correct:'Wonderful counting! You got it right!',wrong:'Good try! Count each one again. You can do it!'
 };
 return en[kind]||en.intro;
}
function choiceSet(){
 const sum=question().a+question().b;
 let candidates=[sum,sum===5?3:sum+1,sum<=2?4:sum-1];
 const shift=(state.index+1)%3;
 candidates=[...candidates.slice(shift),...candidates.slice(0,shift)];
 return candidates.map(v=>`<button class="addition-choice" data-add-choice="${v}" aria-label="Answer ${v}">${v}</button>`).join('');
}
function overlay(){
 return state.popup?`<div class="celebration-backdrop"><div class="celebration-card" role="dialog" aria-modal="true" aria-label="Correct addition answer"><div class="celebration-spark">⭐ 🎉 ✨</div><div class="celebration-mascot">🦊 🌼</div><h2>Great counting!</h2><p>${question().a} + ${question().b} = <strong>${question().a+question().b}</strong></p><button class="btn" data-add-act="next">Next challenge →</button></div></div>`:'';
}
export function additionView(){
 if(state.stage==='finished')return `<section class="panel addition-world game"><div class="addition-trophy">🏆 🦊 🌈</div><h2>Little Addition Champion!</h2><p>You practised putting small groups together. Try it with blocks or toys!</p><button class="btn" data-add-act="restart">Play again ↺</button></section>`;
 const q=question(),total=q.a+q.b;
 const showTotal=state.stage==='teach';
 const prompt=state.stage==='teach'?'Let’s learn how to put things together!':state.stage==='guided'?'Count with Foxy!':'Count all the objects yourself!';
 return `<section class="panel game addition-world"><div class="addition-kicker">🌼 Addition Garden · ${state.index+1} of ${questions.length}</div><progress class="lga-lesson-progress" max="${questions.length*3}" value="${state.index*3+['teach','guided','test'].indexOf(state.stage)}" aria-label="Addition progress"></progress><div class="addition-fox">🦊 ✨</div><h2>${prompt}</h2><div class="addition-scene"><div class="addition-group"><span class="addition-group-label">First group</span><div class="addition-items">${group(q.a,q.emoji)}</div><span class="addition-count">${showTotal?q.a:'Count me'}</span></div><div class="addition-join" aria-label="plus">+</div><div class="addition-group"><span class="addition-group-label">Second group</span><div class="addition-items">${group(q.b,q.emoji)}</div><span class="addition-count">${showTotal?q.b:'Count me'}</span></div></div>${showTotal?`<div class="addition-result"><span>${q.a} + ${q.b} = <b>${total}</b></span><div class="addition-combined">${group(total,q.emoji)}</div></div>`:`<p class="question">How many altogether?</p><div class="addition-choices">${choiceSet()}</div>`}<p class="feedback" aria-live="polite">${state.message||'One step at a time. You can do it! 💜'}</p><div class="addition-tools"><button class="ghost" data-add-act="hear">🔊 Listen</button>${state.stage==='teach'?'<button class="btn" data-add-act="begin">Let me try! →</button>':''}</div>${overlay()}</section>`;
}
function drawArea(){const node=document.querySelector('.addition-world');if(node)node.outerHTML=additionView();}
let installed=false;
export function activateAddition({language}: { language: string }){
 state.language=language;
 if(installed)return;installed=true;
 document.addEventListener('click',e=>{
  if (!(e.target instanceof Element)) return;
  const button=e.target.closest('button'),section=e.target.closest('.addition-world');
  if(!section||!button)return;
  const act=button.dataset.addAct,choice=button.dataset.addChoice;
  if(button.dataset.addCount){button.classList.add('lga-counted');button.setAttribute('aria-pressed','true');say(button.dataset.addCount);return;}
  if(choice!==undefined){
    if(state.popup)return;
    if(Number(choice)===question().a+question().b){
      if(state.stage==='test')recordMathCompletion('addition',state.index+1);state.popup=true;state.message='';state.success++;drawArea();document.querySelector('[data-add-choice="'+choice+'"]')?.classList.add('lga-correct');say(guide('correct'));
    }else{state.message='Almost! Let’s count again.';drawArea();document.querySelector('[data-add-choice="'+choice+'"]')?.classList.add('lga-retry');say(guide('wrong'));}
    return;
  }
  if(act==='hear'){say(guide(state.stage==='teach'?'intro':state.stage==='guided'?'guided':'test'));return;}
  if(act==='begin'){state.stage='guided';state.message='';drawArea();say(guide('guided'));return;}
  if(act==='next'){
    if(!state.popup)return;state.popup=false;state.message='';
    if(state.stage==='guided'){state.stage='test';drawArea();say(guide('test'));return;}
    state.index++;
    if(state.index>=questions.length)state.stage='finished';else state.stage='teach';
    drawArea();if(state.stage==='teach')say(guide('intro'));return;
  }
  if(act==='restart'){state.index=0;state.stage='teach';state.message='';state.popup=false;drawArea();say(guide('intro'));}
 });
}
