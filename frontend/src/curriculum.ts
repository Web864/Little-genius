import { speakGuidance } from './speechHelp';
import { confirmInApp } from './grownUp';
import { playReader,stopReader,wordMarkup } from './readingAudio';
let storyChosen=false;
// Connected learning adventures for preschool children.
// Local progress, gentle review and no timers or streaks.
const KEY='littleGeniusConnectedCurriculum';
const DATA: Record<string,string[][]>={
  phonics:[
    ['m','Moon','🌙','mmm'],['s','Sun','☀️','sss'],['a','Apple','🍎','short a'],
    ['t','Tap','🚰','t'],['p','Pig','🐷','p'],['i','Insect','🐛','short i'],
    ['n','Nest','🪺','nnn'],['c','Cat','🐱','k'],['d','Dog','🐶','d'],['o','Octopus','🐙','short o']
  ],
  urdu:[
    ['ا','انار','🍎'],['ب','بکری','🐐'],['پ','پتنگ','🪁'],['ت','تتلی','🦋'],
    ['ٹ','ٹماٹر','🍅'],['ث','ثواب','🌟'],['ج','جہاز','✈️'],['چ','چاند','🌙'],
    ['ح','حلوہ','🍮'],['خ','خرگوش','🐇'],['د','درخت','🌳'],['ڈ','ڈبہ','📦'],
    ['ذ','ذہن','🧠'],['ر','ریل','🚂'],['ڑ','حرف ڑ','🔤'],['ز','زرافہ','🦒'],
    ['ژ','حرف ژ','🔤'],['س','سیب','🍎'],['ش','شیر','🦁'],['ص','صبر','🌼'],
    ['ض','ضرورت','📚'],['ط','طوطا','🦜'],['ظ','ظرف','🥣'],['ع','عینک','👓'],
    ['غ','غبارہ','🎈'],['ف','فیل','🐘'],['ق','قلم','✏️'],['ک','کتاب','📖'],
    ['گ','گلاب','🌹'],['ل','لیموں','🍋'],['م','مچھلی','🐟'],['ن','ناک','👃'],
    ['ں','حرف ں','🔤'],['و','واحد','1️⃣'],['ہ','ہاتھی','🐘'],['ھ','دو چشمی ھ','🔤'],
    ['ء','ہمزہ','🔤'],['ی','یاد','💭'],['ے','بڑی ے','🔤']
  ],
  words:[
    ['mat','mat','🧶'],['sat','sat','🐱'],['tap','tap','🚰'],
    ['pin','pin','📌'],['sit','sit','🪑'],['map','map','🗺️'],
    ['pan','pan','🍳'],['cat','cat','🐱']
  ],
  shapes:[
    ['Circle','Round ball','⚽'],['Square','Four equal sides','🟪'],
    ['Triangle','Three sides','🍕'],['Rectangle','Door shape','🚪'],['Star','Pointed star','⭐']
  ]
};
const STORIES=[
  {name:'Milo and the Red Ball',pages:[['🐱 🔴','Milo the cat has a red ball.'],['🐱 🛝','The ball rolls under a slide.'],['🐶 🐱 🔴','A friendly dog helps Milo find it.']],q:'Who helped Milo?',answers:['A fish','A dog','A duck'],right:1},
  {name:'A Little Seed',pages:[['👧 🌱','Sara plants a little seed.'],['💧 ☀️','She gives it water and sunshine.'],['🌻 🦋','A lovely flower grows.']],q:'What helped the seed grow?',answers:['Shoes','Water and sunshine','A toy car'],right:1},
  {name:'Two Ducks',pages:[['🦆 🦆','Two ducks are swimming.'],['🐸 🦆 🦆','A frog jumps near them.'],['🌈 🦆 🦆','They see a bright rainbow.']],q:'How many ducks swam?',answers:['Three','One','Two'],right:2}
];
const TITLES: Record<string,string>={phonics:'Sound Forest',urdu:'Urdu Garden',words:'Word Builder',shapes:'Shape Lab',stories:'Story Village',review:'Memory Mission',daily:'Daily Discovery'};
type ResultRecord={ok:number;wrong:number;tries:number;due:string};
let saved: {records:Record<string,ResultRecord>;daily?:{date:string;step:number;done:boolean}|null}={records:{}};
try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
saved.records||={};
const S={world:'phonics',index:0,step:'teach',page:0,lang:'en',msg:'',modal:false,answer:'',draw:[] as {x:number;y:number}[][],drawing:false,guide:true,reviewKeys:[] as string[],reviewAt:0,reviewRetry:-1,reviewHidden:-1,reviewCorrect:false,urduRetry:'',urduHidden:''};
const day=()=>new Date().toISOString().slice(0,10);
const persist=()=>localStorage.setItem(KEY,JSON.stringify(saved));
const key=(w:string,i:number)=>w+':'+i;
const source=()=>S.world==='stories'?STORIES:DATA[S.world];
const current=()=>DATA[S.world]?.[S.index] ?? DATA.phonics[0];
const currentStory=()=>STORIES[S.index];
function noteResult(w:string,i:number,ok:boolean){
  const k=key(w,i),r=saved.records[k]||{ok:0,wrong:0,tries:0,due:day()};
  r.tries++;if(ok){r.ok++;r.due=new Date(Date.now()+86400000*Math.min(7,r.ok)).toISOString().slice(0,10);}
  else{r.wrong++;r.due=day();}
  saved.records[k]=r;persist();
}
function talk(text:string,lang:string){
 speakGuidance(text,lang,warning=>{S.msg=warning;rerender();});
 return '';
}
function listen(){
  const v=current();let text='',lang='en';
  if(S.world==='urdu'){text='یہ حرف '+v[0]+' ہے۔ '+v[0]+' سے '+v[1]+'۔ میرے ساتھ دہراؤ۔';lang='ur';}
  if(S.world==='phonics')text='This is '+v[0]+'. '+v[1]+' starts with '+v[3]+'. Listen to the beginning sound.';
  if(S.world==='words')text='Listen: '+v[0]+'. Point to each letter and blend the sounds together.';
  if(S.world==='shapes')text='This is a '+v[0]+'. '+v[1]+'.';
  if(S.world==='stories')text=currentStory().pages[S.page][1];
  const warning=talk(text,lang);
  if(warning){S.msg=warning;rerender();}
}
function choiceButtons(arr:string[]){
  const rotated=S.index%2?[arr[1],arr[2],arr[0]]:arr;
  return '<div class="learning-answers">'+rotated.map(x=>'<button class="learning-answer" data-c-choice="'+encodeURIComponent(x)+'">'+x+'</button>').join('')+'</div>';
}
function intro(){
  const v=current(),w=S.world;
  if(w==='stories'){
    const v=currentStory();const p=v.pages[S.page];
    return '<div class="lga-reference-reading lga-story-reading"><h1>'+v.name+'</h1><button class="lga-reading-art" type="button" data-c-act="story-picture" aria-label="Hear this story page">'+p[0]+'</button><p class="learning-reading" aria-live="polite">'+wordMarkup(p[1])+'</p><div class="lga-reading-actions"><button class="ghost lga-reading-alt" data-c-act="listen">🔊 Hear the story</button><button class="btn lga-reading-main" data-c-act="page">'+(S.page===v.pages.length-1?'Answer a question →':'Turn page →')+'</button>'+(S.page===v.pages.length-1?'<button class="ghost lga-reading-alt" data-c-act="story-again">Again</button>':'')+'</div><button class="ghost lga-reading-alt" data-c-act="story-choose">Choose story</button><svg class="lga-reading-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"/><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"/></svg></div>';
  }
  return '<button class="learning-visual lga-secondary" data-c-act="listen" aria-label="Hear picture name">'+v[2]+'</button><button class="learning-letter lga-secondary '+(w==='urdu'?'learning-urdu':'')+'" data-c-act="listen" '+(w==='urdu'?'lang="ur" dir="rtl"':'')+'>'+v[0]+'</button>'+
    '<h2 '+(w==='urdu'?'lang="ur" dir="rtl"':'')+'>'+v[0]+' · '+v[1]+'</h2><p class="lga-adult-copy">'+
    (w==='phonics'?'Listen for the beginning sound. A letter name is not always its sound.':
     w==='urdu'?'Learn this Urdu letter. Say the word with a grown-up.':
     w==='words'?'Listen, then build a short word one letter at a time.':'Find this shape in a book or around your room.')+'</p>'+
    '<div class="learning-actions"><button class="ghost" data-c-act="listen">🔊 Listen</button>'+
    '<button class="btn" data-c-act="practice">Let me try →</button></div>';
}
function question(){
  const v=current(),w=S.world;
  if(w==='words'){
    const letters=v[0].split(''),pool=[...letters,'s','n'].slice(0,4);
    return '<div class="learning-visual">'+v[2]+'</div><h2>Build the word '+v[0]+'</h2>'+
      '<div class="learning-slots">'+letters.map((_,i)=>'<span>'+(S.answer[i]||'_')+'</span>').join('')+'</div>'+
      '<div class="learning-answers">'+pool.map(x=>'<button class="learning-answer" data-c-letter="'+x+'">'+x+'</button>').join('')+'</div>'+
      '<button class="ghost" data-c-act="undo">↶ Undo a letter</button>';
  }
  if(w==='stories'){
    return '<h2>'+currentStory().q+'</h2>'+choiceButtons(currentStory().answers);
  }
  const pool=DATA[w],candidates=[v[0],pool[(S.index+2)%pool.length][0],pool[(S.index+4)%pool.length][0]];
  return '<h2>'+(w==='phonics'?'Which letter starts '+v[1]+'?':
      w==='urdu'?v[1]+' starts with…?':'Find '+v[0]+'!')+'</h2>'+
    '<div class="learning-visual">'+v[2]+'</div>'+choiceButtons(candidates);
}
function drawing(){
 const v=current();
 return '<div class="lga-reference-draw lga-curriculum-draw"><div class="lga-draw-heading"><h1>Trace the letter</h1><button class="lga-draw-alt" type="button" data-c-act="listen"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"></path></svg>Listen</button></div>'+
 '<div class="drawing-wrap lga-draw-canvas"><canvas id="curriculum-canvas" width="600" height="330" aria-label="Draw '+v[0]+'"></canvas></div>'+
 '<div class="lga-draw-actions"><button class="lga-draw-alt" type="button" data-c-act="toggle-guide" aria-pressed="'+S.guide+'">Show guide</button><button class="lga-draw-alt" type="button" data-c-act="erase">Erase</button><button class="lga-draw-main" type="button" data-c-act="draw-done">Done<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg></button></div><svg class="lga-draw-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"></path><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"></path></svg></div>';
}
function popup(){
  return S.modal?'<div class="celebration-backdrop"><div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="learning-success-title">'+
    '<div class="celebration-spark" aria-hidden="true">✨ ⭐ 🎉</div><div class="celebration-mascot">💜</div>'+
    '<h2 id="learning-success-title">Wonderful thinking!</h2><p>You found the answer.</p>'+
    '<button class="btn" data-c-act="next">Next adventure →</button></div></div>':'';
}
function reviewList(){
  const sorted=Object.entries(saved.records).filter(([k])=>{
    const [w,i]=k.split(':');return w==='stories'?!!STORIES[Number(i)]:!!DATA[w]?.[Number(i)];
  }).sort((a,b)=>{
    const weight=(r:ResultRecord)=>(r.wrong>r.ok?15:0)+(r.due<=day()?7:0)+r.wrong;
    return weight(b[1])-weight(a[1]);
  }).map(x=>x[0]);
  return [...new Set([...sorted.slice(0,5),'phonics:0','urdu:0','words:0','shapes:0','stories:0'])].slice(0,5);
}
function reviewItem(){
 const k=S.reviewKeys[S.reviewAt];if(!k)return null;
 const [w,str]=k.split(':'),i=Number(str),v=DATA[w]?.[i] ?? [],story=STORIES[i];
 const original=w==='stories'?story.answers:[v[0],DATA[w][(i+2)%DATA[w].length][0],DATA[w][(i+4)%DATA[w].length][0]];
 const shift=(S.reviewAt+i+1)%3;
 const answers=original.slice(shift).concat(original.slice(0,shift));
 const right=( (w==='stories'?story.right:0)-shift+3)%3;
 const prompt=w==='stories'?story.q:w==='phonics'||w==='urdu'?v[1]+' starts with…?':'Find '+v[0];
 return {w,i,v,answers,right,prompt};
}
function reviewView(){
 if(!S.reviewKeys.length){S.reviewKeys=reviewList();S.reviewAt=0;S.reviewRetry=-1;S.reviewHidden=-1;S.reviewCorrect=false;}
 const item=reviewItem();
 if(!item)return '<section class="panel game learning-world lga-memory" data-c-world="review"><div class="lga-memory-picture">🏆</div><h2>Memory Mission complete!</h2><button class="lga-memory-main" data-c-act="review-again">Review again</button></section>';
 const {w,v,answers,right,prompt}=item;
 const moon='<svg viewBox="0 0 120 120" width="140" height="140" role="img" aria-label="Moon"><path d="M83 12A47 47 0 1 0 106 83C54 94 31 42 83 12Z" fill="#FFD54A" stroke="#8A5A00" stroke-width="3" stroke-linejoin="round"/></svg>';
 const art=w==='phonics'&&v[1]==='Moon'?moon:w==='stories'?'📚':v[2];
 const speaker='<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>';
 const tiles=answers.map((a,j)=>'<button type="button" class="lga-memory-tile tile-'+j+(S.reviewCorrect?(j===right?' is-correct':' is-dim'):S.reviewRetry===j?' is-retry':'')+'" data-c-review="'+j+'" '+(S.reviewCorrect||S.reviewHidden===j?'disabled ':'')+(S.reviewHidden===j?'style="visibility:hidden" ':'')+(w==='urdu'?'lang="ur" dir="rtl" ':'')+'>'+a+'</button>').join('');
 const feedback=S.reviewCorrect?'<p>⭐ Great remembering!</p><button class="lga-memory-main" data-c-act="review-next">Next →</button>':S.reviewRetry>=0?'<p>Almost! Think about the sound.</p><button class="lga-memory-main" data-c-act="review-retry">Try again</button>':'';
 return '<section class="panel game learning-world lga-memory" data-c-world="review"><div class="lga-memory-dots" role="img" aria-label="Question '+(S.reviewAt+1)+' of '+S.reviewKeys.length+'">'+S.reviewKeys.map((_,i)=>'<span class="'+(i<=S.reviewAt?'filled':'')+'"></span>').join('')+'</div><div class="lga-memory-prompt"><button class="lga-memory-picture" data-c-act="review-hear" aria-label="Hear question">'+art+'</button><h2>'+prompt+'</h2><button class="lga-memory-alt" data-c-act="review-hear">'+speaker+'Listen</button></div><div class="lga-memory-tiles">'+tiles+'</div><div class="lga-memory-feedback" aria-live="polite">'+feedback+'</div>'+(!S.reviewCorrect?'<button class="lga-memory-alt" data-c-act="hint" '+(S.reviewHidden>=0?'disabled':'')+'>💡 Hint</button>':'')+'</section>';
}
function dailyView(){
  if(saved.daily?.date!==day())saved.daily={date:day(),step:0,done:false};
  const plan=[
    ['🌳','Rescue one forest letter','Help an animal with a missing letter.','lost'],
    ['📚','Story Time','','stories'],
    ['🧮','Count real objects','Count three toys. Add one more.','numbers'],
    ['✏️','Draw on paper','Draw a letter or number with a grown-up.','draw']
  ];
  if(saved.daily.done)return '<section class="panel game learning-world" data-c-world="daily"><div class="learning-visual">🌈</div>'+
    '<h2>Today’s little adventure is complete!</h2><p>Enjoy a break, some movement and offline play.</p>'+
    '<button class="ghost" data-c-act="daily-again">Restart today</button></section>';
  const task=plan[saved.daily.step];
  return '<section class="panel game learning-world" data-c-world="daily"><span class="step">🌈 Daily Discovery '+(saved.daily.step+1)+' / 4</span>'+
    '<div class="learning-visual">'+task[0]+'</div><h2>'+task[1]+'</h2>'+
    '<div class="learning-actions"><button class="ghost" data-c-open="'+task[3]+'">▶ Play</button>'+
    '<button class="btn" data-c-act="daily-done">Next →</button></div>'+
    '</section>';
}

