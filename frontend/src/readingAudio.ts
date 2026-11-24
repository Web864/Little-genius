import { rateForSpeech } from './voicePace';
let utterance:SpeechSynthesisUtterance|null=null;
let activeButton:HTMLButtonElement|null=null;
let activeRoot:HTMLElement|null=null;
let serial=0;
export function stopReader(){
 serial++;if(utterance)window.speechSynthesis?.cancel();utterance=null;
 if(activeButton?.isConnected)activeButton.textContent=activeButton.dataset.readerLabel||'🔊 Hear it';
 activeRoot?.querySelectorAll('.lga-read-active').forEach(x=>x.classList.remove('lga-read-active'));activeButton=null;activeRoot=null;
}
export function playReader(root:HTMLElement,button:HTMLButtonElement,text:string,lineMode=false){
 const synth=window.speechSynthesis;
 if(!synth||!window.SpeechSynthesisUtterance||localStorage.getItem('littleGeniusSound')==='off')return;
 if(utterance&&activeRoot===root){if(synth.paused){synth.resume();button.textContent='⏸ Pause';}else{synth.pause();button.textContent='▶ Resume';}return;}
 stopReader();synth.cancel();const run=++serial;activeRoot=root;activeButton=button;
 button.dataset.readerLabel=button.textContent||'🔊 Hear it';button.textContent='⏸ Pause';
 const spans=Array.from(root.querySelectorAll<HTMLElement>('[data-read-word]'));
 const highlight=(index:number)=>{spans.forEach((x,i)=>x.classList.toggle('lga-read-active',i===index));};
 const parts=lineMode?text.split('\n'):[text];let line=0;
 const next=()=>{if(run!==serial||!root.isConnected){stopReader();return;}if(line>=parts.length){stopReader();return;}
 const u=new SpeechSynthesisUtterance(parts[line]);u.lang='en-US';u.rate=rateForSpeech('en');utterance=u;
 u.onstart=()=>{if(run===serial)highlight(lineMode?line:0);};
 u.onboundary=e=>{if(run!==serial||lineMode)return;let i=0;for(let n=0;n<spans.length;n++){if(Number(spans[n].dataset.readWord)<=e.charIndex)i=n;else break;}highlight(i);};
 u.onend=()=>{if(run!==serial)return;line++;next();};
 u.onerror=()=>{if(run===serial)stopReader();};synth.speak(u);};next();
}
export function wordMarkup(text:string){let offset=0;return text.split(' ').map(w=>{const result='<span data-read-word="'+offset+'">'+w+'</span>';offset+=w.length+1;return result;}).join(' ');}
