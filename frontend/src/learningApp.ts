import { aicsWorlds } from './aics/worlds';
import { renderDraftJourney } from './draftJourney';
import { roundsFor, correctChoice, renderThinkingGame, isThinkingGame } from './thinkingGames';
import type { ThinkingGame } from './thinkingGames';
import './thinkingGames.css';
import { fullAnimal } from './animalArt';
import { poemsView,activatePoems } from './poems';
import { stopReader, playReader } from './readingAudio';
import './lessonFinish.css';
import { grownUpCheck, confirmInApp } from './grownUp';
import { soundEnabled, toggleSound, warmSound } from './forestAudio';
import { stopSpeech } from './speechHelp';
import { speakGuidance, voiceDiagnostic } from './speechHelp';
import './styles.css';
import './redesign.css';
import { getSpeechPace, setSpeechPace, rateForSpeech } from './voicePace';
import { numbersView, activateNumbers } from './numbers';
import { additionView, activateAddition } from './addition';
import { questView, activateQuest, questCount } from './quests';
import { lostForestView, activateLostForest, lostForestCount } from './forestPictureGame';
import { curriculumView, activateCurriculum, curriculumReport, curriculumStats, curriculumReset } from './curriculum';

const thinking = { round: 0, score: 0, message: '' };
function resetThinking(): void { thinking.round = 0; thinking.score = 0; thinking.message = ''; }
const app = document.querySelector('#app');
let installPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('appinstalled',()=>{installPrompt=null;
 const el=document.querySelector('#install-status');
 if(el)el.textContent='App installed. Find Little Genius Adventure on your Android home screen.';
});
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const examples = [
  ['Apple','🍎','سیب'], ['Ball','⚽','گیند'], ['Cat','🐱','بلی'],
  ['Dog','🐶','کتا'], ['Elephant','🐘','ہاتھی'], ['Fish','🐟','مچھلی'],
  ['Goat','🐐','بکری'], ['Hat','🎩','ٹوپی'], ['Ice cream','🍦','آئس کریم'],
  ['Jug','🫗','جگ'], ['Kite','🪁','پتنگ'], ['Lion','🦁','شیر'],
  ['Moon','🌙','چاند'], ['Nest','🪺','گھونسلا'], ['Orange','🍊','سنترہ'],
  ['Parrot','🦜','طوطا'], ['Queen','👑','ملکہ'], ['Rabbit','🐰','خرگوش'],
  ['Sun','☀️','سورج'], ['Tiger','🐯','شیر'], ['Umbrella','☂️','چھتری'],
  ['Van','🚐','گاڑی'], ['Water','💧','پانی'], ['X-ray','🩻','ایکس رے'],
  ['Yo-yo','🪀','یو یو'], ['Zebra','🦓','زیبرا']
];
const urNames = ['اے','بی','سی','ڈی','ای','ایف','جی','ایچ','آئی','جے','کے','ایل','ایم','این','او','پی','کیو','آر','ایس','ٹی','یو','وی','ڈبلیو','ایکس','وائے','زیڈ'];
const lessons = alphabet.map((letter,i) => ({
  letter, lower: letter.toLowerCase(), word: examples[i][0], emoji: examples[i][1],
  meaning: examples[i][2], urName: urNames[i]
}));
const stages = ['teach','say-letter','say-phrase','guided','test-big','test-small','draw'];
const themes={forest:{name:'Magic Forest',icon:'🌳 🦊 🦋'},space:{name:'Space Adventure',icon:'🚀 🪐 ⭐'},ocean:{name:'Ocean World',icon:'🐬 🐠 🪸'}};
let saved = {};
try { saved = JSON.parse(localStorage.getItem('littleGeniusProgress') || '{}') || {}; } catch { saved = {}; }
const state = {
  category:'english',
  tab:'home', index:0, stage:'teach', language:localStorage.getItem('littleGeniusLanguage') === 'ur' ? 'ur' : 'en',
  progress:saved, msg:'', popup:null, retryChoice:'', strokes:[], drawing:false, drawMode:'guide', heard:false,
  voiceWarning:'', choiceOrder:0, listening:false, heardWord:'', speechError:'', recognizer:null,
  theme:['forest','space','ocean'].includes(localStorage.getItem('littleGeniusTheme'))?localStorage.getItem('littleGeniusTheme'):'forest',
  mode:'learn',reviewOrder:[],reviewPos:0,courseComplete:localStorage.getItem('littleGeniusCourseComplete')==='yes'
};
const L = () => lessons[state.index];
const save = () => localStorage.setItem('littleGeniusProgress',JSON.stringify(state.progress));
const label = key => ({
  home:'Home', learn:'Learn letters', drawing:'Drawing studio', parents:'For parents',
  listen:'🔊 Listen to Foxy', next:'Next →', guided:'Practice together', done:'I drew it! ⭐'
})[key];
function speech(key) {
  const l = L(), ur = state.language === 'ur', n=l.urName, letter=l.letter;
  const script = {
    intro: ur ? `آؤ حرف ${n} سیکھیں۔ یہ بڑا ${n} ہے۔ یہ چھوٹا ${n} ہے۔ اب میرے ساتھ بولو۔ ${n}۔` : `Hello! Look. This is big ${letter}. ... This is small ${l.lower}. ... ${letter} for ${l.word}. ... Can you say ${letter}?`,
    promptLetter: ur ? `پہلا مرحلہ۔ مائیک دباؤ۔ پھر حرف ${n} بولو۔` : `Step one. ... Tap the microphone. ... Say ${letter}.`,
    promptPhrase: ur ? `دوسرا مرحلہ۔ اب بولو، ${n} فار ${l.word}۔` : `Step two. ... Listen. ... ${letter} for ${l.word}. ... Now you say it.`,
    promptWord: ur ? `اب انگریزی کا لفظ ${l.word} بولو۔` : `Say ${l.word}.`,
    heardLetter: ur ? `شاباش! تم نے حرف ${n} صحیح بولا۔ اب اگلا جملہ بولو۔` : `Well done! You said ${letter}. Now say ${letter} for ${l.word}.`,
    heardPhrase: ur ? `واہ! تم نے ${n} فار ${l.word} صحیح کہا۔ اب حروف پہچانتے ہیں۔` : `Amazing! You said ${letter} for ${l.word}. Now let's match letters.`,
    retryLetter: ur ? `ایک بار پھر صرف حرف ${n} بولو۔` : `Try saying just ${letter} again.`,
    retryPhrase: ur ? `دوبارہ پورا جملہ بولو: ${n} فار ${l.word}۔` : `Try the whole phrase: ${letter} for ${l.word}.`,
    heardCorrect:ur ? `شاباش! تم نے ${l.word} بالکل درست بولا۔ آؤ آگے چلیں۔` : `Amazing! You said ${l.word} correctly. Let's keep learning!`,
    heardWrong:ur ? `دوبارہ آہستہ سے ${l.word} کہنے کی کوشش کرو۔` : `Try saying ${l.word} again, slowly and clearly.`,
    guided:ur ? `بہت اچھے! اس بڑے حرف ${n} کو دیکھو۔ اب نیچے سے اسی حرف کو ڈھونڈو۔` : `Great! Look at capital ${letter}. Now find the same letter below.`,
    big:ur ? `اب تمہاری باری ہے۔ ان حروف میں سے بڑا ${n} تلاش کرو۔` : `Your turn! Find capital ${letter} by yourself.`,
    small:ur ? `اب چھوٹا ${n} تلاش کرو۔ اچھی طرح دیکھو۔` : `Now find the small letter ${l.lower}.`,
    draw:ur ? `شاباش! اب انگلی سے حرف ${n} بناؤ۔ پہلے ہلکی لکیر پر انگلی چلاؤ۔` : `Wonderful! Now draw capital ${letter}. Follow the pale guide with your finger.`,
    correct:ur ? `واہ، شاباش! تم نے بالکل صحیح جواب دیا۔ مجھے تم پر فخر ہے! اب اگلا مرحلہ شروع کرتے ہیں۔` : `Wow, great job! You found it! Let's explore the next step!`,
    wrong:ur ? `اچھی کوشش! کوئی بات نہیں۔ دوبارہ غور سے دیکھو۔ میں تمہاری مدد کروں گا۔` : `Nice try! Look again, you can do it. I'll help you.`,
    drawingDone:ur ? `واہ، بہت خوب! تم نے ${n} کی مشق کی۔ اب اگلا حرف سیکھتے ہیں۔` : `Lovely effort! You practised ${letter}. Let's learn the next letter!`,
    finish:ur ? 'شاباش! تم نے سارے چھبیس حروف کی مشق کر لی!' : 'Hooray! You finished practising the whole alphabet!'
  };
  speak(script[key] || script.intro);
}
function speak(text){
 speakGuidance(text,state.language,message=>{
  state.voiceWarning=message;updateVoiceWarning();
  const note=document.querySelector('#urdu-test-status');if(note)note.textContent=message;
 });
}
function updateVoiceWarning() {
  document.querySelectorAll('.voice-warning').forEach(node=>node.textContent=state.voiceWarning);
}
function header() {
 const c=Object.values(state.progress).filter(Boolean).length;
 const nav=[['home','🏠','Home'],['lost','🌳','Rescue'],['library','🧭','Worlds']];
 const activeTab=['home','lost','parent'].includes(state.tab)?state.tab:'library';
 return `<div class="shell theme-${state.theme} kid-app ${state.tab==='parent'?'lga-grown':'lga-child'}">
 <header class="kid-header">
  <button class="brand kid-brand" data-tab="home" aria-label="Go home"><span class="kid-brand-icon"><svg width="40" height="40" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><rect width="36" height="36" rx="10" fill="#205B46"></rect><path d="M8 9l7 5h6l7-5v10c0 5-4.5 9-10 9S8 24 8 19z" fill="#F2B84B"></path><circle cx="14.5" cy="20" r="1.6" fill="#203245"></circle><circle cx="21.5" cy="20" r="1.6" fill="#203245"></circle></svg></span><span>Little Genius<small>Play & Learn</small></span></button>
  <div class="kid-header-right"><span class="kid-progress" role="status">${c} letters practised</span><!-- Parent access is in the mobile bottom navigation. --><nav class="lga-header-nav" aria-label="Main navigation">${[...nav,['parent','⚙️','Parents']].map(([id,emoji,label])=>`<button type="button" class="lga-header-tab ${activeTab===id?'is-active':''}" data-tab="${id}" aria-current="${activeTab===id?'page':'false'}">${label}</button>`).join('')}</nav></div>
 </header>
 <nav class="kid-mobile-bottom-nav" aria-label="Learning navigation">
 ${[...nav,['parent','⚙️','Settings']].map(([id,emoji,label])=>`<button type="button" class="kid-mobile-tab ${activeTab===id?'is-active':''}" data-tab="${id}" aria-current="${activeTab===id?'page':'false'}"><span class="kid-mobile-tab-icon" aria-hidden="true">${emoji}</span><span class="kid-mobile-tab-label">${label}</span></button>`).join('')}
 </nav>
 ${state.tab!=='home'?'<div class="kid-back-row"><button class="kid-back-button" type="button" data-act="back" aria-label="Go to previous page">← Back</button></div>':''}
 ${state.tab!=='parent'?'<div class="lga-sound-row"><button type="button" class="lga-round" data-act="sound" aria-label="'+(soundEnabled()?'Turn sound off':'Turn sound on')+'" aria-pressed="'+soundEnabled()+'">'+(soundEnabled()?'🔊':'🔇')+'</button><button type="button" class="lga-round lga-lock" data-tab="parent" aria-label="Grown-ups only">🔒</button></div>':''}
 ${state.tab==='home'?homeHero():''}
 `;
}
function homeHero(){
 return `<section class="kid-hero lga-start lga-reference-start" aria-labelledby="foxy-greeting"><div class="lga-foxy-art" role="img" aria-label="Foxy the fox">${fullAnimal('Foxy')}</div><h1 id="foxy-greeting">Hi! I'm Foxy.</h1><button type="button" class="lga-play" data-act="play" aria-label="Play"><svg width="84" height="84" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" fill="#FFFFFF"></path></svg></button><p class="lga-play-label">Play</p><svg class="lga-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"></path><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"></path></svg></section>`;
}
function home(){return '';}
function options() {
  const l=L(), target=state.stage==='test-small'?l.lower:l.letter;
  const candidates=[target];
  for(let j=1;j<=2;j++) {
    const other=lessons[(state.index+j*7)%26];
    candidates.push(state.stage==='test-small'?other.lower:other.letter);
  }
  const shift=(state.index+state.choiceOrder+(state.stage==='test-small'?2:1))%3;
  return [...candidates.slice(shift),...candidates.slice(0,shift)].map(x=>`<button type="button" class="letter ${state.popup&&x===target?'lga-correct':''} ${state.retryChoice===x&&!state.popup?'lga-retry':''}" data-choice="${x}" aria-label="Letter ${x}${state.popup&&x===target?', correct':''}${state.retryChoice===x&&!state.popup?', try again':''}" ${state.popup?'disabled':''}>${x}${state.popup&&x===target?'<span class="lga-answer-mark" aria-hidden="true">✓</span>':state.retryChoice===x?'<span class="lga-answer-mark" aria-hidden="true">↻</span>':''}</button>`).join('');
}
function game() {
  const l=L(), stage=state.stage;
  if(stage==='finished')return `<div class="panel game"><div class="mascot lg-alphabet-fox">${fullAnimal('Foxy')}</div><h2>Great alphabet adventure!</h2><p>Now practise the letters and words in a random order.</p><button class="btn" data-act="random">🎲 Random Practice</button><button class="ghost" data-act="restart">Learn A–Z again</button></div>`;
  if(stage==='draw')return drawing(true);
  let body='';
  if(stage==='say-letter'||stage==='say-phrase') {
    const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    const first=stage==='say-letter';
    const target=first?l.letter:`${l.letter} for ${l.word}`;
    body=`<div class="say-word-stage"><div class="step">Speaking ${first?'step 1 of 2':'step 2 of 2'}</div><div class="mascot lg-alphabet-fox">${fullAnimal('Foxy')}</div><div class="say-word-target">${target}</div><p class="question">${first?`Say the letter “${l.letter}”`:`Say “${target}”`}</p><p>Say it if you like!</p><div class="voice-actions"><button class="ghost" data-act="hear">🔊 Hear the instruction</button><button class="btn mic-button" data-act="listen" ${supported?'':'disabled'}>${state.listening?'🎙️ Listening...':'🎤 Tap to speak'}</button></div><div class="speech-result" aria-live="polite">${state.heardWord||''}</div><button class="btn" data-act="skip-speech">Next →</button></div>`;
  } else if(stage==='teach') {
    return `<main class="panel game lga-reference-abc"><div class="lga-abc-pair"><button type="button" class="lga-abc-letters" data-act="abc-hear" aria-label="Tap to hear ${l.letter} for ${l.word}">${l.letter}${l.lower}</button><button type="button" class="lga-abc-picture" data-act="abc-hear" aria-label="Hear ${l.word}">${l.letter==='A'?'<svg viewBox="0 0 120 120" width="180" height="180" role="img" aria-label="A red apple"><path d="M60 38c-10-10-34-8-38 14-4 26 12 52 28 52 6 0 8-3 10-3s4 3 10 3c16 0 32-26 28-52-4-22-28-24-38-14z" fill="#E5484D" stroke="#9B1C22" stroke-width="3"></path><path d="M60 38c0-10 4-18 12-22" stroke="#6B4A2B" stroke-width="5" stroke-linecap="round" fill="none"></path><path d="M68 24c10-8 22-4 24 2-8 8-20 8-24-2z" fill="#3E9B5B" stroke="#205B46" stroke-width="2.5"></path></svg>':`<span role="img" aria-label="${l.word}">${l.emoji}</span>`}</button></div><p class="lga-abc-sentence" data-read-word="0">${l.letter} for ${l.word}</p><div class="lga-abc-actions"><button class="ghost" data-act="abc-audio" id="abc-hear-button">🔊 Hear it</button><button class="btn" data-act="abc-next">Next →</button></div><button class="ghost" data-act="practice">Practise</button><button class="ghost" data-act="optional-speech">Say it (optional)</button><svg class="abc-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"/><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"/></svg></main>`;
  } else {
    const guided=stage==='guided';
    const prompt=guided?`${l.word} starts with…?`:stage==='test-big'?`Find the capital ${l.letter}`:`Find the small ${l.lower}`;
    body=`<div class="lga-quiz"><button type="button" class="lga-quiz-picture" data-act="quiz-hear" aria-label="Hear ${l.word}"><span role="img" aria-label="${l.word}">${l.emoji}</span></button><div class="lga-quiz-question"><button type="button" class="lga-round lga-quiz-sound" data-act="quiz-hear" aria-label="Hear question"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg></button><h2>${prompt}</h2></div><div class="choices">${options()}</div><div class="lga-quiz-feedback ${state.popup?'is-correct':state.retryChoice?'is-retry':''}" role="status" aria-live="polite">${state.popup?`<span aria-hidden="true">⭐</span> Great! ${l.letter} is for ${l.word}.`:state.retryChoice?'Almost! Let’s listen again.':''}</div>${state.popup?'<button class="btn lga-quiz-next" data-act="next">Next →</button>':state.retryChoice?'<button class="btn lga-quiz-next" data-act="quiz-retry">Try again</button>':''}</div>`;
    return `<main class="panel game lga-reference-quiz">${body}</main>`;
  }
  return `<div class="panel game"><span class="step">${state.mode==='review'?'Random practice '+(state.reviewPos+1):'Letter '+(state.index+1)} of 26 · ${stage==='teach'?'1. Learn first':stage==='say-letter'?'2. Say the letter':stage==='say-phrase'?'3. Say the phrase':stage==='guided'?'4. Guided practice':stage==='test-big'?'5. Big letter quiz':'6. Small letter quiz'}</span><div class="progress"><div class="bar" style="width:${((state.mode==='review'?state.reviewPos:state.index)*7+stages.indexOf(stage))/182*100}%"></div></div><h2>${stage==='teach'?`Meet letter ${l.letter}!`:'Foxy’s letter adventure'}</h2>${body}<div class="voice-warning" role="status">${state.voiceWarning}</div></div>`;
}
function drawing(embedded=false) {
 const l=L();
 return `<main class="panel game lga-reference-draw"><div class="lga-draw-heading"><h1>Trace the letter</h1><button class="lga-draw-alt" type="button" data-act="hear"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"></path></svg>Listen</button></div><div class="lga-draw-picker"><label for="pick">Letter</label><select id="pick">${lessons.map((x,i)=>`<option value="${i}" ${i===state.index?'selected':''}>${x.letter} — ${x.word}</option>`).join('')}</select></div><div class="drawing-wrap lga-draw-canvas"><canvas id="board" width="600" height="360" aria-label="Draw letter ${l.letter}"></canvas></div><div class="lga-draw-actions"><button class="lga-draw-alt" type="button" data-act="toggle-guide" aria-pressed="${state.drawMode==='guide'}">Show guide</button><button class="lga-draw-alt" type="button" data-act="erase">Erase</button><button class="lga-draw-main" type="button" data-act="done">Done<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg></button></div><svg class="lga-draw-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"></path><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"></path></svg></main>`;
}
function library(){
 const baseGroups=[["english","English Adventures",[["lost","🌳","Lost Letters","Rescue letters through picture clues"],["game","🔤","ABC Lessons","Capital, small, speaking and drawing"],["phonics","🎵","Sound Forest","Hear the first sounds"],["words","🧩","Word Builder","Build short words"],["draw","✏️","Drawing Studio","Trace & draw letters"]]],["math","Math & Thinking",[["numbers","🔢","Number Galaxy","Learn numbers 1–10"],["addition","🌼","Addition Garden","Combine groups and count"], ["sorting","🧺","Sorting Safari","Find the matching kind"], ["patterns","🟩","Pattern Parade","Complete repeating patterns"], ["measurement","📏","Measurement Mission","Compare big, small, long and heavy"],["shapes","🔺","Shape Lab","Explore everyday shapes"]]],["stories","Stories & Discovery",[["nature","🌱","Nature Discovery","Explore plants, animals and habitats"],["quest","🗺️","Story Adventure","Help friends in little quests"],["stories","📚","Story Village","Hear stories & answer questions"],["poems","🎵","Poems","Listen and read along"],["daily","🌈","Daily Discovery","A short guided routine"],["review","🧠","Memory Mission","Revisit difficult items"]]],["urdu","Urdu Garden",[["urdu","🌷","Urdu Letters","Identify and practise Urdu letters"]]]];
 const aicsPlan=aicsWorlds(baseGroups);const groups=aicsPlan.groups;
 const active=groups.find(x=>x[0]===state.category)||groups[0];
 const practiced=Object.values(state.progress).filter(Boolean).length;
 return `<main class="kid-library lga-reference-worlds"><div class="lga-world-status" role="status" aria-label="${practiced} letters practised"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.2 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="#F2B84B" stroke="#8A5A00" stroke-width="1" stroke-linejoin="round"></path></svg><span>${practiced}</span></div><div class="kid-page-heading lga-world-heading"><button type="button" class="lga-round" data-act="world-sound" aria-label="Hear the instructions"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"></path><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"></path></svg></button><h1>What shall we play?</h1></div><ul class="lga-world-launch">${aicsPlan.tiles([["game","<span aria-hidden=\"true\">Aa</span>","Letters"],["numbers","<span aria-hidden=\"true\">123</span>","Numbers"],["shapes","<svg width=\"72\" height=\"72\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#203245\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3l9 16H3z\"></path></svg>","Shapes"],["stories","<svg width=\"72\" height=\"72\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#203245\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 6c-2-2-5-2.5-8-2v14c3-.5 6 0 8 2 2-2 5-2.5 8-2V4c-3-.5-6 0-8 2zM12 6v14\"></path></svg>","Stories"],["urdu","<span class=\"lga-world-urdu\" lang=\"ur\" dir=\"rtl\" aria-hidden=\"true\">اردو</span>","Urdu"],["draw","<svg width=\"72\" height=\"72\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#203245\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 20l1-4L16 5l3 3L8 19z\"></path><path d=\"M14 7l3 3\"></path></svg>","Draw"]]).map(([tab,art,label],i)=>`<li><button type="button" class="lga-world-tile lga-tile-${i}" data-tab="${tab}">${art}<strong>${label}</strong></button></li>`).join('')}</ul><svg class="lga-world-meadow" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120 Q 360 40 720 110 T 1440 90 V200 H0z" fill="#BFE8A8"></path><path d="M0 160 Q 400 100 800 150 T 1440 140 V200 H0z" fill="#9ED88B"></path></svg>
${renderDraftJourney()}
 <div class="kid-category-scroll"><button type="button" class="kid-tab-arrow" data-scroll-tabs="-1" aria-label="Previous categories">«</button><div class="kid-category-tabs" aria-label="Learning categories">${groups.map(([id,label])=>`<button type="button" class="kid-category ${state.category===id?'active':''}" data-category="${id}" aria-pressed="${state.category===id}">${label}</button>`).join('')}</div><button type="button" class="kid-tab-arrow" data-scroll-tabs="1" aria-label="More categories">»</button></div>
 <div class="kid-world-grid">${active[2].map(([id,emoji,title,description])=>`<button class="kid-world-card" data-tab="${id}"><span class="kid-world-icon">${emoji}</span><span class="kid-world-info"><strong>${title}</strong><small class="lga-adult-copy">${description}</small></span><span class="kid-world-arrow">→</span></button>`).join('')}</div></main>`;
}
function parents() {
 const completed=Object.values(state.progress).filter(Boolean).length;
 const report=curriculumStats();
 return `<main class="kid-parent lga-reference-parent"><div class="parent-heading"><span class="kid-eyebrow">Grown-up corner</span><h1>Parent Corner</h1><p>Manage learning preferences, install access, and review practice progress, all in one place.</p></div>
 <div class="parent-config-grid"><section class="kid-settings-panel parent-speech-panel" aria-labelledby="parent-speech"><h2 id="parent-speech">Speech &amp; Language</h2>
 <div class="lga-parent-field"><label for="language">Spoken guide</label><select id="language"><option value="ur" ${state.language==='ur'?'selected':''}>Urdu / اردو</option><option value="en" ${state.language==='en'?'selected':''}>English</option></select><p>Changes instructions, not the app's English buttons.</p></div>
 <div class="lga-parent-field"><label for="pace">Voice speed</label><select id="pace"><option value="slow" ${getSpeechPace()==='slow'?'selected':''}>Slow &amp; Clear</option><option value="normal" ${getSpeechPace()==='normal'?'selected':''}>Normal</option><option value="natural" ${getSpeechPace()==='natural'?'selected':''}>Natural</option></select><p>Slow is easier for English beginners.</p></div>
 <div class="lga-parent-field"><h3>Urdu &amp; English voice check</h3><div class="parent-voice-buttons"><button class="lga-parent-outline" data-act="test-en">Test English</button><button class="lga-parent-outline" data-act="test-urdu">Test Urdu</button><button class="lga-parent-outline" data-act="voice-check">Check available voices</button></div><p class="kid-voice-notice" id="urdu-test-status" role="status">${state.voiceWarning||'If Urdu audio is silent, the device may not have an Urdu voice. Other games remain playable.'}</p></div>
 </section><section class="kid-settings-panel parent-install-panel" aria-labelledby="parent-install"><h2 id="parent-install">Install on Android</h2><ol><li>Open the app in Chrome.</li><li>Tap the menu (three dots).</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li></ol><div><button class="lga-parent-main" data-act="install-app">Install app</button></div><p id="install-status" role="status" class="lga-parent-muted">If the install button is unavailable, use the Chrome menu steps above. Installed shortcuts still use your browser's speech engine.</p></section></div>
 <section class="kid-settings-panel parent-theme-panel" aria-labelledby="parent-theme"><h2 id="parent-theme">Choose Your Theme</h2><div class="kid-theme-choices" role="group" aria-labelledby="parent-theme">${Object.entries({forest:'Magic Forest',space:'Space Adventure',ocean:'Ocean World'}).map(([key,name])=>`<button class="kid-theme-tile ${state.theme===key?'selected':''}" aria-pressed="${state.theme===key}" data-theme-choice="${key}">${name}</button>`).join('')}</div></section>
 <section class="kid-settings-panel parent-progress-panel" aria-labelledby="parent-progress"><h2 id="parent-progress">Learning Progress</h2><div class="stats parent-overview-stats"><div class="stat"><b>${completed} / 26</b><span>Letters practised</span></div><div class="stat"><b>${lostForestCount()}</b><span>Letters rescued in Lost Letters Forest</span></div><div class="stat"><b>${questCount()} / 3</b><span>Little Story Quests tried</span></div><div class="stat"><b>${report.due}</b><span>Due for review</span></div></div>
 <div class="lga-parent-field"><h3>Choose a letter to practise</h3><div class="alphabet-grid">${lessons.map((x,i)=>`<button data-pick="${i}" aria-label="Practise letter ${x.letter}">${x.letter}${state.progress[x.letter]?'<small aria-hidden="true">⭐</small>':''}</button>`).join('')}</div></div>
 <p class="lga-parent-plan"><strong>Daily plan:</strong> ${report.plan}. <strong>Suggestion:</strong> ${report.suggestion}</p><details class="lga-parent-report"><summary>Connected Learning Report</summary>${curriculumReport()}</details></section>
 <section class="kid-settings-panel lga-parent-licence" aria-labelledby="parent-licence"><h2 id="parent-licence">Licence and data</h2><div class="lga-parent-licence-row"><p>Manage the school licence for this app.</p><div id="lga-owner-slot"></div></div><div class="lga-parent-reset"><h3>Reset progress</h3><p>Resetting deletes saved progress on this device. You will be asked to confirm.</p><div class="lga-parent-buttons"><button class="lga-danger" data-c-reset="yes">Reset new-world records</button><button class="lga-danger" data-act="reset">Reset alphabet progress</button></div></div></section></main>`;
}
document.addEventListener('lga-parent-progress-changed',()=>{if(state.tab==='parent')render();});
function popup() {
 const l=L();
 return `<div class="celebration-backdrop"><div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="popup-title"><div class="celebration-spark">✨ ⭐ 🎉</div><div class="celebration-mascot lg-alphabet-fox">${fullAnimal('Foxy')}${l.emoji}</div><h2 id="popup-title">Fantastic! You got it!</h2><p>You found the right letter <strong>${state.stage==='test-small'?l.lower:l.letter}</strong>!</p><div class="voice-warning" role="status">${state.voiceWarning}</div><div class="celebration-actions"><button class="ghost" data-act="replay">🔊 Hear praise</button><button class="btn" data-act="next">Next adventure →</button></div></div></div>`;
}
let categoryScroll=0;
function syncCategoryTabs(){
 const strip=app.querySelector<HTMLElement>('.kid-category-tabs');
 if(!strip)return;
 strip.scrollLeft=categoryScroll;
 const left=app.querySelector<HTMLButtonElement>('[data-scroll-tabs="-1"]');
 const right=app.querySelector<HTMLButtonElement>('[data-scroll-tabs="1"]');
 const sync=()=>{categoryScroll=strip.scrollLeft;if(left)left.disabled=strip.scrollLeft<=2;if(right)right.disabled=strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-2;};
 strip.addEventListener('scroll',sync,{passive:true});sync();
}
function render() { app.innerHTML=header()+(state.tab==='home'?home():state.tab==='library'?library():state.tab==='game'?game():state.tab==='numbers'?numbersView():state.tab==='addition'?additionView():isThinkingGame(state.tab)?renderThinkingGame(state.tab as ThinkingGame,thinking.round,thinking.score,thinking.message,thinking.round>=roundsFor(state.tab as ThinkingGame).length):state.tab==='quest'?questView():state.tab==='lost'?lostForestView():['phonics','urdu','words','shapes','stories','review','daily'].includes(state.tab)?curriculumView(state.tab):state.tab==='draw'?drawing():state.tab==='poems'?poemsView():parents())+`<div class="footer kid-footer">🌱 Little steps. Big discoveries. No ads, no rush.</div></div>`+(state.popup&&!['guided','test-big','test-small'].includes(state.stage)?popup():'');
 if(state.tab==='library')syncCategoryTabs();
 if(state.tab==='poems')activatePoems();
 if(state.tab==='parent')document.dispatchEvent(new Event('lga-parent-rendered'));
 if(state.tab==='draw'||(state.tab==='game'&&state.stage==='draw'))setupCanvas();
 if(state.tab==='numbers')activateNumbers({language:state.language});
 if(state.tab==='addition')activateAddition({language:state.language});
 if(state.tab==='quest')activateQuest({language:state.language});
 if(state.tab==='lost')activateLostForest({language:state.language});
 if(['phonics','urdu','words','shapes','stories','review','daily'].includes(state.tab))activateCurriculum({world:state.tab,language:state.language});
}
function stopListening() {
  if (state.recognizer) {
    try { state.recognizer.onresult=null;state.recognizer.onerror=null;state.recognizer.onend=null;state.recognizer.abort(); } catch (e) {}
  }
  state.recognizer=null; state.listening=false;
}
function resetStage(stage='teach') {
 stopListening();
 state.stage=stage; state.msg=''; state.popup=null; state.retryChoice=''; state.strokes=[];state.drawMode='guide';state.choiceOrder++;
 state.heardWord='';state.speechError='';
}
function normalizeWord(word) {
  return String(word).toLowerCase().replace(/[^a-z\s-]/g,' ').replace(/[\s-]+/g,' ').trim();
}
function wordMatches(transcript, letter, word, stage) {
  const got=normalizeWord(transcript);
  if(!got)return false;
  if(stage==='say-letter') {
    const letterNames={A:['a','ay','eh'],B:['b','bee','be'],C:['c','see','sea'],D:['d','dee'],E:['e','ee'],F:['f','eff'],G:['g','gee'],H:['h','aitch'],I:['i','eye'],J:['j','jay'],K:['k','kay'],L:['l','el'],M:['m','em'],N:['n','en'],O:['o','oh'],P:['p','pee'],Q:['q','cue','queue'],R:['r','are'],S:['s','ess'],T:['t','tee','tea'],U:['u','you'],V:['v','vee'],W:['w','double u','double you'],X:['x','ex'],Y:['y','why'],Z:['z','zed','zee']};    return (letterNames[letter]||[letter.toLowerCase()]).some(name=>got===name||got==='letter '+name||got==='capital '+name);
  }
  const expected=normalizeWord(letter+' for '+word);
  return got===expected || got==='letter '+expected;
}
function spokenSuccess() {
  const wasLetter=state.stage==='say-letter';
  stopListening();
  resetStage(wasLetter?'say-phrase':'guided');
  state.msg=wasLetter?'Great! Now say the full phrase.':'Great speaking! Now find the matching letter.';
  render();
  speech(wasLetter?'heardLetter':'heardPhrase');
}
function startListening() {
  if(!['say-letter','say-phrase'].includes(state.stage)||state.listening)return;
  const SpeechAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechAPI){state.speechError='Speaking is not available here. Tap Next to keep playing.';render();return;}
  if(window.speechSynthesis)window.speechSynthesis.cancel();
  const recognition=new SpeechAPI();
  state.recognizer=recognition;
  recognition.lang='en-US';
  recognition.interimResults=false;
  recognition.continuous=false;
  recognition.maxAlternatives=5;
  state.listening=true;state.speechError='';state.heardWord='Listening… speak now!';render();
  recognition.onresult=e=>{
    if(state.recognizer!==recognition)return;
    const alternatives=Array.from(e.results[0]||[]).map(a=>a.transcript);
    const ok=alternatives.some(text=>wordMatches(text,L().letter,L().word,state.stage));
    state.listening=false;state.recognizer=null;
    if(ok){spokenSuccess();return;}
    state.heardWord='I heard: '+(alternatives[0]||'something else');
    state.speechError=state.stage==='say-letter'?'Try saying the letter “'+L().letter+'” again.':'Try saying “'+L().letter+' for '+L().word+'” again.';
    render();speech(state.stage==='say-letter'?'retryLetter':'retryPhrase');
  };
  recognition.onerror=e=>{
    if(state.recognizer!==recognition)return;
    state.listening=false;state.recognizer=null;
    state.speechError=e.error==='not-allowed'?'Microphone blocked. Allow mic access in browser settings, or ask a parent to help.':e.error==='no-speech'?'I did not hear a word. Tap the mic and try again.':'Voice check could not complete. Try again or ask a parent.';
    state.heardWord='';render();
  };
  recognition.onend=()=>{
    if(state.recognizer!==recognition)return;
    state.listening=false;state.recognizer=null;render();
  };
  try{recognition.start();}catch(e){state.listening=false;state.recognizer=null;state.speechError='Could not start the microphone. Please try again.';render();}
}
function startLesson(index=0) {
 rememberPage('game');
 state.mode='learn';state.reviewOrder=[];state.reviewPos=0;
 state.index=index;state.tab='game';resetStage();render();speech('intro');
}
function startRandomPractice() {
 if(!state.courseComplete)return;
 const order=lessons.map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 if(order.every((v,i)=>i===v))[order[0],order[1]]=[order[1],order[0]];
 state.mode='review';state.reviewOrder=order;state.reviewPos=0;state.index=order[0];state.tab='game';resetStage('say-letter');render();speech('promptLetter');
}
function correct() {
 state.popup='correct';state.retryChoice='';state.msg='';render();speak(`Great! ${L().letter} is for ${L().word}.`);
}
function next() {
 if(!state.popup)return;
 state.popup=null;
 const nextStage=state.stage==='guided'?'test-big':state.stage==='test-big'?'test-small':'draw';
 resetStage(nextStage);render();speech(nextStage==='test-big'?'big':nextStage==='test-small'?'small':'draw');
}
function chosen(value) {
 if(state.popup)return;
 const target=state.stage==='test-small'?L().lower:L().letter;
 if(value===target)correct();
 else {state.retryChoice=value;state.msg='Almost! Let’s listen again.';render();speak(state.language==='ur'?`دوبارہ سنو۔ ${L().urName}۔`:`Almost! Let’s listen again. ${L().word}.`);}
}
function nextLetter() {
 state.progress[L().letter]=true;save();
 if(state.tab==='draw') {
  state.index=(state.index+1)%26; state.strokes=[];state.drawMode='guide';state.msg='Excellent effort! Here is the next letter.';
  render();speech('draw');return;
 }
 if(state.mode==='review'){
  state.reviewPos++;
  if(state.reviewPos===26){resetStage('finished');render();speech('finish');return;}
  state.index=state.reviewOrder[state.reviewPos];resetStage('say-letter');render();speech('promptLetter');return;
 }
 if(state.index===25){state.courseComplete=true;localStorage.setItem('littleGeniusCourseComplete','yes');resetStage('finished');render();speech('finish');return;}
 state.index++;resetStage();render();speech('intro');
}function hear() {
 speech(state.stage==='teach'?'intro':state.stage==='say-letter'?'promptLetter':state.stage==='say-phrase'?'promptPhrase':state.stage==='guided'?'guided':state.stage==='test-big'?'big':state.stage==='test-small'?'small':'draw');
}
type PageSnapshot={tab:string;category:string;index:number;stage:string;mode:string;reviewOrder:number[];reviewPos:number;drawMode:string;strokes:any[];scroll:number};
const pageSnapshots:PageSnapshot[]=[];
function capturePage():PageSnapshot{return {tab:state.tab,category:state.category,index:state.index,stage:state.stage,mode:state.mode,reviewOrder:state.reviewOrder.slice(),reviewPos:state.reviewPos,drawMode:state.drawMode,strokes:state.strokes.map(path=>path.slice()),scroll:window.scrollY};}
function rememberPage(next:string){
 if(next===state.tab)return;
 const depth=Number(history.state?.lgDepth||0);
 pageSnapshots[depth]=capturePage();pageSnapshots.length=depth+1;
 history.replaceState({...history.state,lgScreen:state.tab,lgDepth:depth},'');
 history.pushState({...history.state,lgScreen:next,lgDepth:depth+1},'');
}
function restorePage(snapshot:PageSnapshot){
 stopReader();stopListening();window.speechSynthesis?.cancel();
 Object.assign(state,{tab:snapshot.tab,category:snapshot.category,index:snapshot.index,stage:snapshot.stage,mode:snapshot.mode,reviewOrder:snapshot.reviewOrder.slice(),reviewPos:snapshot.reviewPos,drawMode:snapshot.drawMode,strokes:snapshot.strokes.map(path=>path.slice()),popup:null,msg:'',speechError:'',heardWord:''});
 render();requestAnimationFrame(()=>window.scrollTo(0,snapshot.scroll));
}
function goBack(){
 if(document.querySelector('.school-profile-overlay')){document.querySelector<HTMLButtonElement>('#school-profile-close')?.click();return;}
 if(Number(history.state?.lgDepth||0)>0){history.back();return;}
 if(state.tab!=='home'){state.tab='home';state.popup=null;render();window.scrollTo(0,0);}
}
window.addEventListener('popstate',e=>{
 if(!app.querySelector('.kid-app'))return;
 if(document.querySelector('.school-profile-overlay')){document.querySelector<HTMLButtonElement>('#school-profile-close')?.click();}
 const depth=Number(e.state?.lgDepth||0);
 const previous=pageSnapshots[depth];
 if(previous&&previous.tab===e.state?.lgScreen){restorePage(previous);return;}
 stopListening();window.speechSynthesis?.cancel();state.tab=e.state?.lgScreen||'home';state.popup=null;state.msg='';render();window.scrollTo(0,0);
});
window.addEventListener('resize',()=>{if(state.tab==='library')syncCategoryTabs();});
app.addEventListener('click',e=>{
 const b=e.target.closest('button'); if(!b)return;
 if(b.dataset.thinkingRestart){resetThinking();render();return;}
 if(b.dataset.thinkingNext){thinking.round++;thinking.message='';render();if(isThinkingGame(state.tab) && thinking.round===roundsFor(state.tab as ThinkingGame).length){document.dispatchEvent(new CustomEvent('lga-local-round-complete',{detail:{gameId:state.tab,score:thinking.score,total:thinking.round}}));}return;}
 if(b.dataset.thinkingChoice!==undefined && isThinkingGame(state.tab)){
  if(thinking.message || thinking.round>=roundsFor(state.tab as ThinkingGame).length)return;
  const item=roundsFor(state.tab as ThinkingGame)[thinking.round];
  const choice=item?.choices[Number(b.dataset.thinkingChoice)];
  if(!choice)return;
  const correct=correctChoice(state.tab as ThinkingGame,thinking.round,choice);
  if(correct)thinking.score++;
  thinking.message=(correct?'⭐ Correct! ':'Good try! ')+item.explanation;
  render();return;
 }
 if(b.dataset.act==='back'){goBack();return;}
 if(b.dataset.scrollTabs){const strip=app.querySelector<HTMLElement>('.kid-category-tabs');if(strip)strip.scrollBy({left:Number(b.dataset.scrollTabs)*Math.max(100,strip.clientWidth*.78),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
 if(b.dataset.category){state.category=b.dataset.category;render();return;}
 if(b.dataset.themeChoice){
  state.theme=b.dataset.themeChoice;
  localStorage.setItem('littleGeniusTheme',state.theme);
  render();return;
 }
 if(b.dataset.tab){const target=b.dataset.tab;const enter=()=>{if(!app.querySelector('.kid-app'))return;if(isThinkingGame(target))resetThinking();stopReader();rememberPage(target);stopListening();stopSpeech();state.tab=target;state.popup=null;state.msg='';render();window.scrollTo(0,0);};if(target==='parent'&&state.tab!=='parent'){void grownUpCheck().then(ok=>{if(ok)enter();});}else enter();return;}
 if(b.dataset.pick!==undefined){startLesson(Number(b.dataset.pick));return;}
 if(b.dataset.choice){chosen(b.dataset.choice);return;}
 const act=b.dataset.act;
 if(act==='play'){warmSound();rememberPage('library');state.tab='library';render();speak('What shall we play?');window.scrollTo(0,0);return;}
 if(act==='world-sound'){speak('What shall we play?');return;}
 if(act==='sound'){const on=toggleSound();if(!on){stopReader();stopSpeech();}render();return;}
 if(act==='optional-speech'){stopReader();resetStage('say-letter');render();return;}
 if(act==='skip-speech'){resetStage('guided');render();speech('guided');return;}
 if(act==='install-app'){  const status=document.querySelector('#install-status');
  if(!installPrompt){
   if(status)status.textContent='Open the app in Chrome on Android. Tap ⋮ → Add to Home screen / Install app. Some devices create a home-screen shortcut.';
   return;
  }
  const prompt=installPrompt;installPrompt=null;
  prompt.prompt().then(()=>prompt.userChoice).then(choice=>{
   if(status)status.textContent=choice?.outcome==='accepted'?'Install accepted. Check your Home screen.':'Not installed. You can use the Chrome menu at any time.';
  }).catch(()=>{
   if(status)status.textContent='Use Chrome ⋮ menu → Add to Home screen.';
  });
  return;
 }
 if(act==='test-en'||act==='voice-check'){
  const p=document.querySelector('#urdu-test-status');
  if(p)p.textContent='Checking available English and Urdu voices…';
  if(act==='voice-check'){
   Promise.all([voiceDiagnostic('en'),voiceDiagnostic('ur')]).then(([en,ur])=>{
    const note=document.querySelector('#urdu-test-status');
    if(note)note.textContent='English: '+en.message+' Urdu: '+ur.message;
   });return;
  }
  speakGuidance('Hello! Welcome to Little Genius Adventure.','en',message=>{
   const note=document.querySelector('#urdu-test-status');
   if(note)note.textContent=message;
  }).then(ok=>{if(ok){const note=document.querySelector('#urdu-test-status');if(note)note.textContent='English audio requested. If you cannot hear it, check device volume and speech settings.';}});
  return;
 }
 if(act==='test-urdu'){
  const p=document.querySelector('#urdu-test-status');if(p)p.textContent='Checking Urdu voice…';
  speakGuidance('السلام علیکم۔ میں فاکسی ہوں۔ آؤ مل کر سیکھیں۔','ur',error=>{
   const note=document.querySelector('#urdu-test-status');if(note)note.textContent=error;
  }).then(ok=>{if(ok){const note=document.querySelector('#urdu-test-status');if(note)note.textContent='Urdu speech requested. If there is no sound, your browser may not be playing this voice.';}});
  return; }
 if(act==='start'||act==='restart'){startLesson(0);return;}
 if(act==='random'){startRandomPractice();return;}
 if(act==='practice'){stopReader();resetStage('guided');render();speech('guided');return;} if(act==='listen'){startListening();return;}
 if(act==='parent-confirm' && ['say-letter','say-phrase'].includes(state.stage)){
   const target=state.stage==='say-letter'?L().letter:L().letter+' for '+L().word;
   void grownUpCheck().then(ok=>{if(ok)spokenSuccess();});
   return;
 }
 if(act==='quiz-hear'){speak(state.stage==='guided'?`${L().word} starts with which letter?`:state.stage==='test-big'?`Find capital ${L().letter}`:`Find small ${L().lower}`);return;}
 if(act==='quiz-retry'){state.retryChoice='';state.msg='';render();speak(state.stage==='guided'?`${L().word} starts with which letter?`:state.stage==='test-big'?`Find capital ${L().letter}`:`Find small ${L().lower}`);return;}
 if(act==='abc-hear'||act==='abc-audio'){const root=app.querySelector<HTMLElement>('.lga-reference-abc');const button=app.querySelector<HTMLButtonElement>('#abc-hear-button');if(root&&button){if(act==='abc-hear')stopReader();playReader(root,button,`${L().letter} for ${L().word}`);}return;}
 if(act==='abc-next'){stopReader();stopSpeech();state.index=(state.index+1)%26;resetStage('teach');render();const root=app.querySelector<HTMLElement>('.lga-reference-abc');const button=app.querySelector<HTMLButtonElement>('#abc-hear-button');if(root&&button)playReader(root,button,`${L().letter} for ${L().word}`);return;}
 if(act==='hear'){hear();return;}
 if(act==='replay'){speech('correct');return;}
 if(act==='next'){next();return;}
 if(act==='toggle-guide'){state.drawMode=state.drawMode==='guide'?'free':'guide';render();return;}
 if(act==='guide'||act==='free'||act==='erase'){
   if(act!=='erase')state.drawMode=act;
   state.strokes=[];state.msg=act==='free'?'Now try without the guide!':'Follow the pale letter!';render();return;
 }
 if(act==='done'){

   nextLetter();return; }
 if(act==='reset'){
   void confirmInApp('Reset all saved alphabet practice progress on this device?').then(ok=>{if(ok){state.progress={};state.courseComplete=false;localStorage.removeItem('littleGeniusCourseComplete');save();document.dispatchEvent(new CustomEvent('lga-parent-progress-changed'));render();}});
 }
});
app.addEventListener('change',e=>{
 if(e.target.id==='pace'){
  setSpeechPace(e.target.value);
  render();
  if(state.popup)speech('correct');
  else if(state.tab==='game'||state.tab==='draw')hear();
  return;
 }
 if(e.target.id==='theme'){
  state.theme=['forest','space','ocean'].includes(e.target.value)?e.target.value:'forest';localStorage.setItem('littleGeniusTheme',state.theme);render();return;
 }
 if(e.target.id==='language'){
  stopListening();
  state.language=e.target.value==='ur'?'ur':'en';
  localStorage.setItem('littleGeniusLanguage',state.language);
  state.voiceWarning='';render();if(state.popup)speech('correct');else if(state.tab==='game'||state.tab==='draw')hear();return;
 }
 if(e.target.id==='pick'){
  stopListening();
  state.index=Number(e.target.value);state.strokes=[];state.drawMode='guide';state.msg='';
  if(state.tab==='game')resetStage('draw');
  render();speech('draw');
 }
});
function setupCanvas(){ const canvas=document.querySelector('#board');if(!canvas)return;
 const ctx=canvas.getContext('2d');
 function paint(){
  ctx.clearRect(0,0,600,360);ctx.fillStyle='#FFFDF5';ctx.fillRect(0,0,600,360);
  ctx.strokeStyle='#8A99A8';ctx.lineWidth=3;ctx.setLineDash([8,8]);
  for(const y of [79.2,180,280.8]){ctx.beginPath();ctx.moveTo(36,y);ctx.lineTo(564,y);ctx.stroke();}
  ctx.setLineDash([]);
  if(state.drawMode==='guide'){
   ctx.font='bold 275px Andika, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillStyle='#E4DAFB';ctx.strokeStyle='#6B4FC4';ctx.lineWidth=2;ctx.fillText(L().letter,300,191);ctx.strokeText(L().letter,300,191);
  }
  ctx.strokeStyle='#7155d6';ctx.lineWidth=13;ctx.lineCap='round';ctx.lineJoin='round';
  for(const path of state.strokes){
   if(!path.length)continue;
   ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);
   for(const p of path.slice(1))ctx.lineTo(p.x,p.y);
   if(path.length===1)ctx.lineTo(path[0].x+.1,path[0].y+.1);
   ctx.stroke();
  }
 }
 const pos=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*360/r.height};};
 canvas.onpointerdown=e=>{e.preventDefault();state.drawing=true;state.strokes.push([pos(e)]);canvas.setPointerCapture(e.pointerId);paint();};
 canvas.onpointermove=e=>{if(!state.drawing)return;state.strokes.at(-1).push(pos(e));paint();};
 canvas.onpointerup=()=>state.drawing=false;
 canvas.onpointercancel=()=>state.drawing=false;
 paint();
}
document.addEventListener('click',e=>{const menu=document.querySelector<HTMLDetailsElement>('.kid-menu-wrap[open]');if(menu&&!(e.target as HTMLElement).closest('.kid-menu-wrap'))menu.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const menu=document.querySelector<HTMLDetailsElement>('.kid-menu-wrap[open]');if(menu){menu.open=false;menu.querySelector<HTMLElement>('summary')?.focus();}}});
const startAicsMigration=()=>{try{void import('./aics/bootstrap').then(m=>m.scheduleAicsBootstrap()).catch(()=>{});}catch{/* migration is optional */}};
export function mountLearningApp(){ curriculumReset();state.tab='home';pageSnapshots.length=0;history.replaceState({...history.state,lgScreen:'home',lgDepth:0},'');render();startAicsMigration(); }