function urduArt(v:string[]){return v[0]==='ا'?'<svg width="140" height="140" viewBox="0 0 24 24" role="img" aria-label="A pomegranate"><circle cx="12" cy="13.5" r="8" fill="#B3261E"></circle><path d="M8.5 6.5l1.5 2h4l1.5-2-2 .5L12 5l-1.5 2z" fill="#8A1C16"></path></svg>':v[2];}
function urduReference(){
 const v=current(),count=source().length,answer=v[0];
 const arr=S.index===0?['ا','ب','ث']:[answer,DATA.urdu[(S.index+2)%count][0],DATA.urdu[(S.index+4)%count][0]];
 const options=S.index%2?[arr[1],arr[2],arr[0]]:arr;
 const correct=S.modal,wrong=S.urduRetry;
 const listenButton='<button class="lga-urdu-alt" type="button" data-c-act="listen"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"></path></svg> Listen</button>';
 const dots='<div class="lga-urdu-dots" role="img" aria-label="Urdu Garden, '+(S.index+1)+' of '+count+'">'+[0,1,2].map(i=>'<span class="'+(i<=S.index%3?'filled':'')+'"></span>').join('')+'</div>';
 const picture='<button class="lga-urdu-picture" data-c-act="listen" aria-label="Hear picture word">'+urduArt(v)+'</button>';
 const ur=(text:string)=>'<span lang="ur" dir="rtl" class="lga-urdu-script">'+text+'</span>';
 const prompt='<div class="lga-urdu-prompt">'+picture+'<div><h2>'+ur(v[1])+(S.step==='teach'?' · '+ur(answer):' starts with…?')+'</h2>'+listenButton+'</div></div>';
 const tiles='<ul class="lga-urdu-tiles">'+options.map((letter,i)=>'<li><button type="button" data-c-choice="'+encodeURIComponent(letter)+'" class="lga-urdu-tile tile-'+i+(correct?(letter===answer?' is-correct':' is-dim'):wrong===letter?' is-wrong':'')+'" '+(correct?'disabled':'')+(S.urduHidden===letter?' disabled style="visibility:hidden"':'')+' aria-label="Letter '+letter+(correct&&letter===answer?', correct':wrong===letter?', try again':'')+'">'+ur(letter)+'</button></li>').join('')+'</ul>';
 const feedback=correct?'<div class="lga-urdu-success"><svg width="72" height="72" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.2 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="#F2B84B" stroke="#8A5A00" stroke-width="1" stroke-linejoin="round"/></svg><p>Great! '+ur(answer)+' is for '+ur(v[1])+'.</p><button class="lga-urdu-main" data-c-act="next">Next →</button></div>':wrong?'<p>Almost! Let’s listen again.</p><button class="lga-urdu-main" data-c-act="urdu-retry">Try again</button>':'<button class="lga-urdu-alt" data-c-act="urdu-hint">Hint</button>';
 return '<section class="panel game learning-world lga-reference-urdu" data-c-world="urdu">'+dots+prompt+(S.step==='teach'?'<button class="lga-urdu-main" data-c-act="practice">Let me try →</button>':tiles+'<div class="lga-urdu-feedback" aria-live="polite">'+feedback+'</div>')+'<p class="lga-urdu-voice" role="status">'+S.msg+'</p><svg class="lga-urdu-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"/><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"/></svg></section>';
}

