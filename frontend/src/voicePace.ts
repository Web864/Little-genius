// Shared spoken-guidance preferences for international preschool learners.
// Speech synthesis voice availability varies by browser/operating system.
const KEY='littleGeniusSpeechPace';
const VALID=['slow','normal','natural'];
export function getSpeechPace(){
 const choice=localStorage.getItem(KEY);
 return VALID.includes(choice)?choice:'slow';
}
export function setSpeechPace(value){
 const chosen=VALID.includes(value)?value:'slow';
 localStorage.setItem(KEY,chosen);
 try{window.speechSynthesis?.cancel();}catch{}
 return chosen;
}
export function rateForSpeech(language='en'){
 const pace=getSpeechPace();
 // Gentle default for children who are learning English as an additional language.
 // Keep rates within a comfortable speaking range; actual voices vary across devices.
 const en={slow:0.68,normal:0.84,natural:1.0};
 const ur={slow:0.74,normal:0.88,natural:1.0};
 return (language==='ur'?ur:en)[pace];
}
