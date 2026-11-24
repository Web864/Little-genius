
let enabled = localStorage.getItem('littleGeniusSound') !== 'off';
let context = null;
function ctx(){
  if(!enabled) return null;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if(!AudioContext) return null;
    context ||= new AudioContext();
    if(context.state === 'suspended') context.resume();
    return context;
  } catch {return null;}
}
function tone(frequency, at, duration, type='sine', volume=.055, slide=0){
  const c=ctx(); if(!c)return;
  const oscillator=c.createOscillator(),gain=c.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(frequency,at);
  if(slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(60,frequency+slide),at+duration);
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(volume,at+.018);
  gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
  oscillator.connect(gain).connect(c.destination);
  oscillator.start(at);oscillator.stop(at+duration+.02);
}
export function warmSound(){ctx();}
export function soundEnabled(){return enabled;}
export function toggleSound(){enabled=!enabled;localStorage.setItem('littleGeniusSound',enabled?'on':'off');if(!enabled&&context)context.suspend();return enabled;}
export function littleClick(){
 const c=ctx();if(!c)return;const t=c.currentTime+.015;
 tone(540,t,.085,'sine',.025,120);
}
export function animalHappy(animalName){
 const c=ctx();if(!c)return;
 const t=c.currentTime+.04;
 // Original short animal chirps, playful synthesized effects, not actual animal recordings.
 const sounds={
  Bunny:[[720,120],[860,100],[1040,180]],
  Foxy:[[660,140],[830,140],[950,170]],
  Bear:[[320,190],[410,180],[480,210]],
  Owl:[[520,210],[420,220],[590,230]],
  Panda:[[410,180],[510,170],[690,190]],
  Deer:[[610,120],[770,150],[890,150]],
  Squirrel:[[780,100],[960,100],[1120,130]],
  Butterfly:[[890,130],[1040,130],[920,180]]
 };
 let time=t;
 for(const [pitch,ms] of (sounds[animalName]||sounds.Foxy)){
  tone(pitch,time,ms/1000,'sine',.04,65);
  time+=ms/1000+.035;
 }
 // Tiny original success tune; soft and short.
 const tune=[523.25,659.25,783.99,1046.5];
 tune.forEach((note,i)=>tone(note,t+.53+i*.16,.24,'triangle',.044));
}