export function curriculumView(world:string){
  if(world==='stories'&&!storyChosen)return '<section class="panel game learning-world lga-reference-reading lga-reading-picker" data-c-world="stories"><h1>Pick a story or a poem</h1><button class="lga-reading-round" data-c-act="story-choices" aria-label="Hear the choices"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg></button><div class="lga-reading-grid">'+STORIES.map((v,i)=>'<button class="lga-reading-card tint-'+[0,2,3,2][i%4]+'" data-c-story="'+i+'"><span class="lga-card-art" role="img" aria-label="'+v.name+'">'+v.pages[0][0]+'</span><span class="lga-card-text"><small>Story</small><strong>'+v.name+'</strong></span></button>').join('')+'<button class="lga-reading-card tint-1" data-c-open="poems"><span class="lga-card-art" role="img" aria-label="Little duck">🦆</span><span class="lga-card-text"><small>Poem</small><strong>Poems</strong></span></button></div><svg class="lga-reading-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"/><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"/></svg></section>';
  if(world==='review')return reviewView();
  if(world==='daily')return dailyView();
  if(S.world!==world){S.world=world;S.index=0;S.step='teach';S.page=0;S.msg='';S.answer='';S.modal=false;}
  const count=source().length;
  if(world==='urdu'&&['teach','question'].includes(S.step))return urduReference();
  if(S.step==='finished')return '<section class="panel game learning-world" data-c-world="'+world+'">'+
    '<div class="learning-visual">🏆 🦊</div><h2>'+TITLES[world]+' complete!</h2>'+
    '<p>Now try a real-life example or rest a little.</p><button class="btn" data-c-act="restart">Try again</button></section>';
  return '<section class="panel game learning-world" data-c-world="'+world+'"><div class="learning-fox">🦊 ✨</div>'+
    '<span class="step">'+TITLES[world]+' · '+(S.index+1)+' / '+count+'</span>'+
    '<progress class="lga-lesson-progress" max="'+count+'" value="'+S.index+'" aria-label="Lesson progress"></progress>'+
    (S.step==='teach'?intro():S.step==='question'?question():drawing())+
    '<p class="feedback" aria-live="polite">'+(S.msg||'Take your time. You can do it!')+'</p>'+popup()+'</section>';
}
function rerender(){
  const node=document.querySelector<HTMLElement>('.learning-world');if(!node)return;
  const world=node.dataset.cWorld||S.world;
  node.outerHTML=curriculumView(world);
  if(S.step==='draw'&&world!=='daily'&&world!=='review')setupCanvas();
}
function next(){
  S.index++;S.page=0;S.step=S.index>=source().length?'finished':'teach';
  S.msg='';S.answer='';S.modal=false;S.urduRetry='';S.urduHidden='';S.draw=[];S.guide=true;rerender();
}
function setupCanvas(){
  const c=document.querySelector<HTMLCanvasElement>('#curriculum-canvas');if(!c)return;
  const context=c.getContext('2d');if(!context)return;const ctx=context;
  function paint(){
    ctx.clearRect(0,0,600,330);ctx.fillStyle='#FFFDF5';ctx.fillRect(0,0,600,330);
    ctx.strokeStyle='#8A99A8';ctx.lineWidth=3;ctx.setLineDash([8,8]);
    [72.6,165,257.4].forEach(y=>{ctx.beginPath();ctx.moveTo(36,y);ctx.lineTo(564,y);ctx.stroke();});
    ctx.setLineDash([]);
    if(S.guide){ctx.font=S.world==='urdu'?'bold 190px "Noto Nastaliq Urdu", serif':'bold 240px Andika, sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#E4DAFB';ctx.strokeStyle='#6B4FC4';ctx.lineWidth=2;if(S.world==='urdu'&&current()[0]==='ا'){ctx.save();ctx.translate(193.4,26.4);ctx.scale(2.132,2.132);const guide=new Path2D('M52 6C58 38 60 82 54 124C50 127 46 125 45 120C48 82 46 40 43 12C45 6 49 4 52 6Z');ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.fill(guide);ctx.stroke(guide);ctx.restore();}else{ctx.fillText(current()[0],300,165);ctx.strokeText(current()[0],300,165);}}
    ctx.strokeStyle='#7453d4';ctx.lineWidth=13;ctx.lineCap='round';ctx.lineJoin='round';
    for(const path of S.draw){if(!path.length)continue;ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);path.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();}
  }
  const point=(e:PointerEvent)=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*330/r.height};};
  c.onpointerdown=e=>{e.preventDefault();S.drawing=true;S.draw.push([point(e)]);c.setPointerCapture(e.pointerId);paint();};
  c.onpointermove=e=>{if(S.drawing){S.draw[S.draw.length-1].push(point(e));paint();}};
  c.onpointerup=()=>S.drawing=false;c.onpointercancel=()=>S.drawing=false;paint();
}
let wired=false;
export function activateCurriculum({language}: {world:string;language:string}){
  S.lang=language;if(S.step==='draw')setupCanvas();
  if(wired)return;wired=true;
  document.addEventListener('click',e=>{
  if (!(e.target instanceof Element)) return;
    const b=e.target.closest('button'),root=e.target.closest<HTMLElement>('.learning-world');
    if(!b||!root)return;
    const world=root.dataset.cWorld;
    if(b.dataset.cStory!==undefined){stopReader();storyChosen=true;S.world='stories';S.index=Number(b.dataset.cStory);S.page=0;S.step='teach';S.msg='';S.modal=false;rerender();return;}
    if(b.dataset.cOpen){document.querySelector<HTMLElement>('[data-tab="'+b.dataset.cOpen+'"]')?.click();return;}
    if(b.dataset.cChoice!==undefined){
      const value=decodeURIComponent(b.dataset.cChoice);
      const expected=S.world==='stories'?currentStory().answers[currentStory().right]:current()[0];
      if(S.modal)return;
      const ok=value===expected;noteResult(S.world,S.index,ok);
      if(world==='urdu'){S.urduRetry=ok?'':value;S.modal=ok;S.msg='';rerender();talk(ok?'شاباش! '+current()[0]+' سے '+current()[1]:'دوبارہ سنو۔ '+current()[1],'ur');return;}
      if(ok){S.modal=true;S.msg='';rerender();talk('Wonderful!','en');}
      else{S.msg='Almost! Let’s listen again.';rerender();Array.from(document.querySelectorAll<HTMLButtonElement>('[data-c-choice]')).find(x=>decodeURIComponent(x.dataset.cChoice||'')===value)?.classList.add('lga-retry');listen();}
      return;
    }
    if(b.dataset.cReview!==undefined){
      const item=reviewItem();if(!item||S.reviewCorrect||Number(b.dataset.cReview)===S.reviewHidden)return;
      const j=Number(b.dataset.cReview),ok=j===item.right;
      noteResult(item.w,item.i,ok);S.reviewCorrect=ok;S.reviewRetry=ok?-1:j;S.msg='';rerender();
      talk(ok?'Great remembering!':'Almost! Think about the sound.','en');return;
    }
    if(b.dataset.cLetter!==undefined){
      const letter=b.dataset.cLetter,target=current()[0];S.answer+=letter;
      if(S.answer.length>=target.length){
        const ok=S.answer===target;noteResult('words',S.index,ok);
        if(ok){S.modal=true;S.msg='';rerender();talk('You built '+target+'!','en');}
        else{S.answer='';S.msg='Try that word again. Listen to each sound!';rerender();}
      }else rerender();return;
    }
    const act=b.dataset.cAct;
    if(act==='story-choices'){talk('Pick a story or a poem. '+STORIES.map(v=>v.name).join('. ')+'. Poems.','en');return;}
    if(act==='story-picture'&&world==='stories'&&S.step==='teach'){stopReader();const hear=root.querySelector<HTMLButtonElement>('[data-c-act="listen"]');if(hear)playReader(root,hear,currentStory().pages[S.page][1]);return;}
    if(act==='listen'){if(world==='stories'&&S.step==='teach'){playReader(root,b,currentStory().pages[S.page][1]);}else listen();return;}
    if(act==='story-choose'){stopReader();storyChosen=false;rerender();return;}
    if(act==='story-again'){stopReader();S.page=0;S.step='teach';rerender();const nextRoot=document.querySelector<HTMLElement>('.learning-world');const hear=nextRoot?.querySelector<HTMLButtonElement>('[data-c-act="listen"]');if(nextRoot&&hear)playReader(nextRoot,hear,currentStory().pages[0][1]);return;}
    if(act==='urdu-retry'){S.urduRetry='';S.msg='';rerender();listen();return;}
    if(act==='urdu-hint'){const wrong=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-c-choice]')).find(x=>decodeURIComponent(x.dataset.cChoice ?? '')!==current()[0]&&!x.disabled);if(wrong){S.urduHidden=decodeURIComponent(wrong.dataset.cChoice ?? '');rerender();}listen();return;}
    if(act==='practice'){S.step='question';S.msg='';S.answer='';S.urduRetry='';S.urduHidden='';rerender();return;}
    if(act==='page'){stopReader();if(S.page<currentStory().pages.length-1){S.page++;rerender();const r=document.querySelector<HTMLElement>('.learning-world');const hear=r?.querySelector<HTMLButtonElement>('[data-c-act="listen"]');if(r&&hear)playReader(r,hear,currentStory().pages[S.page][1]);}else{S.step='question';rerender();}return;}
    if(act==='next'){S.modal=false;
      if(['phonics','urdu'].includes(S.world)){S.step='draw';S.draw=[];S.guide=true;S.msg='';rerender();}
      else next();return;
    }
    if(act==='undo'){S.answer=S.answer.slice(0,-1);rerender();return;}
    if(act==='toggle-guide'){S.guide=!S.guide;rerender();return;}
    if(['guide','free','erase'].includes(act ?? '')){if(act!=='erase')S.guide=act==='guide';S.draw=[];rerender();return;}
    if(act==='draw-done'){next();return;}
    if(act==='restart'){S.index=0;S.step='teach';S.page=0;S.msg='';rerender();return;}
    if(act==='review-again'){S.reviewKeys=[];S.reviewAt=0;S.reviewRetry=-1;S.reviewHidden=-1;S.reviewCorrect=false;S.msg='';rerender();return;}
    if(act==='review-next'){if(!S.reviewCorrect)return;S.reviewAt++;S.reviewRetry=-1;S.reviewHidden=-1;S.reviewCorrect=false;S.msg='';rerender();return;}
    if(act==='review-retry'){S.reviewRetry=-1;rerender();return;}
    if(act==='review-hear'){const item=reviewItem();if(item)talk(item.w==='urdu'?item.v[1]:item.prompt,item.w==='urdu'?'ur':'en');return;}
    if(act==='hint'){const item=reviewItem();if(!item||S.reviewHidden>=0||S.reviewCorrect)return;S.reviewHidden=item.answers.findIndex((_,j)=>j!==item.right);if(S.reviewRetry===S.reviewHidden)S.reviewRetry=-1;rerender();return;}
    if(act==='daily-done'){if(!saved.daily)return;saved.daily.step++;if(saved.daily.step===4)saved.daily.done=true;persist();rerender();return;}
    if(act==='daily-again'){saved.daily={date:day(),step:0,done:false};persist();rerender();}
  });
}
export function curriculumStats(){
 const r=saved.records,keys=Object.keys(r),ok=keys.reduce((n,k)=>n+r[k].ok,0),wrong=keys.reduce((n,k)=>n+r[k].wrong,0);
 const revisit=keys.filter(k=>r[k].wrong>0&&r[k].due<=day());
 const plan=saved.daily?.date===day()?(saved.daily.done?'Completed':(saved.daily.step+1)+'/4 tasks'):'Not started today';
 return {items:keys.length,ok,wrong,due:revisit.length,plan,suggestion:revisit.length?'Try a Memory Mission for items due for review.':'Try one Memory Mission tomorrow.'};
}
export function curriculumReport(){
 const r=curriculumStats();
 return '<div class="curriculum-report"><div class="stats"><div class="stat"><b>'+r.items+'</b>Items attempted</div><div class="stat"><b>'+r.ok+'</b>Correct answers</div><div class="stat"><b>'+r.wrong+'</b>Retry moments</div><div class="stat"><b>'+r.due+'</b>Due for review</div></div></div>';
}
let resetWired=false;
export function curriculumReset(){
  if(resetWired)return;resetWired=true;
  document.addEventListener('click',e=>{
  if (!(e.target instanceof Element)) return;
    const b=e.target.closest('button');if(!b||!b.dataset.cReset)return;
    void confirmInApp('Clear Urdu, phonics, words, stories, shapes and daily practice data?').then(ok=>{if(ok){
      saved.records={};saved.daily=null;persist();
      document.dispatchEvent(new CustomEvent('lga-parent-progress-changed'));
    }});
  });
}
