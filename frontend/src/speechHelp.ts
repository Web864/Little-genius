import { rateForSpeech } from './voicePace';
let generation=0;
const voices=()=>{try{return window.speechSynthesis?.getVoices?.()||[];}catch{return [];}};
const isUrdu=(v: SpeechSynthesisVoice)=>/^ur(?:-|_|$)/i.test(v.lang||'');
export function stopSpeech(){generation++;window.speechSynthesis?.cancel();}
function findUrduVoice(){
 return new Promise<SpeechSynthesisVoice | null>(resolve=>{
  const synth=window.speechSynthesis;if(!synth){resolve(null);return;}
  const now=voices().find(isUrdu);if(now){resolve(now);return;}
  let finished=false;
  let timer: ReturnType<typeof setTimeout>;
  const onVoices=()=>{const v=voices().find(isUrdu);if(v)done(v);};
  const done=(v: SpeechSynthesisVoice | null)=>{if(finished)return;finished=true;clearTimeout(timer);
    synth.removeEventListener?.('voiceschanged',onVoices);resolve(v);};
  synth.addEventListener?.('voiceschanged',onVoices);
  timer=setTimeout(()=>done(voices().find(isUrdu)||null),1600);
 });
}

export async function voiceDiagnostic(language='ur'){
 const synth=window.speechSynthesis;
 if(!synth||!window.SpeechSynthesisUtterance)
  return {available:false,message:'Speech playback is unavailable in this browser. Written learning remains available.'};
 const target=language==='ur'?/^ur(?:[-_]|$)/i:/^en(?:[-_]|$)/i;
 const matches=voices().filter(v=>target.test(v.lang||''));
 if(language==='ur'&&!matches.length){
  const ur=await findUrduVoice();
  if(!ur)return {available:false,message:'Urdu voice not installed or not offered by this browser. Urdu letters and activities still work. Install an Urdu-compatible speech voice or use the written instructions.'};
  return {available:true,message:'Urdu voice found: '+ur.name+'. Tap Test Urdu to hear a sample.'};
 }
 if(matches.length)
  return {available:true,message:(language==='ur'?'Urdu':'English')+' voice found: '+matches[0].name+'. Tap Test to play a sample.'};
 return {available:language!=='ur',message:'No named English voice found. The browser may still use its default voice; try the audio test.'};
}

export async function speakGuidance(text: string,language='en',onError?: (message: string) => void){
 const id=++generation;
 if(localStorage.getItem('littleGeniusSound')==='off')return false;
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){
  onError?.('Sound is not available here. Ask a grown-up to help.');return false;
 }
 const synth=window.speechSynthesis;synth.cancel();
 const urdu=language==='ur';
 const match=urdu?await findUrduVoice():voices().find(v=>(v.lang||'').toLowerCase().startsWith('en'));
 if(id!==generation)return false;
 if(urdu&&!match){
  onError?.('Urdu sound is not on this device yet. Ask a grown-up to help. You can still play.');return false;
 }
 const utterance=new SpeechSynthesisUtterance(text);
 utterance.lang=urdu?'ur-PK':'en-US';if(match)utterance.voice=match;
 utterance.rate=rateForSpeech(language);utterance.pitch=1.03;
 utterance.onerror=()=>{if(id===generation)onError?.('The sound did not play. Ask a grown-up to check the volume.');};
 synth.speak(utterance);return true;
}
